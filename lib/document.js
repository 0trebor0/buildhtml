'use strict';

const { Element } = require('./element');
const { Head } = require('./head');
const { CONFIG } = require('./config');
const { metrics } = require('./metrics');
const { LRUCache } = require('./cache');
const { getPooled, recycle } = require('./pools');
const { renderNode, compileClient } = require('./renderer');
const { components, applyComponent } = require('./components');
const { buildNode } = require('./builder');
const {
  createRidGenerator, escapeHtml, sanitizeCssValue, sanitizeFunctionSource, sanitizeFunctionSourceString,
  sanitizeUrl, URL_ATTRS, findFreeVariables, isValidAttrKey, toKebab, minHTML, unescapeHtml,
  isSafeCssSelector, isValidClassName, isValidCssCustomProperty, isSafeRawCss,
  compileCssDeclarations, warnInvalidCss, safeJsonStringify
} = require('./utils');

let responseCache = new LRUCache(CONFIG.cacheLimit);
let _lastCacheLimit = CONFIG.cacheLimit;

/** Returns the responseCache, recreating it if cacheLimit was changed via configure(). */
function getResponseCache() {
  if (CONFIG.cacheLimit !== _lastCacheLimit) {
    responseCache = new LRUCache(CONFIG.cacheLimit);
    _lastCacheLimit = CONFIG.cacheLimit;
  }
  return responseCache;
}

class Document {
  constructor(options = {}) {
    this.body = [];
    this.head = new Head();
    this._ridGen = createRidGenerator();
    this._stateStore = {};
    this._globalState = Object.create(null);
    this._useResponseCache = options.cache ?? false;
    this._cacheKey = options.cacheKey || null;
    this._nonce = options.nonce || null;
    this._oncreateCallbacks = [];
    this._callbackSources = [];
    this._registrationErrors = [];
    this._historyRouter = null;
    this._lastRendered = '';
    this._bodyAttrs = {};
    this._bodyClasses = [];
    this._bodyCss = {};
    this._htmlAttrs = { lang: 'en' };
    this._inlineScripts = [];
    this._rawHeadContent = [];
    this._cssRegistry = CONFIG.mode === 'dev' ? new Map() : null;

    if (this._nonce) this.head.setNonce(this._nonce);
  }

  _poolElement(tag) {
    return getPooled('elements', tag, this._ridGen, this._stateStore, this);
  }

  _recordCallbackFailure(callbackType, error, element = null) {
    const reason = error && error.message ? error.message : String(error);
    this._registrationErrors.push({
      code: 'E_CALLBACK_REGISTRATION',
      message: `Unable to register ${callbackType}: ${reason}. Use a valid callback within the configured size limit and pass only JSON-serializable context.`,
      callbackType,
      reason,
      tag: element ? element.tag : 'document',
      id: element && element.attrs ? element.attrs.id || null : null,
    });
  }

  /* ==== HTML & BODY ATTRIBUTES ==== */

  /** Set <html> lang attribute */
  lang(l) { this._htmlAttrs.lang = l; return this; }

  /** Set any attribute on <html> */
  htmlAttr(key, value) { this._htmlAttrs[toKebab(key)] = value; return this; }

  /** Set body id */
  bodyId(id) { this._bodyAttrs.id = id; return this; }

  /** Add classes to <body> */
  bodyClass(...names) {
    for (const n of names) {
      if (n && typeof n === 'string') {
        for (const p of n.split(' ')) {
          if (p && !this._bodyClasses.includes(p)) this._bodyClasses.push(p);
        }
      }
    }
    return this;
  }

  /** Set attribute on <body> */
  bodyAttr(key, value) { this._bodyAttrs[toKebab(key)] = value; return this; }

  /** Add scoped CSS to <body> via a global style rule */
  bodyCss(rules) {
    if (rules && typeof rules === 'object') {
      for (const k in rules) this._bodyCss[k] = rules[k];
      this.globalStyle('body', this._bodyCss);
    }
    return this;
  }

  /* ==== HEAD SHORTCUTS ==== */

  title(t) { this.head.setTitle(t); return this; }
  addMeta(m) { this.head.addMeta(m); return this; }
  addLink(l) { this.head.addLink(l); return this; }
  addStyle(s) { this.head.addStyle(s); return this; }
  addScript(s) { this.head.addScript(s); return this; }

  meta(name, content) { return this.addMeta({ name, content }); }

  viewport(v = 'width=device-width, initial-scale=1') {
    return this.addMeta({ name: 'viewport', content: v });
  }

  charset(c = 'UTF-8') { this.head.setCharset(c); return this; }

  favicon(href, type) {
    let tag = `<link rel="icon" href="${escapeHtml(sanitizeUrl(href))}"`;
    if (type) tag += ` type="${escapeHtml(type)}"`;
    tag += '>';
    this.head.addRawLink(tag);
    return this;
  }

  /** Inject arbitrary raw HTML into <head> */
  rawHead(html) {
    if (html && typeof html === 'string') this._rawHeadContent.push(html);
    return this;
  }

  /** Add an inline <script> block (not a src) */
  inlineScript(code) {
    if (code && typeof code === 'string') this._inlineScripts.push(code);
    return this;
  }

  /** Add raw CSS string to <head> */
  inlineStyle(css) {
    if (css && typeof css === 'string') this.head.addStyle(css);
    return this;
  }

