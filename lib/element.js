'use strict';

const { toKebab, escapeHtml, sanitizeCssValue, sanitizeFunctionSource, hash } = require('./utils');
const { CONFIG } = require('./config');

const VOID_ELEMENTS = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);

class Element {
  constructor(tag, ridGen, stateStore) {
    this.tag = toKebab(tag);
    this.attrs = {};
    this.children = [];
    this.events = [];
    this.cssText = '';
    this._state = null;
    this.hydrate = false;
    this._computed = null;
    this._ridGen = ridGen;
    this._stateStore = stateStore;
    this._document = null;
    this._stateBindings = [];
    this._classes = [];
    this._classSet = new Set();
    this._parent = null;
    this._slots = null;
    this._portalTarget = null;
    this._inlineStyles = null;
  }

  /* ==== TREE BUILDING ==== */

  child(tag) {
    if (!this._document) throw new Error('[Element] Cannot create child: no document');
    const ch = this._document._poolElement(tag);
    ch._parent = this;
    this.children.push(ch);
    return ch;
  }

  create(tag) { return this.child(tag); }

  append(c) {
    if (c == null) return this;
    if (c instanceof Element) c._parent = this;
    this.children.push(c instanceof Element ? c : escapeHtml(c));
    return this;
  }

  appendUnsafe(html) {
    if (html != null) this.children.push(String(html));
    return this;
  }

  text(c) {
    if (c != null) this.children.push(escapeHtml(c));
    return this;
  }

  set textContent(c) {
    if (c != null) this.children = [escapeHtml(c)];
  }

  before(sibling) {
    if (!this._parent) return this;
    const idx = this._parent.children.indexOf(this);
    if (idx >= 0) {
      if (sibling instanceof Element) sibling._parent = this._parent;
      this._parent.children.splice(idx, 0, sibling instanceof Element ? sibling : escapeHtml(sibling));
    }
    return this;
  }

  after(sibling) {
    if (!this._parent) return this;
    const idx = this._parent.children.indexOf(this);
    if (idx >= 0) {
      if (sibling instanceof Element) sibling._parent = this._parent;
      this._parent.children.splice(idx + 1, 0, sibling instanceof Element ? sibling : escapeHtml(sibling));
    }
    return this;
  }

  wrap(tag) {
    if (!this._parent || !this._document) return this;
    const wrapper = this._document._poolElement(tag);
    wrapper._parent = this._parent;
    const idx = this._parent.children.indexOf(this);
    if (idx >= 0) {
      this._parent.children[idx] = wrapper;
      wrapper.children.push(this);
      this._parent = wrapper;
    }
    return wrapper;
  }

  remove() {
    if (!this._parent) return this;
    const idx = this._parent.children.indexOf(this);
    if (idx >= 0) this._parent.children.splice(idx, 1);
    this._parent = null;
    return this;
  }

  empty() {
    this.children.length = 0;
    return this;
  }

  clone() {
    if (!this._document) throw new Error('[Element] Cannot clone: no document');
    const el = this._document._poolElement(this.tag);
    for (const k in this.attrs) el.attrs[k] = this.attrs[k];
    if (el.attrs.id) el.attrs.id = this._ridGen();
    el._classes = [...this._classes];
    el._classSet = new Set(this._classSet);
    el.cssText = this.cssText;
    el._inlineStyles = this._inlineStyles ? { ...this._inlineStyles } : null;
    el._state = this._state;
    el.hydrate = this.hydrate;
    for (const child of this.children) {
      if (child instanceof Element) {
        const cloned = child.clone();
        cloned._parent = el;
        el.children.push(cloned);
      } else {
        el.children.push(child);
      }
    }
    return el;
  }

  find(tag) {
    const target = toKebab(tag);
    for (const child of this.children) {
      if (child instanceof Element) {
        if (child.tag === target) return child;
        const found = child.find(tag);
        if (found) return found;
      }
    }
    return null;
  }

  findById(id) {
    for (const child of this.children) {
      if (child instanceof Element) {
        if (child.attrs.id === id) return child;
        const found = child.findById(id);
        if (found) return found;
      }
    }
    return null;
  }

  findAll(tag) {
    const target = toKebab(tag);
    const results = [];
    const walk = (el) => {
      for (const child of el.children) {
        if (child instanceof Element) {
          if (child.tag === target) results.push(child);
          walk(child);
        }
      }
    };
    walk(this);
    return results;
  }

