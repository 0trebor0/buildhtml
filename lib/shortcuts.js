'use strict';

const { CONFIG } = require('./config');

// Lazy-loaded to avoid circular dependency (element.js requires shortcuts.js)
let _Element = null;
function getElement() {
  if (!_Element) _Element = require('./element').Element;
  return _Element;
}

const TEXT_TAGS = Object.freeze([
  'div','span','section','header','footer','main','nav',
  'article','aside','form','ul','ol','table','thead','tbody','tfoot','tr',
  'details','summary','dialog','pre','code','blockquote',
  'h1','h2','h3','h4','h5','h6',
  'li','th','td','p','strong','small','label','caption','legend','em','b','i'
]);

function warnExtraShortcutArguments(name, actual, maximum) {
  if (CONFIG.mode === 'dev' && actual > maximum) {
    console.warn(`[BuildHTML W_SHORTCUT_ARGUMENT] ${name}() received ${actual} arguments; expected at most ${maximum}. Extra arguments are ignored.`);
  }
}

/**
 * Adds HTML tag shortcuts, form helpers, layout helpers, and data helpers
 * to a prototype. Both Document and Element share these methods — the only
 * difference is how a child element is created:
 *   - Document: this.createElement(tag)
 *   - Element:  this.child(tag)
 *
 * The caller passes `createChildKey` — the method name to call.
 */
