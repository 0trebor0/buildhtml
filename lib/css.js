'use strict';

/**
 * The CSS compiler.
 *
 * Every stylesheet byte this library emits is produced here: declaration
 * compilation, value sanitisation, name and selector validation, the scoped
 * class hash, rule de-duplication, and the pseudo/media rule shapes. `Element`,
 * `Document`, `Head`, `builder` and `live` all call into this module rather than
 * assembling rule text themselves.
 *
 * That centralisation is not tidiness. These checks used to exist in four
 * partial copies, and the copies disagreed: `Document.mediaQuery()` validated
 * its query while `Element.media()` did not, `Head.globalCss()` validated its
 * selector while `Element.pseudo()` did not, and `live.js` compiled declarations
 * without validating property names at all. Each gap was a way to write
 * arbitrary text into a <style> block. One implementation cannot disagree with
 * itself.
 */

const { toKebab, hash } = require('./utils');

/* ==== VALUE SANITISATION ==== */

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

/* ==== NAME AND SELECTOR VALIDATION ==== */

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

/**
 * An at-rule prelude — the text between `@media` and its `{`.
 *
 * Identical to the selector rule and deliberately so: both are written into the
 * stylesheet verbatim ahead of a `{`, so both can only be attacked the same way.
 * `Document.mediaQuery()` has always checked this; `Element.media()` interpolated
 * its argument unchecked, which meant `media('x{}</style><script>…', …)` closed
 * the style element from an element-level call.
 */
function isSafeMediaQuery(query) {
  return isSafeCssSelector(query);
}

/**
 * The prelude of any conditional at-rule — `@media`, `@supports`, `@container`.
 *
 * All three are the same problem: caller text written verbatim ahead of a `{`.
 * `@supports (display: grid)` legitimately contains a colon and parentheses, and
 * `@container card (min-width: 20em)` a name as well, so the check stays the
 * denylist the selector rule already is rather than trying to parse three
 * grammars. A prelude containing a brace, a semicolon, a `<` or a comment marker
 * is refused whichever at-rule it was headed for.
 */
function isSafeAtRulePrelude(prelude) {
  return isSafeCssSelector(prelude);
}

// A cascade layer name is an identifier, optionally dotted for nesting
// (`base.typography`). Anonymous layers — `@layer {}` — are deliberately not
// offered: they cannot be referenced from a layer order, so a caller who wants
// ordering could not get it, and a caller who does not want ordering does not
// need a layer.
const layerNameRegex = /^[A-Za-z_-][A-Za-z0-9_-]*(?:\.[A-Za-z_-][A-Za-z0-9_-]*)*$/;

function isValidLayerName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 128 && layerNameRegex.test(name);
}

const classNameRegex = /^-?[A-Za-z_][A-Za-z0-9_-]*$/;

function isValidClassName(name) {
  return typeof name === 'string' && name.length <= 128 && classNameRegex.test(name);
}

/**
 * A pseudo-class or pseudo-element suffix, with the optional argument that
 * `:nth-child()`, `:not()`, `:is()` and `:lang()` take.
 *
 * `Element.pseudo()`, `_pseudoClass()` and `nthChild()` interpolated this
 * straight into the rule they emit, so `nthChild('1){} body{display:none} .x:nth-child(1', …)`
 * wrote whole rules of the caller's choosing into the page, and a "}</style>"
 * argument escaped the element entirely. The argument body allows the punctuation
 * real selectors need but none of the four characters that can leave a rule:
 * `{`, `}`, `;` and `<`.
 */