  /** Resource hint: preload */
  preload(href, as, type) {
    let tag = `<link rel="preload" href="${escapeHtml(sanitizeUrl(href))}" as="${escapeHtml(as)}"`;
    if (type) tag += ` type="${escapeHtml(type)}"`;
    tag += '>';
    this._rawHeadContent.push(tag);
    return this;
  }

  /** Resource hint: prefetch */
  prefetch(href) {
    this._rawHeadContent.push(`<link rel="prefetch" href="${escapeHtml(sanitizeUrl(href))}">`);
    return this;
  }

  /** Resource hint: preconnect */
  preconnect(href) {
    this._rawHeadContent.push(`<link rel="preconnect" href="${escapeHtml(sanitizeUrl(href))}">`);
    return this;
  }

  /** Canonical URL */
  canonical(url) {
    this._rawHeadContent.push(`<link rel="canonical" href="${escapeHtml(sanitizeUrl(url))}">`);
    return this;
  }

  /** Open Graph tags in one call */
  ogTags(og) {
    if (!og || typeof og !== 'object') return this;
    for (const k in og) {
      const property = k.startsWith('og:') ? k : 'og:' + k;
      this.addMeta({ property, content: og[k] });
    }
    return this;
  }

  /** Twitter card meta */
  twitterCard(tc) {
    if (!tc || typeof tc !== 'object') return this;
    for (const k in tc) {
      const name = k.startsWith('twitter:') ? k : 'twitter:' + k;
      this.addMeta({ name, content: tc[k] });
    }
    return this;
  }

  /** JSON-LD structured data */
  jsonLd(schema) {
    if (schema && typeof schema === 'object') {
      // safeJsonStringify escapes EVERY less-than sign, not just the one in a
      // closing tag. The old ad-hoc replace only handled "</", so "<!--<script>"
      // passed through intact — and that sequence puts the HTML tokenizer into
      // script-data-double-escaped state, where the following </script> stops
      // ending the element and the rest of the document is swallowed as script
      // text. A unicode escape is legal inside a JSON string, so a JSON-LD
      // consumer still reads the original character.
      const json = safeJsonStringify(schema);
      this._rawHeadContent.push(`<script type="application/ld+json">${json}</script>`);
    }
    return this;
  }

  /** noindex / nofollow */
  noindex(nofollow = false) {
    const content = nofollow ? 'noindex, nofollow' : 'noindex';
    return this.addMeta({ name: 'robots', content });
  }

  /* ==== GLOBAL CSS ==== */

  globalStyle(selector, rules) { this.head.globalCss(selector, rules); return this; }
  sharedClass(name, rules) { this.head.addClass(name, rules); return this; }

  defineClass(selector, rules, isRawSelector = false) {
    if (!rules || typeof rules !== 'object') return this;
    // isRawSelector emits `${selector}{...}` into <style>; otherwise the name is
    // emitted as `.${selector}{...}`. Neither is escaped, so both are checked.
    const selectorOk = isRawSelector ? isSafeCssSelector(selector) : isValidClassName(selector);
    if (!selectorOk) { warnInvalidCss('defineClass', selector); return this; }
    const parts = compileCssDeclarations(rules, (k) => warnInvalidCss('defineClass', k));
    if (parts.length > 0) {
      const cssStr = parts.join(';') + ';';
      if (isRawSelector) this.head.globalStyles.push(`${selector}{${cssStr}}`);
      else this.head.classStyles[selector] = cssStr;
    }
    return this;
  }

  resetCss() {
    this.globalStyle('*,*::before,*::after', { boxSizing: 'border-box', margin: '0', padding: '0' });
    this.globalStyle('body', { lineHeight: '1.5', WebkitFontSmoothing: 'antialiased' });
    this.globalStyle('img,picture,video,canvas,svg', { display: 'block', maxWidth: '100%' });
    this.globalStyle('input,button,textarea,select', { font: 'inherit' });
    return this;
  }

  /* ==== STATE ==== */

  state(key, value) { this._globalState[key] = value; return this; }

  states(obj) {
    if (obj && typeof obj === 'object') {
      for (const k in obj) this._globalState[k] = obj[k];
    }
    return this;
  }

  /* ==== LIFECYCLE ==== */

  oncreate(fn) {
    if (typeof fn !== 'function') throw new Error('[Document] .oncreate() expects a function.');
    try {
      const fnSource = sanitizeFunctionSource(fn, CONFIG.maxEventFnSize);
      this._oncreateCallbacks.push(fnSource);
    } catch (err) {
      this._recordCallbackFailure('oncreate', err);
      if (CONFIG.mode === 'dev') console.error('[Document] Invalid oncreate function:', err.message);
    }
    return this;
  }

  /* ==== ELEMENT CREATION ==== */

  create(tag) {
    if (!tag || typeof tag !== 'string') throw new TypeError('Element tag must be a non-empty string');
    const el = this._poolElement(tag);
    this.body.push(el);
    return el;
  }

  createElement(tag) { return this.create(tag); }
  child(tag) { return this.create(tag); }

  /* ==== COMPONENT SYSTEM ==== */

  component(name, props = {}, overrides = {}) {
    const { fn, options } = components.get(name);
    const tag = overrides.tag || options.tag || 'div';
    const el = this.createElement(tag);
    applyComponent(el, fn, props);
    return el;
  }

