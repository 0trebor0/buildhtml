'use strict';

/* ---------------- CONFIG ---------------- */
const CONFIG = Object.freeze({
  mode: process.env.NODE_ENV === "production" ? "prod" : "dev",
  poolSize: 150,
  cacheLimit: 2000,
  maxCssCache: 1000,
  maxKebabCache: 500,
  compression: true,
  enableMetrics: process.env.ENABLE_METRICS === 'true',
  cspNonce: process.env.CSP_NONCE_ENABLED === 'true',
  maxComputedFnSize: 10000, // Prevent DOS via huge functions
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
    } else if (type === 'objects') {
      // Object already cleared in recycle
    }
    return item;
  }
  
  metrics.increment('pool.new.' + type);
  
  switch (type) {
    case 'elements': return new Element(...args);
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
    // Recursive recycling to prevent memory leaks
    for (let i = 0; i < item.children.length; i++) {
      const child = item.children[i];
      if (child instanceof Element) {
        recycle('elements', child);
      }
    }
    
    // CRITICAL FIX: Clear children array to break references
    item.children.length = 0;
    item.events.length = 0;
    item.cssText = "";
    item._state = null;
    item._computed = null;
    
    // Clear attrs to prevent hidden class changes in V8
    for (const key in item.attrs) delete item.attrs[key];
    
    pool.push(item);
    metrics.increment('pool.recycled.elements');
    
  } else if (type === 'arrays' && Array.isArray(item)) {
    item.length = 0;
    pool.push(item);
    metrics.increment('pool.recycled.arrays');
    
  } else if (type === 'objects' && typeof item === 'object' && item !== null) {
    for (const key in item) delete item[key];
    pool.push(item);
    metrics.increment('pool.recycled.objects');
  }
}

function resetElement(el, tag, ridGen, stateStore) {
  el.tag = toKebab(tag);
  
  // Attrs should already be cleared in recycle, but ensure it's initialized
  if (!el.attrs) el.attrs = {};
  
  // Reset arrays (should already be cleared in recycle)
  if (!el.children) el.children = [];
  if (!el.events) el.events = [];
  
  el.cssText = "";
  el._state = null;
  el.hydrate = false;
  el._computed = null;
  el._ridGen = ridGen;
  el._stateStore = stateStore;
}

/* ---------------- UTILITIES ---------------- */
let ridCounter = 0;
const ridPrefix = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);

const createRidGenerator = () => () => `id-${ridPrefix}${(++ridCounter).toString(36)}`;

// FNV-1a hash (better distribution than simple hash)
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
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
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

// HTML minification (improved)
const minHTML = (html) => {
  return html
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+>/g, ">")
    .replace(/<\s+/g, "<")
    .trim();
};

// XSS protection with comprehensive escape map
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