const pseudoNameRegex = /^[A-Za-z][A-Za-z0-9-]*$/;
const pseudoArgumentRegex = /^[A-Za-z0-9_+\-. #,:*\[\]="'>~^$|()\s]*$/;

function isSafePseudoSelector(pseudo) {
  if (typeof pseudo !== 'string' || pseudo.length === 0 || pseudo.length > 128) return false;
  const open = pseudo.indexOf('(');
  if (open === -1) return pseudoNameRegex.test(pseudo);
  if (!pseudo.endsWith(')')) return false;
  const name = pseudo.slice(0, open);
  const argument = pseudo.slice(open + 1, -1);
  return pseudoNameRegex.test(name) && pseudoArgumentRegex.test(argument);
}

/**
 * A pseudo-ELEMENT never takes a selector argument, so `::before(x)` is refused
 * rather than passed through. Kept separate from the pseudo-class check because
 * the two are emitted with different punctuation (`::` vs `:`).
 */
function isSafePseudoElement(name) {
  return typeof name === 'string' && name.length <= 128 && pseudoNameRegex.test(name);
}

// Guard for already-compiled CSS restored from a snapshot (cssText, globalStyles,
// classStyles). Everything this library compiles is free of "<" — values are run
// through sanitizeCssValue and names/selectors through the checks above — so this
// rejects tampered input without touching a single legitimate round trip.
function isSafeRawCss(css) {
  return typeof css === 'string' && !/[<\x00-\x08\x0B\x0C\x0E-\x1F]/.test(css);
}

/** Dev-only notice that a CSS name was rejected. Silent in prod. */
function warnInvalidCss(where, name) {
  const { CONFIG } = require('./config');
  if (CONFIG.mode === 'dev') {
    console.warn(`[${where}] Ignored invalid CSS name: ${JSON.stringify(String(name)).slice(0, 120)}`);
  }
}

/* ==== DECLARATION COMPILATION AND CANONICAL ORDER ==== */

/**
 * The property family a declaration belongs to — `margin` for both `margin` and
 * `margin-top`, `webkit` for `-webkit-font-smoothing`, the whole name for a
 * custom property.
 *
 * Canonical ordering sorts BETWEEN families and preserves author order WITHIN
 * one. That distinction is the whole reason this function exists: sorting every
 * declaration alphabetically would reorder `{ marginTop: '5px', margin: 0 }` into
 * `margin; margin-top`, silently inverting which one wins the cascade. Two
 * declarations can only override each other when they share a family, so leaving
 * intra-family order alone is what makes the reordering safe.
 */
function propertyFamily(prop) {
  if (prop.startsWith('--')) return prop;
  return prop.replace(/^-+/, '').split('-')[0];
}

/**
 * Validate and canonicalise a { property: value } object into ordered
 * `[property, value]` pairs.
 *
 * A property name that does not pass isValidCssProperty() is DROPPED, never
 * rewritten — silently deleting the ";" from "color;background:url(x)" would
 * emit a declaration the caller never asked for. `onInvalid` lets the call site
 * report the rejection (dev warning, callback-failure record) without this
 * helper needing to know where it is being used.
 *
 * Custom properties keep their exact case: `--brandColor` and `--brandcolor`
 * are different properties in CSS, so kebab-casing them would rename them.
 *
 * The canonical order is what makes `{ color, margin }` and `{ margin, color }`
 * compile to one rule and one class instead of two identical ones under
 * different hashes.
 */
function canonicalizeDeclarations(rules, onInvalid) {
  const declarations = [];
  if (!rules || typeof rules !== 'object') return declarations;
  let index = 0;
  // Object.keys(), not for-in: an inherited key from a polluted Object.prototype
  // would otherwise become a declaration in every compiled rule.
  for (const key of Object.keys(rules)) {
    const prop = typeof key === 'string' && key.startsWith('--') ? key : toKebab(key);
    if (!isValidCssProperty(prop)) {
      if (typeof onInvalid === 'function') onInvalid(key);
      continue;
    }
    declarations.push({ prop, value: sanitizeCssValue(rules[key]), family: propertyFamily(prop), index: index++ });
  }
  // Sorted on the decorated index rather than relying on the engine's sort being
  // stable, so same-family declarations keep author order on every runtime.
  declarations.sort((a, b) => (a.family < b.family ? -1 : a.family > b.family ? 1 : a.index - b.index));
  return declarations.map(d => [d.prop, d.value]);
}

/**
 * Compile to the `prop:value` parts every call site joins with ";".
 * Retained as the shape the existing callers expect; the ordering is canonical.
 */
function compileCssDeclarations(rules, onInvalid) {
  return canonicalizeDeclarations(rules, onInvalid).map(([prop, value]) => `${prop}:${value}`);
}

/**
 * Compile to a finished declaration block body: `a:b;c:d;`, or '' when nothing
 * survived validation. The trailing semicolon matches what every emitter in the
 * library produced before this module existed.
 */
function compileDeclarationText(rules, onInvalid) {
  const parts = compileCssDeclarations(rules, onInvalid);
  return parts.length > 0 ? parts.join(';') + ';' : '';
}

/* ==== SCOPED CLASS HASHING ==== */

/**
 * The scoped class name for a compiled declaration block.
 *
 * `prefix` keeps the four rule kinds in separate namespaces ('c' plain, 'h'
 * pseudo-class, 'p' pseudo-element, 'm' media), and `scope` is the extra text
 * that makes a rule distinct within its kind — the pseudo name or the media
 * query. Two calls agreeing on all three get the same class, which is exactly
 * what de-duplication depends on.
 */
function scopedClassName(prefix, declarationText, scope = '') {
  return prefix + hash(scope + declarationText);
}

/* ==== RULE STORAGE AND DE-DUPLICATION ==== */

/**
 * The compiled rules attached to one element, keyed by scoped class name.
 *
 * This replaced a plain concatenated `cssText` string, which could not
 * de-duplicate: `el.css({ color: 'red' }).css({ color: 'red' })` appended the
 * identical rule twice, and the renderer's whole-string comparison could not
 * see inside a concatenation, so an element carrying `.css(A).hover(B)` re-emitted
 * A even though a plain `.css(A)` element had already emitted it. Keying by class
 * name makes both cases one rule, because an identical rule always hashes to an
 * identical key.
 */
class RuleSet {
  constructor() {
    this.rules = new Map();
  }

  /** Add one compiled rule. A repeated key is already present by definition. */
  add(key, css) {
    if (!key || !css) return this;
    if (!this.rules.has(key)) this.rules.set(key, css);
    return this;
  }

  /**
   * Adopt a pre-compiled rule string of unknown internal structure — restored
   * from `toJSON()`, or assigned directly to `element.cssText`. It cannot be
   * split back into rules reliably, so it is stored whole under a content hash,
   * which still de-duplicates two identical strings.
   */
  addRaw(css) {
    if (typeof css !== 'string' || css === '') return this;
    return this.add('raw' + hash(css), css);
  }

  get size() { return this.rules.size; }

  clear() { this.rules.clear(); return this; }

  entries() { return this.rules.entries(); }

  /** The concatenated rule text, which is what `element.cssText` reads as. */
  toString() {
    let out = '';
    for (const css of this.rules.values()) out += css;
    return out;
  }
}

/* ==== NESTING ====
 *
 * `css()` accepts nested blocks beside ordinary declarations:
 *
 *   css({ color: 'red', '&:hover': { color: 'blue' }, '@media (min-width: 40em)': { … } })
 *
 * They FLATTEN into separate rules rather than compiling to native CSS nesting.
 * Two reasons. `hover()`, `pseudo()` and `media()` already produce exactly these
 * flattened rules, so nesting becomes a second spelling of something the library
 * does rather than a second mechanism; and flattened output parses in every
 * browser, which native nesting does not.
 *
 * A nested key is either a selector pattern containing `&` — replaced by the
 * generated class — or a conditional at-rule. Anything else is dropped and
 * reported, never guessed at.
 */

const NESTED_AT_RULES = new Set(['media', 'supports', 'container']);

/** Split `@media (min-width: 40em)` into its keyword and prelude. */
function parseNestedAtRule(key) {
  const space = key.indexOf(' ');
  if (space === -1) return null;
  const name = key.slice(1, space);
  const prelude = key.slice(space + 1).trim();
  if (!NESTED_AT_RULES.has(name) || !prelude) return null;
  return { name, prelude };
}

/**
 * Separate a rules object into its own declarations and its nested blocks, in a
 * canonical order both this module and the client runtime can reproduce.
 *
 * Nested keys are sorted so `{ '&:hover': …, '&:focus': … }` written either way
 * round hashes the same, exactly as the declarations themselves are ordered.
 */
function splitNestedRules(rules, onInvalid) {
  const flat = {};
  const nested = [];
  if (!rules || typeof rules !== 'object') return { flat, nested };
  for (const key of Object.keys(rules)) {
    const value = rules[key];
    const isBlockKey = key.startsWith('&') || key.startsWith('@');
    if (!isBlockKey) { flat[key] = value; continue; }
    // A nested key whose value is not an object is a typo, not a declaration:
    // `'&:hover': 'blue'` cannot mean anything, so it is reported rather than
    // coerced into one.
    if (!value || typeof value !== 'object') {
      if (typeof onInvalid === 'function') onInvalid(key);
      continue;
    }
    nested.push([key, value]);
  }
  nested.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return { flat, nested };
}

/**
 * Compile a rules object that may contain nested blocks into one class and the
 * full set of rules it needs.
 *
 * The class name is derived from the declarations AND the nested blocks, so
 * `css({color:'red'})` and `css({color:'red','&:hover':{…}})` are different
 * classes — they are different rule sets, and sharing one name would let the
 * hover rule leak onto elements that never asked for it. An object with no
 * nested keys hashes to exactly what it hashed before nesting existed, which is
 * what keeps the client runtime in agreement.
 *
 * @returns {{ className: string, declarations: string, rules: Array<[string,string]> } | null}
 */
function compileNestedRules(rules, options = {}) {
  const { prefix = 'c', onInvalid } = options;
  const { flat, nested } = splitNestedRules(rules, onInvalid);

  const declarations = compileDeclarationText(flat, onInvalid);

  // Compile each nested block first: its text joins the hash input, so the class
  // name cannot be known until every block has been validated.
  const blocks = [];
  for (const [key, value] of nested) {
    const inner = compileDeclarationText(value, onInvalid);
    if (!inner) continue;
    if (key.startsWith('&')) {
      const suffix = key.slice(1);
      // The suffix is concatenated onto `.class`, so it is checked as the
      // selector fragment it becomes.
      if (!isSafeCssSelector(`x${suffix}`)) {
        if (typeof onInvalid === 'function') onInvalid(key);
        continue;
      }
      blocks.push({ key, suffix, inner, at: null });
    } else {
      const at = parseNestedAtRule(key);
      if (!at || !isSafeAtRulePrelude(at.prelude)) {
        if (typeof onInvalid === 'function') onInvalid(key);
        continue;
      }
      blocks.push({ key, suffix: '', inner, at });
    }
  }

  if (!declarations && blocks.length === 0) return null;

  const nestedSpec = blocks.map(b => `${b.key}{${b.inner}}`).join('');
  const className = scopedClassName(prefix, declarations + nestedSpec, '');

  const out = [];
  if (declarations) out.push([className, `.${className}{${declarations}}`]);
  for (const b of blocks) {
    const body = b.at
      ? `@${b.at.name} ${b.at.prelude}{.${className}{${b.inner}}}`
      : `.${className}${b.suffix}{${b.inner}}`;
    // Keyed by the rule's own text so two identical nested blocks de-duplicate
    // the way every other rule in the library does.
    out.push([`${className}${b.key}`, body]);
  }
  return { className, declarations, rules: out };
}

/* ==== RULE SHAPES ==== */

/**
 * Compile `rules` into a scoped class rule.
 * Returns null when nothing survived validation, or when the scope is unsafe.
 *
 * @returns {{ className: string, css: string, declarations: string } | null}
 */
function compileScopedRule(rules, options = {}) {
  const {
    prefix = 'c', pseudo = null, pseudoElement = null,
    media = null, supports = null, container = null, onInvalid,
  } = options;

  if (pseudo !== null && !isSafePseudoSelector(pseudo)) return null;
  if (pseudoElement !== null && !isSafePseudoElement(pseudoElement)) return null;
  // One prelude check for all three conditional at-rules: each is written into
  // the stylesheet verbatim ahead of a `{`, so each can only be attacked the
  // same way. Adding a fourth needs no new rule, only this list.
  for (const prelude of [media, supports, container]) {
    if (prelude !== null && !isSafeAtRulePrelude(prelude)) return null;
  }

  const declarations = compileDeclarationText(rules, onInvalid);
  if (!declarations) return null;

  // Every prelude joins the hash input, so the same declarations under two
  // different conditions are two different classes rather than one that silently
  // wins. The separator keeps `@media a` + `@supports b` distinct from the
  // concatenation of their texts.
  // Empty parts are filtered out rather than joined as blanks: an unconditional
  // rule must hash to exactly hash(declarations), because that is what the client
  // runtime computes for a liveList row's `css` object. Padding the scope with
  // separators here would silently break that parity.
  const scope = [pseudo, pseudoElement, media, supports, container].filter(Boolean).join(' ');
  const className = scopedClassName(prefix, declarations, scope);

  let selector = `.${className}`;
  if (pseudo) selector += `:${pseudo}`;
  if (pseudoElement) selector += `::${pseudoElement}`;

  // Wrapped innermost to outermost in a fixed order, so a rule's text is a pure
  // function of its inputs and two identical calls de-duplicate.
  let css = `${selector}{${declarations}}`;
  if (media) css = `@media ${media}{${css}}`;
  if (supports) css = `@supports ${supports}{${css}}`;
  if (container) css = `@container ${container}{${css}}`;

  return { className, declarations, css };
}

/**
 * Compile `rules` into a rule for an arbitrary selector: `selector{decls}`.
 * Returns null when the selector is unsafe or nothing survived validation.
 */
function compileGlobalRule(selector, rules, onInvalid) {
  if (!isSafeCssSelector(selector)) return null;
  const declarations = compileDeclarationText(rules, onInvalid);
  return declarations ? `${selector}{${declarations}}` : null;
}

/**
 * Compile `@media <query>{ selector{decls} … }`.
 *
 * The document-level and element-level media paths both end up here, so the
 * query is validated once, in one place. They used to be separate: `Element.media()`
 * built its own `@media` string with no check at all, and `Document.mediaQuery()`
 * built a different one with a check — the kind of divergence that let the
 * element path stay exploitable after the document path had been fixed.
 */
function compileMediaRule(query, selectorRules, onInvalid) {
  return compileConditionalRule('media', query, selectorRules, onInvalid);
}

/**
 * Compile `@<atRule> <prelude>{ selector{decls} … }` for a conditional at-rule.
 *
 * `@media`, `@supports` and `@container` differ only in the keyword: each wraps
 * ordinary rules in a condition the browser evaluates. Sharing one compiler is
 * what stops the three drifting the way `Document.mediaQuery()` and
 * `Element.media()` did — a check added to one of three copies protects a third
 * of the callers and reads as though it protects all of them.
 *
 * @param {'media'|'supports'|'container'} atRule
 */
function compileConditionalRule(atRule, prelude, selectorRules, onInvalid) {
  if (!isSafeAtRulePrelude(prelude)) return null;
  if (!selectorRules || typeof selectorRules !== 'object') return null;
  const parts = [];
  for (const selector of Object.keys(selectorRules)) {
    const rule = compileGlobalRule(selector, selectorRules[selector], onInvalid);
    if (rule) parts.push(rule);
    else if (typeof onInvalid === 'function' && !isSafeCssSelector(selector)) onInvalid(selector);
  }
  return parts.length ? `@${atRule} ${prelude}{${parts.join('')}}` : null;
}

/**
 * Compile `@layer <name>{ selector{decls} … }`.
 *
 * A layer with no rules still has meaning — declaring the name is what fixes its
 * position in the cascade — so an empty body compiles to `@layer name{}` rather
 * than to nothing, unlike the conditional at-rules above.
 */
function compileLayerRule(name, selectorRules, onInvalid) {
  if (!isValidLayerName(name)) return null;
  const parts = [];
  if (selectorRules && typeof selectorRules === 'object') {
    for (const selector of Object.keys(selectorRules)) {
      const rule = compileGlobalRule(selector, selectorRules[selector], onInvalid);
      if (rule) parts.push(rule);
      else if (typeof onInvalid === 'function' && !isSafeCssSelector(selector)) onInvalid(selector);
    }
  }
  return `@layer ${name}{${parts.join('')}}`;
}

/**
 * Compile `@layer a, b, c;` — the statement that fixes layer precedence.
 *
 * Order is the entire point, so this preserves the caller's order exactly and
 * does not sort or de-duplicate. An invalid name is dropped and reported rather
 * than rewritten, as everywhere else in this module.
 */
function compileLayerOrder(names, onInvalid) {
  if (!Array.isArray(names)) return null;
  const valid = [];
  for (const name of names) {
    if (isValidLayerName(name)) valid.push(name);
    else if (typeof onInvalid === 'function') onInvalid(name);
  }
  return valid.length ? `@layer ${valid.join(',')};` : null;
}

/**
 * Compile `@keyframes <name>{ stop{decls} … }`.
 * The animation name and every stop reach the stylesheet verbatim, so both are
 * validated — the name as an identifier, each stop ("from", "50%") as a selector.
 */
function compileKeyframesRule(name, frames, onInvalid) {
  if (!isValidClassName(name)) return null;
  if (!frames || typeof frames !== 'object') return null;
  const parts = [];
  for (const stop in frames) {
    if (!isSafeCssSelector(stop)) {
      if (typeof onInvalid === 'function') onInvalid(stop);
      continue;
    }
    const frame = frames[stop];
    const declarations = typeof frame === 'object' ? compileDeclarationText(frame, onInvalid) : '';
    if (declarations) parts.push(`${stop}{${declarations}}`);
  }
  return parts.length ? `@keyframes ${name}{${parts.join('')}}` : null;
}

/* ==== CLIENT RUNTIME ====
 *
 * `liveList` re-renders its items in the browser, and a NodeDef's `css` object
 * has to become the SAME scoped class there that it became during server
 * rendering — otherwise the two disagree about what `css` means, which is the
 * inconsistency this module exists to remove.
 *
 * The client therefore needs three things the server has: the kebab-caser, the
 * canonical ordering, and the FNV-1a hash. They are emitted from the sources
 * below, and `test/test-css.js` asserts that the emitted runtime produces
 * byte-identical class names to the server implementation for a corpus of
 * objects. That test is what stops the two from drifting; the URL and attribute
 * guards in utils.js carry the same note for the same reason.
 */

/**
 * FNV-1a, one full lane plus three low digits of a second — character for
 * character the same arithmetic as `hash()` in utils.js, including the ES5
 * padding idiom, which is why that function does not use `padStart`.
 */
const CLIENT_HASH_SOURCE =
  'function _bhHash(s){var a=2166136261,b=2166136387;for(var i=0;i<s.length;i++){' +
  'var c=s.charCodeAt(i);' +
  'a^=c;a+=(a<<1)+(a<<4)+(a<<7)+(a<<8)+(a<<24);' +
  'b^=c;b+=(b<<1)+(b<<4)+(b<<7)+(b<<8)+(b<<24);}' +
  'return (a>>>0).toString(36)+("00"+(b>>>0).toString(36)).slice(-3);}';

/** Property-name validation, canonical ordering, and the scoped class rule. */
const CLIENT_CSS_SOURCE =
  'function _bhKebab(s){return String(s).replace(/([A-Z])/g,function(m){return"-"+m.toLowerCase();});}' +
  'function _bhProp(n){return n.length>0&&n.length<=128&&(n.indexOf("--")===0?/^--[A-Za-z0-9_-]+$/.test(n):/^-?[A-Za-z][A-Za-z0-9-]*$/.test(n));}' +
  'function _bhFamily(p){return p.indexOf("--")===0?p:p.replace(/^-+/,"").split("-")[0];}' +
  'function _bhValue(v){' + clientCssValueSanitizerBody('v') + '}' +
  'function _bhDecls(o){var list=[],i=0;' +
  'for(var k in o){var p=k.indexOf("--")===0?k:_bhKebab(k);if(!_bhProp(p))continue;' +
  'list.push({p:p,v:_bhValue(o[k]),f:_bhFamily(p),i:i++});}' +
  'list.sort(function(a,b){return a.f<b.f?-1:a.f>b.f?1:a.i-b.i;});' +
  'var out="";for(var j=0;j<list.length;j++)out+=list[j].p+":"+list[j].v+";";return out;}' +
  // One <style> element holds every rule the client mints. Rules are added once
  // and never removed: a class name is a pure function of its declarations, so a
  // rule that was correct when first inserted stays correct, and a list that
  // re-renders on every keystroke reuses the classes it already created instead
  // of growing the stylesheet.
  'var _bhSheet=null,_bhSeen={};' +
  // Keyed by rule, not by class: one class can now own several rules — its own
  // declarations plus a nested block each — and they must be inserted
  // independently while still de-duplicating.
  'function _bhRuleText(key,text){if(_bhSeen[key])return;_bhSeen[key]=1;' +
  'if(!_bhSheet){_bhSheet=document.getElementById("_bh-live-css");' +
  'if(!_bhSheet){_bhSheet=document.createElement("style");_bhSheet.id="_bh-live-css";' +
  '(document.head||document.documentElement).appendChild(_bhSheet);}}' +
  'try{_bhSheet.appendChild(document.createTextNode(text));}catch(e){}}' +
  'function _bhRule(cls,decls){_bhRuleText(cls,"."+cls+"{"+decls+"}");}' +
  // Nesting, mirroring compileNestedRules(): own declarations, then nested
  // blocks in sorted key order, hashed together. A `css` object with no nested
  // keys hashes to exactly _bhHash(declarations), which is what it hashed before
  // nesting existed — so an ordinary row's class is unchanged.
  //
  // The client has to understand nesting for the same reason it has to compute
  // the same hash: `css` means one thing in this library, and a liveList row
  // that flattened differently to its server rendering would put the page back
  // into the state this whole compiler exists to prevent.
  'function _bhAtRule(k){var s=k.indexOf(" ");if(s===-1)return null;' +
  'var n=k.slice(1,s),p=k.slice(s+1).replace(/^\\s+|\\s+$/g,"");' +
  'if(!/^(?:media|supports|container)$/.test(n)||!p)return null;return{n:n,p:p};}' +
  'function _bhSplit(o){var flat={},nested=[];' +
  'for(var k in o){if(!Object.prototype.hasOwnProperty.call(o,k))continue;' +
  'var v=o[k];if(k.charAt(0)!=="&"&&k.charAt(0)!=="@"){flat[k]=v;continue;}' +
  'if(!v||typeof v!=="object")continue;nested.push([k,v]);}' +
  'nested.sort(function(a,b){return a[0]<b[0]?-1:a[0]>b[0]?1:0;});' +
  'return{flat:flat,nested:nested};}' +
  'function _bhCssClass(o){' +
  'var sp=_bhSplit(o),d=_bhDecls(sp.flat),blocks=[];' +
  'for(var i=0;i<sp.nested.length;i++){' +
  'var k=sp.nested[i][0],inner=_bhDecls(sp.nested[i][1]);if(!inner)continue;' +
  'if(k.charAt(0)==="&"){var sfx=k.slice(1);' +
  'if(/[<{};\\\\]|\\/\\*|\\*\\//.test(sfx))continue;' +
  'blocks.push({k:k,s:sfx,i:inner,a:null});}' +
  'else{var at=_bhAtRule(k);' +
  'if(!at||/[<{};\\\\]|\\/\\*|\\*\\//.test(at.p))continue;' +
  'blocks.push({k:k,s:"",i:inner,a:at});}}' +
  'if(!d&&!blocks.length)return"";' +
  'var spec="";for(var j=0;j<blocks.length;j++)spec+=blocks[j].k+"{"+blocks[j].i+"}";' +
  'var cls="c"+_bhHash(d+spec);' +
  'if(d)_bhRule(cls,d);' +
  'for(var m=0;m<blocks.length;m++){var b=blocks[m];' +
  '_bhRuleText(cls+b.k,b.a?"@"+b.a.n+" "+b.a.p+"{."+cls+"{"+b.i+"}}":"."+cls+b.s+"{"+b.i+"}");}' +
  'return cls;}';

/** The full client CSS runtime: hash + canonical compile + class minting. */
function clientCssRuntimeSource() {
  return CLIENT_HASH_SOURCE + CLIENT_CSS_SOURCE;
}

/**
 * Defines `_bhStyle(el, obj)` — the reactive counterpart of `Element.style()`.
 *
 * `bindStyle()` compiled to `for (var k in obj) el.style[k] = obj[k]`, which
 * validated no property name, sanitised no value, and walked the prototype
 * chain — while the server's `style()` did all three. The same split as the
 * `liveList` `css` inconsistency: one behaviour, two implementations, only one
 * of them guarded.
 *
 * `setProperty` with a kebab-cased name is what closes the `cssText` escape:
 * the old form let a binding assign `el.style.cssText` and replace the whole
 * declaration block, where now that name compiles to the unknown property
 * `css-text` and the browser ignores it.
 *
 * Emitted only when a page actually has a style binding.
 */
const CLIENT_STYLE_APPLIER_SOURCE =
  'function _bhSKebab(s){return String(s).replace(/([A-Z])/g,function(m){return"-"+m.toLowerCase();});}' +
  'function _bhSProp(n){return n.length>0&&n.length<=128&&(n.indexOf("--")===0?/^--[A-Za-z0-9_-]+$/.test(n):/^-?[A-Za-z][A-Za-z0-9-]*$/.test(n));}' +
  'function _bhSValue(v){' + clientCssValueSanitizerBody('v') + '}' +
  'function _bhStyle(el,o){' +
    'if(!o||typeof o!=="object")return;' +
    'for(var k in o){' +
      'if(!Object.prototype.hasOwnProperty.call(o,k))continue;' +
      'var p=k.indexOf("--")===0?k:_bhSKebab(k);' +
      'if(!_bhSProp(p))continue;' +
      // A rejected value must not take the whole binding down with it, so the
      // per-property write is what is guarded, not the loop.
      'try{el.style.setProperty(p,_bhSValue(o[k]));}catch(e){}' +
    '}' +
  '}';

/** JS source defining `_bhStyle(el, obj)` for compiled `bindStyle()` updates. */
function clientStyleApplierSource() {
  return CLIENT_STYLE_APPLIER_SOURCE;
}

// Only what another module actually calls. `clientCssValueSanitizerBody`,
// `CSS_VALUE_STRIP_SOURCE`, `compileCssDeclarations`, `propertyFamily`,
// `scopedClassName` and `isValidLayerName` are deliberately absent: each is a
// building block used inside this file, and exporting a helper nothing imports
// invites a second caller to depend on a shape that was never designed to be
// depended on.
module.exports = {
  // Value sanitisation
  sanitizeCssValue,
  // Validation
  isValidCssProperty, isValidCssCustomProperty, isSafeCssSelector, isSafeMediaQuery,
  isSafeAtRulePrelude,
  isValidClassName, isSafePseudoSelector, isSafePseudoElement, isSafeRawCss,
  warnInvalidCss,
  // Compilation
  canonicalizeDeclarations, compileDeclarationText,
  // Hashing and rules
  compileScopedRule, compileNestedRules, compileGlobalRule, compileMediaRule,
  compileConditionalRule, compileLayerRule, compileLayerOrder,
  compileKeyframesRule, RuleSet,
  // Client runtime
  clientCssRuntimeSource, clientStyleApplierSource,
};
