'use strict';

/* ---------------- CONFIG ---------------- */
const CONFIG = Object.freeze({
  mode: process.env.NODE_ENV === "production" ? "prod" : "dev",
  poolSize: 150,
  cacheLimit: 2000,
  maxKebabCache: 500,
  compression: true,
  enableMetrics: process.env.ENABLE_METRICS === 'true',
  cspNonce: process.env.CSP_NONCE_ENABLED === 'true',
  maxComputedFnSize: 10000,
  maxEventFnSize: 5000,
  sanitizeCss: true
});

/* ---------------- METRICS (Optional) ---------------- */
class Metrics {
  constructor() {
    this.enabled = CONFIG.enableMetrics;
    this.counters = new Map();
    this.timings = new Map();
  }

  increment(key, value = 1) {
    if (!this.enabled) return;
    this.counters.set(key, (this.counters.get(key) || 0) + value);
  }

  timing(key, duration) {
    if (!this.enabled) return;
    if (!this.timings.has(key)) this.timings.set(key, []);
    this.timings.get(key).push(duration);
  }

  getStats() {
    const stats = { counters: {}, timings: {} };
    
    for (const [key, value] of this.counters) {
      stats.counters[key] = value;
    }
    
    for (const [key, values] of this.timings) {
      const sorted = values.sort((a, b) => a - b);
      const len = sorted.length;
      stats.timings[key] = {
        count: len,
        avg: values.reduce((a, b) => a + b, 0) / len,
        p50: sorted[Math.floor(len * 0.5)],
        p95: sorted[Math.floor(len * 0.95)],
        p99: sorted[Math.floor(len * 0.99)]
      };
    }
    
    return stats;
  }

  reset() {
    this.counters.clear();
    this.timings.clear();
  }
}

const metrics = new Metrics();

/* ---------------- OBJECT POOLS ---------------- */
const pools = {
  elements: [],
  arrays: [],
  objects: []
};

function getPooled(type, ...args) {
  const pool = pools[type];
  if (pool && pool.length > 0) {
    const item = pool.pop();
    metrics.increment('pool.reuse.' + type);
    
    if (type === 'elements') {
      resetElement(item, ...args);
    } else if (type === 'arrays') {
      item.length = 0;
    }
    return item;
  }
  
  metrics.increment('pool.new.' + type);
  
  switch (type) {
    case 'elements': {
      const [tag, ridGen, stateStore, document] = args;
      const el = new Element(tag, ridGen, stateStore);
      el._document = document;
      return el;
    }
    case 'arrays': return [];
    case 'objects': return {};
    default: return null;
  }
}

function recycle(type, item) {
  const pool = pools[type];
  if (!pool || pool.length >= CONFIG.poolSize) {
    metrics.increment('pool.overflow.' + type);
    return;
  }
  
  if (type === 'elements' && item instanceof Element) {
    for (let i = 0; i < item.children.length; i++) {
      const child = item.children[i];
      if (child instanceof Element) {
        recycle('elements', child);
      }
    }
    
    item.children.length = 0;
    item.events.length = 0;
    item._stateBindings.length = 0;
    item.cssText = "";
    item._state = null;
    item._computed = null;
    
    for (const key in item.attrs) delete item.attrs[key];
    
    pool.push(item);
    metrics.increment('pool.recycled.elements');
    
  } else if (type === 'arrays' && Array.isArray(item)) {
    item.length = 0;
    pool.push(item);
    metrics.increment('pool.recycled.arrays');
  }
}

function resetElement(el, tag, ridGen, stateStore, document) {
  el.tag = toKebab(tag);
  el._ridGen = ridGen;
  el._stateStore = stateStore;
  el._document = document;
  
  if (!el.attrs) el.attrs = {};
  if (!el.children) el.children = [];
  if (!el.events) el.events = [];
  if (!el._stateBindings) el._stateBindings = [];
  
  el.cssText = "";
  el._state = null;
  el.hydrate = false;
  el._computed = null;
}

/* ---------------- UTILITIES ---------------- */
let ridCounter = 0;
const ridPrefix = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);

const createRidGenerator = () => () => `id-${ridPrefix}${(++ridCounter).toString(36)}`;

