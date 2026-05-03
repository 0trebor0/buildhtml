'use strict';

const { Document } = require('../index');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

function test(name, fn) {
  console.log(`\n▸ ${name}`);
  try { fn(); } catch (e) { failed++; console.error(`  ✗ THREW: ${e.message}`); }
}

/* ---- bindShow ---- */
test('bindShow — default fn (truthy toggle)', () => {
  const doc = new Document();
  doc.states({ open: true });
  doc.div().bindShow('open');
  const html = doc.render();
  assert(html.includes("style.display="), 'compiled show toggle');
  assert(html.includes('"open"'), 'watchState for open');
});

test('bindShow — custom fn', () => {
  const doc = new Document();
  doc.states({ count: 0 });
  doc.div().bindShow('count', val => val > 0);
  const html = doc.render();
  assert(html.includes('style.display='), 'compiled display toggle');
  assert(html.includes('val > 0'), 'custom fn body in output');
});

/* ---- bindClass ---- */
test('bindClass — sets className from fn return value', () => {
  const doc = new Document();
  doc.states({ theme: 'dark' });
  doc.div().bindClass('theme', val => val + '-mode');
  const html = doc.render();
  assert(html.includes('el.className='), 'compiled className assignment');
  assert(html.includes('"theme"'), 'watchState for theme');
});

/* ---- bindAttr ---- */
test('bindAttr — sets/removes attribute', () => {
  const doc = new Document();
  doc.states({ disabled: false });
  doc.button('click').bindAttr('disabled', 'disabled', val => val ? 'disabled' : null);
  const html = doc.render();
  assert(html.includes('removeAttribute'), 'removeAttribute when null');
  assert(html.includes('setAttribute'), 'setAttribute when truthy');
  assert(html.includes('"disabled"'), 'watchState for disabled');
});

/* ---- bindStyle ---- */
test('bindStyle — applies style object', () => {
  const doc = new Document();
  doc.states({ progress: 50 });
  doc.div().bindStyle('progress', val => ({ width: val + '%' }));
  const html = doc.render();
  assert(html.includes('el.style['), 'compiled style loop');
  assert(html.includes('"progress"'), 'watchState for progress');
});

/* ---- bindProp ---- */
test('bindProp — sets element property', () => {
  const doc = new Document();
  doc.states({ val: 'hello' });
  doc.input('text').bindProp('val', 'value');
  const html = doc.render();
  assert(html.includes('el["value"]'), 'compiled prop assignment');
  assert(html.includes('"val"'), 'watchState for val');
});

test('bindProp — custom fn', () => {
  const doc = new Document();
  doc.states({ checked: false });
  doc.input('checkbox').bindProp('checked', 'checked', val => !!val);
  const html = doc.render();
  assert(html.includes('el["checked"]'), 'compiled prop assignment');
  assert(html.includes('!!val'), 'custom fn body in output');
});

/* ---- bindInput ---- */
test('bindInput — two-way binding (prop + event)', () => {
  const doc = new Document();
  doc.states({ name: '' });
  doc.input('text').bindInput('name');
  const html = doc.render();
  assert(html.includes('el["value"]'), 'state → input.value binding');
  assert(html.includes('State["name"]=this.value'), 'input → state event handler');
  assert(html.includes('"name"'), 'watchState for name');
});

/* ---- builder.js bind type dispatch ---- */
test('doc.build() bind type: show', () => {
  const doc = new Document();
  doc.states({ visible: true });
  doc.build({ tag: 'div', bind: { key: 'visible', type: 'show' } });
  const html = doc.render();
  assert(html.includes('style.display='), 'build() dispatched to bindShow');
});

test('doc.build() bind type: class', () => {
  const doc = new Document();
  doc.states({ theme: 'light' });
  doc.build({ tag: 'div', bind: { key: 'theme', type: 'class', fn: val => val + '-mode' } });
  const html = doc.render();
  assert(html.includes('el.className='), 'build() dispatched to bindClass');
});

test('doc.build() bind type: attr', () => {
  const doc = new Document();
  doc.states({ loading: false });
  doc.build({ tag: 'button', bind: { key: 'loading', type: 'attr', attr: 'disabled', fn: val => val ? 'disabled' : null } });
  const html = doc.render();
  assert(html.includes('removeAttribute') || html.includes('setAttribute'), 'build() dispatched to bindAttr');
});

test('doc.build() bind type: style', () => {
  const doc = new Document();
  doc.states({ width: 80 });
  doc.build({ tag: 'div', bind: { key: 'width', type: 'style', fn: val => ({ width: val + '%' }) } });
  const html = doc.render();
  assert(html.includes('el.style['), 'build() dispatched to bindStyle');
});

