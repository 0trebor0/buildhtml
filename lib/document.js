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
  createRidGenerator, escapeHtml, sanitizeCssValue, sanitizeFunctionSource,
  toKebab, minHTML, unescapeHtml
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
    this._globalState = {};
    this._useResponseCache = options.cache ?? false;
    this._cacheKey = options.cacheKey || null;
    this._nonce = options.nonce || null;
    this._oncreateCallbacks = [];
    this._lastRendered = '';
    this._bodyAttrs = {};
    this._bodyClasses = [];
    this._bodyCss = {};
    this._htmlAttrs = { lang: 'en' };
    this._inlineScripts = [];
    this._rawHeadContent = [];

    if (this._nonce) this.head.setNonce(this._nonce);
  }

  _poolElement(tag) {
    return getPooled('elements', tag, this._ridGen, this._stateStore, this);
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
    let tag = `<link rel="icon" href="${escapeHtml(href)}"`;
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
    let tag = `<link rel="preload" href="${escapeHtml(href)}" as="${escapeHtml(as)}"`;
    if (type) tag += ` type="${escapeHtml(type)}"`;
    tag += '>';
    this._rawHeadContent.push(tag);
    return this;
  }

  /** Resource hint: prefetch */
  prefetch(href) {
    this._rawHeadContent.push(`<link rel="prefetch" href="${escapeHtml(href)}">`);
    return this;
  }

  /** Resource hint: preconnect */
  preconnect(href) {
    this._rawHeadContent.push(`<link rel="preconnect" href="${escapeHtml(href)}">`);
    return this;
  }

  /** Canonical URL */
  canonical(url) {
    this._rawHeadContent.push(`<link rel="canonical" href="${escapeHtml(url)}">`);
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
      const json = JSON.stringify(schema).replace(/<\//g, '<\\/');
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
    const parts = [];
    for (const prop in rules) parts.push(`${toKebab(prop)}:${sanitizeCssValue(rules[prop])}`);
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
      sanitizeFunctionSource(fn, CONFIG.maxEventFnSize);
      this._oncreateCallbacks.push(fn);
    } catch (err) {
      if (CONFIG.mode === 'dev') console.error('[Document] Invalid oncreate function:', err.message);
    }
    return this;
  }

  /* ==== ELEMENT CREATION ==== */

  createElement(tag) {
    if (!tag || typeof tag !== 'string') throw new TypeError('Element tag must be a non-empty string');
    const el = this._poolElement(tag);
    this.body.push(el);
    return el;
  }

  create(tag) { return this.createElement(tag); }
  child(tag) { return this.createElement(tag); }

  /* ==== COMPONENT SYSTEM ==== */

  component(name, props = {}, overrides = {}) {
    const { fn, options } = components.get(name);
    const tag = overrides.tag || options.tag || 'div';
    const el = this.createElement(tag);
    applyComponent(el, fn, props, { ...options, ...overrides });
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
    const parts = [];
    for (const stop in frames) {
      const rules = [];
      const f = frames[stop];
      if (typeof f === 'object') {
        for (const k in f) rules.push(`${toKebab(k)}:${sanitizeCssValue(f[k])}`);
      }
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
    const parts = [];
    for (const selector in selectorRules) {
      const rules = [];
      const r = selectorRules[selector];
      if (typeof r === 'object') {
        for (const k in r) rules.push(`${toKebab(k)}:${sanitizeCssValue(r[k])}`);
      }
      if (rules.length) parts.push(`${selector}{${rules.join(';')};}`);
    }
    if (parts.length) {
      this.head.globalStyles.push(`@media ${query}{${parts.join('')}}`);
    }
    return this;
  }

  /** CSS custom property on :root */
  cssVar(name, value) {
    const varName = name.startsWith('--') ? name : '--' + toKebab(name);
    if (!this._cssVars) this._cssVars = {};
    this._cssVars[varName] = sanitizeCssValue(value);
    // Rebuild :root rule
    const parts = [];
    for (const k in this._cssVars) parts.push(`${k}:${this._cssVars[k]}`);
    // Remove old :root if exists, then add new
    this.head.globalStyles = this.head.globalStyles.filter(s => !s.startsWith(':root{'));
    this.head.globalStyles.push(`:root{${parts.join(';')};}`);
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

    // Meta / links / scripts
    if (Array.isArray(def.meta)) for (const m of def.meta) this.addMeta(m);
    if (Array.isArray(def.links)) for (const l of def.links) this.addLink(l);
    if (Array.isArray(def.scripts)) for (const s of def.scripts) this.addScript(s);

    // CSS
    if (def.cssVars) this.cssVars(def.cssVars);
    if (def.globalStyles && typeof def.globalStyles === 'object') {
      for (const sel in def.globalStyles) this.globalStyle(sel, def.globalStyles[sel]);
    }
    if (def.sharedClasses && typeof def.sharedClasses === 'object') {
      for (const name in def.sharedClasses) this.sharedClass(name, def.sharedClasses[name]);
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

    // State
    if (def.state && typeof def.state === 'object') this.states(def.state);

    // Body
    if (def.body) this.build(def.body);

    return this;
  }

  /* ==== RENDERING ==== */

  output() { return this._lastRendered; }

  save(path) {
    require('fs').writeFileSync(path, this._lastRendered);
    return this;
  }

  clear() {
    for (const el of this.body) {
      if (el instanceof Element) recycle('elements', el);
    }
    this.body.length = 0;
    for (const key in this._stateStore) delete this._stateStore[key];
  }

  _renderHtmlAttrs() {
    const parts = [];
    for (const k in this._htmlAttrs) {
      if (this._htmlAttrs[k] != null) parts.push(` ${k}="${escapeHtml(this._htmlAttrs[k])}"`);
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
      if (allAttrs[k] != null) parts.push(` ${k}="${escapeHtml(allAttrs[k])}"`);
    }
    return parts.join('');
  }

  render() {
    const startTime = CONFIG.enableMetrics ? Date.now() : 0;

    if (this._useResponseCache && this._cacheKey) {
      const cached = getResponseCache().get(this._cacheKey);
      if (cached) { this.clear(); this._lastRendered = cached; return cached; }
    }

    const ctx = {
      events: getPooled('arrays'),
      states: getPooled('arrays'),
      styles: [],
      seenCss: new Set(),
      computed: getPooled('arrays'),
      stateBindings: getPooled('arrays'),
      oncreates: this._oncreateCallbacks,
      globalState: this._globalState,
      nonce: this._nonce
    };

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

    recycle('arrays', ctx.events);
    recycle('arrays', ctx.states);
    recycle('arrays', ctx.computed);
    recycle('arrays', ctx.stateBindings);

    const result = CONFIG.mode === 'prod' ? minHTML(html) : html;

    if (this._useResponseCache && this._cacheKey) getResponseCache().set(this._cacheKey, result);

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
        children: el.children.map(serialize), cssText: el.cssText, hydrate: el.hydrate
      };
      if (el._state !== null) s.state = el._state;
      if (el._stateBindings?.length > 0) s.stateBindings = el._stateBindings;
      if (el.events?.length > 0) {
        s.events = el.events.map(e => ({ event: e.event, id: e.id, targetId: e.targetId, fn: e.fn.toString() }));
      }
      if (el._computed) s.computed = el._computed.toString();
      return s;
    };

    return {
      version: '2.0', title: this.head.title,
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