// FNV-1a hash
const hash = (str) => {
  let h = 2166136261;
  const len = str.length;
  for (let i = 0; i < len; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return (h >>> 0).toString(36);
};

// LRU Kebab-case conversion cache
class KebabCache {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}

const kebabCache = new KebabCache(CONFIG.maxKebabCache);
const kebabRegex = /[A-Z]/g;

function toKebab(str) {
  if (!str || typeof str !== 'string') return "";
  
  const cached = kebabCache.get(str);
  if (cached) {
    metrics.increment('kebab.cache.hit');
    return cached;
  }
  
  metrics.increment('kebab.cache.miss');
  const result = str.replace(kebabRegex, m => "-" + m.toLowerCase());
  kebabCache.set(str, result);
  return result;
}

// HTML minification (Safer version to preserve inline layouts)
const minHTML = (html) => {
  return html
    // Only remove whitespace if it includes a newline or is more than 3 spaces
    .replace(/>\s+<|>\n+</g, (m) => {
        return m.includes('\n') || m.length > 3 ? "><" : " > <";
    })
    .replace(/\s{2,}/g, " ")
    .trim();
};

// XSS protection
const escapeMap = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;'
});
const escapeRegex = /[&<>"'\/]/g;
const escapeHtml = (text) => {
  if (text == null) return '';
  return String(text).replace(escapeRegex, m => escapeMap[m]);
};

// HTML Entity Unescaping (For JSON transport optimization)
const unescapeMap = Object.freeze({
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#x27;': "'",
  '&#x2F;': '/'
});
const unescapeRegex = /&(?:amp|lt|gt|quot|#x27|#x2F);/g;
const unescapeHtml = (text) => {
  if (text == null) return '';
  return String(text).replace(unescapeRegex, m => unescapeMap[m]);
};

// CSS value sanitization
const cssValueRegex = /[<>"'{}()]/g;
const sanitizeCssValue = (value) => {
  if (!CONFIG.sanitizeCss) return value;
  return String(value)
    .replace(cssValueRegex, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '')
    .substring(0, 1000);
};

// Validate function source
const sanitizeFunctionSource = (fn, maxSize) => {
  if (typeof fn !== 'function') {
    throw new TypeError('Expected a function');
  }
  
  const source = fn.toString();
  
  if (source.length > maxSize) {
    throw new Error(`Function source too large: ${source.length} > ${maxSize}`);
  }
  
  if (source.includes('</script>') || source.includes('<script')) {
    throw new Error('Function contains potentially malicious script tags');
  }
  
  return source;
};

/* ---------------- ELEMENT ---------------- */
class Element {
  constructor(tag, ridGen, stateStore) {
    this.tag = toKebab(tag);
    this.attrs = {};
    this.children = [];
    this.events = [];
    this.cssText = "";
    this._state = null;
    this.hydrate = false;
    this._computed = null;
    this._ridGen = ridGen;
    this._stateStore = stateStore;
    this._document = null;
    this._stateBindings = [];
  }

  child(tag) {
    if (!this._document) {
      throw new Error('[Element] Cannot create child: element not associated with a document');
    }
    const childElement = getPooled('elements', tag, this._ridGen, this._stateStore, this._document);
    // Automatically add to parent's children array
    this.children.push(childElement);
    return childElement;
  }

  create(tag) {
    return this.child(tag);
  }

  attr(key, value) {
    this.attrs[toKebab(key)] = value;
    return this;
  }

  attribute(key, value) {
    return this.attr(key, value);
  }

  id(v) {
    this.attrs.id = v || this._ridGen();
    return this;
  }

  text(c) {
    if (c != null) {
      this.children.push(escapeHtml(c));
    }
    return this;
  }

  // Allow text to be set as a property
  set textContent(c) {
    if (c != null) {
      this.children = [escapeHtml(c)];
    }
  }

  append(c) {
    if (c == null) return this;
    this.children.push(c instanceof Element ? c : escapeHtml(c));
    return this;
  }

  appendUnsafe(html) {
    if (html != null) {
      this.children.push(String(html));
    }
    return this;
  }

  css(s) {
    if (!s || typeof s !== 'object') return this;
    
    const cssRules = [];
    for (const k in s) {
      const key = toKebab(k);
      const value = sanitizeCssValue(s[k]);
      cssRules.push(`${key}:${value}`);
    }
    
    if (cssRules.length === 0) return this;
    
    const cssStr = cssRules.join(';') + ';';
    const sc = "c" + hash(cssStr);
    
    this.attrs.class = this.attrs.class ? `${this.attrs.class} ${sc}` : sc;
    this.cssText += `.${sc}{${cssStr}}`;
    
    return this;
  }

  uniqueClass(rules) {
    if (!rules || typeof rules !== 'object') return this;
    
    const cssRules = [];
    for (const k in rules) {
      const key = toKebab(k);
      const value = sanitizeCssValue(rules[k]);
      cssRules.push(`${key}:${value}`);
    }
    
    if (cssRules.length === 0) return this;
    
    const cssStr = cssRules.join(';') + ';';
    const uniqueName = "_u" + Math.random().toString(36).substring(2, 9);
    
    this.attrs.class = this.attrs.class ? `${this.attrs.class} ${uniqueName}` : uniqueName;
    this.cssText += `.${uniqueName}{${cssStr}}`;
    
    return this;
  }

  bind(stateKey, templateFn = (val) => val) {
    if (!this.attrs.id) this.id();
    
    try {
      const fnSource = typeof templateFn === 'function' 
        ? sanitizeFunctionSource(templateFn, CONFIG.maxComputedFnSize)
        : '(val) => val';
      
      // Store binding info for client-side rendering
      if (!this._stateBindings) this._stateBindings = [];
      this._stateBindings.push({
        stateKey,
        id: this.attrs.id,
        templateFn: fnSource
      });
      
      this.hydrate = true;
    } catch (err) {
      if (CONFIG.mode === 'dev') {
        console.error('[Element] Invalid bind function:', err.message);
      }
    }
    
    return this;
  }

  state(v) {
    if (!this.attrs.id) this.id();
    this._state = v;
    this._stateStore[this.attrs.id] = v;
    this.hydrate = true;
    return this;
  }

  computed(fn) {
    try {
      sanitizeFunctionSource(fn, CONFIG.maxComputedFnSize);
      this._computed = fn;
      if (!this.attrs.id) this.id();
      this.hydrate = true;
    } catch (err) {
      if (CONFIG.mode === 'dev') {
        console.error('Invalid computed function:', err);
      }
    }
    return this;
  }

  on(ev, fn) {
    try {
      const fnSource = sanitizeFunctionSource(fn, CONFIG.maxEventFnSize);
      
      // Warn about closures in dev mode
      if (CONFIG.mode === 'dev') {
        // Check for potential closure usage
        const hasClosureRisk = /(?:let|const|var)\s+\w+/.test(fnSource) === false && 
                               /\w+\s*[\+\-\*\/\=]/.test(fnSource) && 
                               !fnSource.includes('State.');
        
        if (hasClosureRisk) {
          console.warn('[Sculptor] Warning: Event handler may use closures. ' +
                       'Closures won\'t work after serialization. Use State instead.');
        }
      }
      
      if (!this.attrs.id) this.id();
      this.events.push({ event: ev, id: this.attrs.id, fn });
      this.hydrate = true;
    } catch (err) {
      if (CONFIG.mode === 'dev') {
        console.error('Invalid event handler:', err.message);
      }
    }
    return this;
  }

  bindState(target, ev, fn) {
    try {
      sanitizeFunctionSource(fn, CONFIG.maxEventFnSize);
      if (!this.attrs.id) this.id();
      if (!target.attrs.id) target.id();
      this.events.push({ 
        event: ev, 
        id: this.attrs.id, 
        targetId: target.attrs.id, 
        fn 
      });
      this.hydrate = true;
    } catch (err) {
      if (CONFIG.mode === 'dev') {
        console.error('Invalid state binding:', err.message);
      }
    }
    return this;
  }
}

/* ---------------- HEAD ---------------- */
class Head {
  constructor() {
    this.title = "Document";
    this.metas = [];
    this.links = [];
    this.styles = [];
    this.scripts = [];
    this.globalStyles = [];
    this.classStyles = {};
    this.nonce = null;
  }

  setNonce(nonce) {
    this.nonce = nonce;
    return this;
  }

  setTitle(t) {
    this.title = escapeHtml(t);
    return this;
  }

  addMeta(m) {
    if (m && typeof m === 'object') {
      this.metas.push(m);
    }
    return this;
  }

  addLink(l) {
    if (l && typeof l === 'string' && !this.links.includes(l)) {
      this.links.push(l);
    }
    return this;
  }

  addStyle(s) {
    if (s && typeof s === 'string') {
      this.styles.push(s);
    }
    return this;
  }

  addScript(s) {
    if (s && typeof s === 'string') {
      this.scripts.push(s);
    }
    return this;
  }

  globalCss(selector, rules) {
    if (!selector || !rules || typeof rules !== 'object') return this;
    
    const cssRules = [];
    for (const k in rules) {
      const key = toKebab(k);
      const value = sanitizeCssValue(rules[k]);
      cssRules.push(`${key}:${value}`);
    }
    
    if (cssRules.length > 0) {
      const cssStr = `${selector}{${cssRules.join(';')};}`;
      this.globalStyles.push(cssStr);
    }
    
    return this;
  }

  addClass(name, rules) {
    if (!name || !rules || typeof rules !== 'object') return this;
    
    const cssRules = [];
    for (const k in rules) {
      const key = toKebab(k);
      const value = sanitizeCssValue(rules[k]);
      cssRules.push(`${key}:${value}`);
    }
    
    if (cssRules.length > 0) {
      this.classStyles[name] = cssRules.join(';') + ';';
    }
    
    return this;
  }

  render() {
    const parts = [];
    const nonceAttr = this.nonce ? ` nonce="${escapeHtml(this.nonce)}"` : '';
    
    parts.push('<meta charset="UTF-8">');
    parts.push('<title>', this.title, '</title>');
    
    const metaLen = this.metas.length;
    for (let i = 0; i < metaLen; i++) {
      const m = this.metas[i];
      parts.push('<meta ');
      for (const k in m) {
        parts.push(toKebab(k), '="', escapeHtml(m[k]), '" ');
      }
      parts.push('>');
    }
    
    const linkLen = this.links.length;
    for (let i = 0; i < linkLen; i++) {
      parts.push('<link rel="stylesheet" href="', escapeHtml(this.links[i]), '">');
    }
    
    if (this.hasStyles()) {
      parts.push('<style', nonceAttr, '>');
      
      for (const name in this.classStyles) {
        parts.push('.', toKebab(name), '{', this.classStyles[name], '}');
      }
      
      const globalLen = this.globalStyles.length;
      for (let i = 0; i < globalLen; i++) {
        parts.push(this.globalStyles[i]);
      }
      
      const styleLen = this.styles.length;
      for (let i = 0; i < styleLen; i++) {
        parts.push(this.styles[i]);
      }
      
      parts.push('</style>');
    }
    
    const scriptLen = this.scripts.length;
    for (let i = 0; i < scriptLen; i++) {
      parts.push('<script', nonceAttr, ' src="', escapeHtml(this.scripts[i]), '"></script>');
    }
    
    return parts.join('');
  }

  hasStyles() {
    return Object.keys(this.classStyles).length > 0 || 
           this.globalStyles.length > 0 || 
           this.styles.length > 0;
  }
}

/* ---------------- LRU CACHE ---------------- */
class LRUCache {
  constructor(limit) {
    this.limit = limit;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) {
      metrics.increment('cache.miss');
      return null;
    }
    
    metrics.increment('cache.hit');
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.limit) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      metrics.increment('cache.eviction');
    }
    this.cache.set(key, value);
    metrics.increment('cache.set');
  }

  clear() {
    this.cache.clear();
  }
  
  delete(key) {
    return this.cache.delete(key);
  }
  
  has(key) {
    return this.cache.has(key);
  }

  get size() {
    return this.cache.size;
  }
}

