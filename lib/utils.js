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
// Quotes are kept: they are required by valid CSS (content: "x", font-family:
// "Fira Code") and cannot escape either destination — a <style> block can only be
// closed by "</style>" and "<" is stripped here, while a style attribute value is
// HTML-escaped at render time.
// Shared with the _mkEl client runtime, which used to carry its own hand-copied
// version. That copy also stripped quotes, so `font-family: "Fira Code"` survived
// server rendering and silently lost its quotes the moment a reactive list
// rebuilt the same node on the client.
const CSS_VALUE_STRIP_SOURCE =
  '[<>{};\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]|\\/\\*|\\*\\/|expression\\s*\\(|url\\s*\\(\\s*[\'"]?\\s*(?:javascript|vbscript|data):';

const cssValueRegex = new RegExp(CSS_VALUE_STRIP_SOURCE, 'gi');
function sanitizeCssValue(value) {
  const s = String(value);
  const cleaned = s.replace(cssValueRegex, '');
  return cleaned.length <= 1000 ? cleaned : cleaned.substring(0, 1000);
}

/** JS source for a client-side CSS value sanitiser body: `valueExpr` -> safe string. */
function clientCssValueSanitizerBody(valueExpr = 'v') {
  return `return String(${valueExpr}).replace(/${CSS_VALUE_STRIP_SOURCE}/gi,"").slice(0,1000);`;
}

/* ---- CSS Identifier / Selector Validation ---- */
// sanitizeCssValue() only ever saw the value half of a declaration. A property
// NAME reaches the stylesheet unfiltered, so `css({ 'color:red}</style><script>': 'x' })`
// closed the <style> element and ran script. Names are validated, never rewritten:
// silently turning "a;b" into "ab" would invent a declaration the caller never wrote.
const cssCustomPropertyRegex = /^--[A-Za-z0-9_-]+$/;
const cssPropertyRegex = /^-?[A-Za-z][A-Za-z0-9-]*$/;

/** `--brand-color` and friends. */
function isValidCssCustomProperty(name) {
  return typeof name === 'string' && name.length <= 128 && cssCustomPropertyRegex.test(name);
}

/** `color`, `-webkit-font-smoothing`, or any custom property. */
function isValidCssProperty(name) {
  if (typeof name !== 'string' || name.length === 0 || name.length > 128) return false;
  if (name.startsWith('--')) return isValidCssCustomProperty(name);
  return cssPropertyRegex.test(name);
}

// A selector legitimately contains ">", "+", "~", quotes and brackets, so this is
// a denylist of what cannot appear rather than a whitelist of what can: "<" (the
// only way to close a <style> element), the declaration punctuation that would
// let a selector open or close a block, and comment markers.
const unsafeCssSelectorRegex = /[<{};\\\x00-\x1F\x7F]|\/\*|\*\//;

function isSafeCssSelector(selector) {
  return typeof selector === 'string'
    && selector.length > 0
    && selector.length <= 500
    && !unsafeCssSelectorRegex.test(selector);
}

const classNameRegex = /^-?[A-Za-z_][A-Za-z0-9_-]*$/;

function isValidClassName(name) {
  return typeof name === 'string' && name.length <= 128 && classNameRegex.test(name);
}

// Guard for already-compiled CSS restored from a snapshot (cssText, globalStyles,
// classStyles). Everything this library compiles is free of "<" — values are run
// through sanitizeCssValue and names/selectors through the checks above — so this
// rejects tampered input without touching a single legitimate round trip.
function isSafeRawCss(css) {
  return typeof css === 'string' && !/[<\x00-\x08\x0B\x0C\x0E-\x1F]/.test(css);
}

/**
 * Compile a { property: value } object into validated `prop:value` declarations.
 *
 * A property name that does not pass isValidCssProperty() is DROPPED, never
 * rewritten — silently deleting the ";" from "color;background:url(x)" would
 * emit a declaration the caller never asked for. `onInvalid` lets the call site
 * report the rejection (dev warning, callback-failure record) without this
 * helper needing to know where it is being used.
 *
 * Custom properties keep their exact case: `--brandColor` and `--brandcolor`
 * are different properties in CSS, so kebab-casing them would rename them.
 */