  closest(tag) {
    const target = toKebab(tag);
    let current = this._parent;
    while (current) {
      if (current.tag === target) return current;
      current = current._parent;
    }
    return null;
  }

  html() {
    const { renderNode } = require('./renderer');
    const ctx = { events: [], states: [], styles: [], computed: [], stateBindings: [], oncreates: [], globalState: {} };
    return renderNode(this, ctx);
  }

  /* ==== ATTRIBUTES ==== */

  attr(key, value) {
    this.attrs[toKebab(key)] = value;
    return this;
  }

  attribute(key, value) { return this.attr(key, value); }

  id(v) {
    this.attrs.id = v || this._ridGen();
    return this;
  }

  setAttrs(obj) {
    if (obj && typeof obj === 'object') {
      for (const k in obj) this.attrs[toKebab(k)] = obj[k];
    }
    return this;
  }

  data(obj) {
    if (obj && typeof obj === 'object') {
      for (const k in obj) this.attrs['data-' + toKebab(k)] = obj[k];
    }
    return this;
  }

  aria(obj) {
    if (obj && typeof obj === 'object') {
      for (const k in obj) this.attrs['aria-' + toKebab(k)] = obj[k];
    }
    return this;
  }

  /* ---- Attribute Shortcuts ---- */
  href(url) { return this.attr('href', url); }
  src(url) { return this.attr('src', url); }
  type(t) { return this.attr('type', t); }
  placeholder(t) { return this.attr('placeholder', t); }
  value(v) { return this.attr('value', v); }
  name(n) { return this.attr('name', n); }
  role(r) { return this.attr('role', r); }
  for(id) { return this.attr('for', id); }
  title(t) { return this.attr('title', t); }
  tabindex(n) { return this.attr('tabindex', n); }
  action(url) { return this.attr('action', url); }
  method(m) { return this.attr('method', m); }
  target(t) { return this.attr('target', t); }
  rel(r) { return this.attr('rel', r); }
  alt(a) { return this.attr('alt', a); }
  width(w) { return this.attr('width', w); }
  height(h) { return this.attr('height', h); }
  min(v) { return this.attr('min', v); }
  max(v) { return this.attr('max', v); }
  step(v) { return this.attr('step', v); }
  pattern(p) { return this.attr('pattern', p); }
  required(v = true) { if (v) this.attrs.required = 'required'; return this; }
  readonly(v = true) { if (v) this.attrs.readonly = 'readonly'; return this; }
  autofocus(v = true) { if (v) this.attrs.autofocus = 'autofocus'; return this; }
  autocomplete(v) { return this.attr('autocomplete', v || 'off'); }
  multiple(v = true) { if (v) this.attrs.multiple = 'multiple'; return this; }
  checked(v = true) { if (v) this.attrs.checked = 'checked'; return this; }
  selected(v = true) { if (v) this.attrs.selected = 'selected'; return this; }

  disabled(v = true) {
    if (v) this.attrs.disabled = 'disabled';
    else delete this.attrs.disabled;
    return this;
  }

  hidden(v = true) {
    if (v) this.attrs.hidden = 'hidden';
    else delete this.attrs.hidden;
    return this;
  }

  contentEditable(v = true) {
    this.attrs.contenteditable = v ? 'true' : 'false';
    return this;
  }

  draggable(v = true) {
    this.attrs.draggable = v ? 'true' : 'false';
    return this;
  }

  /* ==== CSS / CLASSES ==== */

  css(s) {
    if (!s || typeof s !== 'object') return this;
    const rules = [];
    for (const k in s) rules.push(`${toKebab(k)}:${sanitizeCssValue(s[k])}`);
    if (!rules.length) return this;
    const cssStr = rules.join(';') + ';';
    const sc = 'c' + hash(cssStr);
    this._addClassName(sc);
    this.cssText += `.${sc}{${cssStr}}`;
    return this;
  }

  style(prop, value) {
    if (!this._inlineStyles) this._inlineStyles = {};
    if (typeof prop === 'object') {
      for (const k in prop) this._inlineStyles[toKebab(k)] = sanitizeCssValue(prop[k]);
    } else if (prop && value != null) {
      this._inlineStyles[toKebab(prop)] = sanitizeCssValue(value);
    }
    const parts = [];
    for (const k in this._inlineStyles) parts.push(`${k}:${this._inlineStyles[k]}`);
    if (parts.length) this.attrs.style = parts.join(';') + ';';
    return this;
  }

  addClass(...names) {
    for (const n of names) {
      if (n && typeof n === 'string') {
        for (const p of n.split(' ')) { if (p) this._addClassName(p); }
      }
    }
    return this;
  }

