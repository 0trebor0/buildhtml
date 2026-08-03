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

/* ---- HTML Tag Validation ---- */
const validTagNameRegex = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function isValidTagName(tag) {
  return typeof tag === 'string' && validTagNameRegex.test(tag);
}

function normalizeTagName(tag) {
  if (!tag || typeof tag !== 'string') {
    throw new TypeError('Element tag must be a non-empty string');
  }
  const normalized = toKebab(tag);
  if (!isValidTagName(normalized)) {
    throw new TypeError(`Invalid element tag: ${tag}`);
  }
  return normalized;
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
// Strip chars/patterns that can break out of a CSS property value or execute code.
// Semicolons end CSS declarations — never valid inside a value, so stripping them
// prevents CSS injection when user-supplied data reaches .css().
const cssValueRegex = /[<>"'{};\x00-\x08\x0B\x0C\x0E-\x1F]|\/\*|\*\/|expression\s*\(|url\s*\(\s*['"]?\s*(?:javascript|vbscript|data):/gi;
function sanitizeCssValue(value) {
  const s = String(value);
  const cleaned = s.replace(cssValueRegex, '');
  return cleaned.length <= 1000 ? cleaned : cleaned.substring(0, 1000);
}

/* ---- URL Sanitization ---- */
// Block javascript:, vbscript:, and data:text/html URLs in href/src/action.
// Control characters (used to bypass filters) are stripped before the protocol check.
const DANGEROUS_URL_RE = /^[\x00-\x20]*(?:javascript|vbscript|data)\s*:/i;
function sanitizeUrl(value) {
  if (value == null) return value;
  const s = String(value).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return DANGEROUS_URL_RE.test(s) ? '#' : s;
}

const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'cite', 'poster', 'xlink:href']);

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

function sanitizeFunctionSourceString(source, maxSize = 10000) {
  if (typeof source !== 'string') throw new TypeError('Expected function source');
  if (source.length > maxSize) throw new Error(`Function source too large: ${source.length} > ${maxSize}`);
  for (const pattern of dangerousPatterns) {
    if (pattern.test(source)) {
      throw new Error('Function contains potentially dangerous code pattern');
    }
  }
  try {
    new (require('vm').Script)(`(${source}\n)`);
  } catch {
    throw new Error('Invalid function source');
  }
  return source;
}

function sanitizeFunctionSource(fn, maxSize = 10000) {
  if (typeof fn !== 'function') throw new TypeError('Expected a function');
  return sanitizeFunctionSourceString(fn.toString(), maxSize);
}

const JS_KEYWORDS = new Set([
  'async','await','break','case','catch','class','const','continue','debugger','default','delete','do','else','export',
  'extends','false','finally','for','from','function','get','if','import','in','instanceof','let','new','null','of',
  'return','set','static','super','switch','this','throw','true','try','typeof','undefined','var','void','while','with','yield'
]);

const BROWSER_GLOBALS = new Set([
  'State','window','document','console','fetch','URL','URLSearchParams','Headers','Request','Response','FormData',
  'Promise','Object','Array','String','Number','Boolean','BigInt','Symbol','Math','JSON','Date','RegExp','Error',
  'TypeError','RangeError','Set','Map','WeakSet','WeakMap','Intl','location','history','navigator','localStorage',
  'sessionStorage','MutationObserver','IntersectionObserver','ResizeObserver','Event','CustomEvent','HTMLElement',
  'Node','Blob','File','FileReader','AbortController','TextEncoder','TextDecoder','WebSocket','crypto','performance',
  'requestAnimationFrame','cancelAnimationFrame','queueMicrotask','setTimeout','clearTimeout','setInterval','clearInterval',
  'alert','confirm','prompt','atob','btoa','structuredClone','NaN','Infinity','arguments'
]);