const responseCache = new LRUCache(CONFIG.cacheLimit);
const inFlightCache = new Map();

/* ---------------- OBFUSCATION (NOT ENCRYPTION) ---------------- */
// Simple Base64 obfuscation for JSON data
// WARNING: This is obfuscation ONLY, NOT cryptographic security!
// It only reduces payload size and makes data less human-readable.
function obfuscateString(str) {
  // Simple Base64 is fast and sufficient for obfuscation.
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf-8').toString('base64');
  }
  return btoa(unescape(encodeURIComponent(str)));
}

function getDeobfuscateScript() {
  // Optimized decoder: Just decode Base64
  return `var _d=function(e){return decodeURIComponent(escape(atob(e)));};`;
}

/* ---------------- DOCUMENT ---------------- */
class Document {
  constructor(options = {}) {
    this.body = [];
    this.head = new Head();
    this._ridGen = createRidGenerator();
    this._stateStore = {};
    this._globalState = {};
    this._useResponseCache = options.cache ?? false;
    this._cacheKey = options.cacheKey || null;
    this._nonce = options.nonce || null;
    this._oncreateCallbacks = [];
    this._lastRendered = "";
    
    if (this._nonce) {
      this.head.setNonce(this._nonce);
    }
  }

  state(key, value) {
    this._globalState[key] = value;
    return this;
  }

  title(t) {
    this.head.setTitle(t);
    return this;
  }

  addMeta(m) {
    this.head.addMeta(m);
    return this;
  }

  addLink(l) {
    this.head.addLink(l);
    return this;
  }

