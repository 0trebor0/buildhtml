// ======================================================
// ULTRA-PERFORMANCE SSR BUILDER v1.0.1 (FIXED)
// ======================================================

'use strict';

/* ---------------- CONFIG ---------------- */
const CONFIG = {
  mode: process.env.NODE_ENV === "production" ? "prod" : "dev",
  poolSize: 150,
  cacheLimit: 2000,
  maxCssCache: 1000,
  maxKebabCache: 500,
  compression: true
};

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
    if (type === 'elements') {
      resetElement(item, ...args);
    } else if (type === 'arrays') {
      item.length = 0;
    }
    return item;
  }
  
  switch (type) {
    case 'elements': return new Element(...args);
    case 'arrays': return [];
    case 'objects': return {};
    default: return null;
  }
}

function recycle(type, item) {
  const pool = pools[type];
  if (!pool || pool.length >= CONFIG.poolSize) return;
  
  if (type === 'elements' && item instanceof Element) {
    // FIX: Recursive recycling to prevent memory leaks and orphaned children
    for (let i = 0; i < item.children.length; i++) {
      const child = item.children[i];
      if (child instanceof Element) {
        recycle('elements', child);
      }
    }
    pool.push(item);
  } else if (type === 'arrays' && Array.isArray(item)) {
    item.length = 0;
    pool.push(item);
  } else if (type === 'objects' && typeof item === 'object') {
    for (const key in item) delete item[key];
    pool.push(item);
  }
}

function resetElement(el, tag, ridGen, stateStore) {
  el.tag = toKebab(tag);
  
  // Clear attrs object properties instead of replacing to reduce GC
  for (const key in el.attrs) delete el.attrs[key];
  
  // Reset arrays
  if (!el.children) el.children = [];
  else el.children.length = 0;
  
  if (!el.events) el.events = [];
  else el.events.length = 0;
  
  el.cssText = "";
  el._state = null;
  el.hydrate = false;
  el.computed = null;
  el._ridGen = ridGen;
  el._stateStore = stateStore;
}

/* ---------------- UTILITIES ---------------- */
let ridCounter = 0;
const ridPrefix = Date.now().toString(36);

const createRidGenerator = () => () => `id-${ridPrefix}${(++ridCounter).toString(36)}`;

