'use strict';

const { toKebab, normalizeTagName, escapeHtml, sanitizeCssValue, sanitizeFunctionSource, isValidAttrKey, safeJsonStringify, hash, VOID_ELEMENTS } = require('./utils');
const { CONFIG } = require('./config');

class Element {
  constructor(tag, ridGen, stateStore) {
    this.tag = normalizeTagName(tag);
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
    this._lifecycle = [];
    this._classes = [];
    this._classSet = new Set();
    this._parent = null;
    this._slots = null;
    this._portalTarget = null;
    this._inlineStyles = null;
    this._pooled = false;
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

  build(defs) {
    const { buildNode } = require('./builder');
    const definitions = Array.isArray(defs) ? defs : [defs];
    for (const def of definitions) {
      if (def != null) buildNode(this, def);
    }
    return this;
  }

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

  // A top-level element created by Document.create() lives in document.body and
  // has no _parent, so the sibling list has to be resolved from whichever of the
  // two actually holds it. Without this these silently did nothing.
  _siblingList() {
    if (this._parent) return this._parent.children;
    return this._document ? this._document.body : null;
  }

  before(sibling) {
    const siblings = this._siblingList();
    if (!siblings) return this;
    const idx = siblings.indexOf(this);
    if (idx >= 0) {
      if (sibling instanceof Element) sibling._parent = this._parent;
      siblings.splice(idx, 0, sibling instanceof Element ? sibling : escapeHtml(sibling));
    }
    return this;
  }

  after(sibling) {
    const siblings = this._siblingList();
    if (!siblings) return this;
    const idx = siblings.indexOf(this);
    if (idx >= 0) {
      if (sibling instanceof Element) sibling._parent = this._parent;
      siblings.splice(idx + 1, 0, sibling instanceof Element ? sibling : escapeHtml(sibling));
    }
    return this;
  }

  wrap(tag) {
    if (!this._document) return this;
    const siblings = this._siblingList();
    if (!siblings) return this;
    const wrapper = this._document._poolElement(tag);
    // Null for a body-level element, which is what a document-level wrapper has.
    wrapper._parent = this._parent;
    const idx = siblings.indexOf(this);
    if (idx >= 0) {
      siblings[idx] = wrapper;
      wrapper.children.push(this);
      this._parent = wrapper;
    }
    return wrapper;
  }

  remove() {
    if (this._parent) {
      const idx = this._parent.children.indexOf(this);
      if (idx >= 0) this._parent.children.splice(idx, 1);
      this._parent = null;
      return this;
    }
    // Document.create() appends to document.body without setting _parent, so a
    // top-level element reached neither branch and remove() silently did
    // nothing — with no error to tell the caller it had not worked.
    if (this._document) {
      const idx = this._document.body.indexOf(this);
      if (idx >= 0) this._document.body.splice(idx, 1);
    }
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
    el._state = (this._state !== null && typeof this._state === 'object')
      ? JSON.parse(JSON.stringify(this._state))
      : this._state;
    el.hydrate = this.hydrate;
    el._portalTarget = this._portalTarget;
    // Handlers and bindings address their element by id at hydration time, so they
    // must follow the clone's regenerated id — otherwise every clone re-registers
    // against the source element, leaving the clones inert.
    if (this.events.length > 0) el.events = this.events.map(e => ({ ...e, id: el.attrs.id }));
    if (this._stateBindings.length > 0) el._stateBindings = this._stateBindings.map(b => ({ ...b, id: el.attrs.id }));
    if (this._lifecycle.length > 0) el._lifecycle = this._lifecycle.map(h => ({ ...h, id: el.attrs.id }));
    if (this._computed) el._computed = this._computed;
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
    const target = normalizeTagName(tag);
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
    const target = normalizeTagName(tag);
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
    const target = normalizeTagName(tag);
    let current = this._parent;
    while (current) {
      if (current.tag === target) return current;
      current = current._parent;
    }
    return null;
  }

  html() {
    const { renderNode } = require('./renderer');
    const ctx = { events: [], states: [], styles: [], seenCss: new Set(), computed: [], stateBindings: [], lifecycles: [], portals: [], oncreates: [], globalState: {} };
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
      for (const k in obj) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        this.attrs[toKebab(k)] = obj[k];
      }
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
  required(v = true) { if (v) this.attrs.required = 'required'; else delete this.attrs.required; return this; }
  readonly(v = true) { if (v) this.attrs.readonly = 'readonly'; else delete this.attrs.readonly; return this; }
  autofocus(v = true) { if (v) this.attrs.autofocus = 'autofocus'; else delete this.attrs.autofocus; return this; }
  autocomplete(v) { return this.attr('autocomplete', v || 'off'); }
  multiple(v = true) { if (v) this.attrs.multiple = 'multiple'; else delete this.attrs.multiple; return this; }
  checked(v = true) { if (v) this.attrs.checked = 'checked'; else delete this.attrs.checked; return this; }
  selected(v = true) { if (v) this.attrs.selected = 'selected'; else delete this.attrs.selected; return this; }

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
    if (CONFIG.mode === 'dev' && this._document && this._document._cssRegistry) {
      const reg = this._document._cssRegistry;
      if (reg.has(sc) && reg.get(sc) !== cssStr) {
        console.warn(`[css] Hash collision: class "${sc}" maps to two different CSS strings.\n  Existing: ${reg.get(sc)}\n  New:      ${cssStr}`);
      } else {
        reg.set(sc, cssStr);
      }
    }
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
      if (n && typeof n === 'string') {
        for (const p of n.split(' ')) {
          if (p && this._classSet.has(p)) {
            this._classSet.delete(p);
            const idx = this._classes.indexOf(p);
            if (idx >= 0) this._classes.splice(idx, 1);
          }
        }
      }
    }
    return this;
  }

  toggleClass(condition, name) {
    if (!name) return this;
    if (condition) this._addClassName(name);
    else this.removeClass(name);
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
    if (typeof targetId !== 'string' || !targetId) return this;
    if (!this.attrs.id) this.id();
    this._portalTarget = targetId;
    this.hydrate = true;
    return this;
  }

  /* ==== STATE & EVENTS ==== */

  _recordCallbackFailure(callbackType, error) {
    if (this._document && typeof this._document._recordCallbackFailure === 'function') {
      this._document._recordCallbackFailure(callbackType, error, this);
    }
  }

  bind(stateKey, templateFn = (val) => val, context) {
    if (!this.attrs.id) this.id();
    try {
      const fnSource = typeof templateFn === 'function'
        ? sanitizeFunctionSource(templateFn, CONFIG.maxComputedFnSize)
        : '(val) => val';
      this._stateBindings.push({ stateKey, id: this.attrs.id, templateFn: fnSource, bindType: 'text', context: safeJsonStringify(context) });
      this.hydrate = true;
    } catch (err) {
      this._recordCallbackFailure('binding:text', err);
      if (CONFIG.mode === 'dev') console.error('[Element] Invalid bind function:', err.message);
    }
    return this;
  }

  /** Reactively show/hide this element. fn(val) => truthy = visible. */
  bindShow(stateKey, fn = (val) => val, context) {
    if (!this.attrs.id) this.id();
    try {
      const fnSource = sanitizeFunctionSource(fn, CONFIG.maxComputedFnSize);
      this._stateBindings.push({ stateKey, id: this.attrs.id, templateFn: fnSource, bindType: 'show', context: safeJsonStringify(context) });
      this.hydrate = true;
    } catch (err) {
      this._recordCallbackFailure('binding:show', err);
      if (CONFIG.mode === 'dev') console.error('[Element] Invalid bindShow function:', err.message);
    }
    return this;
  }

  /** Show this element when State[stateKey] strictly equals expectedValue. */
  showWhen(stateKey, expectedValue) {
    if (!this.attrs.id) this.id();
    try {
      const expected = safeJsonStringify(expectedValue);
      this._stateBindings.push({ stateKey, id: this.attrs.id, templateFn: `function(value){return Object.is(value,${expected});}`, bindType: 'show' });
      this.hydrate = true;
    } catch (err) {
      if (CONFIG.mode === 'dev') console.error('[Element] showWhen value must be JSON-serializable:', err.message);
    }
    return this;
  }

  /** Reactively set className. fn(val) => string of classes. */
  bindClass(stateKey, fn, context) {
    if (!this.attrs.id) this.id();
    try {
      const fnSource = sanitizeFunctionSource(fn, CONFIG.maxComputedFnSize);
      this._stateBindings.push({ stateKey, id: this.attrs.id, templateFn: fnSource, bindType: 'class', context: safeJsonStringify(context) });
      this.hydrate = true;
    } catch (err) {
      this._recordCallbackFailure('binding:class', err);
      if (CONFIG.mode === 'dev') console.error('[Element] Invalid bindClass function:', err.message);
    }
    return this;
  }

  /** Toggle one class when State[stateKey] strictly equals expectedValue. */
  classWhen(stateKey, expectedValue, className) {
    if (typeof className !== 'string' || !className.trim() || /\s/.test(className.trim())) {
      if (CONFIG.mode === 'dev') console.error('[Element] classWhen requires one non-empty class name.');
      return this;
    }
    if (!this.attrs.id) this.id();
    try {
      this._stateBindings.push({
        stateKey, id: this.attrs.id, bindType: 'classToggle',
        expectedValue: safeJsonStringify(expectedValue), className: className.trim()
      });
      this.hydrate = true;
    } catch (err) {
      if (CONFIG.mode === 'dev') console.error('[Element] classWhen value must be JSON-serializable:', err.message);
    }
    return this;
  }

  /** Reactively set an attribute. fn(val) => string | null (null removes the attribute). */
  bindAttr(stateKey, attrName, fn = (val) => val, context) {
    const safeAttrName = toKebab(attrName);
    if (!isValidAttrKey(safeAttrName)) {
      if (CONFIG.mode === 'dev') console.error('[Element] Invalid bindAttr attribute name:', attrName);
      return this;
    }
    if (!this.attrs.id) this.id();
    try {
      const fnSource = sanitizeFunctionSource(fn, CONFIG.maxComputedFnSize);
      this._stateBindings.push({ stateKey, id: this.attrs.id, templateFn: fnSource, bindType: 'attr', attrName: safeAttrName, context: safeJsonStringify(context) });
      this.hydrate = true;
    } catch (err) {
      this._recordCallbackFailure('binding:attr', err);
      if (CONFIG.mode === 'dev') console.error('[Element] Invalid bindAttr function:', err.message);
    }
    return this;
  }

  /** Reactively apply inline styles. fn(val) => { prop: value } object. */
  bindStyle(stateKey, fn, context) {
    if (!this.attrs.id) this.id();
    try {
      const fnSource = sanitizeFunctionSource(fn, CONFIG.maxComputedFnSize);
      this._stateBindings.push({ stateKey, id: this.attrs.id, templateFn: fnSource, bindType: 'style', context: safeJsonStringify(context) });
      this.hydrate = true;
    } catch (err) {
      this._recordCallbackFailure('binding:style', err);
      if (CONFIG.mode === 'dev') console.error('[Element] Invalid bindStyle function:', err.message);
    }
    return this;
  }

  /** Reactively set a DOM property (e.g. 'value', 'checked', 'innerHTML'). fn(val) => value. */
  bindProp(stateKey, prop, fn = (val) => val, context) {
    if (!this.attrs.id) this.id();
    try {
      const fnSource = sanitizeFunctionSource(fn, CONFIG.maxComputedFnSize);
      this._stateBindings.push({ stateKey, id: this.attrs.id, templateFn: fnSource, bindType: 'prop', prop, context: safeJsonStringify(context) });
      this.hydrate = true;
    } catch (err) {
      this._recordCallbackFailure('binding:prop', err);
      if (CONFIG.mode === 'dev') console.error('[Element] Invalid bindProp function:', err.message);
    }
    return this;
  }

  /**
   * Two-way input binding: syncs State[stateKey] → input.value AND input changes → State[stateKey].
   * Equivalent to calling bindProp(stateKey, 'value') + on('input', ...) together.
   */
  bindInput(stateKey) {
    this.bindProp(stateKey, 'value');
    if (!this.attrs.id) this.id();
    // Hardcoded trusted source — cannot use sanitizeFunctionSource because that blocks new Function()
    this.events.push({ event: 'input', id: this.attrs.id, fn: `function(){State[${safeJsonStringify(stateKey)}]=this.value;}` });
    this.hydrate = true;
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
      const fnSource = sanitizeFunctionSource(fn, CONFIG.maxComputedFnSize);
      this._computed = fnSource;
      if (!this.attrs.id) this.id();
      this.hydrate = true;
    } catch (err) {
      this._recordCallbackFailure('computed', err);
      if (CONFIG.mode === 'dev') console.error('Invalid computed function:', err);
    }
    return this;
  }

  on(ev, fn, context) {
    try {
      // Store source string now — prevents fn.toString() override at render time
      const fnSource = sanitizeFunctionSource(fn, CONFIG.maxEventFnSize);
      if (!this.attrs.id) this.id();
      this.events.push({ event: ev, id: this.attrs.id, fn: fnSource, context: safeJsonStringify(context) });
      this.hydrate = true;
    } catch (err) {
      this._recordCallbackFailure(`event:${ev}`, err);
      if (CONFIG.mode === 'dev') console.error('Invalid event handler:', err.message);
    }
    return this;
  }

  bindState(target, ev, fn, context) {
    try {
      const fnSource = sanitizeFunctionSource(fn, CONFIG.maxEventFnSize);
      if (!this.attrs.id) this.id();
      if (!target.attrs.id) target.id();
      this.events.push({ event: ev, id: this.attrs.id, targetId: target.attrs.id, fn: fnSource, context: safeJsonStringify(context) });
      this.hydrate = true;
    } catch (err) {
      this._recordCallbackFailure(`event:${ev}`, err);
      if (CONFIG.mode === 'dev') console.error('Invalid state binding:', err.message);
    }
    return this;
  }

  /** Set a state value on click without serializing a user callback. */
  setStateOnClick(stateKey, value) {
    try {
      if (!this.attrs.id) this.id();
      const fnSource = `function(){State[${safeJsonStringify(stateKey)}]=${safeJsonStringify(value)};}`;
      this.events.push({ event: 'click', id: this.attrs.id, fn: fnSource });
      this.hydrate = true;
    } catch (err) {
      if (CONFIG.mode === 'dev') console.error('[Element] setStateOnClick value must be JSON-serializable:', err.message);
    }
    return this;
  }

  _addLifecycle(type, stateKey, fn) {
    try {
      const fnSource = sanitizeFunctionSource(fn, CONFIG.maxEventFnSize);
      if (!this.attrs.id) this.id();
      this._lifecycle.push({ type, stateKey, id: this.attrs.id, fn: fnSource });
      this.hydrate = true;
    } catch (err) {
      this._recordCallbackFailure(`lifecycle:${type}`, err);
      if (CONFIG.mode === 'dev') console.error(`[Element] Invalid on${type} function:`, err.message);
    }
    return this;
  }

  /** Run once after this DOM element is mounted. A returned function runs during destroy. */
  onMount(fn) { return this._addLifecycle('mount', null, fn); }

  /** Run whenever the named root state key changes after mount. */
  onUpdate(stateKey, fn) {
    if (typeof stateKey !== 'string' || !stateKey) {
      if (CONFIG.mode === 'dev') console.error('[Element] onUpdate requires a non-empty state key.');
      return this;
    }
    return this._addLifecycle('update', stateKey, fn);
  }

  /** Run once after this DOM element is removed. */
  onDestroy(fn) { return this._addLifecycle('destroy', null, fn); }

  /* ---- Event Shorthands ---- */
  onClick(fn, context) { return this.on('click', fn, context); }
  onChange(fn, context) { return this.on('change', fn, context); }
  onInput(fn, context) { return this.on('input', fn, context); }
  onSubmit(fn, context) { return this.on('submit', fn, context); }
  onKeydown(fn, context) { return this.on('keydown', fn, context); }
  onKeyup(fn, context) { return this.on('keyup', fn, context); }
  onKeypress(fn, context) { return this.on('keypress', fn, context); }
  onFocus(fn, context) { return this.on('focus', fn, context); }
  onBlur(fn, context) { return this.on('blur', fn, context); }
  onMouseenter(fn, context) { return this.on('mouseenter', fn, context); }
  onMouseleave(fn, context) { return this.on('mouseleave', fn, context); }
  onMousedown(fn, context) { return this.on('mousedown', fn, context); }
  onMouseup(fn, context) { return this.on('mouseup', fn, context); }
  onMousemove(fn, context) { return this.on('mousemove', fn, context); }
  onDblclick(fn, context) { return this.on('dblclick', fn, context); }
  onContextmenu(fn, context) { return this.on('contextmenu', fn, context); }
  onScroll(fn, context) { return this.on('scroll', fn, context); }
  onLoad(fn, context) { return this.on('load', fn, context); }
  onError(fn, context) { return this.on('error', fn, context); }
  onDragstart(fn, context) { return this.on('dragstart', fn, context); }
  onDragend(fn, context) { return this.on('dragend', fn, context); }
  onDragover(fn, context) { return this.on('dragover', fn, context); }
  onDrop(fn, context) { return this.on('drop', fn, context); }
  onTouchstart(fn, context) { return this.on('touchstart', fn, context); }
  onTouchend(fn, context) { return this.on('touchend', fn, context); }
  onTouchmove(fn, context) { return this.on('touchmove', fn, context); }

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
    if (props && typeof props === 'object') {
      const { property = 'all', duration = '0.3s', timing = 'ease', delay = '0s' } = props;
      return this.style('transition', `${property} ${duration} ${timing} ${delay}`);
    }
    return this;
  }

  /** CSS transform shorthand */
  transform(value) { return this.style('transform', value); }

  /** Link to a keyframe animation */
  animate(keyframeName, options = {}) {
    if (!options || typeof options !== 'object') options = {};
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

  /* ==== SPA COMPILATION ==== */

  /**
   * Compile a reactive list as a child of this element.
   * itemFn(item, index) must return a NodeDef plain object.
   */
  liveList(stateKey, itemFn, options = {}) {
    if (!this._document) throw new Error('[Element] liveList requires a document');
    const { compileLiveList } = require('./live');
    return compileLiveList(this._document, this, stateKey, itemFn, options);
  }

  /* ==== COMPONENT SYSTEM ==== */

  component(name, props = {}, overrides = {}) {
    const { components, applyComponent } = require('./components');
    const { fn, options } = components.get(name);
    const tag = overrides.tag || options.tag || 'div';
    const el = this.child(tag);
    applyComponent(el, fn, props);
    return el;
  }

  use(componentFn, props = {}, tag = 'div') {
    const { applyComponent } = require('./components');
    const el = this.child(tag);
    applyComponent(el, componentFn, props);
    return el;
  }

  /**
   * Render this element (and its children) to a static HTML+CSS fragment.
   * Use this to pre-build reusable chunks (navbars, footers, etc.) once at
   * server startup, then inject them into every request with doc.stamp().
   *
   * @returns {{ html: string, css: string }}
   */
  renderFragment() {
    const { renderNode } = require('./renderer');
    const ctx = {
      events: [], states: [], styles: [], seenCss: new Set(),
      computed: [], stateBindings: [], lifecycles: [], oncreates: [], globalState: {}
    };
    const html = renderNode(this, ctx);
    // A fragment carries only markup and CSS, so anything that needs hydration is
    // dropped here. Warn instead of silently emitting elements whose handlers were
    // collected into ctx and then discarded.
    if (CONFIG.mode === 'dev' &&
      (ctx.events.length > 0 || ctx.stateBindings.length > 0 || ctx.states.length > 0 ||
       ctx.lifecycles.length > 0 || ctx.computed.length > 0)) {
      console.warn('[Element] renderFragment() returns static HTML and CSS only; events, state, bindings, and lifecycle hooks on this subtree are not included in the fragment. Build interactive markup on the document instead.');
    }
    return { html, css: ctx.styles.join('') };
  }
}

// Apply shared shortcuts (tag helpers, form helpers, layout helpers, data helpers, each/when)
const { applyShortcuts } = require('./shortcuts');
applyShortcuts(Element.prototype, 'child');

module.exports = { Element };
