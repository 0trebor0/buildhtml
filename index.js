// ======================================================
// HIGH-PERFORMANCE SSR BUILDER (Express Optimized)
// ======================================================
// Ultra-fast, memory-efficient version for production

/* ---------------- CONFIG ---------------- */
const CONFIG = {
  mode: process.env.NODE_ENV === "production" ? "prod" : "dev",
  poolSize: 100,  // Object pool size
  cacheLimit: 1000,  // Max cached responses
  enableCompression: true
};

/* ---------------- OBJECT POOLS (Memory Reuse) ---------------- */
const elementPool = [];
const arrayPool = [];

function getElement(tag, ridGen, stateStore) {
  const el = elementPool.pop();
  if (el) {
    el.tag = toKebab(tag);
    el.attrs = {};
    el.children.length = 0;
    el.events.length = 0;
    el.cssText = "";
    el._state = null;
    el.hydrate = false;
    el.computed = null;
    el._ridGen = ridGen;
    el._stateStore = stateStore;
    return el;
  }
  return new Element(tag, ridGen, stateStore);
}

function recycleElement(el) {
  if (elementPool.length < CONFIG.poolSize) {
    elementPool.push(el);
  }
}

function getArray() {
  return arrayPool.pop() || [];
}

function recycleArray(arr) {
  arr.length = 0;
  if (arrayPool.length < CONFIG.poolSize) {
    arrayPool.push(arr);
  }
}

/* ---------------- UTILITIES (Optimized) ---------------- */
let ridCounter = 0;
const ridPrefix = Date.now().toString(36);

function createRidGenerator() {
  return () => `id-${ridPrefix}${(++ridCounter).toString(36)}`;
}

// Fast hash using bit shifts
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

// Cached regex for performance
const kebabRegex = /[A-Z]/g;
const kebabCache = new Map();

function toKebab(str) {
  if (!str) return "";
  let cached = kebabCache.get(str);
  if (cached) return cached;
  
  const result = str.replace(kebabRegex, m => "-" + m.toLowerCase());
  if (kebabCache.size < 500) kebabCache.set(str, result);
  return result;
}

function minHTML(html) {
  return html.replace(/>\s+</g, "><").replace(/\n/g, "").trim();
}

