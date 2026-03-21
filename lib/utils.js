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

/* ---- Kebab Cache (plain Map — CSS props and HTML attrs are a bounded set) ---- */
const kebabCache = new Map();
const kebabRegex = /[A-Z]/g;

function toKebab(str) {
  if (!str || typeof str !== 'string') return '';
  let cached = kebabCache.get(str);
  if (cached !== undefined) return cached;
  cached = str.replace(kebabRegex, m => '-' + m.toLowerCase());
  kebabCache.set(str, cached);
  return cached;
}

/* ---- HTML Escaping ---- */
const escapeMap = Object.freeze({
  '&': '&amp;', '<': '&lt;', '>': '&gt;',
  '"': '&quot;', "'": '&#x27;'
});
const escapeRegex = /[&<>"']/g;
const escapeHtml = (text) => {
  if (text == null) return '';
  return String(text).replace(escapeRegex, m => escapeMap[m]);
};

const unescapeMap = Object.freeze({
  '&amp;': '&', '&lt;': '<', '&gt;': '>',
  '&quot;': '"', '&#x27;': "'"
});
const unescapeRegex = /&(?:amp|lt|gt|quot|#x27);/g;
const unescapeHtml = (text) => {
  if (text == null) return '';
  return String(text).replace(unescapeRegex, m => unescapeMap[m]);
};

/* ---- CSS Sanitization ---- */
const cssValueRegex = /[<>"'{}]|\/\*|\*\/|expression\s*\(|url\s*\(\s*javascript:/gi;
function sanitizeCssValue(value) {
  const s = String(value);
  const cleaned = s.replace(cssValueRegex, '');
  return cleaned.length <= 1000 ? cleaned : cleaned.substring(0, 1000);
}

/* ---- Function Validation ---- */
const dangerousPatterns = [
  /<\/script>/i,
  /<script[\s>]/i,
  /document\.cookie/i,
  /\.innerHTML\s*=/i,
  /eval\s*\(/,
  /Function\s*\(/,
  /setTimeout\s*\(\s*["'`]/,
  /setInterval\s*\(\s*["'`]/
];

function sanitizeFunctionSource(fn, maxSize = 10000) {
  if (typeof fn !== 'function') throw new TypeError('Expected a function');
  const source = fn.toString();
  if (source.length > maxSize) throw new Error(`Function source too large: ${source.length} > ${maxSize}`);
  for (const pattern of dangerousPatterns) {
    if (pattern.test(source)) {
      throw new Error('Function contains potentially dangerous code pattern');
    }
  }
  return source;
}

/* ---- Void Elements ---- */
const VOID_ELEMENTS = new Set([
  'area','base','br','col','embed','hr','img','input',
  'link','meta','param','source','track','wbr'
]);

/* ---- Safe JS String Interpolation ---- */
/**
 * Escape a string for safe embedding inside a JS string literal (double-quoted).
 * Prevents breakout via ", \, newlines, and </script>.
 */
function escapeJsString(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/<\/(script)/gi, '<\\/$1');
}

/* ---- Attribute Key Validation ---- */
const validAttrKeyRegex = /^[a-zA-Z_][\w\-:.]*$/;
function isValidAttrKey(key) {
  return validAttrKeyRegex.test(key);
}

/* ---- HTML Minification ---- */
function minHTML(html) {
  // Preserve whitespace inside <pre>, <code>, <script>, <style>, <textarea>
  const preserved = [];
  const placeholder = '\x00PRESERVE';
  const result = html.replace(/<(pre|code|script|style|textarea)\b[^>]*>[\s\S]*?<\/\1>/gi, (match) => {
    preserved.push(match);
    return placeholder + (preserved.length - 1) + '\x00';
  });

  const minified = result
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Restore preserved blocks
  return minified.replace(/\x00PRESERVE(\d+)\x00/g, (_, idx) => preserved[idx]);
}

module.exports = {
  createRidGenerator, hash, toKebab, escapeHtml, unescapeHtml,
  sanitizeCssValue, sanitizeFunctionSource, minHTML,
  VOID_ELEMENTS, escapeJsString, isValidAttrKey
};