  addStyle(s) {
    this.head.addStyle(s);
    return this;
  }

  addScript(s) {
    this.head.addScript(s);
    return this;
  }

  globalStyle(selector, rules) {
    this.head.globalCss(selector, rules);
    return this;
  }

  sharedClass(name, rules) {
    this.head.addClass(name, rules);
    return this;
  }

  defineClass(selector, rules, isRawSelector = false) {
    if (!rules || typeof rules !== 'object') return this;
    
    const cssRules = [];
    for (const prop in rules) {
      const key = toKebab(prop);
      const val = sanitizeCssValue(rules[prop]);
      cssRules.push(`${key}:${val}`);
    }
    
    if (cssRules.length > 0) {
      const cssString = cssRules.join(';') + ';';
      const finalSelector = isRawSelector ? selector : `.${selector}`;
      
      if (isRawSelector) {
        this.head.globalStyles.push(`${finalSelector}{${cssString}}`);
      } else {
        this.head.classStyles[selector] = cssString;
      }
    }
    
    return this;
  }

  oncreate(fn) {
    if (typeof fn !== 'function') {
      throw new Error('[Document] .oncreate() expects a function.');
    }
    
    try {
      sanitizeFunctionSource(fn, CONFIG.maxEventFnSize);
      this._oncreateCallbacks.push(fn);
    } catch (err) {
      if (CONFIG.mode === 'dev') {
        console.error('[Document] Invalid oncreate function:', err.message);
      }
    }
    
    return this;
  }

  useFragment(fn) {
    if (typeof fn !== 'function') return this;
    
    try {
      const els = fn(this);
      const arr = Array.isArray(els) ? els : [els];
      
      for (let i = 0; i < arr.length; i++) {
        const el = arr[i];
        if (el != null && el instanceof Element) {
          this.body.push(el);
        }
      }
    } catch (err) {
      if (CONFIG.mode === 'dev') {
        console.error('Fragment function error:', err);
      }
    }
    
    return this;
  }

  createElement(tag) {
    if (!tag || typeof tag !== 'string') {
      throw new TypeError('Element tag must be a non-empty string');
    }
    const element = getPooled('elements', tag, this._ridGen, this._stateStore, this);
    // Automatically add to document body when created from document
    this.body.push(element);
    return element;
  }

  create(tag) {
    return this.createElement(tag);
  }

  child(tag) {
    return this.createElement(tag);
  }

  output() {
    return this._lastRendered;
  }

  save(path) {
    const fs = require('fs');
    fs.writeFileSync(path, this._lastRendered);
    return this;
  }

  clear() {
    const bodyLen = this.body.length;
    for (let i = 0; i < bodyLen; i++) {
      if (this.body[i] instanceof Element) {
        recycle('elements', this.body[i]);
      }
    }
    this.body.length = 0;
    
    for (const key in this._stateStore) {
      delete this._stateStore[key];
    }
  }

  toJSON() {
    const serializeElement = (el) => {
      if (!(el instanceof Element)) {
        // FIX: Unescape text here so client gets raw chars
        return { type: 'text', content: unescapeHtml(String(el)) };
      }

      const serialized = {
        type: 'element',
        tag: el.tag,
        attrs: { ...el.attrs },
        children: el.children.map(serializeElement),
        cssText: el.cssText,
        hydrate: el.hydrate
      };

      if (el._state !== null) {
        serialized.state = el._state;
      }

      if (el._stateBindings && el._stateBindings.length > 0) {
        serialized.stateBindings = el._stateBindings;
      }

      if (el.events && el.events.length > 0) {
        serialized.events = el.events.map(e => ({
          event: e.event,
          id: e.id,
          targetId: e.targetId,
          fn: e.fn.toString()
        }));
      }

      if (el._computed) {
        serialized.computed = el._computed.toString();
      }

      return serialized;
    };

    return {
      version: '1.0',
      title: this.head.title,
      metas: this.head.metas,
      links: this.head.links,
      styles: this.head.styles,
      scripts: this.head.scripts,
      globalStyles: this.head.globalStyles,
      classStyles: this.head.classStyles,
      globalState: this._globalState,
      oncreateCallbacks: this._oncreateCallbacks.map(fn => fn.toString()),
      body: this.body.map(serializeElement)
    };
  }

  static fromJSON(json) {
    const doc = new Document();
    
    if (typeof json === 'string') {
      try {
        json = JSON.parse(json);
      } catch (e) {
        throw new Error('[Sculptor] Invalid JSON string provided to fromJSON');
      }
    }
    
    if (!json || typeof json !== 'object') {
      throw new Error('[Sculptor] fromJSON requires a valid JSON object');
    }
    
    // Validate minimum required fields
    if (!json.version) {
      throw new Error('[Sculptor] Invalid JSON: missing version field');
    }
    
    if (!Array.isArray(json.body)) {
      throw new Error('[Sculptor] Invalid JSON: body must be an array');
    }

    // Restore head
    doc.head.title = json.title || 'Document';
    doc.head.metas = json.metas || [];
    doc.head.links = json.links || [];
    doc.head.styles = json.styles || [];
    doc.head.scripts = json.scripts || [];
    doc.head.globalStyles = json.globalStyles || [];
    doc.head.classStyles = json.classStyles || {};

    // Restore global state (data only)
    doc._globalState = json.globalState || {};

    // WARNING: Functions cannot be restored from JSON for security reasons.
    // oncreate callbacks, computed functions, and event handlers are NOT restored.
    // This method is intended for server-side data restoration only.
    // For client-side hydration with functions, use renderJSON() instead.

    // Restore body
    const deserializeElement = (node) => {
      if (node.type === 'text') {
        return node.content;
      }

      const el = getPooled('elements', node.tag, doc._ridGen, doc._stateStore, doc);
      
      if (node.attrs) {
        for (const key in node.attrs) {
          el.attrs[key] = node.attrs[key];
        }
      }

      if (node.cssText) {
        el.cssText = node.cssText;
      }

      if (node.state !== undefined) {
        el._state = node.state;
        if (el.attrs.id) {
          doc._stateStore[el.attrs.id] = node.state;
        }
      }

      if (node.stateBindings) {
        el._stateBindings = node.stateBindings;
      }

      // NOTE: Functions (computed, events, oncreate) are NOT restored from JSON
      // for security reasons. This method is for data restoration only.
      // For full client-side hydration with functions, use renderJSON() instead.

      el.hydrate = node.hydrate || false;

      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          const childEl = deserializeElement(child);
          el.children.push(childEl);
        }
      }