// CSS value sanitization to prevent injection
const cssValueRegex = /[<>"'{}()]/g;
const sanitizeCssValue = (value) => {
  if (!CONFIG.sanitizeCss) return value;
  // Remove dangerous characters that could break out of CSS context
  return String(value)
    .replace(cssValueRegex, '')
    .replace(/\/\*/g, '') // Remove comment starts
    .replace(/\*\//g, '') // Remove comment ends
    .substring(0, 1000); // Limit length to prevent DOS
};

// Validate and sanitize function source for client injection
const sanitizeFunctionSource = (fn, maxSize) => {
  if (typeof fn !== 'function') {
    throw new TypeError('Expected a function');
  }
  
  const source = fn.toString();
  
  if (source.length > maxSize) {
    throw new Error(`Function source too large: ${source.length} > ${maxSize}`);
  }
  
  // Basic validation to prevent obvious injection attempts
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
  }

  attr(key, value) {
    this.attrs[toKebab(key)] = value;
    return this;
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

  append(c) {
    if (c == null) return this;
    this.children.push(c instanceof Element ? c : escapeHtml(c));
    return this;
  }

  appendUnsafe(html) {
    // For trusted HTML only - use with caution
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
        console.error('Invalid computed function:', err.message);
      }
      // In production, silently fail to prevent breaking the render
    }
    return this;
  }

  on(ev, fn) {
    try {
      sanitizeFunctionSource(fn, CONFIG.maxEventFnSize);
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
    
    // Meta tags
    const metaLen = this.metas.length;
    for (let i = 0; i < metaLen; i++) {
      const m = this.metas[i];
      parts.push('<meta ');
      for (const k in m) {
        parts.push(toKebab(k), '="', escapeHtml(m[k]), '" ');
      }
      parts.push('>');
    }
    
    // Links
    const linkLen = this.links.length;
    for (let i = 0; i < linkLen; i++) {
      parts.push('<link rel="stylesheet" href="', escapeHtml(this.links[i]), '">');
    }
    
    // Styles (with optional nonce for CSP)
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
    
    // Scripts
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
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.limit) {
      // Remove least recently used (first item)
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

/* ---------------- DOCUMENT ---------------- */
class Document {
  constructor(options = {}) {
    this.body = [];
    this.head = new Head();
    this._ridGen = createRidGenerator();
    this._stateStore = {};
    this._useResponseCache = options.cache ?? false;
    this._cacheKey = options.cacheKey || null;
    this._nonce = options.nonce || null;
    
    if (this._nonce) {
      this.head.setNonce(this._nonce);
    }
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

  use(el) {
    if (el != null) {
      this.body.push(el);
    }
    return this;
  }

  /** Add multiple elements from a function (for composition/layouts). */
  useFragment(fn) {
    if (typeof fn !== 'function') return this;
    
    try {
      const els = fn(this);
      const arr = Array.isArray(els) ? els : [els];
      
      for (let i = 0; i < arr.length; i++) {
        const el = arr[i];
        if (el != null && el instanceof Element) {
          this.use(el);
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
    return getPooled('elements', tag, this._ridGen, this._stateStore);
  }

  /** Shorthand for createElement(tag). */
  create(tag) {
    return this.createElement(tag);
  }

  clear() {
    // Recycle all body elements
    const bodyLen = this.body.length;
    for (let i = 0; i < bodyLen; i++) {
      if (this.body[i] instanceof Element) {
        recycle('elements', this.body[i]);
      }
    }
    this.body.length = 0;
    
    // Clear state store properties instead of replacing object
    for (const key in this._stateStore) {
      delete this._stateStore[key];
    }
  }

  render() {
    const startTime = CONFIG.enableMetrics ? Date.now() : 0;
    
    // Check cache first
    if (this._useResponseCache && this._cacheKey) {
      const cached = responseCache.get(this._cacheKey);
      if (cached) {
        this.clear();
        if (CONFIG.enableMetrics) {
          metrics.timing('render.cached', Date.now() - startTime);
        }
        return cached;
      }
    }

    const ctx = {
      events: getPooled('arrays'),
      states: getPooled('arrays'),
      styles: [],
      computed: getPooled('arrays'),
      nonce: this._nonce
    };

    // Render body
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

    // Build final HTML
    const html = [
      '<!DOCTYPE html><html lang="en"><head>',
      headHTML,
      stylesHTML,
      '</head><body>',
      bodyHTML,
      clientJS ? `<script${this._nonce ? ` nonce="${escapeHtml(this._nonce)}"` : ''}>${clientJS}</script>` : '',
      '</body></html>'
    ].join('');

    // Recycle context arrays
    recycle('arrays', ctx.events);
    recycle('arrays', ctx.states);
    recycle('arrays', ctx.computed);

    const result = CONFIG.mode === "prod" ? minHTML(html) : html;

    // Cache if enabled
    if (this._useResponseCache && this._cacheKey) {
      responseCache.set(this._cacheKey, result);
    }

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

  // Render attributes
  for (const k in n.attrs) {
    const value = n.attrs[k];
    if (value != null) {
      parts.push(' ', toKebab(k), '="', escapeHtml(value), '"');
    }
  }

  parts.push('>');

  // Add scoped styles
  if (n.cssText) ctx.styles.push(n.cssText);

  // Track state
  if (n._state !== null) {
    ctx.states.push({ id: n.attrs.id, value: n._state, tag: n.tag });
  }

  // Track computed
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

  // Render children (skip for void elements)
  if (!voidElements.has(n.tag)) {
    const childLen = n.children.length;
    for (let i = 0; i < childLen; i++) {
      const rendered = renderNode(n.children[i], ctx);
      if (rendered) parts.push(rendered);
    }
    parts.push('</', n.tag, '>');
  }

  // Track events
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

  if (!hasStates && !hasComputed && !hasEvents) {
    return '';
  }

  // Use a unique namespace to avoid conflicts with multiple renders
  const namespace = '_ssr' + Date.now().toString(36);
  
  const parts = [
    '(function(){',
    `var ${namespace}={state:{}};`,
    'var getById=function(id){return document.getElementById(id);};'
  ];

  // States initialization
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

  // Computed functions
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

  // Event handlers
  const eventLen = ctx.events.length;
  if (eventLen > 0) {
    parts.push('var initEvents=function(){');
    
    for (let i = 0; i < eventLen; i++) {
      const e = ctx.events[i];
      let fnSource = e.fn.toString();
      
      // Replace state ID placeholder if present
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

  // Initialize everything on DOMContentLoaded
  parts.push(
    'if(document.readyState==="loading"){',
    'document.addEventListener("DOMContentLoaded",function(){'
  );
  
  if (stateLen > 0) parts.push('initStates();');
  if (computedLen > 0) parts.push('initComputed();');
  if (eventLen > 0) parts.push('initEvents();');
  
  parts.push(
    '});',
    '}else{'
  );
  
  if (stateLen > 0) parts.push('initStates();');
  if (computedLen > 0) parts.push('initComputed();');
  if (eventLen > 0) parts.push('initEvents();');
  
  parts.push('}');
  
  // Expose state globally for convenience (optional)
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

      // No caching
      if (key == null || key === '') {
        const doc = await Promise.resolve(builderFn(req));
        
        if (!doc || !(doc instanceof Document)) {
          return res.status(500).send('Internal Server Error');
        }
        
        return res.send(doc.render());
      }

      // Check cache
      const cached = responseCache.get(key);
      if (cached) {
        metrics.increment('middleware.cache.hit');
        return res.send(cached);
      }

      metrics.increment('middleware.cache.miss');

      // Check in-flight cache (prevent stampede)
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
            
            // Pass CSP nonce if available
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
            // Remove from in-flight on error
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
  
  // Collect keys from response cache
  for (const [key] of responseCache.cache) {
    if (key.includes(pattern)) {
      keysToDelete.add(key);
    }
  }
  
  // Collect keys from in-flight cache
  for (const key of inFlightCache.keys()) {
    if (key.includes(pattern)) {
      keysToDelete.add(key);
    }
  }
  
  // Delete collected keys
  for (const key of keysToDelete) {
    responseCache.delete(key);
    inFlightCache.delete(key);
  }
  
  metrics.increment('cache.clear.pattern', keysToDelete.size);
}

// Improved compression middleware with async support
function enableCompression() {
  return (req, res, next) => {
    const acceptEncoding = req.headers['accept-encoding'];
    
    if (!acceptEncoding || !acceptEncoding.includes('gzip')) {
      return next();
    }
    
    const originalSend = res.send;
    
    res.send = function(data) {
      // Restore original send first to prevent infinite loops
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
          
          // Use async compression to avoid blocking
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
          
          return; // Wait for async callback
          
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

// Warmup cache helper with error handling
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
        compressed: Math.floor(html.length * 0.3), // Estimate
        success: true 
      });
      
    } catch (err) {
      results.push({ key, error: err.message, success: false });
    }
  }
  
  return results;
}

// Stats helper with detailed metrics
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

// Reset all pools (useful for testing)
function resetPools() {
  pools.elements.length = 0;
  pools.arrays.length = 0;
  pools.objects.length = 0;
  metrics.increment('pools.reset');
}

// Health check helper
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