  use(fn, props = {}, tag = 'div') {
    const el = this.createElement(tag);
    applyComponent(el, fn, props);
    return el;
  }

  useFragment(fn) {
    if (typeof fn !== 'function') return this;
    try { fn(this); } catch (err) {
      if (CONFIG.mode === 'dev') console.error('Fragment function error:', err);
    }
    return this;
  }

  /* ==== SPA COMPILATION ==== */

  /**
   * Compile a reactive list into the document body.
   * itemFn(item, index) must return a NodeDef plain object.
   * The server renders the initial items; the client re-renders on state change.
   */
  liveList(stateKey, itemFn, options = {}) {
    const { compileLiveList } = require('./live');
    return compileLiveList(this, this, stateKey, itemFn, options);
  }

  /**
   * Compile a hash-based router that maps location.hash → State[stateKey].
   * Optionally applies active/inactive styles to nav links.
   */
  hashRouter(options = {}) {
    const { compileHashRouter } = require('./live');
    compileHashRouter(this, options);
    return this;
  }

  /**
   * Compile a History API router for clean URLs.
   * The server must return this document for every application route.
   */
  historyRouter(options = {}) {
    const { compileHistoryRouter } = require('./live');
    if (!options || typeof options !== 'object') options = {};
    this._historyRouter = {
      base: typeof options.base === 'string' && options.base ? options.base : '/',
    };
    compileHistoryRouter(this, options);
    return this;
  }

  /** Compile state-driven view switching without changing the URL. */
  views(options = {}) {
    const { compileViews } = require('./live');
    return compileViews(this, options);
  }

  /* ==== DECLARATIVE BUILDER ==== */

  build(defs) {
    if (Array.isArray(defs)) {
      for (const def of defs) {
        if (def == null) continue;
        if (typeof def === 'string') { this.body.push(escapeHtml(def)); continue; }
        buildNode(this, def);
      }
    } else if (defs && typeof defs === 'object') {
      buildNode(this, defs);
    }
    return this;
  }

  /* ==== CSS FEATURES ==== */

  /** Define @keyframes animation */
  keyframes(name, frames) {
    if (!name || !frames || typeof frames !== 'object') return this;
    // The animation name and every stop ("from", "50%") land in <style> verbatim.
    if (!isValidClassName(name)) { warnInvalidCss('keyframes', name); return this; }
    const parts = [];
    for (const stop in frames) {
      if (!isSafeCssSelector(stop)) { warnInvalidCss('keyframes', stop); continue; }
      const f = frames[stop];
      const rules = typeof f === 'object'
        ? compileCssDeclarations(f, (k) => warnInvalidCss('keyframes', k))
        : [];
      if (rules.length) parts.push(`${stop}{${rules.join(';')};}`);
    }
    if (parts.length) {
      this.head.globalStyles.push(`@keyframes ${name}{${parts.join('')}}`);
    }
    return this;
  }

  /** @media query block */
  mediaQuery(query, selectorRules) {
    if (!query || !selectorRules || typeof selectorRules !== 'object') return this;
    if (!isSafeCssSelector(query)) { warnInvalidCss('mediaQuery', query); return this; }
    const parts = [];
    for (const selector in selectorRules) {
      if (!isSafeCssSelector(selector)) { warnInvalidCss('mediaQuery', selector); continue; }
      const r = selectorRules[selector];
      const rules = typeof r === 'object'
        ? compileCssDeclarations(r, (k) => warnInvalidCss('mediaQuery', k))
        : [];
      if (rules.length) parts.push(`${selector}{${rules.join(';')};}`);
    }
    if (parts.length) {
      this.head.globalStyles.push(`@media ${query}{${parts.join('')}}`);
    }
    return this;
  }

  /** CSS custom property on :root */
  cssVar(name, value) {
    if (typeof name !== 'string' || !name) return this;
    const varName = name.startsWith('--') ? name : '--' + toKebab(name);
    if (!isValidCssCustomProperty(varName)) { warnInvalidCss('cssVar', name); return this; }
    if (!this._cssVars) this._cssVars = {};
    this._cssVars[varName] = sanitizeCssValue(value);
    const parts = [];
    for (const k in this._cssVars) parts.push(`${k}:${this._cssVars[k]}`);
    const rule = `:root{${parts.join(';')};}`;
    // Update in-place by index — avoids wiping unrelated :root rules from globalStyle()
    if (this._cssVarsRuleIdx !== undefined) {
      this.head.globalStyles[this._cssVarsRuleIdx] = rule;
    } else {
      this._cssVarsRuleIdx = this.head.globalStyles.length;
      this.head.globalStyles.push(rule);
    }
    return this;
  }

  /** Set multiple CSS variables at once */
  cssVars(obj) {
    if (obj && typeof obj === 'object') {
      for (const k in obj) this.cssVar(k, obj[k]);
    }
    return this;
  }

  /** @media (prefers-color-scheme: dark) shorthand */
  darkMode(selectorRules) {
    return this.mediaQuery('(prefers-color-scheme: dark)', selectorRules);
  }

  /** @media print shorthand */
  print(selectorRules) {
    return this.mediaQuery('print', selectorRules);
  }

  /* ==== UTILITY APIS ==== */

  /** HTML comment in body */
  comment(text) {
    this.body.push(`<!-- ${escapeHtml(text)} -->`);
    return this;
  }