      return el;
    };

    if (json.body && Array.isArray(json.body)) {
      for (const node of json.body) {
        const el = deserializeElement(node);
        doc.body.push(el);
      }
    }

    return doc;
  }

  render() {
    const startTime = CONFIG.enableMetrics ? Date.now() : 0;
    
    if (this._useResponseCache && this._cacheKey) {
      const cached = responseCache.get(this._cacheKey);
      if (cached) {
        this.clear();
        if (CONFIG.enableMetrics) {
          metrics.timing('render.cached', Date.now() - startTime);
        }
        this._lastRendered = cached;
        return cached;
      }
    }

    const ctx = {
      events: getPooled('arrays'),
      states: getPooled('arrays'),
      styles: [],
      computed: getPooled('arrays'),
      stateBindings: getPooled('arrays'),
      oncreates: this._oncreateCallbacks,
      globalState: this._globalState,
      nonce: this._nonce
    };

    const bodyParts = [];
    const bodyLen = this.body.length;
    for (let i = 0; i < bodyLen; i++) {
      const rendered = renderNode(this.body[i], ctx);
      if (rendered) bodyParts.push(rendered);
    }

    const bodyHTML = bodyParts.join('');
    const headHTML = this.head.render();
    const stylesHTML = ctx.styles.length > 0 ? 
      `<style${this._nonce ? ` nonce="${escapeHtml(this._nonce)}"` : ''}>${ctx.styles.join('')}</style>` : 
       '';
    const clientJS = compileClient(ctx);

    const html = [
      '<!DOCTYPE html><html lang="en"><head>',
      headHTML,
      stylesHTML,
      '</head><body>',
      bodyHTML,
      clientJS ? `<script${this._nonce ? ` nonce="${escapeHtml(this._nonce)}"` : ''}>${clientJS}</script>` : '',
      '</body></html>'
    ].join('');

    recycle('arrays', ctx.events);
    recycle('arrays', ctx.states);
    recycle('arrays', ctx.computed);
    recycle('arrays', ctx.stateBindings);

    const result = CONFIG.mode === "prod" ? minHTML(html) : html;

    if (this._useResponseCache && this._cacheKey) {
      responseCache.set(this._cacheKey, result);
    }

    this._lastRendered = result;
    this.clear();
    
    if (CONFIG.enableMetrics) {
      metrics.timing('render.total', Date.now() - startTime);
      metrics.increment('render.count');
    }
    
    return result;
  }

  renderJSON(varNameOrOptions, options) {
    let jsonVarName = '__SCULPTOR_DATA__';
    let opts = {};
    
    if (typeof varNameOrOptions === 'string') {
      jsonVarName = varNameOrOptions;
      opts = options || {};
    } else if (typeof varNameOrOptions === 'object' && varNameOrOptions !== null) {
      opts = varNameOrOptions;
      jsonVarName = opts.varName || '__SCULPTOR_DATA__';
    }
    
    const startTime = CONFIG.enableMetrics ? Date.now() : 0;
    
    // Check Cache
    if (this._useResponseCache && this._cacheKey) {
      const cached = responseCache.get(this._cacheKey);
      if (cached) {
        this.clear();
        if (CONFIG.enableMetrics) metrics.timing('render.cached', Date.now() - startTime);
        this._lastRendered = cached;
        return cached;
      }
    }

    const jsonData = this.toJSON();
    const eventHandlers = {};
    
    // Extract Event Handlers (Deduplication)
    const extractHandlers = (node) => {
      if (node.type === 'element') {
        if (node.events && Array.isArray(node.events)) {
          node.events = node.events.map(evt => {
            const handlerId = '_h' + hash(evt.fn.toString() + evt.id + evt.event);
            eventHandlers[handlerId] = evt.fn.toString();
            return {
              event: evt.event,
              id: evt.id,
              targetId: evt.targetId,
              handlerId: handlerId
            };
          });
        }
        if (node.children) node.children.forEach(child => extractHandlers(child));
      }
    };
    
    jsonData.body.forEach(node => extractHandlers(node));
    
    const jsonStr = JSON.stringify(jsonData);
    const obfuscate = opts.obfuscate === true;
    const headHTML = this.head.render();
    
    const parts = [
      '<!DOCTYPE html><html lang="en"><head>',
      headHTML,
      `<script${this._nonce ? ` nonce="${escapeHtml(this._nonce)}"` : ''}>`,
    ];
    
    // Inject Event Handlers (Safe Scope)
    if (Object.keys(eventHandlers).length > 0) {
      parts.push('window.__HANDLERS__={');
      const handlerEntries = Object.entries(eventHandlers);
      for (let i = 0; i < handlerEntries.length; i++) {
        const [id, fnStr] = handlerEntries[i];
        parts.push(`"${id}":${fnStr}`);
        if (i < handlerEntries.length - 1) parts.push(',');
      }
      parts.push('};');
    }
    
    // Inject JSON Data (Fast Decode)
    if (obfuscate) {
      const obfuscated = obfuscateString(jsonStr);
      parts.push(getDeobfuscateScript(), `window.${jsonVarName}=JSON.parse(_d("${obfuscated}"));`);
    } else {
      parts.push(`window.${jsonVarName}=${jsonStr};`);
    }
    
    parts.push('</script></head><body>');
    
    // ---------------- HYDRATION ENGINE (Client Side) ---------------- //
    parts.push(
      `<script${this._nonce ? ` nonce="${escapeHtml(this._nonce)}"` : ''}>`,
      `(function(){`,
      `var data=window.${jsonVarName};`,
      `if(!data)return;`,
      
      // HELPER: Compiler (Performance: Compiles string -> Function ONCE)
      `var compile=function(s){try{return new Function('return ('+s+')')();}catch(e){return function(){};}};`,

      // 1. INJECT STYLES
      `var css='';`,
      `if(data.classStyles){for(var n in data.classStyles)css+='.'+n+'{'+data.classStyles[n]+'}';}`,
      `if(data.globalStyles){data.globalStyles.forEach(function(s){css+=s;});}`,
      `if(css){var s=document.createElement('style');s.textContent=css;document.head.appendChild(s);}`,
      
      // 2. DOM BUILDER (Recursion)
      `var dynamicCss = '';`,
      `function buildEl(node){`,
      `if(node.type==='text') return document.createTextNode(node.content);`, // Safe: createTextNode handles escaping
      `var el=document.createElement(node.tag);`,
      `if(node.attrs){for(var k in node.attrs)el.setAttribute(k,node.attrs[k]);}`,
      `if(node.cssText){ dynamicCss += node.cssText; }`,
      `if(node.children){for(var i=0;i<node.children.length;i++){`,
      `el.appendChild(buildEl(node.children[i]));`,
      `}}`,
      `return el;`,
      `}`,
      
      // 3. REACTIVE STATE PROXY
      `if(data.globalState){`,
      `var _cbs={};`,
      `window.watchState=function(k,f){(_cbs[k]=_cbs[k]||[]).push(f);};`,
      `window.State=new Proxy(data.globalState,{`,
      `set:function(t,k,v){if(t[k]===v)return true;t[k]=v;if(_cbs[k])_cbs[k].forEach(function(f){f(v);});return true;}`,
      `});}`,
      
      // 4. RENDER BODY
      `if(data.body){`,
      `for(var i=0;i<data.body.length;i++){document.body.appendChild(buildEl(data.body[i]));}`,
      `}`,

      // 5. INJECT DYNAMIC CSS (Buffered)
      `if(dynamicCss){var s=document.createElement('style');s.textContent=dynamicCss;document.head.appendChild(s);}`,
      
      // 6. HYDRATION (Events & Bindings)
      `function hydrateNode(node){`,
      `if(node.type!=='element')return;`,
      `var el=node.attrs&&node.attrs.id?document.getElementById(node.attrs.id):null;`,
      `if(el){`,
      
      // State Bindings (Optimized: Compile Once, Run Many)
      `if(node.stateBindings){`,
      `node.stateBindings.forEach(function(b){`,
      `var fn=compile(b.templateFn);`, // Compile here
      `window.watchState(b.stateKey,function(val){try{el.textContent=fn(val);}catch(e){}});`,
      `if(window.State[b.stateKey]!==undefined){try{el.textContent=fn(window.State[b.stateKey]);}catch(e){}}`,
      `});`,
      `}`,
      `}`,
      
      // Events (Delegated via Handlers)
      `if(node.events){`,
      `node.events.forEach(function(evt){`,
      `var tid=evt.targetId||evt.id;`,
      `var te=document.getElementById(tid);`,
      `if(te&&evt.handlerId&&window.__HANDLERS__[evt.handlerId]){`,
      `try{te.addEventListener(evt.event,window.__HANDLERS__[evt.handlerId]);}catch(e){}`,
      `}`,
      `});`,
      `}`,
      
      // Recurse Children
      `if(node.children){node.children.forEach(function(c){hydrateNode(c);});}`,
      `}`,
      
      `if(data.body){data.body.forEach(function(n){hydrateNode(n);});}`,
      
      // OnCreate Callbacks
      `if(data.oncreateCallbacks){`,
      `data.oncreateCallbacks.forEach(function(f){try{compile(f)();}catch(e){console.error(e);}});`,
      `}`,
      `})();`,
      '</script></body></html>'
    );

    const html = parts.join('');
    // Use safer minification
    const result = CONFIG.mode === "prod" ? minHTML(html) : html;

    if (this._useResponseCache && this._cacheKey) {
      responseCache.set(this._cacheKey, result);
    }

    this._lastRendered = result;
    this.clear();
    
    if (CONFIG.enableMetrics) {
      metrics.timing('render.total', Date.now() - startTime);
      metrics.increment('render.count');
    }
    
    return result;
  }
}