function maskFunctionLiterals(source) {
  let result = '';
  let state = 'code';
  let templateDepth = 0;
  let regexClass = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const next = source[i + 1];
    if (state === 'line') {
      if (c === '\n') { state = 'code'; result += '\n'; } else result += ' ';
    } else if (state === 'block') {
      if (c === '*' && next === '/') { result += '  '; i++; state = 'code'; } else result += c === '\n' ? '\n' : ' ';
    } else if (state === 'regex') {
      if (c === '\\') { result += '  '; i++; }
      else if (c === '[') { regexClass = true; result += ' '; }
      else if (c === ']') { regexClass = false; result += ' '; }
      else if (c === '/' && !regexClass) {
        result += ' '; state = 'code';
        while (/[a-z]/i.test(source[i + 1] || '')) { result += ' '; i++; }
      } else result += c === '\n' ? '\n' : ' ';
    } else if (state === 'single' || state === 'double' || state === 'template') {
      const end = state === 'single' ? "'" : state === 'double' ? '"' : '`';
      if (c === '\\') { result += '  '; i++; }
      else if (state === 'template' && c === '$' && next === '{') {
        result += '  '; i++; templateDepth = 1; state = 'code';
      }
      else if (c === end) { result += ' '; state = 'code'; }
      else result += c === '\n' ? '\n' : ' ';
    } else if (c === '/' && next === '/') {
      result += '  '; i++; state = 'line';
    } else if (c === '/' && next === '*') {
      result += '  '; i++; state = 'block';
    } else if (templateDepth > 0 && c === '{') { result += c; templateDepth++; }
    else if (templateDepth > 0 && c === '}') {
      result += ' ';
      templateDepth--;
      if (templateDepth === 0) state = 'template';
    } else if (c === "'") { result += ' '; state = 'single'; }
    else if (c === '"') { result += ' '; state = 'double'; }
    else if (c === '`') { result += ' '; state = 'template'; }
    else if (c === '/') {
      let previous = result.length - 1;
      while (previous >= 0 && /\s/.test(result[previous])) previous--;
      const beforeSlash = result.slice(0, i).trimEnd();
      if (previous < 0 || /[=(:,!&|?{};\[]/.test(result[previous]) || beforeSlash.endsWith('=>') || /\b(?:return|case|throw)$/.test(beforeSlash)) {
        result += ' '; state = 'regex'; regexClass = false;
      } else result += c;
    }
    else result += c;
  }
  return result;
}

/** Conservatively identify names that cannot be resolved inside a serialized browser callback. */
function findFreeVariables(source) {
  if (typeof source !== 'string') return [];
  const code = maskFunctionLiterals(source);
  const locals = new Set();
  const addNames = (part) => {
    const matches = String(part || '').match(/[A-Za-z_$][\w$]*/g) || [];
    for (const name of matches) if (!JS_KEYWORDS.has(name)) locals.add(name);
  };

  for (const match of code.matchAll(/\bfunction\s*([A-Za-z_$][\w$]*)?\s*\(([^)]*)\)/g)) {
    if (match[1]) locals.add(match[1]);
    addNames(match[2]);
  }
  for (const match of code.matchAll(/\(([^()]*)\)\s*=>/g)) addNames(match[1]);
  for (const match of code.matchAll(/\b([A-Za-z_$][\w$]*)\s*=>/g)) locals.add(match[1]);
  for (const match of code.matchAll(/\bcatch\s*\(([^)]*)\)/g)) addNames(match[1]);
  for (const match of code.matchAll(/\b(?:const|let|var)\s+([^;\n]+)/g)) {
    for (const declaration of match[1].split(',')) addNames(declaration.split('=')[0]);
  }
  for (const match of code.matchAll(/\b(?:class|function)\s+([A-Za-z_$][\w$]*)/g)) locals.add(match[1]);

  const free = new Set();
  const identifier = /[A-Za-z_$][\w$]*/g;
  let match;
  while ((match = identifier.exec(code))) {
    const name = match[0];
    if (JS_KEYWORDS.has(name) || BROWSER_GLOBALS.has(name) || locals.has(name)) continue;
    let before = match.index - 1;
    let after = identifier.lastIndex;
    while (before >= 0 && /\s/.test(code[before])) before--;
    while (after < code.length && /\s/.test(code[after])) after++;
    if (code[before] === '.' || code[before] === '#') continue;
    if (code[after] === ':') continue;
    free.add(name);
  }
  return [...free].sort();
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

/* ---- Safe JSON Embedding ---- */
// JSON is valid JavaScript, but raw "<" can terminate an enclosing <script> tag.
// U+2028/U+2029 are also escaped for compatibility with older JS parsers.
function safeJsonStringify(value) {
  const json = JSON.stringify(value);
  if (json === undefined) return 'undefined';
  return json
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/* ---- Attribute Key Validation ---- */
const validAttrKeyRegex = /^[a-zA-Z_][\w\-:.]*$/;
function isValidAttrKey(key) {
  // Block inline event handler attributes (onclick, onmouseover, etc.).
  // Events must be attached via .on() / .onClick() which compile to addEventListener.
  if (/^on[a-z]/i.test(key)) return false;
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
  sanitizeCssValue, sanitizeFunctionSource, sanitizeFunctionSourceString, findFreeVariables, minHTML,
  VOID_ELEMENTS, escapeJsString, isValidAttrKey,
  sanitizeUrl, URL_ATTRS, safeJsonStringify, isValidTagName, normalizeTagName
};