  removeClass(...names) {
    for (const n of names) {
      if (this._classSet.has(n)) {
        this._classSet.delete(n);
        const idx = this._classes.indexOf(n);
        if (idx >= 0) this._classes.splice(idx, 1);
      }
    }
    return this;
  }

  toggleClass(condition, name) {
    if (condition && name) this._addClassName(name);
    return this;
  }

  classIf(condition, trueClass, falseClass) {
    if (condition && trueClass) this._addClassName(trueClass);
    else if (!condition && falseClass) this._addClassName(falseClass);
    return this;
  }

  classMap(map) {
    if (map && typeof map === 'object') {
      for (const k in map) { if (map[k]) this._addClassName(k); }
    }
    return this;
  }

  hasClass(name) { return this._classSet.has(name); }

  _addClassName(name) {
    if (!this._classSet.has(name)) {
      this._classSet.add(name);
      this._classes.push(name);
    }
  }

  /* ==== SLOTS ==== */

  slot(name = 'default') {
    if (!this._slots) this._slots = {};
    if (!this.attrs.id) this.id();
    this._slots[name] = this.attrs.id;
    this.attr('data-slot', name);
    return this;
  }

  fillSlot(name, contentFn) {
    const slotEl = this._findSlot(name);
    if (slotEl && typeof contentFn === 'function') contentFn(slotEl);
    return this;
  }

  _findSlot(name) {
    for (const child of this.children) {
      if (child instanceof Element) {
        if (child.attrs['data-slot'] === name) return child;
        const found = child._findSlot(name);
        if (found) return found;
      }
    }
    return null;
  }

  /* ==== PORTAL ==== */

  portal(targetId) {
    this._portalTarget = targetId;
    return this;
  }

  /* ==== STATE & EVENTS ==== */

  bind(stateKey, templateFn = (val) => val) {
    if (!this.attrs.id) this.id();
    try {
      const fnSource = typeof templateFn === 'function'
        ? sanitizeFunctionSource(templateFn, CONFIG.maxComputedFnSize)
        : '(val) => val';
      this._stateBindings.push({ stateKey, id: this.attrs.id, templateFn: fnSource });
      this.hydrate = true;
    } catch (err) {
      if (CONFIG.mode === 'dev') console.error('[Element] Invalid bind function:', err.message);
    }
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
    try {
      sanitizeFunctionSource(fn, CONFIG.maxComputedFnSize);
      this._computed = fn;
      if (!this.attrs.id) this.id();
      this.hydrate = true;
    } catch (err) {
      if (CONFIG.mode === 'dev') console.error('Invalid computed function:', err);
    }
    return this;
  }

  on(ev, fn) {
    try {
      sanitizeFunctionSource(fn, CONFIG.maxEventFnSize);
      if (!this.attrs.id) this.id();
      this.events.push({ event: ev, id: this.attrs.id, fn });
      this.hydrate = true;
    } catch (err) {
      if (CONFIG.mode === 'dev') console.error('Invalid event handler:', err.message);
    }
    return this;
  }

  bindState(target, ev, fn) {
    try {
      sanitizeFunctionSource(fn, CONFIG.maxEventFnSize);
      if (!this.attrs.id) this.id();
      if (!target.attrs.id) target.id();
      this.events.push({ event: ev, id: this.attrs.id, targetId: target.attrs.id, fn });
      this.hydrate = true;
    } catch (err) {
      if (CONFIG.mode === 'dev') console.error('Invalid state binding:', err.message);
    }
    return this;
  }

  /* ---- Event Shorthands ---- */
  onClick(fn) { return this.on('click', fn); }
  onChange(fn) { return this.on('change', fn); }
  onInput(fn) { return this.on('input', fn); }
  onSubmit(fn) { return this.on('submit', fn); }
  onKeydown(fn) { return this.on('keydown', fn); }
  onKeyup(fn) { return this.on('keyup', fn); }
  onKeypress(fn) { return this.on('keypress', fn); }
  onFocus(fn) { return this.on('focus', fn); }
  onBlur(fn) { return this.on('blur', fn); }
  onMouseenter(fn) { return this.on('mouseenter', fn); }
  onMouseleave(fn) { return this.on('mouseleave', fn); }
  onMousedown(fn) { return this.on('mousedown', fn); }
  onMouseup(fn) { return this.on('mouseup', fn); }
  onMousemove(fn) { return this.on('mousemove', fn); }
  onDblclick(fn) { return this.on('dblclick', fn); }
  onContextmenu(fn) { return this.on('contextmenu', fn); }
  onScroll(fn) { return this.on('scroll', fn); }
  onLoad(fn) { return this.on('load', fn); }
  onError(fn) { return this.on('error', fn); }
  onDragstart(fn) { return this.on('dragstart', fn); }
  onDragend(fn) { return this.on('dragend', fn); }
  onDragover(fn) { return this.on('dragover', fn); }
  onDrop(fn) { return this.on('drop', fn); }
  onTouchstart(fn) { return this.on('touchstart', fn); }
  onTouchend(fn) { return this.on('touchend', fn); }
  onTouchmove(fn) { return this.on('touchmove', fn); }