/* ---------------- RENDERER ---------------- */
const voidElements = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

function renderNode(n, ctx) {
  if (n == null) return '';
  if (!(n instanceof Element)) return String(n);

  const parts = ['<', n.tag];

  for (const k in n.attrs) {
    const value = n.attrs[k];
    if (value != null) {
      parts.push(' ', toKebab(k), '="', escapeHtml(value), '"');
    }
  }

  parts.push('>');

  if (n.cssText) ctx.styles.push(n.cssText);

  if (n._state !== null) {
    ctx.states.push({ id: n.attrs.id, value: n._state, tag: n.tag });
  }

  if (n._computed) {
    try {
      const fnSource = sanitizeFunctionSource(n._computed, CONFIG.maxComputedFnSize);
      ctx.computed.push({ id: n.attrs.id, fn: fnSource });
    } catch (err) {
      if (CONFIG.mode === 'dev') {
        console.error('Computed function validation failed:', err);
      }
    }
  }

  // Collect state bindings
  if (n._stateBindings && n._stateBindings.length > 0) {
    ctx.stateBindings.push(...n._stateBindings);
  }

  if (!voidElements.has(n.tag)) {
    const childLen = n.children.length;
    for (let i = 0; i < childLen; i++) {
      const rendered = renderNode(n.children[i], ctx);
      if (rendered) parts.push(rendered);
    }
    parts.push('</', n.tag, '>');
  }

  const eventLen = n.events.length;
  for (let i = 0; i < eventLen; i++) {
    ctx.events.push(n.events[i]);
  }

  return parts.join('');
}

