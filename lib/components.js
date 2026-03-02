'use strict';

const { Element } = require('./element');

/**
 * Component registry — define reusable components, use them declaratively.
 *
 * USAGE:
 *
 *   // 1. Define a component as a function that receives (el, props, children)
 *   //    el      = the root Element already created for you
 *   //    props   = any data passed in
 *   //    children = a helper to append child components
 *
 *   function Card(el, { title, body, footer }) {
 *     el.addClass('card').css({ border: '1px solid #ddd', borderRadius: '8px', padding: '16px' });
 *     el.child('h2').text(title).addClass('card-title');
 *     el.child('p').text(body);
 *     if (footer) el.child('footer').text(footer).addClass('card-footer');
 *   }
 *
 *   // 2. Register it globally (optional — you can also pass functions directly)
 *   const { components } = require('buildhtml');
 *   components.register('Card', Card);
 *
 *   // 3. Use it
 *   doc.component('Card', { title: 'Hello', body: 'World' });
 *   // or
 *   doc.use(Card, { title: 'Hello', body: 'World' });
 *
 *   // 4. Nest components
 *   function Page(el, { cards }) {
 *     el.addClass('page');
 *     for (const c of cards) {
 *       el.component('Card', c);           // if registered globally
 *       // or: el.use(Card, c);            // pass function directly
 *     }
 *   }
 */

class ComponentRegistry {
  constructor() {
    this._registry = new Map();
  }

  /**
   * Register a named component.
   *   components.register('Card', CardFn)
   *   components.register('Card', CardFn, { tag: 'article' })
   */
  register(name, fn, options = {}) {
    if (typeof fn !== 'function') throw new TypeError(`Component "${name}" must be a function`);
    this._registry.set(name, { fn, options });
    return this;
  }

  /**
   * Check if a component is registered.
   */
  has(name) {
    return this._registry.has(name);
  }

  /**
   * Get a registered component definition.
   */
  get(name) {
    const entry = this._registry.get(name);
    if (!entry) throw new Error(`[buildhtml] Component "${name}" is not registered. Register it with components.register('${name}', fn)`);
    return entry;
  }

  /**
   * Unregister a component.
   */
  unregister(name) {
    this._registry.delete(name);
    return this;
  }

  /**
   * List all registered component names.
   */
  list() {
    return Array.from(this._registry.keys());
  }

  clear() {
    this._registry.clear();
  }

  /**
   * Extend an existing component.
   *   components.extend('CardWithImage', 'Card', (el, props) => {
   *     if (props.image) el.child('img').src(props.image);
   *   })
   */
  extend(newName, baseName, extendFn, options = {}) {
    const base = this.get(baseName);
    const combinedFn = (el, props) => {
      base.fn(el, props);
      if (typeof extendFn === 'function') extendFn(el, props);
    };
    this._registry.set(newName, { fn: combinedFn, options: { ...base.options, ...options } });
    return this;
  }
}

const components = new ComponentRegistry();

/**
 * Execute a component function against an element.
 * Used internally by Element.use() and Element.component().
 */
function applyComponent(el, fn, props = {}, options = {}) {
  if (typeof fn !== 'function') throw new TypeError('Component must be a function');
  fn(el, props);
  return el;
}

module.exports = { ComponentRegistry, components, applyComponent };