// Fast HTML escaping with lookup table
const escapeMap = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;'
};
const escapeRegex = /[&<>"']/g;

function escapeHtml(text) {
  return String(text).replace(escapeRegex, m => escapeMap[m]);
}

/* ---------------- ELEMENT (Optimized) ---------------- */
class Element {
  constructor(tag, ridGen, stateStore) {
    this.tag = toKebab(tag);
    this.attrs = {};
    this.children = [];
    this.events = [];
    this.cssText = "";
    this._state = null;
    this.hydrate = false;
    this.computed = null;
    this._ridGen = ridGen;
    this._stateStore = stateStore;
  }

  id(v) { 
    this.attrs.id = v || this._ridGen(); 
    return this; 
  }
  
  text(c) { 
    this.children.push(escapeHtml(c)); 
    return this; 
  }
  
  append(c) { 
    this.children.push(c instanceof Element ? c : escapeHtml(c));
    return this;
  }

  css(s) {
    // Pre-build CSS string
    let cssStr = "";
    for (const k in s) {
      cssStr += `${toKebab(k)}:${s[k]};`;
    }
    
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
    this.computed = fn;
    if (!this.attrs.id) this.id();
    this.hydrate = true;
    return this;
  }

  on(ev, fn) {
    if (!this.attrs.id) this.id();
    this.events.push({ event: ev, id: this.attrs.id, fn });
    this.hydrate = true;
    return this;
  }

  bindState(target, ev, fn) {
    if (!this.attrs.id) this.id();
    if (!target.attrs.id) target.id();
    this.events.push({ event: ev, id: this.attrs.id, targetId: target.attrs.id, fn });
    this.hydrate = true;
    return this;
  }
}

/* ---------------- HEAD (Optimized) ---------------- */
class Head {
  constructor() {
    this.title = "Document";
    this.metas = [];
    this.links = [];
    this.styles = [];
    this.scripts = [];
    this.globalStyles = [];
    this.classStyles = {};
  }

  setTitle(t) { 
    this.title = escapeHtml(t); 
    return this; 
  }
  
  addMeta(m) { 
    this.metas.push(m); 
    return this; 
  }
  
  addLink(l) { 
    if (!this.links.includes(l)) this.links.push(l); 
    return this; 
  }
  
  addStyle(s) { 
    this.styles.push(s); 
    return this; 
  }
  
  addScript(s) { 
    this.scripts.push(s); 
    return this; 
  }

  globalCss(selector, rules) {
    let cssStr = "";
    for (const k in rules) {
      cssStr += `${toKebab(k)}:${rules[k]};`;
    }
    this.globalStyles.push(`${selector}{${cssStr}}`);
    return this;
  }

  addClass(name, rules) {
    let cssStr = "";
    for (const k in rules) {
      cssStr += `${toKebab(k)}:${rules[k]};`;
    }
    this.classStyles[name] = cssStr;
    return this;
  }

  render() {
    // Use array join for better performance
    const parts = ['<meta charset="UTF-8"><title>', this.title, '</title>'];
    
    // Meta tags
    for (let i = 0; i < this.metas.length; i++) {
      const m = this.metas[i];
      parts.push('<meta ');
      for (const k in m) {
        parts.push(toKebab(k), '="', escapeHtml(m[k]), '" ');
      }
      parts.push('>');
    }
    
    // Links
    for (let i = 0; i < this.links.length; i++) {
      parts.push('<link rel="stylesheet" href="', escapeHtml(this.links[i]), '">');
    }
    
    // Styles
    parts.push('<style>');
    for (const name in this.classStyles) {
      parts.push('.', toKebab(name), '{', this.classStyles[name], '}');
    }
    parts.push(this.globalStyles.join(''), this.styles.join(''), '</style>');
    
    // Scripts
    for (let i = 0; i < this.scripts.length; i++) {
      parts.push('<script src="', escapeHtml(this.scripts[i]), '"></script>');
    }
    
    return parts.join('');
  }
}

/* ---------------- DOCUMENT (Optimized with LRU Cache) ---------------- */
class LRUCache {
  constructor(limit) {
    this.limit = limit;
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
    } else if (this.cache.size >= this.limit) {
      // Remove oldest (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
  
  clear() {
    this.cache.clear();
  }
}

// Global response cache for static content
const responseCache = new LRUCache(CONFIG.cacheLimit);

class Document {
  constructor(options = {}) {
    this.body = [];
    this.head = new Head();
    this._ridGen = createRidGenerator();
    this._stateStore = {};
    this._useResponseCache = options.cache ?? false;
    this._cacheKey = options.cacheKey || null;
  }

  title(t) { this.head.setTitle(t); return this; }
  addMeta(m) { this.head.addMeta(m); return this; }
  addLink(l) { this.head.addLink(l); return this; }
  addStyle(s) { this.head.addStyle(s); return this; }
  addScript(s) { this.head.addScript(s); return this; }
  use(el) { this.body.push(el); return this; }
  createElement(tag) { return getElement(tag, this._ridGen, this._stateStore); }

  clear() {
    // Recycle elements
    for (let i = 0; i < this.body.length; i++) {
      if (this.body[i] instanceof Element) {
        recycleElement(this.body[i]);
      }
    }
    this.body.length = 0;
    this._stateStore = {};
  }

  render() {
    // Check cache first
    if (this._useResponseCache && this._cacheKey) {
      const cached = responseCache.get(this._cacheKey);
      if (cached) return cached;
    }

    const ctx = { 
      events: getArray(), 
      states: getArray(), 
      styles: [], 
      computed: getArray() 
    };
    
    // Render body - using string array for better performance
    const bodyParts = [];
    for (let i = 0; i < this.body.length; i++) {
      bodyParts.push(renderNode(this.body[i], ctx));
    }
    const bodyHTML = bodyParts.join('');
    
    const headHTML = this.head.render() + '<style>' + ctx.styles.join('') + '</style>';
    const clientJS = compileClient(ctx);

    const html = `<!DOCTYPE html><html lang="en"><head>${headHTML}</head><body>${bodyHTML}<script>${clientJS}</script></body></html>`;
    
    // Recycle context arrays
    recycleArray(ctx.events);
    recycleArray(ctx.states);
    recycleArray(ctx.computed);
    
    const result = CONFIG.mode === "prod" ? minHTML(html) : html;
    
    // Cache result if enabled
    if (this._useResponseCache && this._cacheKey) {
      responseCache.set(this._cacheKey, result);
    }
    
    this.clear();
    return result;
  }
}

/* ---------------- RENDERER (Optimized) ---------------- */
// Void elements set for O(1) lookup
const voidElements = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

function renderNode(n, ctx) {
  if (!(n instanceof Element)) return n;
  
  const parts = ['<', toKebab(n.tag)];
  
  // Attributes
  for (const k in n.attrs) {
    parts.push(' ', toKebab(k), '="', escapeHtml(n.attrs[k]), '"');
  }
  
  parts.push('>');
  
  // CSS
  if (n.cssText) ctx.styles.push(n.cssText);
  
  // State
  if (n._state !== null) {
    ctx.states.push({ id: n.attrs.id, value: n._state });
  }
  
  // Computed
  if (n.computed) {
    ctx.computed.push({ id: n.attrs.id, fn: n.computed.toString() });
  }
  
  // Children (only if not void element)
  if (!voidElements.has(n.tag)) {
    for (let i = 0; i < n.children.length; i++) {
      parts.push(renderNode(n.children[i], ctx));
    }
    parts.push('</', toKebab(n.tag), '>');
  }
  
  // Events
  for (let i = 0; i < n.events.length; i++) {
    ctx.events.push(n.events[i]);
  }
  
  return parts.join('');
}

/* ---------------- CLIENT (Optimized) ---------------- */
function compileClient(ctx) {
  if (ctx.states.length === 0 && ctx.computed.length === 0 && ctx.events.length === 0) {
    return ''; // No client-side JS needed
  }

  const parts = [
    'window.state={};',
    'window.getById=id=>document.getElementById(id);',
    'document.addEventListener("DOMContentLoaded",function(){'
  ];

  // States
  for (let i = 0; i < ctx.states.length; i++) {
    const s = ctx.states[i];
    parts.push(
      'window.state["', s.id, '"]=', JSON.stringify(String(s.value)), ';',
      'getById("', s.id, '").textContent=window.state["', s.id, '"];'
    );
  }

  // Computed
  for (let i = 0; i < ctx.computed.length; i++) {
    const c = ctx.computed[i];
    parts.push('getById("', c.id, '").textContent=(', c.fn, ')(window.state);');
  }

  // Events
  for (let i = 0; i < ctx.events.length; i++) {
    const e = ctx.events[i];
    let f = e.fn.toString();
    if (e.targetId) {
      f = f.replace(/__STATE_ID__/g, e.targetId);
    }
    parts.push('getById("', e.id, '").addEventListener("', e.event, '",', f, ');');
  }

  parts.push('});');
  return parts.join('');
}

/* ---------------- MIDDLEWARE HELPERS ---------------- */
function createCachedRenderer(builderFn, cacheKey) {
  return (req, res, next) => {
    const key = typeof cacheKey === 'function' ? cacheKey(req) : cacheKey;
    const cached = responseCache.get(key);
    
    if (cached) return res.send(cached);

    const doc = builderFn(req, res);

    doc._useResponseCache = true;
    doc._cacheKey = key;

    res.send(doc.render());
  };
}


function clearCache(pattern) {
  if (!pattern) {
    responseCache.clear();
  } else {
    // Clear matching keys
    for (const [key] of responseCache.cache) {
      if (key.includes(pattern)) {
        responseCache.cache.delete(key);
      }
    }
  }
}

// Express middleware for compression
function enableCompression() {
  return (req, res, next) => {
    const acceptEncoding = req.headers['accept-encoding'] || '';
    
    if (acceptEncoding.includes('gzip')) {
      const originalSend = res.send;
      res.send = function(data) {
        if (typeof data === 'string' && data.length > 1024) {
          const zlib = require('zlib');
          const compressed = zlib.gzipSync(data);
          res.setHeader('Content-Encoding', 'gzip');
          res.setHeader('Content-Length', compressed.length);
          return originalSend.call(this, compressed);
        }
        return originalSend.call(this, data);
      };
    }
    
    next();
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
  responseCache
};