  /* ==== VISIBILITY / STATE TOGGLES ==== */

  show() { delete this.attrs.hidden; return this; }
  hide() { this.attrs.hidden = 'hidden'; return this; }
  enable() { delete this.attrs.disabled; return this; }
  disable() { this.attrs.disabled = 'disabled'; return this; }
  focus() { this.attrs.autofocus = 'autofocus'; return this; }

  /* ==== ADDITIONAL TREE MANIPULATION ==== */

  /** Replace this element in its parent with another element */
  replaceWith(other) {
    if (!this._parent) return other;
    const idx = this._parent.children.indexOf(this);
    if (idx >= 0) {
      if (other instanceof Element) other._parent = this._parent;
      this._parent.children[idx] = other;
      this._parent = null;
    }
    return other;
  }

  /** Insert child at the beginning */
  prependChild(child) {
    if (child instanceof Element) child._parent = this;
    this.children.unshift(child instanceof Element ? child : escapeHtml(child));
    return this;
  }

  /** Insert child at a specific index */
  insertAt(index, child) {
    if (child instanceof Element) child._parent = this;
    const clamped = Math.max(0, Math.min(index, this.children.length));
    this.children.splice(clamped, 0, child instanceof Element ? child : escapeHtml(child));
    return this;
  }

  /** Number of children */
  childCount() { return this.children.length; }

  /** Get parent element */
  parent() { return this._parent; }

  /** Position in parent's children array */
  index() {
    if (!this._parent) return -1;
    return this._parent.children.indexOf(this);
  }

  /** Get all sibling elements (excluding self) */
  siblings() {
    if (!this._parent) return [];
    return this._parent.children.filter(c => c !== this && c instanceof Element);
  }

  /** Next sibling element */
  nextSibling() {
    if (!this._parent) return null;
    const idx = this._parent.children.indexOf(this);
    for (let i = idx + 1; i < this._parent.children.length; i++) {
      if (this._parent.children[i] instanceof Element) return this._parent.children[i];
    }
    return null;
  }

  /** Previous sibling element */
  prevSibling() {
    if (!this._parent) return null;
    const idx = this._parent.children.indexOf(this);
    for (let i = idx - 1; i >= 0; i--) {
      if (this._parent.children[i] instanceof Element) return this._parent.children[i];
    }
    return null;
  }

  /** Check if this is a void/self-closing element */
  isVoid() { return VOID_ELEMENTS.has(this.tag); }

  /** Alias for html() */
  toString() { return this.html(); }

  /** Tooltip — sets title + aria-describedby */
  tooltip(text) {
    if (!this.attrs.id) this.id();
    this.attrs.title = text;
    this.attrs['aria-describedby'] = this.attrs.id + '-tip';
    return this;
  }

  /* ==== CSS PSEUDO-CLASS & RESPONSIVE ==== */

  /** :hover styles */
  hover(rules) { return this._pseudoClass('hover', rules); }

  /** :focus styles (CSS, not event) */
  focusCss(rules) { return this._pseudoClass('focus', rules); }

  /** :active styles */
  active(rules) { return this._pseudoClass('active', rules); }

  /** :first-child styles */
  firstChild(rules) { return this._pseudoClass('first-child', rules); }

  /** :last-child styles */
  lastChild(rules) { return this._pseudoClass('last-child', rules); }

  /** :nth-child(n) styles */
  nthChild(n, rules) { return this._pseudoClass(`nth-child(${n})`, rules); }

  /** ::before / ::after pseudo-element */
  pseudo(which, rules) {
    if (!rules || typeof rules !== 'object') return this;
    const cssRules = [];
    for (const k in rules) cssRules.push(`${toKebab(k)}:${sanitizeCssValue(rules[k])}`);
    if (!cssRules.length) return this;
    const cssStr = cssRules.join(';') + ';';
    // Need a stable class for the element
    const sc = 'p' + hash(which + cssStr);
    this._addClassName(sc);
    this.cssText += `.${sc}::${which}{${cssStr}}`;
    return this;
  }