  /** Raw HTML string in body (no element wrapper) */
  raw(html) {
    if (html != null) this.body.push(String(html));
    return this;
  }

  /**
   * Inject a pre-rendered fragment (from element.renderFragment()) into this document.
   * Adds the HTML to the body and the CSS to the <head>.
   *
   * @param {{ html: string, css: string }} fragment
   */
  stamp(fragment) {
    if (!fragment || typeof fragment !== 'object') return this;
    if (fragment.html) this.body.push(fragment.html);
    if (fragment.css) this.head.addStyle(fragment.css);
    return this;
  }

  /** Logical grouping — runs fn without creating a wrapper element */
  group(fn) {
    if (typeof fn === 'function') fn(this);
    return this;
  }

  /** Define a reusable document-level fragment template */
  template(name, fn) {
    if (!this._templates) this._templates = {};
    if (typeof fn === 'function') this._templates[name] = fn;
    return this;
  }

  /** Stamp out a previously defined template */
  useTemplate(name, vars = {}) {
    if (!this._templates || !this._templates[name]) {
      if (CONFIG.mode === 'dev') console.warn(`[Document] Template "${name}" not found`);
      return this;
    }
    this._templates[name](this, vars);
    return this;
  }

  /** Check if body has any content */
  isEmpty() { return this.body.length === 0; }

  /** Count total elements in body (recursive) */
  elementCount() {
    let count = 0;
    const walk = (children) => {
      for (const c of children) {
        if (c instanceof Element) {
          count++;
          walk(c.children);
        }
      }
    };
    walk(this.body);
    return count;
  }