test('doc.build() bind type: prop', () => {
  const doc = new Document();
  doc.states({ inputVal: '' });
  doc.build({ tag: 'input', bind: { key: 'inputVal', type: 'prop', prop: 'value' } });
  const html = doc.render();
  assert(html.includes('el["value"]'), 'build() dispatched to bindProp');
});

test('doc.build() bind array — multiple bindings', () => {
  const doc = new Document();
  doc.states({ open: true, theme: 'dark' });
  doc.build({
    tag: 'div',
    bind: [
      { key: 'open', type: 'show' },
      { key: 'theme', type: 'class', fn: val => val + '-mode' }
    ]
  });
  const html = doc.render();
  assert(html.includes('style.display='), 'array bind: show');
  assert(html.includes('el.className='), 'array bind: class');
});

/* ---- initial state applied at page load ---- */
test('bindShow initial state false — hidden on load', () => {
  const doc = new Document();
  doc.states({ modal: false });
  doc.div().bindShow('modal');
  const html = doc.render();
  // The compiled script calls _render() immediately; initial state is applied
  assert(html.includes('var val='), 'initial val read from State');
});

/* ---- security: bindInput stateKey escaping ---- */
test('bindInput stateKey with special chars is JSON-escaped', () => {
  const doc = new Document();
  doc.states({ 'my"key': '' });
  doc.input('text').bindInput('my"key');
  const html = doc.render();
  assert(!html.includes('State[my"key]'), 'raw unescaped key not present');
  assert(html.includes('State["my\\"key"]'), 'key is JSON-escaped');
});

/* ---- liveList itemFn: if conditional in NodeDef children ---- */
test('liveList itemFn — if: false skips child in SSR output', () => {
  const { compileLiveList } = require('../lib/live');
  const doc = new Document();
  doc.states({ items: [{ title: 'A', done: true }, { title: 'B', done: false }] });
  compileLiveList(doc, doc, 'items', (item) => ({
    tag: 'li',
    children: [
      { tag: 'span', text: item.title },
      { tag: 'em', text: 'done', if: item.done },
    ]
  }));
  const html = doc.render();
  // item A has done:true — em should appear; item B has done:false — em should not
  const liMatches = html.match(/<li>/g) || [];
  assert(liMatches.length === 2, 'two li elements rendered');
  assert(html.includes('<em>done</em>'), 'done em present for item A');
  // Only one em should be in the HTML (item B skipped)
  const emMatches = html.match(/<em>/g) || [];
  assert(emMatches.length === 1, 'if:false skipped one em');
});

test('liveList itemFn — if: true includes child', () => {
  const { compileLiveList } = require('../lib/live');
  const doc = new Document();
  doc.states({ items: [{ label: 'X', show: true }] });
  compileLiveList(doc, doc, 'items', (item) => ({
    tag: 'div',
    children: [
      { tag: 'span', text: item.label, if: item.show },
    ]
  }));
  const html = doc.render();
  assert(html.includes('<span>X</span>'), 'if:true includes span');
});

test('_mkEl client runtime includes if:false null guard', () => {
  const { MK_EL_SRC } = require('../lib/live');
  assert(MK_EL_SRC.includes('"if" in d'), 'if key check in _mkEl source');
  assert(MK_EL_SRC.includes('return null'), 'returns null when if is falsy');
});

/* ---- _mkEl string children + html key (SSR/client parity) ---- */
test('_mkEl handles string children (no TypeError)', () => {
  const { MK_EL_SRC } = require('../lib/live');
  assert(MK_EL_SRC.includes('typeof d==="string"'), 'string child guard in _mkEl');
  assert(MK_EL_SRC.includes('createTextNode'), 'creates text node for string children');
});

test('liveList itemFn string child — SSR renders it', () => {
  const { compileLiveList } = require('../lib/live');
  const doc = new Document();
  doc.states({ items: [{ name: 'Alice' }] });
  compileLiveList(doc, doc, 'items', item => ({
    tag: 'div',
    children: ['Label: ', { tag: 'strong', text: item.name }]
  }));
  const html = doc.render();
  assert(html.includes('Label: '), 'string child rendered in SSR');
  assert(html.includes('<strong>Alice</strong>'), 'element child still rendered');
});

test('_mkEl handles html key', () => {
  const { MK_EL_SRC } = require('../lib/live');
  assert(MK_EL_SRC.includes('d.html!=null'), 'html key handled in _mkEl');
  assert(MK_EL_SRC.includes('innerHTML'), 'sets innerHTML for html key');
});