  /** @media query scoped to this element */
  media(query, rules) {
    if (!rules || typeof rules !== 'object') return this;
    const cssRules = [];
    for (const k in rules) cssRules.push(`${toKebab(k)}:${sanitizeCssValue(rules[k])}`);
    if (!cssRules.length) return this;
    const cssStr = cssRules.join(';') + ';';
    const sc = 'm' + hash(query + cssStr);
    this._addClassName(sc);
    this.cssText += `@media ${query}{.${sc}{${cssStr}}}`;
    return this;
  }

  /** CSS transition shorthand */
  transition(props) {
    if (typeof props === 'string') return this.style('transition', props);
    if (typeof props === 'object') {
      const { property = 'all', duration = '0.3s', timing = 'ease', delay = '0s' } = props;
      return this.style('transition', `${property} ${duration} ${timing} ${delay}`);
    }
    return this;
  }

  /** CSS transform shorthand */
  transform(value) { return this.style('transform', value); }

  /** Link to a keyframe animation */
  animate(keyframeName, options = {}) {
    const { duration = '1s', timing = 'ease', delay = '0s', iterations = '1', direction = 'normal', fillMode = 'none' } = options;
    return this.style('animation', `${keyframeName} ${duration} ${timing} ${delay} ${iterations} ${direction} ${fillMode}`);
  }

  /* ---- CSS property shorthands ---- */
  opacity(n) { return this.style('opacity', String(n)); }
  zIndex(n) { return this.style('z-index', String(n)); }
  cursor(type) { return this.style('cursor', type); }
  overflow(value) { return this.style('overflow', value); }
  display(value) { return this.style('display', value); }
  position(value) { return this.style('position', value); }
  size(w, h) { this.style('width', w); if (h != null) this.style('height', h); else this.style('height', w); return this; }

  /* ==== FORM VALIDATION ATTRIBUTES ==== */
  minLength(n) { return this.attr('minlength', n); }
  maxLength(n) { return this.attr('maxlength', n); }
  accept(types) { return this.attr('accept', types); }
  rows(n) { return this.attr('rows', n); }
  cols(n) { return this.attr('cols', n); }

  /* ---- Internal pseudo-class helper ---- */
  _pseudoClass(pseudo, rules) {
    if (!rules || typeof rules !== 'object') return this;
    const cssRules = [];
    for (const k in rules) cssRules.push(`${toKebab(k)}:${sanitizeCssValue(rules[k])}`);
    if (!cssRules.length) return this;
    const cssStr = cssRules.join(';') + ';';
    const sc = 'h' + hash(pseudo + cssStr);
    this._addClassName(sc);
    this.cssText += `.${sc}:${pseudo}{${cssStr}}`;
    return this;
  }

  /* ==== TAG SHORTCUTS (create child elements) ==== */

  div() { return this.child('div'); }
  span() { return this.child('span'); }
  section() { return this.child('section'); }
  header() { return this.child('header'); }
  footer() { return this.child('footer'); }
  main() { return this.child('main'); }
  nav() { return this.child('nav'); }
  article() { return this.child('article'); }
  aside() { return this.child('aside'); }
  form() { return this.child('form'); }
  ul() { return this.child('ul'); }
  ol() { return this.child('ol'); }
  table() { return this.child('table'); }
  details() { return this.child('details'); }
  summary() { return this.child('summary'); }
  dialog() { return this.child('dialog'); }
  pre() { return this.child('pre'); }
  code() { return this.child('code'); }
  blockquote() { return this.child('blockquote'); }

  h(level = 1) { return this.child('h' + Math.max(1, Math.min(6, level))); }

  p(text) {
    const el = this.child('p');
    if (text != null) el.text(text);
    return el;
  }

  img(src, alt = '') {
    return this.child('img').attr('src', src).attr('alt', alt);
  }

  a(href, text) {
    const el = this.child('a').attr('href', href);
    if (text != null) el.text(text);
    return el;
  }

  button(text) {
    const el = this.child('button');
    if (text != null) el.text(text);
    return el;
  }

  input(type = 'text', attrs = {}) {
    const el = this.child('input').attr('type', type);
    if (attrs) el.setAttrs(attrs);
    return el;
  }

  textarea(attrs = {}) {
    const el = this.child('textarea');
    if (attrs) el.setAttrs(attrs);
    return el;
  }

