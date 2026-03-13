'use strict';

const { Element } = require('./element');
const { components, applyComponent } = require('./components');

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

  // Conditional rendering
  if ('if' in def && !def.if) return null;

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

  // Classes
  if (def.class) {
    const classes = Array.isArray(def.class) ? def.class : def.class.split(' ');
    el.addClass(...classes);
  }

  // Attributes
  if (def.attrs) el.setAttrs(def.attrs);

  // Data attributes
  if (def.data) el.data(def.data);

  // Aria attributes
  if (def.aria) el.aria(def.aria);

  // CSS
  if (def.css) el.css(def.css);
  if (def.style) el.style(def.style);

  // Text
  if (def.text != null) el.text(def.text);

  // Raw HTML
  if (def.html != null) el.appendUnsafe(def.html);

  // State
  if (def.state != null) el.state(def.state);

  // State binding
  if (def.bind) el.bind(def.bind.key, def.bind.fn);

  // Events
  if (def.on && typeof def.on === 'object') {
    for (const ev in def.on) el.on(ev, def.on[ev]);
  }

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
