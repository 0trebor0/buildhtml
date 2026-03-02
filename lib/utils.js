'use strict';

/* ---- ID Generation ---- */
let ridCounter = 0;
const ridPrefix = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
const createRidGenerator = () => () => `id-${ridPrefix}${(++ridCounter).toString(36)}`;

/* ---- FNV-1a Hash ---- */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return (h >>> 0).toString(36);
}

/* ---- LRU Kebab Cache ---- */
class KebabCache {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }
  get(key) {
    if (!this.cache.has(key)) return null;
    const v = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, v);
    return v;
  }
  set(key, value) {
    if (this.cache.has(key)) this.cache.delete(key);
    else if (this.cache.size >= this.maxSize) {
      this.cache.delete(this.cache.keys().next().value);
    }
    this.cache.set(key, value);
  }
}

const kebabCache = new KebabCache(500);
const kebabRegex = /[A-Z]/g;

function toKebab(str) {
  if (!str || typeof str !== 'string') return '';
  const cached = kebabCache.get(str);
  if (cached) return cached;
  const result = str.replace(kebabRegex, m => '-' + m.toLowerCase());
  kebabCache.set(str, result);
  return result;
}

/* ---- HTML Escaping ---- */
const escapeMap = Object.freeze({
  '&': '&amp;', '<': '&lt;', '>': '&gt;',
  '"': '&quot;', "'": '&#x27;', '/': '&#x2F;'
});
const escapeRegex = /[&<>"'\/]/g;
const escapeHtml = (text) => {
  if (text == null) return '';
  return String(text).replace(escapeRegex, m => escapeMap[m]);
};

const unescapeMap = Object.freeze({
  '&amp;': '&', '&lt;': '<', '&gt;': '>',
  '&quot;': '"', '&#x27;': "'", '&#x2F;': '/'
});
const unescapeRegex = /&(?:amp|lt|gt|quot|#x27|#x2F);/g;
const unescapeHtml = (text) => {
  if (text == null) return '';
  return String(text).replace(unescapeRegex, m => unescapeMap[m]);
};

/* ---- CSS Sanitization ---- */
const cssValueRegex = /[<>"'{}]/g;
function sanitizeCssValue(value) {
  return String(value).replace(cssValueRegex, '').replace(/\/\*/g, '').replace(/\*\//g, '').substring(0, 1000);
}

/* ---- Function Validation ---- */
function sanitizeFunctionSource(fn, maxSize = 10000) {
  if (typeof fn !== 'function') throw new TypeError('Expected a function');
  const source = fn.toString();
  if (source.length > maxSize) throw new Error(`Function source too large: ${source.length} > ${maxSize}`);
  if (source.includes('</script>') || source.includes('<script')) {
    throw new Error('Function contains potentially malicious script tags');
  }
  return source;
}

/* ---- HTML Minification ---- */
function minHTML(html) {
  return html
    .replace(/>\s+<|>\n+</g, m => m.includes('\n') || m.length > 3 ? '><' : ' > <')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

module.exports = {
  createRidGenerator, hash, toKebab, escapeHtml, unescapeHtml,
  sanitizeCssValue, sanitizeFunctionSource, minHTML
};
