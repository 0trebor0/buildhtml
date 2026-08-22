'use strict';

/*
 * The 26 on<Event>() shorthands and the h4/h5/h6 heading shortcuts were the only
 * public methods no suite referenced. Each shorthand is a one-line delegation to
 * on(), so the risk is not the body but the DOM event name it hard-codes: a typo
 * there compiles a listener for an event that never fires, and nothing else in
 * the corpus would notice.
 */

const { Document, configure, CONFIG } = require('../index');

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

/** The compiled client script for a document containing one wired element. */
function clientScript(build) {
  const doc = new Document();
  build(doc);
  const match = doc.render().match(/<script>([^]*?)<\/script>/);
  return match ? match[1] : '';
}

/* ==== EVENT SHORTHANDS ==== */

// method name -> the DOM event it must register.
const SHORTHANDS = {
  onClick: 'click',
  onChange: 'change',
  onInput: 'input',
  onSubmit: 'submit',
  onKeydown: 'keydown',
  onKeyup: 'keyup',
  onKeypress: 'keypress',
  onFocus: 'focus',
  onBlur: 'blur',
  onMouseenter: 'mouseenter',
  onMouseleave: 'mouseleave',
  onMousedown: 'mousedown',
  onMouseup: 'mouseup',
  onMousemove: 'mousemove',
  onDblclick: 'dblclick',
  onContextmenu: 'contextmenu',
  onScroll: 'scroll',
  onLoad: 'load',
  onError: 'error',
  onDragstart: 'dragstart',
  onDragend: 'dragend',
  onDragover: 'dragover',
  onDrop: 'drop',
  onTouchstart: 'touchstart',
  onTouchend: 'touchend',
  onTouchmove: 'touchmove',
};

test('every shorthand registers its own DOM event', () => {
  for (const [method, event] of Object.entries(SHORTHANDS)) {
    const js = clientScript(doc => doc.button('go')[method](function () { State.n = 1; }));
    assert(js.includes(`addEventListener("${event}"`), `${method}() -> addEventListener("${event}")`);
  }
});

test('no shorthand registers an event belonging to another shorthand', () => {
  for (const [method, event] of Object.entries(SHORTHANDS)) {
    const js = clientScript(doc => doc.button('go')[method](function () { State.n = 1; }));
    const registered = [...js.matchAll(/addEventListener\("([a-z]+)"/g)].map(m => m[1]);
    const unique = [...new Set(registered)];
    assert(unique.length === 1 && unique[0] === event,
      `${method}() registers only "${event}" (got ${JSON.stringify(unique)})`);
  }
});

test('every shorthand is chainable', () => {
  const doc = new Document();
  for (const method of Object.keys(SHORTHANDS)) {
    const el = doc.button('go');
    assert(el[method](function () { State.n = 1; }) === el, `${method}() returns the element`);
  }
});

test('every shorthand forwards its context argument', () => {
  for (const method of Object.keys(SHORTHANDS)) {
    const js = clientScript(doc => doc.button('go')[method](function () { State.n = 1; }, { tag: method }));
    assert(js.includes(`{"tag":"${method}"}`), `${method}() serializes the context object`);
  }
});

test('every shorthand applies the on() source sanitizer', () => {
  const original = CONFIG.mode;
  const originalError = console.error;
  configure({ mode: 'prod' });
  console.error = () => {};
  try {
    for (const [method, event] of Object.entries(SHORTHANDS)) {
      const js = clientScript(doc => doc.button('go')[method](function () { document.cookie = 'stolen'; }));
      assert(!js.includes(`addEventListener("${event}"`),
        `${method}() drops a handler reading document.cookie`);
    }
  } finally {
    console.error = originalError;
    configure({ mode: original });
  }
});

test('a rejected shorthand handler leaves the element renderable', () => {
  const original = CONFIG.mode;
  const originalError = console.error;
  configure({ mode: 'prod' });
  console.error = () => {};
  try {
    const doc = new Document();
    doc.button('go').onDblclick(function () { eval('1'); }).addClass('still-here');
    const html = doc.render();
    assert(html.includes('class="still-here"'), 'the element still renders after a rejected handler');
    assert(!html.includes('eval('), 'the rejected source is not emitted');
  } finally {
    console.error = originalError;
    configure({ mode: original });
  }
});

test('shorthands stack on one element', () => {
  const js = clientScript(doc => doc.input()
    .onFocus(function () { State.focused = true; })
    .onBlur(function () { State.focused = false; })
    .onInput(function () { State.typed = true; }));
  for (const event of ['focus', 'blur', 'input']) {
    assert(js.includes(`addEventListener("${event}"`), `stacked ${event} listener present`);
  }
});

/* ==== HEADING SHORTCUTS ==== */

test('h4, h5 and h6 render on the document', () => {
  for (const tag of ['h4', 'h5', 'h6']) {
    const doc = new Document();
    doc[tag]('Heading');
    assert(doc.render().includes(`<${tag}>Heading</${tag}>`), `doc.${tag}() renders <${tag}>`);
  }
});

test('h4, h5 and h6 render nested in an element', () => {
  for (const tag of ['h4', 'h5', 'h6']) {
    const doc = new Document();
    doc.section()[tag]('Nested');
    assert(doc.render().includes(`<section><${tag}>Nested</${tag}></section>`),
      `section > ${tag} nests correctly`);
  }
});

test('h4, h5 and h6 escape their text', () => {
  for (const tag of ['h4', 'h5', 'h6']) {
    const doc = new Document();
    doc[tag]('<script>alert(1)</script>');
    const html = doc.render();
    assert(!html.includes('<script>alert(1)'), `${tag}() escapes a script payload`);
    assert(html.includes('&lt;script&gt;'), `${tag}() emits the escaped text`);
  }
});

test('h4, h5 and h6 return the element for chaining', () => {
  for (const tag of ['h4', 'h5', 'h6']) {
    const doc = new Document();
    const el = doc[tag]('Heading').addClass('title');
    assert(el.tag === tag, `${tag}() returns an element with the right tag`);
    assert(doc.render().includes(`class="title"`), `${tag}() result accepts addClass()`);
  }
});

/* ---- Summary ---- */
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(40));
process.exit(failed > 0 ? 1 : 0);