test('liveList itemFn html key — SSR and client parity', () => {
  const { compileLiveList } = require('../lib/live');
  const doc = new Document();
  doc.states({ items: [{ markup: '<em>hi</em>' }] });
  compileLiveList(doc, doc, 'items', item => ({
    tag: 'div',
    html: item.markup
  }));
  const html = doc.render();
  assert(html.includes('<em>hi</em>'), 'html key rendered in SSR output');
});

/* ---- clear() resets inline script state ---- */
test('clear() resets _inlineScripts, _mkElDefined, _oncreateCallbacks', () => {
  const { compileLiveList } = require('../lib/live');
  const doc = new Document();
  doc.states({ items: ['a'] });
  compileLiveList(doc, doc, 'items', i => ({ tag: 'li', text: i }));
  doc.oncreate(function() { console.log('ready'); });
  assert(doc._inlineScripts.length > 0, 'inlineScripts populated before clear');
  assert(doc._mkElDefined === true, '_mkElDefined true before clear');
  assert(doc._oncreateCallbacks.length > 0, 'oncreateCallbacks populated before clear');
  doc.clear();
  assert(doc._inlineScripts.length === 0, 'inlineScripts cleared');
  assert(doc._mkElDefined === false, '_mkElDefined reset to false');
  assert(doc._oncreateCallbacks.length === 0, 'oncreateCallbacks cleared');
});

test('document reuse: liveList emits _mkEl definition exactly once per render', () => {
  const { compileLiveList } = require('../lib/live');
  const doc = new Document();
  doc.states({ items: ['x'] });
  compileLiveList(doc, doc, 'items', i => ({ tag: 'li', text: i }));
  const html1 = doc.render();
  // render() calls clear() internally; explicit clear() is a no-op
  doc.clear();
  doc.states({ items: ['y'] });
  compileLiveList(doc, doc, 'items', i => ({ tag: 'li', text: i }));
  const html2 = doc.render();
  // Count the DEFINITION (window._mkEl=), not call sites (window._mkEl(...))
  const defCount1 = (html1.match(/window\._mkEl=\(function/g) || []).length;
  const defCount2 = (html2.match(/window\._mkEl=\(function/g) || []).length;
  assert(defCount1 === 1, 'first render defines _mkEl exactly once');
  assert(defCount2 === 1, 'second render defines _mkEl exactly once (not accumulated)');
});

/* ---- bindState() cross-element binding ---- */
test('bindState() compiles targetId into __STATE_ID__ placeholder', () => {
  const doc = new Document();
  const source = doc.input('text');
  const target = doc.div().id('my-target');
  source.bindState(target, 'input', function() {
    var el = document.getElementById('__STATE_ID__');
    if (el) el.textContent = this.value;
  });
  const html = doc.render();
  // __STATE_ID__ should be replaced with the target's actual id
  assert(!html.includes('__STATE_ID__'), '__STATE_ID__ placeholder replaced');
  assert(html.includes('my-target'), 'target id compiled into event handler');
});

test('bindState() gives source element an id', () => {
  const doc = new Document();
  const source = doc.input('text');
  const target = doc.div();
  source.bindState(target, 'change', function() { return this.value; });
  assert(!!source.attrs.id, 'source element has id after bindState()');
  assert(!!target.attrs.id, 'target element has id after bindState()');
});

test('bindState() compiles addEventListener for the right event', () => {
  const doc = new Document();
  const source = doc.input('text');
  const target = doc.div().id('display');
  source.bindState(target, 'keyup', function() {
    var el = document.getElementById('__STATE_ID__');
    if (el) el.textContent = this.value;
  });
  const html = doc.render();
  assert(html.includes('"keyup"'), 'keyup event compiled');
  assert(html.includes('display'), 'target id present in compiled output');
});

test('bindState() with auto-generated target id works', () => {
  const doc = new Document();
  const source = doc.span().text('trigger');
  const target = doc.div(); // no explicit id — auto-generated
  source.bindState(target, 'click', function() {
    var el = document.getElementById('__STATE_ID__');
    if (el) el.style.display = 'none';
  });
  // Capture id before render() recycles the elements
  const targetId = target.attrs.id;
  const html = doc.render();
  assert(typeof targetId === 'string' && targetId.length > 0, 'target has auto-generated id');
  assert(html.includes(targetId), 'auto-generated target id in compiled output');
  assert(!html.includes('__STATE_ID__'), '__STATE_ID__ replaced with auto id');
});

/* ---- summary ---- */
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