  select(optionsList = [], attrs = {}) {
    const el = this.child('select');
    if (attrs) el.setAttrs(attrs);
    for (const opt of optionsList) {
      const optEl = el.child('option').attr('value', opt.value);
      if (opt.text) optEl.text(opt.text);
      if (opt.selected) optEl.attr('selected', 'selected');
      if (opt.disabled) optEl.attr('disabled', 'disabled');
    }
    return el;
  }

  br() { this.children.push('<br>'); return this; }
  hr() { return this.child('hr'); }

  /* ==== FORM HELPERS ==== */

  formGroup(label, inputType = 'text', inputAttrs = {}) {
    const group = this.child('div').addClass('form-group');
    const inputId = inputAttrs.id || this._ridGen();
    group.child('label').attr('for', inputId).text(label);
    const inp = group.child('input').attr('type', inputType).id(inputId);
    if (inputAttrs) inp.setAttrs(inputAttrs);
    return group;
  }

  checkbox(name, label, checked = false) {
    const group = this.child('div').addClass('form-check');
    const id = this._ridGen();
    const inp = group.child('input').attr('type', 'checkbox').name(name).id(id);
    if (checked) inp.checked();
    group.child('label').attr('for', id).text(label);
    return group;
  }

  radio(name, options = []) {
    const group = this.child('div').addClass('form-radio-group');
    for (const opt of options) {
      const id = this._ridGen();
      const wrapper = group.child('div').addClass('form-radio');
      const inp = wrapper.child('input').attr('type', 'radio').name(name).attr('value', opt.value).id(id);
      if (opt.checked) inp.checked();
      wrapper.child('label').attr('for', id).text(opt.label || opt.text || opt.value);
    }
    return group;
  }

  fieldset(legend, setupFn) {
    const fs = this.child('fieldset');
    if (legend) fs.child('legend').text(legend);
    if (typeof setupFn === 'function') setupFn(fs);
    return fs;
  }

  hiddenInput(name, value) {
    return this.child('input').attr('type', 'hidden').name(name).value(value);
  }

  /* ==== LAYOUT HELPERS ==== */

  grid(columns, items, gap = '16px') {
    const g = this.child('div').css({
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

  flex(items, options = {}) {
    const { direction = 'row', gap = '16px', align, justify, wrap } = options;
    const f = this.child('div').css({
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

  stack(items, gap = '16px') { return this.flex(items, { direction: 'column', gap }); }
  row(items, gap = '16px') { return this.flex(items, { direction: 'row', gap }); }

  center(childFn) {
    const c = this.child('div').css({ display: 'flex', alignItems: 'center', justifyContent: 'center' });
    if (typeof childFn === 'function') childFn(c);
    return c;
  }

  container(childFn, maxWidth = '1200px') {
    const c = this.child('div').css({ maxWidth, margin: '0 auto', padding: '0 20px' });
    if (typeof childFn === 'function') childFn(c);
    return c;
  }

  spacer(height = '16px') { return this.child('div').css({ height }); }

  divider(options = {}) {
    const { color = '#e0e0e0', margin = '16px 0' } = options;
    return this.child('hr').css({ border: 'none', borderTop: `1px solid ${color}`, margin });
  }

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
    const ul = this.child(tag);
    for (let i = 0; i < items.length; i++) {
      const li = ul.child('li');
      if (typeof renderer === 'function') renderer(li, items[i], i);
      else li.text(String(items[i]));
    }
    return ul;
  }

  dataTable(headers, rows, options = {}) {
    const tbl = this.child('table');
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

  /* ==== COMPONENT SYSTEM ==== */

  component(name, props = {}, overrides = {}) {
    const { components, applyComponent } = require('./components');
    const { fn, options } = components.get(name);
    const tag = overrides.tag || options.tag || 'div';
    const el = this.child(tag);
    applyComponent(el, fn, props, { ...options, ...overrides });
    return el;
  }

  use(componentFn, props = {}, tag = 'div') {
    const { applyComponent } = require('./components');
    const el = this.child(tag);
    applyComponent(el, componentFn, props);
    return el;
  }

  /* ==== UTILITY ==== */

  each(items, fn) {
    if (!Array.isArray(items) || typeof fn !== 'function') return this;
    for (let i = 0; i < items.length; i++) fn(this, items[i], i);
    return this;
  }

  when(condition, fn) {
    if (condition && typeof fn === 'function') fn(this);
    return this;
  }
}

module.exports = { Element };