function compileCssDeclarations(rules, onInvalid) {
  const parts = [];
  if (!rules || typeof rules !== 'object') return parts;
  for (const key in rules) {
    const prop = typeof key === 'string' && key.startsWith('--') ? key : toKebab(key);
    if (!isValidCssProperty(prop)) {
      if (typeof onInvalid === 'function') onInvalid(key);
      continue;
    }
    parts.push(`${prop}:${sanitizeCssValue(rules[key])}`);
  }
  return parts;
}

/** Dev-only notice that a CSS name was rejected. Silent in prod. */
function warnInvalidCss(where, name) {
  const { CONFIG } = require('./config');
  if (CONFIG.mode === 'dev') {
    console.warn(`[${where}] Ignored invalid CSS name: ${JSON.stringify(String(name)).slice(0, 120)}`);
  }
}

/* ---- URL Sanitization ---- */
// Block javascript:, vbscript:, and data:text/html URLs in href/src/action.
// Control characters (used to bypass filters) are stripped before the protocol check.
// The strip must cover the whole C0 range including tab, LF, and CR: the URL
// parser removes those three from an attribute value, so leaving them in meant
// "java\tscript:" passed this check and the browser then reassembled it into a
// working javascript: URL. Space (\x20) is deliberately not stripped — the
// regex already tolerates leading whitespace, and a space elsewhere is ordinary
// URL content.
//
// These two patterns are the single source of truth for URL sanitisation. The
// same check runs in three places — here on the server, in the reactive
// bindAttr() guard, and in the _mkEl list runtime — and keeping them as separate
// hand-copied regex literals is exactly how the tab/LF/CR hole survived: the
// server strip set was widened to the full C0 range, and neither generated copy
// was updated, so a reactive binding still resurrected "java\tscript:". Both
// clients are now built from these strings, so they cannot drift again.
const URL_CONTROL_STRIP_SOURCE = '[\\x00-\\x1F\\x7F]';
const DANGEROUS_URL_SOURCE = '^[\\x00-\\x20]*(?:javascript|vbscript|data)\\s*:';

const URL_CONTROL_STRIP_RE = new RegExp(URL_CONTROL_STRIP_SOURCE, 'g');
const DANGEROUS_URL_RE = new RegExp(DANGEROUS_URL_SOURCE, 'i');

function sanitizeUrl(value) {
  if (value == null) return value;
  const s = String(value).replace(URL_CONTROL_STRIP_RE, '');
  return DANGEROUS_URL_RE.test(s) ? '#' : s;
}

/**
 * JS source for a client-side sanitiser body: reads `valueExpr`, returns a safe
 * URL string. Emitted into generated page script, so it stays ES5 and self
 * contained.
 */