  /** Inspect the current element tree for common correctness and accessibility issues. */
  validate() {
    const errors = [];
    const warnings = [];
    const ids = new Map();
    const labels = [];
    const controls = [];
    const ariaReferences = [];
    let previousHeadingLevel = 0;
    const labelableTags = new Set(['button', 'input', 'meter', 'output', 'progress', 'select', 'textarea']);
    const interactiveTags = new Set(['a', 'button', 'input', 'select', 'textarea']);

    const describe = (el) => ({ tag: el.tag, id: el.attrs.id || null });
    const add = (target, code, message, el) => {
      target.push({ code, message, ...(el ? describe(el) : {}) });
    };
    const checkCallback = (source, callbackType, el) => {
      const variables = findFreeVariables(source);
      if (variables.length > 0) {
        warnings.push({
          code: 'W_CALLBACK_CAPTURE',
          message: `${callbackType} references browser-unavailable variable${variables.length === 1 ? '' : 's'}: ${variables.join(', ')}. Use State, callback context, data-* attributes, or browser globals.`,
          callbackType,
          variables,
          ...(el ? describe(el) : { tag: 'document', id: null }),
        });
      }
    };
    const hasContent = (el) => el.children.some((child) => {
      if (child instanceof Element) return hasContent(child);
      return String(child).replace(/<[^>]*>/g, '').trim().length > 0;
    });
    const recordId = (id, el) => {
      if (id == null || id === '') return;
      const value = String(id);
      if (ids.has(value)) {
        add(errors, 'E_DUPLICATE_ID', `Duplicate id "${value}" on <${el.tag}>; first used on <${ids.get(value).tag}>.`, el);
      } else {
        ids.set(value, el);
      }
    };
    const walk = (children, ancestors = []) => {
      for (const child of children) {
        if (!(child instanceof Element)) continue;
        recordId(child.attrs.id, child);
        if (/^h[1-6]$/.test(child.tag)) {
          const level = Number(child.tag[1]);
          if (!hasContent(child)) add(warnings, 'W_EMPTY_HEADING', `Empty <${child.tag}> has no accessible heading text.`, child);
          if (level > previousHeadingLevel + 1) {
            add(warnings, 'W_HEADING_ORDER', `<${child.tag}> skips a heading level after h${previousHeadingLevel || 0}.`, child);
          }
          previousHeadingLevel = level;
        }
        if (child.tag === 'button' && !hasContent(child) && !child.attrs['aria-label'] && !child.attrs.title) {
          add(warnings, 'W_EMPTY_BUTTON', 'Button has no text, aria-label, or title.', child);
        }
        if (child.tag === 'img' && !Object.prototype.hasOwnProperty.call(child.attrs, 'alt')) {
          add(warnings, 'W_IMAGE_ALT', 'Image is missing an alt attribute.', child);
        }
        if (child.tag === 'label' && child.attrs.for) labels.push(child);
        if (labelableTags.has(child.tag) && child.tag !== 'button' && !(child.tag === 'input' && child.attrs.type === 'hidden')) {
          controls.push({ element: child, wrapped: ancestors.some((ancestor) => ancestor.tag === 'label') });
        }
        if (child.attrs['aria-labelledby']) ariaReferences.push(child);
        for (const attrName of URL_ATTRS) {
          if (child.attrs[attrName] != null && sanitizeUrl(child.attrs[attrName]) === '#' && String(child.attrs[attrName]) !== '#') {
            add(warnings, 'W_UNSAFE_URL', `Unsafe URL in ${attrName} will be replaced with "#".`, child);
          }
        }
        const interactiveAncestor = ancestors.find((ancestor) => ancestor.tag === 'button' || ancestor.tag === 'a');
        if (interactiveAncestor && interactiveTags.has(child.tag)) {
          add(warnings, 'W_NESTED_INTERACTIVE', `<${child.tag}> must not be nested inside <${interactiveAncestor.tag}>.`, child);
        }
        for (const binding of child._stateBindings || []) {
          if (!Object.prototype.hasOwnProperty.call(this._globalState, binding.stateKey)) {
            add(warnings, 'W_UNDECLARED_STATE', `Binding references undeclared state key "${binding.stateKey}".`, child);
          }
          if (binding.templateFn) checkCallback(binding.templateFn, `binding:${binding.bindType || 'text'}`, child);
        }
        for (const event of child.events || []) checkCallback(event.fn, `event:${event.event}`, child);
        if (child._computed) checkCallback(child._computed, 'computed', child);
        for (const lifecycle of child._lifecycle || []) checkCallback(lifecycle.fn, `lifecycle:${lifecycle.type}`, child);
        walk(child.children, [...ancestors, child]);
      }
    };

    recordId(this._bodyAttrs.id, { tag: 'body', attrs: this._bodyAttrs });
    walk(this.body);
    for (const label of labels) {
      const target = ids.get(String(label.attrs.for));
      if (!target || !labelableTags.has(target.tag)) {
        add(warnings, 'W_LABEL_TARGET', `Label references missing control id "${label.attrs.for}".`, label);
      }
    }
    const labelledIds = new Set(labels.map((label) => String(label.attrs.for)));
    for (const { element, wrapped } of controls) {
      const named = wrapped || (element.attrs.id && labelledIds.has(String(element.attrs.id))) ||
        element.attrs['aria-label'] || element.attrs['aria-labelledby'] || element.attrs.title;
      if (!named) add(warnings, 'W_CONTROL_LABEL', `<${element.tag}> has no associated label or accessible name.`, element);
    }
    for (const element of ariaReferences) {
      const references = String(element.attrs['aria-labelledby']).trim().split(/\s+/).filter(Boolean);
      if (references.some((id) => !ids.has(id))) {
        add(warnings, 'W_ARIA_TARGET', 'aria-labelledby references an id that does not exist.', element);
      }
    }
    for (const source of this._oncreateCallbacks) checkCallback(source, 'oncreate', null);
    for (const callback of this._callbackSources) {
      checkCallback(callback.source, callback.callbackType, callback.element || null);
    }
    errors.push(...this._registrationErrors.map((issue) => ({ ...issue })));
    if (this._useResponseCache && !this._cacheKey) {
      warnings.push({
        code: 'W_CACHE_KEY',
        message: 'Document caching is enabled without a cacheKey, so rendered output will not be cached. Set a stable cacheKey or disable cache.',
        tag: 'document',
        id: null,
      });
    }
    if (this._lastRendered && this.body.length === 0) {
      warnings.push({
        code: 'W_VALIDATE_AFTER_RENDER',
        message: 'render() already cleared the body, so this validation inspected an empty document. Call validate() before render().',
        tag: 'document',
        id: null,
      });
    }
    if (this._historyRouter) {
      warnings.push({
        code: 'W_HISTORY_FALLBACK',
        message: `History routing under "${this._historyRouter.base}" requires the server to return this application HTML for direct route requests after API and static routes.`,
        tag: 'document',
        id: null,
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /* ==== JSON IMPORT ==== */

  /**
   * Populate this document from a plain JSON definition.
   * Supports all head config, CSS, state, and body tree.
   *
   * @param {Object} def - Page definition object
   * @returns {Document} this
   */
  fromJSON(def) {
    if (!def || typeof def !== 'object') return this;

    // Head
    if (def.title) this.title(def.title);
    if (def.lang) this.lang(def.lang);
    if (def.charset) this.charset(def.charset);
    if (def.viewport !== undefined) {
      if (def.viewport !== false) this.viewport(typeof def.viewport === 'string' ? def.viewport : undefined);
    }
    if (def.resetCss) this.resetCss();
    if (def.favicon) this.favicon(def.favicon);
    if (def.canonical) this.canonical(def.canonical);
    if (def.noindex) this.noindex(def.noindex === 'nofollow');

    // Attributes on <html> and <body>. toJSON emits these so a round trip keeps
    // lang, dir, body id and body classes instead of silently reverting them.
    if (def.htmlAttrs && typeof def.htmlAttrs === 'object') {
      for (const k in def.htmlAttrs) {
        if (def.htmlAttrs[k] != null) this.htmlAttr(k, def.htmlAttrs[k]);
      }
    }
    if (def.bodyAttrs && typeof def.bodyAttrs === 'object') {
      for (const k in def.bodyAttrs) {
        if (def.bodyAttrs[k] != null) this.bodyAttr(k, def.bodyAttrs[k]);
      }
    }
    if (Array.isArray(def.bodyClasses)) this.bodyClass(...def.bodyClasses);

    // Meta / links / scripts. `meta` is the authored key; `metas` is what toJSON
    // emits, and reading only the former silently dropped every meta tag.
    if (Array.isArray(def.meta)) for (const m of def.meta) this.addMeta(m);
    if (Array.isArray(def.metas)) for (const m of def.metas) this.addMeta(m);
    if (Array.isArray(def.links)) for (const l of def.links) this.addLink(l);
    if (Array.isArray(def.scripts)) for (const s of def.scripts) this.addScript(s);
    // `styles`, `globalStyles` and `classStyles` are ALREADY-COMPILED CSS that
    // head.render() writes into the <style> block verbatim — the same trust level
    // as appendUnsafe(). Restoring a snapshot needs them, so they are validated
    // rather than dropped: nothing this library compiles contains "<", so the
    // check is invisible to a genuine toJSON() round trip and fatal to a tampered
    // one. `trustedCss: true` opts out for callers restoring their own snapshots.
    const trustedCss = def.trustedCss === true;
    const acceptRawCss = (css, where) => {
      if (trustedCss || isSafeRawCss(css)) return true;
      this._recordCallbackFailure(`css:${where}`, new Error('Compiled CSS contains markup'), null);
      warnInvalidCss(`fromJSON:${where}`, css);
      return false;
    };

    if (Array.isArray(def.styles)) {
      for (const s of def.styles) if (acceptRawCss(s, 'styles')) this.head.addStyle(s);
    }

    // CSS
    if (def.cssVars) this.cssVars(def.cssVars);
    // Authored form is { selector: rules }; toJSON emits already-compiled rule
    // strings, and an array would otherwise be walked by index and discarded.
    if (Array.isArray(def.globalStyles)) {
      for (const rule of def.globalStyles) {
        if (typeof rule !== 'string' || this.head.globalStyles.includes(rule)) continue;
        if (acceptRawCss(rule, 'globalStyles')) this.head.globalStyles.push(rule);
      }
    } else if (def.globalStyles && typeof def.globalStyles === 'object') {
      for (const sel in def.globalStyles) this.globalStyle(sel, def.globalStyles[sel]);
    }
    if (def.sharedClasses && typeof def.sharedClasses === 'object') {
      for (const name in def.sharedClasses) this.sharedClass(name, def.sharedClasses[name]);
    }
    // toJSON form: class name -> compiled declaration string.
    if (def.classStyles && typeof def.classStyles === 'object') {
      for (const name in def.classStyles) {
        if (typeof def.classStyles[name] !== 'string') continue;
        // The key becomes the `.name` selector, so it is checked as a class name
        // even when the declarations themselves are trusted.
        if (!isValidClassName(name)) { warnInvalidCss('fromJSON:classStyles', name); continue; }
        if (acceptRawCss(def.classStyles[name], 'classStyles')) {
          this.head.classStyles[name] = def.classStyles[name];
        }
      }
    }
    if (def.keyframes && typeof def.keyframes === 'object') {
      for (const name in def.keyframes) this.keyframes(name, def.keyframes[name]);
    }
    if (def.darkMode) this.darkMode(def.darkMode);
    if (def.print) this.print(def.print);

    // Body CSS
    if (def.bodyCss) this.bodyCss(def.bodyCss);
    if (def.bodyClass) {
      const cls = Array.isArray(def.bodyClass) ? def.bodyClass : [def.bodyClass];
      this.bodyClass(...cls);
    }

    // SEO
    if (def.ogTags) this.ogTags(def.ogTags);
    if (def.twitterCard) this.twitterCard(def.twitterCard);

    // State — accepts both user-facing `state` key and toJSON `globalState` key
    if (def.state && typeof def.state === 'object') this.states(def.state);
    if (def.globalState && typeof def.globalState === 'object') this.states(def.globalState);

    // toJSON emits already-sanitized callback sources, so re-validate rather than
    // trusting them: a JSON document may have come from anywhere.
    if (Array.isArray(def.oncreateCallbacks)) {
      for (const source of def.oncreateCallbacks) {
        if (typeof source !== 'string') continue;
        try {
          this._oncreateCallbacks.push(sanitizeFunctionSourceString(source, CONFIG.maxEventFnSize));
        } catch (err) {
          this._recordCallbackFailure('oncreate', err);
          if (CONFIG.mode === 'dev') console.error('[Document] Invalid oncreate source in JSON:', err.message);
        }
      }
    }

    // Body. The trust decision is made once, at the top level, and applies to
    // every nested node's compiled cssText — a per-node `trustedCss` inside an
    // untrusted payload would let the payload grant itself the exemption.
    if (def.body) {
      this._trustedCss = trustedCss;
      try {
        this.build(def.body);
      } finally {
        this._trustedCss = false;
      }
    }

    return this;
  }

  /* ==== RENDERING ==== */

  output() { return this._lastRendered; }

  save(path) {
    const html = this._lastRendered || this.render();
    require('fs').writeFileSync(path, html);
    return this;
  }

  /**
   * Stream the HTML response to a Node.js Writable (e.g. res).
   *
   * Work happens on demand: each _read() renders only as much as the consumer
   * has room for, so <head> reaches the socket before the body is built and a
   * slow client applies backpressure instead of buffering the whole page.
   *
   * Usage:
   *   app.get('/', (req, res) => {
   *     res.setHeader('Content-Type', 'text/html');
   *     page('Home').h1().text('Hello') && doc.renderStream().pipe(res);
   *   });
   *
   * Unlike render(), streaming emits <style> after the body (the head has
   * already gone out) and applies neither prod minification nor the response
   * cache, since both need the whole document before the first byte.
   */
  /**
   * Build the compilation context both render paths use.
   *
   * render() and renderStream() each used to assemble this literal by hand and
   * each had its own recycle sequence, so the two could — and did — fall out of
   * step over which arrays were pooled. One factory and one release helper mean a
   * new pooled field is added in a single place.
   */
  _createRenderContext() {
    return {
      events: getPooled('arrays'),
      states: getPooled('arrays'),
      styles: [],
      seenCss: new Set(),
      computed: getPooled('arrays'),
      stateBindings: getPooled('arrays'),
      lifecycles: getPooled('arrays'),
      portals: getPooled('arrays'),
      oncreates: this._oncreateCallbacks,
      callbackSources: this._callbackSources,
      registrationErrors: this._registrationErrors,
      globalState: this._globalState,
      nonce: this._nonce
    };
  }

  /**
   * Return a context's pooled arrays. Idempotent: recycle() is not, so handing
   * the same array back twice would place one object in the pool twice and give
   * two later renders the same buffer. The flag makes a second call a no-op,
   * which matters on the stream path where completion, error and abandonment can
   * all fire.
   */
  _releaseRenderContext(ctx) {
    if (!ctx || ctx._released) return;
    ctx._released = true;
    recycle('arrays', ctx.events);
    recycle('arrays', ctx.states);
    recycle('arrays', ctx.computed);
    recycle('arrays', ctx.stateBindings);
    recycle('arrays', ctx.lifecycles);
    recycle('arrays', ctx.portals);
  }

  renderStream() {
    const { Readable } = require('stream');
    const self = this;

    // The cache holds whole documents, which streaming never assembles before the
    // first byte goes out. Say so rather than ignoring an explicit cacheKey.
    if (CONFIG.mode === 'dev' && this._useResponseCache && this._cacheKey) {
      console.warn(`[Document] renderStream() does not use the response cache, so cacheKey "${this._cacheKey}" is ignored. Use render() for cached responses.`);
    }

    const na = this._nonce ? ` nonce="${escapeHtml(this._nonce)}"` : '';

    const ctx = this._createRenderContext();

    // Yielding lazily is what makes this a stream: nothing below runs until the
    // consumer asks for the next chunk. Styles and the client script come last
    // because renderNode() fills ctx as the body is walked.
    function* parts() {
      const headHTML = self.head.render();
      const rawHead = self._rawHeadContent.join('');
      yield `<!DOCTYPE html><html${self._renderHtmlAttrs()}><head>${headHTML}${rawHead}</head><body${self._renderBodyAttrs()}>`;

      for (const node of self.body) {
        const r = renderNode(node, ctx);
        if (r) yield r;
      }

      if (ctx.styles.length > 0) yield `<style${na}>${ctx.styles.join('')}</style>`;

      const clientJS = compileClient(ctx);
      if (clientJS) yield `<script${na}>${clientJS}</script>`;

      if (self._inlineScripts.length > 0) {
        yield self._inlineScripts.map(s => `<script${na}>${s}</script>`).join('');
      }

      yield '</body></html>';
    }

    const iterator = parts();
    // Mirror what is streamed so output()/save() still see the rendered page;
    // finalize() clears the document, so re-rendering later would produce nothing.
    const sent = [];
    let done = false;

    // Runs on completion, on error, and if the consumer abandons the stream, so
    // pooled arrays and the element tree are always released exactly once.
    const finalize = (complete) => {
      if (done) return;
      done = true;
      if (complete) self._lastRendered = sent.join('');
      self._releaseRenderContext(ctx);
      self.clear();
    };

    const stream = new Readable({
      read() {
        if (done) return;
        try {
          // push() returns false once the buffer is full; stop there and wait to
          // be called again rather than rendering the rest of the document.
          let wantsMore = true;
          while (wantsMore) {
            const next = iterator.next();
            if (next.done) {
              finalize(true);
              this.push(null);
              return;
            }
            sent.push(next.value);
            wantsMore = this.push(next.value);
          }
        } catch (err) {
          finalize(false);
          this.destroy(err);
        }
      }
    });

    stream.on('close', () => finalize(false));

    return stream;
  }

  clear() {
    for (const el of this.body) {
      if (el instanceof Element) recycle('elements', el);
    }
    this.body.length = 0;
    for (const key in this._stateStore) delete this._stateStore[key];
    // _cssVarsRuleIdx is deliberately kept: clear() does not touch the head, so the
    // :root rule it points at survives. Resetting the index would make the next
    // cssVar() append a second :root block and orphan the first.
    this._inlineScripts.length = 0;
    this._mkElDefined = false;
    this._oncreateCallbacks.length = 0;
    this._callbackSources.length = 0;
    this._registrationErrors.length = 0;
    this._historyRouter = null;
  }

  _renderHtmlAttrs() {
    const parts = [];
    for (const k in this._htmlAttrs) {
      if (isValidAttrKey(k) && this._htmlAttrs[k] != null) parts.push(` ${k}="${escapeHtml(this._htmlAttrs[k])}"`);
    }
    return parts.join('');
  }

  _renderBodyAttrs() {
    const allAttrs = { ...this._bodyAttrs };
    if (this._bodyClasses.length > 0) {
      allAttrs.class = this._bodyClasses.join(' ');
    }
    const parts = [];
    for (const k in allAttrs) {
      if (isValidAttrKey(k) && allAttrs[k] != null) parts.push(` ${k}="${escapeHtml(allAttrs[k])}"`);
    }
    return parts.join('');
  }

  render() {
    const startTime = CONFIG.enableMetrics ? Date.now() : 0;

    // A CSP nonce is single-use by definition: it is minted per response and the
    // matching `script-src 'nonce-…'` header goes out with it. Caching the page
    // that carries one served request B the page — and the nonce — from request
    // A, so B's header and B's markup no longer agree. Either every script is
    // blocked, or, worse, the stale nonce is now a value an attacker has already
    // seen, which is the whole thing a nonce exists to prevent.
    //
    // The fix is to bypass the cache, not to key on the nonce: a unique nonce per
    // response would give a unique key per response, storing one entry per
    // request and never hitting.
    const cacheable = this._useResponseCache && this._cacheKey && !this._nonce;
    if (this._useResponseCache && this._cacheKey && this._nonce && CONFIG.mode === 'dev') {
      console.warn(
        `[Document] cacheKey "${this._cacheKey}" is ignored because this document has a CSP nonce. ` +
        'A cached page would serve a stale nonce to later requests. Render without a nonce to use the cache.'
      );
    }

    if (cacheable) {
      const cached = getResponseCache().get(this._cacheKey);
      if (cached) { this.clear(); this._lastRendered = cached; return cached; }
    }

    const ctx = this._createRenderContext();

    // Everything that can throw — node conversion, head rendering, client
    // compilation — sits inside the try. Without it a single throwing element
    // took six pooled arrays out of circulation permanently, so a handler that
    // failed on every request drained the pool and never refilled it.
    //
    // On failure the document is deliberately left INTACT: nothing is cached,
    // _lastRendered keeps its previous value, and the body is not cleared, so the
    // caller can inspect or fix the tree and render again. Only a completed
    // render consumes the document. renderStream() already draws the same line —
    // its finalize(complete) records output and clears only when the stream ran
    // to the end.
    let result;
    try {
      const bodyParts = [];
      for (const node of this.body) {
        const r = renderNode(node, ctx);
        if (r) bodyParts.push(r);
      }

      const bodyHTML = bodyParts.join('');
      const headHTML = this.head.render();
      const na = this._nonce ? ` nonce="${escapeHtml(this._nonce)}"` : '';

      const stylesHTML = ctx.styles.length > 0 ? `<style${na}>${ctx.styles.join('')}</style>` : '';
      const clientJS = compileClient(ctx);
      const rawHead = this._rawHeadContent.length > 0 ? this._rawHeadContent.join('') : '';
      const inlineScripts = this._inlineScripts.length > 0
        ? this._inlineScripts.map(s => `<script${na}>${s}</script>`).join('')
        : '';

      const html = [
        `<!DOCTYPE html><html${this._renderHtmlAttrs()}><head>`,
        headHTML, rawHead, stylesHTML,
        '</head>',
        `<body${this._renderBodyAttrs()}>`,
        bodyHTML,
        clientJS ? `<script${na}>${clientJS}</script>` : '',
        inlineScripts,
        '</body></html>'
      ].join('');

      result = CONFIG.mode === 'prod' ? minHTML(html) : html;
    } finally {
      // Each array is recycled exactly once, on both paths. recycle() is not
      // idempotent — handing the same array back twice would put one object in
      // the pool twice and give two future renders the same buffer.
      this._releaseRenderContext(ctx);
    }

    if (cacheable) getResponseCache().set(this._cacheKey, result);

    this._lastRendered = result;
    this.clear();

    if (CONFIG.enableMetrics) {
      metrics.timing('render.total', Date.now() - startTime);
      metrics.increment('render.count');
    }

    return result;
  }

  toJSON() {
    const serialize = (el) => {
      if (!(el instanceof Element)) return { type: 'text', content: unescapeHtml(String(el)) };
      const s = {
        type: 'element', tag: el.tag, attrs: { ...el.attrs },
        classes: el._classes.length > 0 ? [...el._classes] : undefined,
        children: el.children.map(serialize), cssText: el.cssText, hydrate: el.hydrate
      };
      if (el._state !== null) s.state = el._state;
      if (el._stateBindings?.length > 0) s.stateBindings = el._stateBindings;
      if (el._lifecycle?.length > 0) s.lifecycle = el._lifecycle;
      if (el.events?.length > 0) {
        s.events = el.events.map(e => ({ event: e.event, id: e.id, targetId: e.targetId, fn: e.fn, context: e.context, options: e.options }));
      }
      if (el._computed) s.computed = el._computed;
      return s;
    };

    return {
      // head.title is stored pre-escaped for render(); emit the source text so a
      // fromJSON() -> setTitle() round trip does not escape it a second time.
      version: '2.0', title: unescapeHtml(this.head.title),
      charset: this.head.charset,
      lang: this._htmlAttrs.lang,
      htmlAttrs: { ...this._htmlAttrs },
      bodyAttrs: { ...this._bodyAttrs },
      bodyClasses: [...this._bodyClasses],
      metas: this.head.metas, links: this.head.links, styles: this.head.styles,
      scripts: this.head.scripts, globalStyles: this.head.globalStyles,
      classStyles: this.head.classStyles, globalState: this._globalState,
      oncreateCallbacks: this._oncreateCallbacks.map(fn => fn.toString()),
      body: this.body.map(serialize)
    };
  }
}

// Apply shared shortcuts (tag helpers, form helpers, layout helpers, data helpers, each/when)
const { applyShortcuts } = require('./shortcuts');
applyShortcuts(Document.prototype, 'createElement');

module.exports = { Document, responseCache, getResponseCache };
