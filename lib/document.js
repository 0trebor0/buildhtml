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
  toKebab, minHTML, hash, unescapeHtml
} = require('./utils');

const responseCache = new LRUCache(CONFIG.cacheLimit);

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

  charset(c = 'UTF-8') { return this.addMeta({ charset: c }); }

  favicon(href) {
    this.head.links.push(href);
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
      const json = JSON.stringify(schema);
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
        this._buildRootNode(def);
      }
    } else if (defs && typeof defs === 'object') {
      this._buildRootNode(defs);
    }
    return this;
  }

  _buildRootNode(def) {
    if ('if' in def && !def.if) return;
    if (def.each && Array.isArray(def.each)) {
      const template = { ...def }; delete template.each;
      for (let i = 0; i < def.each.length; i++) {
        const item = def.each[i];
        const itemDef = typeof template.itemTemplate === 'function'
          ? template.itemTemplate(item, i) : { ...template, text: String(item) };
        this._buildRootNode(itemDef);
      }
      return;
    }
    let el;
    if (def.component) {
      const { fn, options } = components.get(def.component);
      el = this.createElement(options.tag || def.tag || 'div');
      applyComponent(el, fn, def.props || {}, options);
    } else if (def.use && typeof def.use === 'function') {
      el = this.createElement(def.tag || 'div');
      applyComponent(el, def.use, def.props || {});
    } else {
      el = this.createElement(def.tag || 'div');
    }
    if (def.id) el.id(def.id);
    if (def.class) {
      const cls = Array.isArray(def.class) ? def.class : def.class.split(' ');
      el.addClass(...cls);
    }
    if (def.attrs) el.setAttrs(def.attrs);
    if (def.data) el.data(def.data);
    if (def.aria) el.aria(def.aria);
    if (def.css) el.css(def.css);
    if (def.style) el.style(def.style);
    if (def.text != null) el.text(def.text);
    if (def.html != null) el.appendUnsafe(def.html);
    if (def.state != null) el.state(def.state);
    if (def.bind) el.bind(def.bind.key, def.bind.fn);
    if (def.on && typeof def.on === 'object') {
      for (const ev in def.on) el.on(ev, def.on[ev]);
    }
    if (def.children && Array.isArray(def.children)) {
      for (const childDef of def.children) buildNode(el, childDef);
    }
    if (typeof def.setup === 'function') def.setup(el);
    return el;
  }

  /* ==== HTML TAG SHORTCUTS ==== */

  div() { return this.createElement('div'); }
  span() { return this.createElement('span'); }
  section() { return this.createElement('section'); }
  header() { return this.createElement('header'); }
  footer() { return this.createElement('footer'); }
  main() { return this.createElement('main'); }
  nav() { return this.createElement('nav'); }
  article() { return this.createElement('article'); }
  aside() { return this.createElement('aside'); }
  form() { return this.createElement('form'); }
  ul() { return this.createElement('ul'); }
  ol() { return this.createElement('ol'); }
  table() { return this.createElement('table'); }
  details() { return this.createElement('details'); }
  summary() { return this.createElement('summary'); }
  dialog() { return this.createElement('dialog'); }
  pre() { return this.createElement('pre'); }
  code() { return this.createElement('code'); }
  blockquote() { return this.createElement('blockquote'); }

  h(level = 1) { return this.createElement('h' + Math.max(1, Math.min(6, level))); }

  p(text) {
    const el = this.createElement('p');
    if (text != null) el.text(text);
    return el;
  }

  img(src, alt = '') {
    return this.createElement('img').attr('src', src).attr('alt', alt);
  }

  a(href, text) {
    const el = this.createElement('a').attr('href', href);
    if (text != null) el.text(text);
    return el;
  }

  button(text) {
    const el = this.createElement('button');
    if (text != null) el.text(text);
    return el;
  }

  input(type = 'text', attrs = {}) {
    const el = this.createElement('input').attr('type', type);
    if (attrs) el.setAttrs(attrs);
    return el;
  }

  textarea(attrs = {}) {
    const el = this.createElement('textarea');
    if (attrs) el.setAttrs(attrs);
    return el;
  }

  select(optionsList = [], attrs = {}) {
    const el = this.createElement('select');
    if (attrs) el.setAttrs(attrs);
    for (const opt of optionsList) {
      const optEl = el.child('option').attr('value', opt.value);
      if (opt.text) optEl.text(opt.text);
      if (opt.selected) optEl.attr('selected', 'selected');
      if (opt.disabled) optEl.attr('disabled', 'disabled');
    }
    return el;
  }

  br() { this.body.push('<br>'); return this; }
  hr() { return this.createElement('hr'); }

  /* ==== FORM HELPERS ==== */

  /** Label + input pair wrapped in a container */
  formGroup(label, inputType = 'text', inputAttrs = {}) {
    const group = this.createElement('div').addClass('form-group');
    const inputId = inputAttrs.id || this._ridGen();
    group.child('label').attr('for', inputId).text(label);
    const inp = group.child('input').attr('type', inputType).id(inputId);
    if (inputAttrs) inp.setAttrs(inputAttrs);
    return group;
  }

  /** Checkbox with label */
  checkbox(name, label, checked = false) {
    const group = this.createElement('div').addClass('form-check');
    const id = this._ridGen();
    const inp = group.child('input').attr('type', 'checkbox').name(name).id(id);
    if (checked) inp.checked();
    group.child('label').attr('for', id).text(label);
    return group;
  }

  /** Radio button group */
  radio(name, options = []) {
    const group = this.createElement('div').addClass('form-radio-group');
    for (const opt of options) {
      const id = this._ridGen();
      const wrapper = group.child('div').addClass('form-radio');
      const inp = wrapper.child('input').attr('type', 'radio').name(name).attr('value', opt.value).id(id);
      if (opt.checked) inp.checked();
      wrapper.child('label').attr('for', id).text(opt.label || opt.text || opt.value);
    }
    return group;
  }

  /** Fieldset with legend */
  fieldset(legend, setupFn) {
    const fs = this.createElement('fieldset');
    if (legend) fs.child('legend').text(legend);
    if (typeof setupFn === 'function') setupFn(fs);
    return fs;
  }

  /** Hidden input */
  hiddenInput(name, value) {
    return this.createElement('input').attr('type', 'hidden').name(name).value(value);
  }

  /* ==== LAYOUT HELPERS ==== */

  /** CSS Grid wrapper */
  grid(columns, items, gap = '16px') {
    const g = this.createElement('div').css({
      display: 'grid',
      gridTemplateColumns: typeof columns === 'number' ? `repeat(${columns}, 1fr)` : columns,
      gap
    });
    if (Array.isArray(items)) {
      for (const item of items) {
        if (typeof item === 'function') item(g.child('div'));
        else if (item instanceof Element) g.append(item);
        else g.child('div').text(String(item));
      }
    }
    return g;
  }

  /** Flex container */
  flex(items, options = {}) {
    const { direction = 'row', gap = '16px', align, justify, wrap } = options;
    const f = this.createElement('div').css({
      display: 'flex',
      flexDirection: direction,
      gap,
      ...(align && { alignItems: align }),
      ...(justify && { justifyContent: justify }),
      ...(wrap && { flexWrap: wrap })
    });
    if (Array.isArray(items)) {
      for (const item of items) {
        if (typeof item === 'function') item(f.child('div'));
        else if (item instanceof Element) f.append(item);
        else f.child('div').text(String(item));
      }
    }
    return f;
  }

  /** Vertical stack (flex-column with gap) */
  stack(items, gap = '16px') {
    return this.flex(items, { direction: 'column', gap });
  }

  /** Horizontal row (flex-row with gap) */
  row(items, gap = '16px') {
    return this.flex(items, { direction: 'row', gap });
  }

  /** Centered wrapper */
  center(childFn) {
    const c = this.createElement('div').css({
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    });
    if (typeof childFn === 'function') childFn(c);
    return c;
  }

  /** Max-width centered container */
  container(childFn, maxWidth = '1200px') {
    const c = this.createElement('div').css({
      maxWidth, margin: '0 auto', padding: '0 20px'
    });
    if (typeof childFn === 'function') childFn(c);
    return c;
  }

  /** Empty spacer div */
  spacer(height = '16px') {
    return this.createElement('div').css({ height });
  }

  /** Styled horizontal rule */
  divider(options = {}) {
    const { color = '#e0e0e0', margin = '16px 0' } = options;
    return this.createElement('hr').css({ border: 'none', borderTop: `1px solid ${color}`, margin });
  }

  /** Multi-column layout */
  columns(count, columnFns = [], gap = '16px') {
    const g = this.grid(count, null, gap);
    for (const fn of columnFns) {
      const col = g.child('div');
      if (typeof fn === 'function') fn(col);
    }
    return g;
  }

  /* ==== DATA HELPERS ==== */

  list(items, renderer, tag = 'ul') {
    const ul = this.createElement(tag);
    for (let i = 0; i < items.length; i++) {
      const li = ul.child('li');
      if (typeof renderer === 'function') renderer(li, items[i], i);
      else li.text(String(items[i]));
    }
    return ul;
  }

  dataTable(headers, rows, options = {}) {
    const tbl = this.createElement('table');
    if (options.class) tbl.addClass(options.class);
    if (!headers && options.autoHeaders && rows.length > 0 && typeof rows[0] === 'object') {
      headers = Object.keys(rows[0]);
    }
    if (headers && headers.length > 0) {
      const thead = tbl.child('thead');
      const tr = thead.child('tr');
      for (const h of headers) tr.child('th').text(h);
    }
    const tbody = tbl.child('tbody');
    for (const row of rows) {
      const tr = tbody.child('tr');
      if (Array.isArray(row)) {
        for (const cell of row) tr.child('td').text(String(cell));
      } else if (typeof row === 'object') {
        const keys = headers || Object.keys(row);
        for (const k of keys) tr.child('td').text(String(row[k] ?? ''));
      }
    }
    return tbl;
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
      const cached = responseCache.get(this._cacheKey);
      if (cached) { this.clear(); this._lastRendered = cached; return cached; }
    }

    const ctx = {
      events: getPooled('arrays'),
      states: getPooled('arrays'),
      styles: [],
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

    if (this._useResponseCache && this._cacheKey) responseCache.set(this._cacheKey, result);

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

module.exports = { Document, responseCache };