// Simple 32-bit hash (for scoped class names)
const hash = (str) => {
  let h = 2166136261;
  const len = str.length;
  for (let i = 0; i < len; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return (h >>> 0).toString(36);
};

// Kebab-case conversion with LRU cache
const kebabCache = new Map();
const kebabRegex = /[A-Z]/g;

function toKebab(str) {
  if (!str || typeof str !== 'string') return "";
  
  const cached = kebabCache.get(str);
  if (cached) return cached;
  
  const result = str.replace(kebabRegex, m => "-" + m.toLowerCase());
  
  if (kebabCache.size >= CONFIG.maxKebabCache) {
    const firstKey = kebabCache.keys().next().value;
    kebabCache.delete(firstKey);
  }
  
  kebabCache.set(str, result);
  return result;
}

// HTML minification
const minHTML = (html) => html.replace(/>\s+</g, "><").replace(/\s{2,}/g, " ").trim();

// XSS protection
const escapeMap = Object.freeze({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
});
const escapeRegex = /[&<>"']/g;
const escapeHtml = (text) => String(text).replace(escapeRegex, m => escapeMap[m]);

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
    let cssStr = "";
    for (const k in s) {
      cssStr += toKebab(k) + ":" + s[k] + ";";
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
    let cssStr = selector + "{";
    for (const k in rules) {
      cssStr += toKebab(k) + ":" + rules[k] + ";";
    }
    cssStr += "}";
    this.globalStyles.push(cssStr);
    return this;
  }

  addClass(name, rules) {
    let cssStr = "";
    for (const k in rules) {
      cssStr += toKebab(k) + ":" + rules[k] + ";";
    }
    this.classStyles[name] = cssStr;
    return this;
  }

  render() {
    const parts = ['<meta charset="UTF-8"><title>', this.title, '</title>'];
    
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
    
    // Styles
    parts.push('<style>');
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
    
    // Scripts
    const scriptLen = this.scripts.length;
    for (let i = 0; i < scriptLen; i++) {
      parts.push('<script src="', escapeHtml(this.scripts[i]), '"></script>');
    }
    
    return parts.join('');
  }
}

/* ---------------- LRU CACHE ---------------- */
class LRUCache {
  constructor(limit) {
    this.limit = limit;
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
    } else if (this.cache.size >= this.limit) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  clear() {
    this.cache.clear();
  }
  
  delete(key) {
    this.cache.delete(key);
  }
  
  has(key) {
    return this.cache.has(key);
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
    this.body.push(el);
    return this;
  }

  /** Add multiple elements from a function (for composition/layouts). fn(doc) returns Element or Element[]. */
  useFragment(fn) {
    const els = fn(this);
    const arr = Array.isArray(els) ? els : [els];
    for (let i = 0; i < arr.length; i++) {
      const el = arr[i];
      if (el != null && el instanceof Element) this.use(el);
    }
    return this;
  }

  createElement(tag) {
    return getPooled('elements', tag, this._ridGen, this._stateStore);
  }

  /** Shorthand for createElement(tag). */
  create(tag) {
    return this.createElement(tag);
  }

  clear() {
    const bodyLen = this.body.length;
    for (let i = 0; i < bodyLen; i++) {
      if (this.body[i] instanceof Element) {
        recycle('elements', this.body[i]);
      }
    }
    this.body.length = 0;
    this._stateStore = {};
  }

  render() {
    if (this._useResponseCache && this._cacheKey) {
      const cached = responseCache.get(this._cacheKey);
      if (cached) {
        this.clear();
        return cached;
      }
    }

    const ctx = {
      events: getPooled('arrays'),
      states: getPooled('arrays'),
      styles: [],
      computed: getPooled('arrays')
    };

    const bodyParts = [];
    const bodyLen = this.body.length;
    for (let i = 0; i < bodyLen; i++) {
      bodyParts.push(renderNode(this.body[i], ctx));
    }

    const bodyHTML = bodyParts.join('');
    const headHTML = this.head.render();
    const stylesHTML = ctx.styles.length > 0 ? '<style>' + ctx.styles.join('') + '</style>' : '';
    const clientJS = compileClient(ctx);

    // FIX: clientJS is injected inside body, maintaining requirement.
    const html = `<!DOCTYPE html><html lang="en"><head>${headHTML}${stylesHTML}</head><body>${bodyHTML}${clientJS ? '<script>' + clientJS + '</script>' : ''}</body></html>`;

    recycle('arrays', ctx.events);
    recycle('arrays', ctx.states);
    recycle('arrays', ctx.computed);

    const result = CONFIG.mode === "prod" ? minHTML(html) : html;

    if (this._useResponseCache && this._cacheKey) {
      responseCache.set(this._cacheKey, result);
    }

    this.clear();
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
  if (!(n instanceof Element)) return n;

  const parts = ['<', n.tag];

  for (const k in n.attrs) {
    parts.push(' ', toKebab(k), '="', escapeHtml(n.attrs[k]), '"');
  }

  parts.push('>');

  if (n.cssText) ctx.styles.push(n.cssText);

  if (n._state !== null) {
    ctx.states.push({ id: n.attrs.id, value: n._state, tag: n.tag });
  }

  if (n.computed) {
    ctx.computed.push({ id: n.attrs.id, fn: n.computed.toString() });
  }

  // FIX: Properly skip children for void elements to avoid illegal HTML
  if (!voidElements.has(n.tag)) {
    const childLen = n.children.length;
    for (let i = 0; i < childLen; i++) {
      parts.push(renderNode(n.children[i], ctx));
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

  if (!hasStates && !hasComputed && !hasEvents) {
    return '';
  }

  // FIX: Moved helper functions inside the scope to prevent global pollution
  const parts = [
    'window.state={};',
    'document.addEventListener("DOMContentLoaded",function(){',
    'const getById=id=>document.getElementById(id);'
  ];

  // States (use .value for input/textarea, .textContent for others)
  const stateLen = ctx.states.length;
  const valueProp = (tag) => (tag === 'input' || tag === 'textarea' ? 'value' : 'textContent');
  for (let i = 0; i < stateLen; i++) {
    const s = ctx.states[i];
    const prop = valueProp(s.tag || '');
    parts.push(
      'window.state["', s.id, '"]=', JSON.stringify(s.value), ';',
      '(function(){var _el=getById("', s.id, '");if(_el)_el.', prop, '=window.state["', s.id, '"];})();'
    );
  }

  // Computed
  const computedLen = ctx.computed.length;
  for (let i = 0; i < computedLen; i++) {
    const c = ctx.computed[i];
    parts.push('(function(){var _el=getById("', c.id, '");if(_el)_el.textContent=(', c.fn, ')(window.state);})();');
  }

  // Events
  const eventLen = ctx.events.length;
  for (let i = 0; i < eventLen; i++) {
    const e = ctx.events[i];
    let f = e.fn.toString();
    if (e.targetId) {
      f = f.replace(/__STATE_ID__/g, e.targetId);
    }
    parts.push('(function(){var _el=getById("', e.id, '");if(_el)_el.addEventListener("', e.event, '",', f, ');})();');
  }

  parts.push('});');
  return parts.join('');
}

/* ---------------- MIDDLEWARE HELPERS ---------------- */
function createCachedRenderer(builderFn, cacheKeyOrFn) {
  return (req, res, next) => {
    const key = typeof cacheKeyOrFn === 'function' ? cacheKeyOrFn(req) : cacheKeyOrFn;

    if (key == null || key === '') {
      try {
        const doc = builderFn(req);
        if (!doc || !(doc instanceof Document)) {
          return res.status(500).send('Internal Server Error');
        }
        return res.send(doc.render());
      } catch (err) {
        return next(err);
      }
    }

    const cached = responseCache.get(key);
    if (cached) {
      return res.send(cached);
    }

    let promise = inFlightCache.get(key);
    if (!promise) {
      promise = Promise.resolve().then(() => {
        const doc = builderFn(req);
        if (!doc || !(doc instanceof Document)) {
          const err = new Error('Builder function must return a Document instance');
          err.status = 500;
          throw err;
        }
        doc._useResponseCache = true;
        doc._cacheKey = key;
        return doc.render();
      });
      inFlightCache.set(key, promise);
      promise.then((html) => {
        responseCache.set(key, html);
      }).finally(() => {
        inFlightCache.delete(key);
      });
    }

    promise.then((html) => res.send(html)).catch((err) => {
      if (err.status === 500) {
        res.status(500).send('Internal Server Error');
      } else {
        next(err);
      }
    });
  };
}

function clearCache(pattern) {
  if (!pattern) {
    responseCache.clear();
    inFlightCache.clear();
    return;
  }

  const keysToDelete = [];
  for (const [key] of responseCache.cache) {
    if (key.includes(pattern)) keysToDelete.push(key);
  }
  for (const key of inFlightCache.keys()) {
    if (key.includes(pattern) && !keysToDelete.includes(key)) keysToDelete.push(key);
  }
  const len = keysToDelete.length;
  for (let i = 0; i < len; i++) {
    responseCache.delete(keysToDelete[i]);
    inFlightCache.delete(keysToDelete[i]);
  }
}

// Compression middleware
function enableCompression() {
  return (req, res, next) => {
    const acceptEncoding = req.headers['accept-encoding'];
    
    if (acceptEncoding && acceptEncoding.includes('gzip')) {
      const originalSend = res.send;
      res.send = function(data) {
        if (typeof data === 'string' && data.length > 1024) {
          try {
            const zlib = require('zlib');
            const compressed = zlib.gzipSync(data);
            this.setHeader('Content-Encoding', 'gzip');
            this.setHeader('Content-Length', compressed.length);
            return originalSend.call(this, compressed);
          } catch (err) {
            return originalSend.call(this, data);
          }
        }
        return originalSend.call(this, data);
      };
    }
    
    next();
  };
}

// Warmup cache helper
function warmupCache(routes) {
  const results = [];
  
  for (const route of routes) {
    const { key, builder } = route;
    try {
      const doc = builder();
      if (!doc || !(doc instanceof Document)) {
        results.push({ key, error: 'Builder must return a Document instance', success: false });
        continue;
      }
      doc._useResponseCache = true;
      doc._cacheKey = key;
      const html = doc.render();
      results.push({ key, size: html.length, success: true });
    } catch (err) {
      results.push({ key, error: err.message, success: false });
    }
  }
  
  return results;
}

// Stats helper
function getCacheStats() {
  return {
    size: responseCache.cache.size,
    limit: CONFIG.cacheLimit,
    usage: ((responseCache.cache.size / CONFIG.cacheLimit) * 100).toFixed(2) + '%',
    keys: Array.from(responseCache.cache.keys()),
    poolStats: {
      elements: pools.elements.length,
      arrays: pools.arrays.length,
      objects: pools.objects.length
    }
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
  getCacheStats
};