function clientUrlSanitizerBody(valueExpr = 'v') {
  return `var _u=String(${valueExpr}).replace(/${URL_CONTROL_STRIP_SOURCE}/g,"");`
    + `return /${DANGEROUS_URL_SOURCE}/i.test(_u)?"#":_u;`;
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
 * Escape a string for safe embedding inside a JS string literal.
 *
 * Both quote styles and "<" are escaped as \uXXXX, which is valid in a single-
 * quoted literal, a double-quoted literal and a template literal alike, and
 * evaluates back to the original character. Two things went wrong when this
 * only handled `"`, `\`, newlines and the exact sequence `</script`:
 *
 *  - `<` survived, so a value containing "<!--<script>" put the HTML tokenizer
 *    into its script-data-double-escaped state, where `</script>` no longer ends
 *    the element — swallowing the rest of the document as script text.
 *  - `'` survived, and renderer.js substitutes an escaped id into __STATE_ID__
 *    inside the *caller's* function source, where the surrounding literal is
 *    usually single-quoted: getElementById('__STATE_ID__'). An id of
 *    "x');alert(1);//" closed that literal and appended executable statements.
 *
 * Escaping the quote characters rather than the enclosing context is what makes
 * this safe wherever the result is interpolated.
 */
function escapeJsString(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, '\\u0027')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
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

/* ---- Bindable DOM Property Classification ----
 *
 * bindProp() assigns `el[prop] = fn(value)` in the browser, so the property name
 * decides what the assignment MEANS. Three of them are HTML parsing sinks —
 * assigning to them turns a state value into live markup, which is the one thing
 * every other binding kind is careful not to do — and six are URL sinks that need
 * the same scheme check a rendered href gets. Everything else is classified by an
 * allowlist: a binding that is not known to be inert is refused rather than
 * compiled, because a property that turns out to be a sink is a silent XSS and a
 * property that is merely unsupported is a visible error.
 */
const MARKUP_SINK_PROPS = new Set(['innerHTML', 'outerHTML', 'srcdoc']);

// Compared case-insensitively: the DOM spells it formAction, HTML spells it
// formaction, and callers use both.
const URL_SINK_PROPS = new Set(['href', 'src', 'action', 'formaction', 'poster', 'cite']);

const SAFE_BINDABLE_PROPS = new Set([
  'value', 'checked', 'selected', 'disabled', 'open', 'hidden',
  'readOnly', 'required', 'textContent'
]);

/** 'markup' (never compile), 'url' (compile with a scheme guard), 'safe', or 'unknown'. */
function classifyBindableProp(prop) {
  if (typeof prop !== 'string' || prop.length === 0) return 'unknown';
  if (MARKUP_SINK_PROPS.has(prop)) return 'markup';
  if (URL_SINK_PROPS.has(prop.toLowerCase())) return 'url';
  if (SAFE_BINDABLE_PROPS.has(prop)) return 'safe';
  return 'unknown';
}

/* ---- Attribute Key Validation ---- */
// Shared with the _mkEl client runtime. Its copy tested /^on[a-z]/i without the
// optional dash, so `attrs: { 'on-click': '…' }` — which is what attr('onClick')
// kebab-cases to — was rejected by the server and ACCEPTED by the client, adding
// a live inline handler the moment a reactive list rebuilt the node.
const ATTR_KEY_SOURCE = '^[a-zA-Z_][\\w\\-:.]*$';
// The separator also covers ":" because the template attribute parser keeps a
// colon inside an attribute name — needed for xlink:href — which would otherwise
// let "on:click" through to the renderer. No browser honours that form, but the
// documented guarantee is that no inline on* attribute is ever emitted, and the
// guard should not depend on a parser bug to hold.
//
// The lookahead excepts the ordinary English words that merely begin with "on".
// A bare prefix test refused `one`, `only`, `once` and `online` as if they were
// event handlers. Enumerating those is the cheap direction: the alternative is
// matching a ~70-name list of real HTML events, which this string cannot afford
// because it is embedded verbatim into every page that renders a reactive list.
// Excepting known words keeps the rule fail-closed — an "on" name that is not
// one of these, including any event added to HTML later, is still refused.
const EVENT_ATTR_SOURCE = '^on(?!e$|ly$|ce$|line$|set$)[-:]?[a-z]';

const validAttrKeyRegex = new RegExp(ATTR_KEY_SOURCE);

/** JS source for a client-side attribute-key predicate body: `keyExpr` -> boolean. */
function clientAttrKeyValidatorBody(keyExpr = 'k') {
  return `return /${ATTR_KEY_SOURCE}/.test(${keyExpr})&&!/${EVENT_ATTR_SOURCE}/i.test(${keyExpr});`;
}

function isValidAttrKey(key) {
  // Block inline event handler attributes (onclick, onmouseover, etc.).
  // Events must be attached via .on() / .onClick() which compile to addEventListener.
  // The optional dash also catches camelCase keys such as attr('onClick'), which
  // toKebab rewrites to "on-click" before this check runs.
  if (new RegExp(EVENT_ATTR_SOURCE, 'i').test(key)) return false;
  return validAttrKeyRegex.test(key);
}

/* ---- Event Listener Options ---- */
// on() and the 26 shorthands accept these; the first three reach
// addEventListener's third argument, the last two compile into the generated
// wrapper ahead of the user callback.
//
// Normalising here rather than at each call site is what keeps the three
// consumers — on(), the JSON restore in builder.js, and the renderer that emits
// the call — reading the same key set. The URL and CSS sanitisers above carry
// the same note for the same reason: hand-copied duplicates are how the
// tab/LF/CR hole survived.
const LISTENER_OPTION_KEYS = Object.freeze(['once', 'passive', 'capture']);
const EVENT_MODIFIER_KEYS = Object.freeze(['preventDefault', 'stopPropagation']);

/**
 * Reduce a caller's options object to known boolean flags.
 *
 * Values are coerced to real booleans and unknown keys dropped, so nothing a
 * caller supplies is ever interpolated into the generated script as data — the
 * renderer only ever emits the literals `true` and `false` from this result.
 * Returns null when nothing is set, which keeps the emitted call byte-identical
 * to the pre-options output for every existing page.
 */
function normalizeEventOptions(options) {
  if (!options || typeof options !== 'object') return null;
  let result = null;
  // Own properties only. An inherited flag — from a polluted Object.prototype or
  // an object literal carrying "__proto__" — would otherwise switch a listener
  // option on for every element that never asked for it.
  for (const key of LISTENER_OPTION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(options, key) && options[key]) {
      (result || (result = {}))[key] = true;
    }
  }
  for (const key of EVENT_MODIFIER_KEYS) {
    if (Object.prototype.hasOwnProperty.call(options, key) && options[key]) {
      (result || (result = {}))[key] = true;
    }
  }
  return result;
}