function applyShortcuts(proto, createChildKey) {

  /* ==== TAG SHORTCUTS ==== */

  for (const tag of TEXT_TAGS) {
    proto[tag] = function (textOrSetup) {
      warnExtraShortcutArguments(tag, arguments.length, 1);
      const el = this[createChildKey](tag);
      if (typeof textOrSetup === 'function') textOrSetup(el);
      else if (textOrSetup != null) el.text(textOrSetup);
      return el;
    };
  }

  proto.img = function (src, alt) {
    warnExtraShortcutArguments('img', arguments.length, 2);
    const el = this[createChildKey]('img').attr('src', src);
    if (alt !== undefined) el.attr('alt', alt);
    return el;
  };

  proto.a = function (href, text) {
    warnExtraShortcutArguments('a', arguments.length, 2);
    const el = this[createChildKey]('a').attr('href', href);
    if (text != null) el.text(text);
    return el;
  };

  proto.button = function (text) {
    warnExtraShortcutArguments('button', arguments.length, 1);
    const el = this[createChildKey]('button');
    if (text != null) el.text(text);
    return el;
  };

  proto.input = function (type, attrs) {
    warnExtraShortcutArguments('input', arguments.length, 2);
    if (attrs === undefined) attrs = {};
    const el = this[createChildKey]('input');
    if (type !== undefined) el.attr('type', type);
    if (attrs) el.setAttrs(attrs);
    return el;
  };

  proto.textarea = function (attrs) {
    warnExtraShortcutArguments('textarea', arguments.length, 1);
    if (attrs === undefined) attrs = {};
    const el = this[createChildKey]('textarea');
    if (attrs) el.setAttrs(attrs);
    return el;
  };

  proto.select = function (optionsList, attrs) {
    warnExtraShortcutArguments('select', arguments.length, 2);
    if (!Array.isArray(optionsList)) optionsList = [];
    if (attrs === undefined) attrs = {};
    const el = this[createChildKey]('select');
    if (attrs) el.setAttrs(attrs);
    for (const opt of optionsList) {
      const optEl = el.child('option').attr('value', opt.value);
      if (opt.text) optEl.text(opt.text);
      if (opt.selected) optEl.attr('selected', 'selected');
      if (opt.disabled) optEl.attr('disabled', 'disabled');
    }
    return el;
  };

  proto.br = function () {
    warnExtraShortcutArguments('br', arguments.length, 0);
    if (this.body) this.body.push('<br>');
    else this.children.push('<br>');
    return this;
  };

  proto.hr = function () {
    warnExtraShortcutArguments('hr', arguments.length, 0);
    return this[createChildKey]('hr');
  };

  /* ==== FORM HELPERS ==== */

  // These helpers build structure only. They never add a class, style, or
  // attribute the caller did not pass: a rendering library that injects its own
  // selectors and design values collides with the caller's stylesheet and puts
  // markup in the output that was never asked for. The only attributes emitted
  // beyond the caller's are the generated ids that wire `label[for]` to its
  // input, which the structure cannot express without them.

  proto.formGroup = function (label, inputType, inputAttrs) {
    if (inputAttrs === undefined) inputAttrs = {};
    const group = this[createChildKey]('div');
    const inputId = inputAttrs.id || this._ridGen();
    group.child('label').attr('for', inputId).text(label);
    const inp = group.child('input').id(inputId);
    if (inputType !== undefined) inp.attr('type', inputType);
    if (inputAttrs) inp.setAttrs(inputAttrs);
    return group;
  };

  proto.field = function (label, options) {
    if (!options || typeof options !== 'object') options = {};
    const attrs = options.attrs && typeof options.attrs === 'object' ? { ...options.attrs } : {};
    const inputId = options.id || attrs.id || this._ridGen();
    delete attrs.id;

    const group = this[createChildKey]('div');
    if (options.groupClass) group.addClass(options.groupClass);
    const labelElement = group.child('label').attr('for', inputId).text(label);
    const input = group.child('input').id(inputId);
    if (options.type !== undefined) input.attr('type', options.type);
    input.setAttrs(attrs);
    if (options.name !== undefined) input.name(options.name);
    if (options.bind !== undefined) input.bindInput(options.bind);

    return { group, label: labelElement, input };
  };

  proto.checkbox = function (name, label, checked) {
    if (checked === undefined) checked = false;
    const group = this[createChildKey]('div');
    const id = this._ridGen();
    const inp = group.child('input').attr('type', 'checkbox').name(name).id(id);
    if (checked) inp.checked();
    group.child('label').attr('for', id).text(label);
    return group;
  };

  proto.radio = function (name, options) {
    if (!Array.isArray(options)) options = [];
    const group = this[createChildKey]('div');
    for (const opt of options) {
      const id = this._ridGen();
      const wrapper = group.child('div');
      const inp = wrapper.child('input').attr('type', 'radio').name(name).attr('value', opt.value).id(id);
      if (opt.checked) inp.checked();
      wrapper.child('label').attr('for', id).text(opt.label || opt.text || opt.value);
    }
    return group;
  };

  proto.fieldset = function (legend, setupFn) {
    const fs = this[createChildKey]('fieldset');
    if (legend) fs.child('legend').text(legend);
    if (typeof setupFn === 'function') setupFn(fs);
    return fs;
  };

  proto.hiddenInput = function (name, value) {
    return this[createChildKey]('input').attr('type', 'hidden').name(name).value(value);
  };

  /* ==== LAYOUT HELPERS ==== */

  // Layout helpers emit only the display mode the method names and the values
  // the caller passed. Spacing, sizing, and colour are the caller's to supply.

  proto.grid = function (columns, items, gap) {
    const g = this[createChildKey]('div').css({
      display: 'grid',
      ...(columns != null && {
        gridTemplateColumns: typeof columns === 'number' ? `repeat(${columns}, 1fr)` : columns
      }),
      ...(gap !== undefined && { gap })
    });
    if (Array.isArray(items)) {
      for (const item of items) {
        if (typeof item === 'function') item(g.child('div'));
        else if (item instanceof getElement()) g.append(item);
        else g.child('div').text(String(item));
      }
    }
    return g;
  };

  proto.flex = function (items, options) {
    if (!options || typeof options !== 'object') options = {};
    const { direction, gap, align, justify, wrap } = options;
    const f = this[createChildKey]('div').css({
      display: 'flex',
      ...(direction && { flexDirection: direction }),
      ...(gap !== undefined && { gap }),
      ...(align && { alignItems: align }),
      ...(justify && { justifyContent: justify }),
      ...(wrap && { flexWrap: wrap })
    });
    if (Array.isArray(items)) {
      for (const item of items) {
        if (typeof item === 'function') item(f.child('div'));
        else if (item instanceof getElement()) f.append(item);
        else f.child('div').text(String(item));
      }
    }
    return f;
  };

  proto.stack = function (items, gap) {
    return this.flex(items, { direction: 'column', gap });
  };

  proto.row = function (items, gap) {
    return this.flex(items, { direction: 'row', gap });
  };

  proto.center = function (childFn) {
    const c = this[createChildKey]('div').css({
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    });
    if (typeof childFn === 'function') childFn(c);
    return c;
  };

  proto.container = function (childFn, maxWidth) {
    const c = this[createChildKey]('div').css({
      margin: '0 auto',
      ...(maxWidth !== undefined && { maxWidth })
    });
    if (typeof childFn === 'function') childFn(c);
    return c;
  };

  proto.spacer = function (height) {
    const s = this[createChildKey]('div');
    if (height !== undefined) s.css({ height });
    return s;
  };

  proto.divider = function (options) {
    if (!options || typeof options !== 'object') options = {};
    const { color, margin } = options;
    return this[createChildKey]('hr').css({
      ...(color && { border: 'none', borderTop: `1px solid ${color}` }),
      ...(margin !== undefined && { margin })
    });
  };

  proto.columns = function (count, columnFns, gap) {
    if (!Array.isArray(columnFns)) columnFns = [];
    const g = this.grid(count, null, gap);
    for (const fn of columnFns) {
      const col = g.child('div');
      if (typeof fn === 'function') fn(col);
    }
    return g;
  };

  /* ==== DATA HELPERS ==== */

  proto.list = function (items, renderer, tag) {
    if (!Array.isArray(items)) items = [];
    if (tag === undefined) tag = 'ul';
    const ul = this[createChildKey](tag);
    for (let i = 0; i < items.length; i++) {
      const li = ul.child('li');
      if (typeof renderer === 'function') renderer(li, items[i], i);
      else li.text(String(items[i]));
    }
    return ul;
  };

  proto.dataTable = function (headers, rows, options) {
    if (!Array.isArray(rows)) rows = [];
    if (!options || typeof options !== 'object') options = {};
    const tbl = this[createChildKey]('table');
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
  };

  /* ==== UTILITY ==== */

  proto.each = function (items, fn) {
    if (!Array.isArray(items) || typeof fn !== 'function') return this;
    for (let i = 0; i < items.length; i++) fn(this, items[i], i);
    return this;
  };

  proto.when = function (condition, fn) {
    if (condition && typeof fn === 'function') fn(this);
    return this;
  };
}

module.exports = { applyShortcuts, TEXT_TAGS };
