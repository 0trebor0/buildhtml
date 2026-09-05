'use strict';

const { Element } = require('./element');
const { components, applyComponent } = require('./components');
const { compileLiveList } = require('./live');
const { sanitizeFunctionSourceString, safeJsonStringify, normalizeEventOptions } = require('./utils');
const { isSafeRawCss } = require('./css');
const { CONFIG } = require('./config');

/* ==== RESTORED-CALLBACK VALIDATION ====
 *
 * `on`, `onMount` and friends take real functions, which Element.on() runs
 * through sanitizeFunctionSourceString() before storing. The toJSON() shapes
 * below (`events`, `stateBindings`, `computed`, `lifecycle`, `cssText`) instead
 * carry pre-compiled SOURCE STRINGS, and those went straight into the generated
 * <script>. Anything reaching compileClient() has to clear the same bar as a
 * live function, whether it came from a builder call or from parsed JSON —
 * otherwise `fromJSON()` on untrusted input is remote script injection.
 *
 * A rejected callback is dropped whole: every check runs before anything is
 * pushed, so an element never ends up half-registered and marked for hydration.
 */

// Ids and event names are interpolated into the client script inside string
// literals, which escapeJsString() already makes escape-proof. These checks stop
// malformed values earlier, so a typo surfaces as a recorded failure instead of
// a getById() that silently matches nothing.
const SAFE_ID_RE = /^[A-Za-z_][\w:.-]*$/;
const SAFE_EVENT_RE = /^[A-Za-z][A-Za-z0-9:_-]*$/;

function recordFailure(el, type, err) {
  const doc = el && el._document;
  if (doc && typeof doc._recordCallbackFailure === 'function') doc._recordCallbackFailure(type, err, el);
  if (CONFIG.mode === 'dev') console.error(`[build] Rejected ${type}: ${err.message}`);
}

function checkId(label, id) {
  if (id != null && !SAFE_ID_RE.test(String(id))) throw new Error(`Invalid ${label}: ${id}`);
  return id;
}

/**
 * A serialized `context` (and classToggle's `expectedValue`) is a JSON source
 * string that compileClient() interpolates as a bare argument expression — it is
 * never wrapped in quotes, so a crafted one is executable code, not data.
 * Parsing and re-serializing is what proves it is still only data.
 */
function revalidateJsonSource(value, label) {
  if (value == null || value === 'undefined') return undefined;
  if (typeof value !== 'string') throw new Error(`${label} must be a serialized JSON string`);
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  return safeJsonStringify(parsed);
}

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
 *   onMount     - Client mount lifecycle hook
 *   onUpdate    - State update hook { key, fn } or array
 *   onDestroy   - Client destroy lifecycle hook
 *   setup       - Custom setup function (el) => { ... } for anything not covered above
 */

// A definition object that reaches back to an ancestor recursed until the stack
// ran out, surfacing as "RangeError: Maximum call stack size exceeded" from
// library internals. Only the CURRENT path is tracked, so the same object used
// twice as a sibling — a legal shape — still builds twice; a cycle is the only
// thing this refuses.
//
// Deliberately no depth cap alongside it. Any fixed limit would reject trees
// that render today, and the real ceiling is the JS stack, which varies with
// platform, Node version and --stack-size. Turning "works here" into "always
// refused" is the worse failure.
const buildPath = new Set();

function buildNode(parentEl, def) {
  if (def == null) return null;
  if (typeof def !== 'object') return buildNodeInner(parentEl, def);

  if (buildPath.has(def)) {
    recordFailure(parentEl, 'build', new Error('Circular node definition: a node lists an ancestor as its own child'));
    return null;
  }
  buildPath.add(def);
  try {
    return buildNodeInner(parentEl, def);
  } finally {
    buildPath.delete(def);
  }
}