/** The `addEventListener` third argument, or '' when no listener option is set. */
function listenerOptionsSource(options) {
  if (!options) return '';
  const parts = LISTENER_OPTION_KEYS.filter(k => options[k]).map(k => `${k}:true`);
  return parts.length ? `,{${parts.join(',')}}` : '';
}

/** Statements run before the user callback, for preventDefault/stopPropagation. */
function eventModifierSource(options) {
  if (!options) return '';
  let src = '';
  if (options.preventDefault) src += 'event.preventDefault();';
  if (options.stopPropagation) src += 'event.stopPropagation();';
  return src;
}

/* ---- HTML Minification ---- */
const PRESERVED_BLOCK_RE = /<(pre|code|script|style|textarea)\b[^>]*>[\s\S]*?<\/\1>/gi;

/**
 * Collapse insignificant whitespace, leaving <pre>, <code>, <script>, <style>
 * and <textarea> byte-for-byte intact.
 *
 * This used to swap each protected block for a "\x00PRESERVE<n>\x00" token and
 * substitute it back at the end. The token was caller-forgeable: text containing
 * a literal "\x00PRESERVE0\x00" was not a placeholder this function created, but
 * the restore pass could not tell the difference and expanded it anyway — so a
 * page could duplicate a protected block, or move it somewhere it was never
 * written. Nothing is inserted into the string now: the input is scanned once
 * into alternating plain and protected segments, only the plain ones are
 * rewritten, and the pieces are concatenated. There is no token to collide with.
 */
function minHTML(html) {
  const segments = [];
  let last = 0;
  PRESERVED_BLOCK_RE.lastIndex = 0;
  let match;
  while ((match = PRESERVED_BLOCK_RE.exec(html)) !== null) {
    if (match.index > last) segments.push({ text: html.slice(last, match.index), keep: false });
    segments.push({ text: match[0], keep: true });
    last = match.index + match[0].length;
  }
  if (last < html.length) segments.push({ text: html.slice(last), keep: false });

  // Collapse to a single space rather than deleting it. Rendered markup never
  // contains whitespace between tags (parts are joined with no separator), so a
  // match here is a text node the caller put there — and dropping it would join
  // adjacent inline elements, e.g. "<span>a</span> <span>b</span>" -> "ab".
  for (const segment of segments) {
    if (segment.keep) continue;
    segment.text = segment.text.replace(/>\s+</g, '> <').replace(/\s{2,}/g, ' ');
  }

  // trim() applied to the whole result, as before — but only the outermost plain
  // segments can lose characters, never a protected block.
  const first = segments.find(s => !s.keep);
  const lastPlain = [...segments].reverse().find(s => !s.keep);
  if (first && first === segments[0]) first.text = first.text.replace(/^\s+/, '');
  if (lastPlain && lastPlain === segments[segments.length - 1]) {
    lastPlain.text = lastPlain.text.replace(/\s+$/, '');
  }

  return segments.map(s => s.text).join('');
}

module.exports = {
  createRidGenerator, hash, toKebab, escapeHtml, unescapeHtml,
  sanitizeCssValue, sanitizeFunctionSource, sanitizeFunctionSourceString, findFreeVariables, minHTML,
  isValidCssProperty, isValidCssCustomProperty, isSafeCssSelector, isValidClassName, isSafeRawCss,
  compileCssDeclarations, warnInvalidCss,
  VOID_ELEMENTS, escapeJsString, isValidAttrKey,
  sanitizeUrl, URL_ATTRS, safeJsonStringify, isValidTagName, normalizeTagName,
  clientUrlSanitizerBody, URL_CONTROL_STRIP_SOURCE, DANGEROUS_URL_SOURCE, classifyBindableProp,
  clientAttrKeyValidatorBody, clientCssValueSanitizerBody,
  normalizeEventOptions, listenerOptionsSource, eventModifierSource
};
