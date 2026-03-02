'use strict';

const { toKebab, escapeHtml, sanitizeCssValue, sanitizeFunctionSource, hash } = require('./utils');
const { CONFIG } = require('./config');

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
    this._parent = null;
    this._slots = {};
    this._portalTarget = null;
    this._inlineStyles = {};
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
    el.cssText = this.cssText;
    el._inlineStyles = { ...this._inlineStyles };
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
      const idx = this._classes.indexOf(n);
      if (idx >= 0) this._classes.splice(idx, 1);
    }
    this.attrs.class = this._classes.join(' ') || undefined;
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

  hasClass(name) { return this._classes.includes(name); }

  _addClassName(name) {
    if (!this._classes.includes(name)) this._classes.push(name);
    this.attrs.class = this._classes.join(' ');
  }

  /* ==== SLOTS ==== */

  slot(name = 'default') {
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
  isVoid() {
    const voids = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
    return voids.has(this.tag);
  }

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
}

module.exports = { Element };