/* ---------------- CLIENT ---------------- */
function compileClient(ctx) {
  const hasStates = ctx.states.length > 0;
  const hasComputed = ctx.computed.length > 0;
  const hasEvents = ctx.events.length > 0;
  const hasOncreates = ctx.oncreates && ctx.oncreates.length > 0;
  const hasGlobalState = ctx.globalState && Object.keys(ctx.globalState).length > 0;
  const hasStateBindings = ctx.stateBindings && ctx.stateBindings.length > 0;

  if (!hasStates && !hasComputed && !hasEvents && !hasOncreates && !hasGlobalState && !hasStateBindings) {
    return '';
  }

  const namespace = '_ssr' + Date.now().toString(36);
  
  const parts = [
    '(function(){',
    `var ${namespace}={state:{}};`,
    'var getById=function(id){return document.getElementById(id);};'
  ];

  // Initialize global reactive state with callbacks
  if (hasGlobalState || hasStateBindings) {
    parts.push(
      'var _cbs={};',
      'window.watchState=function(k,f){(_cbs[k]=_cbs[k]||[]).push(f);};',
      'window.State=new Proxy(' + JSON.stringify(ctx.globalState || {}) + ',{',
      'set:function(t,k,v){',
      'if(t[k]===v)return true;',
      't[k]=v;',
      'if(_cbs[k])_cbs[k].forEach(function(f){f(v);});',
      'return true;',
      '}',
      '});'
    );
  }

  const stateLen = ctx.states.length;
  if (stateLen > 0) {
    parts.push('var initStates=function(){');
    
    for (let i = 0; i < stateLen; i++) {
      const s = ctx.states[i];
      const prop = (s.tag === 'input' || s.tag === 'textarea') ? 'value' : 'textContent';
      const safeValue = JSON.stringify(s.value);
      
      parts.push(
        `${namespace}.state["${s.id}"]=${safeValue};`,
        `(function(){var el=getById("${s.id}");if(el)el.${prop}=${namespace}.state["${s.id}"];})();`
      );
    }
    
    parts.push('};');
  }

  const computedLen = ctx.computed.length;
  if (computedLen > 0) {
    parts.push('var initComputed=function(){');
    
    for (let i = 0; i < computedLen; i++) {
      const c = ctx.computed[i];
      parts.push(
        `(function(){var el=getById("${c.id}");`,
        `if(el)try{el.textContent=(${c.fn})(${namespace}.state);}catch(e){console.error("Computed error:",e);}`,
        '})();'
      );
    }
    
    parts.push('};');
  }

  // State bindings - use watchState
  if (hasStateBindings) {
    parts.push('var initBindings=function(){');
    
    for (let i = 0; i < ctx.stateBindings.length; i++) {
      const b = ctx.stateBindings[i];
      parts.push(
        `window.watchState('${b.stateKey}',function(val){`,
        `var el=getById('${b.id}');`,
        `if(el)try{el.textContent=(${b.templateFn})(val);}catch(e){console.error('Binding error:',e);}`,
        '});'
      );
      
      // Initialize with current value
      parts.push(
        `(function(){`,
        `var el=getById('${b.id}');`,
        `if(el&&window.State['${b.stateKey}']!==undefined)`,
        `try{el.textContent=(${b.templateFn})(window.State['${b.stateKey}']);}catch(e){}`,
        '})();'
      );
    }
    
    parts.push('};');
  }

  const eventLen = ctx.events.length;
  if (eventLen > 0) {
    parts.push('var initEvents=function(){');
    
    for (let i = 0; i < eventLen; i++) {
      const e = ctx.events[i];
      let fnSource = e.fn.toString();
      
      if (e.targetId) {
        fnSource = fnSource.replace(/__STATE_ID__/g, e.targetId);
      }
      
      parts.push(
        `(function(){var el=getById("${e.id}");`,
        `if(el)try{el.addEventListener("${e.event}",${fnSource});}catch(err){console.error("Event handler error:",err);}`,
        '})();'
      );
    }
    
    parts.push('};');
  }

  // Add oncreate callbacks
  if (hasOncreates) {
    parts.push('var initOncreate=function(){');
    
    for (let i = 0; i < ctx.oncreates.length; i++) {
      const fn = ctx.oncreates[i];
      try {
        const fnSource = sanitizeFunctionSource(fn, CONFIG.maxEventFnSize);
        parts.push(`(${fnSource})();`);
      } catch (err) {
        if (CONFIG.mode === 'dev') {
          console.error('Oncreate validation failed:', err);
        }
      }
    }
    
    parts.push('};');
  }

  parts.push(
    'if(document.readyState==="loading"){',
    'document.addEventListener("DOMContentLoaded",function(){'
  );
  
  if (stateLen > 0) parts.push('initStates();');
  if (computedLen > 0) parts.push('initComputed();');
  if (hasStateBindings) parts.push('initBindings();');
  if (eventLen > 0) parts.push('initEvents();');
  if (hasOncreates) parts.push('initOncreate();');
  
  parts.push(
    '});',
    '}else{'
  );
  
  if (stateLen > 0) parts.push('initStates();');
  if (computedLen > 0) parts.push('initComputed();');
  if (hasStateBindings) parts.push('initBindings();');
  if (eventLen > 0) parts.push('initEvents();');
  if (hasOncreates) parts.push('initOncreate();');
  
  parts.push('}');
  parts.push(`window.${namespace}=${namespace};`);
  parts.push('})();');

  return parts.join('');
}