function buildNodeInner(parentEl, def) {
  if (def == null) return null;

  // String shortcut
  if (typeof def === 'string') {
    parentEl.text(def);
    return null;
  }

  // Other primitives render as text too; without this the `'if' in def` check
  // below throws "Cannot use 'in' operator" on a number or boolean.
  if (typeof def !== 'object') {
    parentEl.text(String(def));
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
    const { stateKey, itemFn, filter, filterKeys, sort, sortKeys, empty } = def.liveList;
    const doc = parentEl._document || parentEl;
    const container = compileLiveList(doc, parentEl, stateKey, itemFn, { filter, filterKeys, sort, sortKeys, empty });
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
    el = parentEl.create(tag);
    applyComponent(el, fn, def.props || {});
  }
  // Component by function reference
  else if (def.use && typeof def.use === 'function') {
    const tag = def.tag || 'div';
    el = parentEl.create(tag);
    applyComponent(el, def.use, def.props || {});
  }
  // Regular element
  else {
    // create() rather than child(): buildNode() is called with a Document as the
    // parent for a top-level build(), and `create` is the name both types share.
    el = parentEl.create(def.tag || 'div');
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
  // toJSON serialized cssText — an already-compiled rule string, emitted into the
  // page's <style> block verbatim. Everything css() compiles is free of "<", so
  // rejecting it here costs no legitimate round trip and blocks a tampered one.
  if (def.cssText && typeof def.cssText === 'string') {
    const trusted = !!(el._document && el._document._trustedCss);
    if (trusted || isSafeRawCss(def.cssText)) el.cssText = def.cssText;
    else recordFailure(el, 'cssText', new Error('Compiled cssText contains markup'));
  }

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
  // toJSON serialized events array — source strings, revalidated before use
  if (def.events && Array.isArray(def.events)) {
    for (const e of def.events) {
      if (!e || !e.event || !e.fn) continue;
      try {
        if (!SAFE_EVENT_RE.test(String(e.event))) throw new Error(`Invalid event name: ${e.event}`);
        const fn = sanitizeFunctionSourceString(
          typeof e.fn === 'string' ? e.fn : String(e.fn),
          CONFIG.maxEventFnSize
        );
        const id = checkId('element id', e.id || el.attrs.id);
        const targetId = checkId('target id', e.targetId);
        const context = revalidateJsonSource(e.context, 'Event context');
        // Re-normalised rather than trusted: a serialized `options` may carry
        // anything, and the renderer interpolates the result into the emitted
        // addEventListener call. Passing it back through the same function on()
        // uses reduces it to known boolean flags.
        const options = normalizeEventOptions(e.options);
        el.events.push({ event: e.event, id, targetId, fn, context, options });
        el.hydrate = true;
      } catch (err) {
        recordFailure(el, `event:${e.event}`, err);
      }
    }
  }
  // toJSON serialized stateBindings — every callback-bearing field revalidated
  if (def.stateBindings && Array.isArray(def.stateBindings)) {
    for (const b of def.stateBindings) {
      if (!b) continue;
      const bindType = b.bindType || 'text';
      try {
        const binding = { ...b, bindType };
        binding.id = checkId('element id', b.id || el.attrs.id);
        if (b.templateFn != null) {
          binding.templateFn = sanitizeFunctionSourceString(String(b.templateFn), CONFIG.maxComputedFnSize);
        }
        binding.context = revalidateJsonSource(b.context, 'Binding context');
        if (bindType === 'classToggle') {
          binding.expectedValue = revalidateJsonSource(b.expectedValue, 'Binding expectedValue');
        }
        el._stateBindings.push(binding);
        el.hydrate = true;
      } catch (err) {
        recordFailure(el, `binding:${bindType}`, err);
      }
    }
  }
  if (typeof def.onMount === 'function') el.onMount(def.onMount);
  if (def.onUpdate) {
    const updates = Array.isArray(def.onUpdate) ? def.onUpdate : [def.onUpdate];
    for (const update of updates) {
      if (update && update.key && typeof update.fn === 'function') el.onUpdate(update.key, update.fn);
    }
  }
  if (typeof def.onDestroy === 'function') el.onDestroy(def.onDestroy);
  if (def.lifecycle && Array.isArray(def.lifecycle)) {
    for (const hook of def.lifecycle) {
      if (!hook || !['mount', 'update', 'destroy'].includes(hook.type)) continue;
      try {
        const fn = sanitizeFunctionSourceString(hook.fn, CONFIG.maxEventFnSize);
        if (!el.attrs.id) el.id();
        el._lifecycle.push({ type: hook.type, stateKey: hook.stateKey, fn, id: el.attrs.id });
      } catch (err) {
        // `doc` was only ever bound inside the liveList branch above, so this
        // handler threw a ReferenceError instead of recording the rejection —
        // turning an invalid lifecycle hook into a crashed build.
        recordFailure(el, `lifecycle:${hook.type}`, err);
      }
    }
    if (el._lifecycle.length > 0) el.hydrate = true;
  }
  // toJSON serialized computed source string
  if (def.computed && typeof def.computed === 'string') {
    try {
      el._computed = sanitizeFunctionSourceString(def.computed, CONFIG.maxComputedFnSize);
    } catch (err) {
      recordFailure(el, 'computed', err);
    }
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
