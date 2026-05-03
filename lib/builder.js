'use strict';

const { Element } = require('./element');
const { components, applyComponent } = require('./components');
const { compileLiveList } = require('./live');

/**
 * Declarative tree builder.
 * Build element trees from plain objects instead of chaining.
 *
 * USAGE:
 *
 *   doc.build({
 *     tag: 'div', class: 'container', children: [
 *       { tag: 'h1', text: 'Hello World', class: 'title' },
 *       { tag: 'p', text: 'This is a paragraph', css: { color: 'red' } },
 *       { tag: 'ul', children: [
 *         { tag: 'li', text: 'Item 1' },
 *         { tag: 'li', text: 'Item 2' },
 *         { tag: 'li', text: 'Item 3' },
 *       ]},
 *       { component: 'Card', props: { title: 'My Card', body: 'Content' } },
 *     ]
 *   })
 *
 * EACH NODE SUPPORTS:
 *   tag         - HTML tag (default: 'div')
 *   text        - Text content
 *   html        - Raw HTML (unsafe)
 *   class       - Space-separated class names or array
 *   id          - Element id
 *   css         - Inline scoped CSS object { color: 'red', fontSize: '14px' }
 *   attrs       - Attribute map { role: 'button', tabindex: 0 }
 *   data        - data-* attributes { userId: 42 }
 *   aria        - aria-* attributes { label: 'Close' }
 *   on          - Event map { click: fn, input: fn }
 *   children    - Array of child node definitions
 *   component   - Registered component name (instead of tag)
 *   use         - Component function reference (instead of tag)
 *   props       - Props passed to component
 *   if          - Conditional rendering (falsy = skip node)
 *   each        - Array to iterate (children become template for each item)
 *   bind        - State binding { key: 'counter', fn: (val) => `Count: ${val}` }
 *   state       - Element state value
 *   setup       - Custom setup function (el) => { ... } for anything not covered above
 */

function buildNode(parentEl, def) {
  if (def == null) return null;

  // String shortcut
  if (typeof def === 'string') {
    parentEl.text(def);
    return null;
  }

  // toJSON() text node format — { type: 'text', content: '...' }
  if (def.type === 'text' && 'content' in def) {
    parentEl.text(def.content);
    return null;
  }

  // Conditional rendering
  if ('if' in def && !def.if) return null;

  // Reactive list — { liveList: { stateKey, itemFn, filter?, filterKeys? } }
  if (def.liveList) {
    const { stateKey, itemFn, filter, filterKeys } = def.liveList;
    const doc = parentEl._document || parentEl;
    const container = compileLiveList(doc, parentEl, stateKey, itemFn, { filter, filterKeys });
    if (def.css) container.css(def.css);
    if (def.class) container.addClass(...(Array.isArray(def.class) ? def.class : def.class.split(' ')));
    if (def.id) container.id(def.id);
    return container;
  }

  // Iteration
  if (def.each && Array.isArray(def.each)) {
    const template = { ...def };
    delete template.each;
    for (let i = 0; i < def.each.length; i++) {
      const item = def.each[i];
      const itemDef = typeof template.itemTemplate === 'function'
        ? template.itemTemplate(item, i)
        : { ...template, text: String(item) };
      buildNode(parentEl, itemDef);
    }
    return null;
  }

  let el;

  // Component by name
  if (def.component) {
    const { fn, options } = components.get(def.component);
    const tag = options.tag || def.tag || 'div';
    el = parentEl.child(tag);
    applyComponent(el, fn, def.props || {}, options);
  }
  // Component by function reference
  else if (def.use && typeof def.use === 'function') {
    const tag = def.tag || 'div';
    el = parentEl.child(tag);
    applyComponent(el, def.use, def.props || {});
  }
  // Regular element
  else {
    el = parentEl.child(def.tag || 'div');
  }

  // ID
  if (def.id) el.id(def.id);

  // Classes — user-facing `class` field (string or array)
  if (def.class) {
    const classes = Array.isArray(def.class) ? def.class : def.class.split(' ');
    el.addClass(...classes);
  }
  // toJSON serialized `classes` array
  if (def.classes && Array.isArray(def.classes)) el.addClass(...def.classes);

  // Attributes
  if (def.attrs) el.setAttrs(def.attrs);

  // Data attributes
  if (def.data) el.data(def.data);

  // Aria attributes
  if (def.aria) el.aria(def.aria);

  // CSS — user-facing rules object
  if (def.css) el.css(def.css);
  if (def.style) el.style(def.style);
  // toJSON serialized cssText (compiled rule string) — inject directly
  if (def.cssText && typeof def.cssText === 'string') el.cssText = def.cssText;

  // Text
  if (def.text != null) el.text(def.text);

  // Raw HTML
  if (def.html != null) el.appendUnsafe(def.html);

  // State
  if (def.state != null) el.state(def.state);

  // State binding — single object or array of binding descriptors
  // { bind: { key, fn } }                           → el.bind()
  // { bind: { key, type: 'show', fn? } }            → el.bindShow()
  // { bind: { key, type: 'class', fn } }            → el.bindClass()
  // { bind: { key, type: 'attr', attr, fn? } }      → el.bindAttr()
  // { bind: { key, type: 'style', fn } }            → el.bindStyle()
  // { bind: { key, type: 'prop', prop, fn? } }      → el.bindProp()
  // { bind: [ ...descriptors ] }                    → multiple bindings
  if (def.bind) {
    const bindings = Array.isArray(def.bind) ? def.bind : [def.bind];
    for (const b of bindings) {
      if (!b || !b.key) continue;
      switch (b.type) {
        case 'show':  el.bindShow(b.key, b.fn); break;
        case 'class': el.bindClass(b.key, b.fn); break;
        case 'attr':  el.bindAttr(b.key, b.attr || b.attrName, b.fn); break;
        case 'style': el.bindStyle(b.key, b.fn); break;
        case 'prop':  el.bindProp(b.key, b.prop, b.fn); break;
        default:      el.bind(b.key, b.fn); break;
      }
    }
  }

  // Events — user-facing `on` object (event name → function)
  if (def.on && typeof def.on === 'object') {
    for (const ev in def.on) el.on(ev, def.on[ev]);
  }
  // toJSON serialized events array (pre-sanitized source strings)
  if (def.events && Array.isArray(def.events)) {
    for (const e of def.events) {
      if (e && e.event && e.fn) {
        el.events.push({ event: e.event, id: e.id || el.attrs.id, targetId: e.targetId, fn: e.fn });
        el.hydrate = true;
      }
    }
  }
  // toJSON serialized stateBindings
  if (def.stateBindings && Array.isArray(def.stateBindings)) {
    for (const b of def.stateBindings) {
      if (b) el._stateBindings.push({ ...b });
    }
    if (def.stateBindings.length > 0) el.hydrate = true;
  }
  // toJSON serialized computed source string
  if (def.computed && typeof def.computed === 'string') el._computed = def.computed;

  // Children
  if (def.children && Array.isArray(def.children)) {
    for (const childDef of def.children) {
      buildNode(el, childDef);
    }
  }

  // Custom setup
  if (typeof def.setup === 'function') {
    def.setup(el);
  }

  return el;
}

/**
 * Build multiple root nodes from an array of definitions.
 */
function buildNodes(parentEl, defs) {
  if (!Array.isArray(defs)) defs = [defs];
  const results = [];
  for (const def of defs) {
    const el = buildNode(parentEl, def);
    if (el) results.push(el);
  }
  return results;
}

module.exports = { buildNode, buildNodes };