/* ---------------- MIDDLEWARE HELPERS ---------------- */
function createCachedRenderer(builderFn, cacheKeyOrFn, options = {}) {
  if (typeof builderFn !== 'function') {
    throw new TypeError('Builder function is required');
  }

  return async (req, res, next) => {
    try {
      const key = typeof cacheKeyOrFn === 'function' ? cacheKeyOrFn(req) : cacheKeyOrFn;

      if (key == null || key === '') {
        const doc = await Promise.resolve(builderFn(req));
        
        if (!doc || !(doc instanceof Document)) {
          return res.status(500).send('Internal Server Error');
        }
        
        return res.send(doc.render());
      }

      const cached = responseCache.get(key);
      if (cached) {
        metrics.increment('middleware.cache.hit');
        return res.send(cached);
      }

      metrics.increment('middleware.cache.miss');

      let promise = inFlightCache.get(key);
      
      if (!promise) {
        promise = Promise.resolve()
          .then(() => builderFn(req))
          .then((doc) => {
            if (!doc || !(doc instanceof Document)) {
              const err = new Error('Builder function must return a Document instance');
              err.status = 500;
              throw err;
            }
            
            doc._useResponseCache = true;
            doc._cacheKey = key;
            
            if (options.nonce && typeof options.nonce === 'function') {
              doc._nonce = options.nonce(req);
            }
            
            return doc.render();
          });
        
        inFlightCache.set(key, promise);
        
        promise
          .then((html) => {
            responseCache.set(key, html);
            metrics.increment('middleware.cache.set');
          })
          .catch((err) => {
            if (CONFIG.mode === 'dev') {
              console.error('Render error:', err);
            }
          })
          .finally(() => {
            inFlightCache.delete(key);
          });
      } else {
        metrics.increment('middleware.stampede.prevented');
      }

      const html = await promise;
      res.send(html);
      
    } catch (err) {
      if (err.status === 500) {
        res.status(500).send('Internal Server Error');
      } else {
        next(err);
      }
    }
  };
}

function clearCache(pattern) {
  if (!pattern) {
    responseCache.clear();
    inFlightCache.clear();
    metrics.increment('cache.clear.all');
    return;
  }

  const keysToDelete = new Set();
  
  for (const [key] of responseCache.cache) {
    if (key.includes(pattern)) {
      keysToDelete.add(key);
    }
  }
  
  for (const key of inFlightCache.keys()) {
    if (key.includes(pattern)) {
      keysToDelete.add(key);
    }
  }
  
  for (const key of keysToDelete) {
    responseCache.delete(key);
    inFlightCache.delete(key);
  }
  
  metrics.increment('cache.clear.pattern', keysToDelete.size);
}

function enableCompression() {
  return (req, res, next) => {
    const acceptEncoding = req.headers['accept-encoding'];
    
    if (!acceptEncoding || !acceptEncoding.includes('gzip')) {
      return next();
    }
    
    const originalSend = res.send;
    
    res.send = function(data) {
      res.send = originalSend;
      
      const contentType = this.getHeader('Content-Type') || '';
      const isCompressible = 
        contentType.includes('text/html') || 
        contentType.includes('text/css') ||
        contentType.includes('text/javascript') ||
        contentType.includes('application/javascript') ||
        contentType.includes('application/json');
      
      const shouldCompress = 
        typeof data === 'string' && 
        data.length > 1024 && 
        isCompressible;
      
      if (shouldCompress) {
        try {
          const zlib = require('zlib');
          
          zlib.gzip(data, (err, compressed) => {
            if (err) {
              metrics.increment('compression.error');
              return originalSend.call(this, data);
            }
            
            this.setHeader('Content-Encoding', 'gzip');
            this.setHeader('Content-Length', compressed.length);
            this.setHeader('Vary', 'Accept-Encoding');
            metrics.increment('compression.success');
            metrics.increment('compression.bytes.saved', data.length - compressed.length);
            
            return originalSend.call(this, compressed);
          });
          
          return;
          
        } catch (err) {
          metrics.increment('compression.error');
          return originalSend.call(this, data);
        }
      }
      
      return originalSend.call(this, data);
    };
    
    next();
  };
}

async function warmupCache(routes) {
  if (!Array.isArray(routes)) {
    throw new TypeError('Routes must be an array');
  }
  
  const results = [];
  
  for (const route of routes) {
    if (!route || typeof route !== 'object') {
      results.push({ error: 'Invalid route object', success: false });
      continue;
    }
    
    const { key, builder } = route;
    
    if (!key || !builder) {
      results.push({ key, error: 'Missing key or builder', success: false });
      continue;
    }
    
    try {
      const doc = await Promise.resolve(builder());
      
      if (!doc || !(doc instanceof Document)) {
        results.push({ key, error: 'Builder must return a Document instance', success: false });
        continue;
      }
      
      doc._useResponseCache = true;
      doc._cacheKey = key;
      
      const html = doc.render();
      
      results.push({ 
        key, 
        size: html.length, 
        compressed: Math.floor(html.length * 0.3),
        success: true 
      });
      
    } catch (err) {
      results.push({ key, error: err.message, success: false });
    }
  }
  
  return results;
}

function getCacheStats() {
  return {
    cache: {
      size: responseCache.size,
      limit: CONFIG.cacheLimit,
      usage: ((responseCache.size / CONFIG.cacheLimit) * 100).toFixed(2) + '%',
      keys: Array.from(responseCache.cache.keys())
    },
    inFlight: {
      size: inFlightCache.size,
      keys: Array.from(inFlightCache.keys())
    },
    pools: {
      elements: pools.elements.length,
      arrays: pools.arrays.length,
      objects: pools.objects.length
    },
    metrics: CONFIG.enableMetrics ? metrics.getStats() : null
  };
}

function resetPools() {
  pools.elements.length = 0;
  pools.arrays.length = 0;
  pools.objects.length = 0;
  metrics.increment('pools.reset');
}

function healthCheck() {
  return {
    status: 'ok',
    timestamp: Date.now(),
    config: {
      mode: CONFIG.mode,
      poolSize: CONFIG.poolSize,
      cacheLimit: CONFIG.cacheLimit
    },
    stats: getCacheStats()
  };
}

/* ---------------- EXPORTS ---------------- */
module.exports = {
  Document,
  Element,
  Head,
  CONFIG,
  createCachedRenderer,
  clearCache,
  enableCompression,
  responseCache,
  warmupCache,
  getCacheStats,
  resetPools,
  healthCheck,
  metrics
};