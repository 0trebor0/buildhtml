'use strict';

/*
 * The 26 on<Event>() shorthands and the h4/h5/h6 heading shortcuts were the only
 * public methods no suite referenced. Each shorthand is a one-line delegation to
 * on(), so the risk is not the body but the DOM event name it hard-codes: a typo
 * there compiles a listener for an event that never fires, and nothing else in
 * the corpus would notice.
 */

const { Document, configure, CONFIG } = require('../index');
const { listenerOptionsSource } = require('../lib/utils');

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

/* ==== EVENT OPTIONS ==== */

const vm = require('vm');

/** The compiled script must stay valid JS whatever options are passed. */
function assertParses(js, msg) {
  try { new vm.Script(js); assert(true, msg); }
  catch (e) { assert(false, `${msg} (${e.message})`); }
}

test('a handler with no options compiles exactly as before', () => {
  const js = clientScript(doc => doc.button('go').onClick(function () { State.n = 1; }));
  assert(/addEventListener\("click",function\(event\)\{try\{/.test(js),
    'the two-argument addEventListener call is unchanged');
  assert(!js.includes('},{'), 'no empty options object is emitted');
});

test('listener options reach addEventListener', () => {
  const cases = [
    [{ passive: true }, '},{passive:true})'],
    [{ once: true }, '},{once:true})'],
    [{ capture: true }, '},{capture:true})'],
    [{ once: true, passive: true, capture: true }, '},{once:true,passive:true,capture:true})'],
  ];
  for (const [options, expected] of cases) {
    const js = clientScript(doc => doc.div().onScroll(function () { State.n = 1; }, undefined, options));
    assert(js.includes(expected), `${JSON.stringify(options)} -> ${expected}`);
    assertParses(js, `${JSON.stringify(options)} compiles to valid JavaScript`);
  }
});

test('modifiers run before the handler and are not listener options', () => {
  const js = clientScript(doc => doc.form().onSubmit(function () { State.n = 1; },
    undefined, { preventDefault: true, stopPropagation: true }));
  assert(/function\(event\)\{event\.preventDefault\(\);event\.stopPropagation\(\);try\{/.test(js),
    'both modifiers run ahead of the user callback');
  assert(!/\}\,\{/.test(js), 'modifiers do not leak into the addEventListener options argument');
  assertParses(js, 'modifier output compiles to valid JavaScript');
});

test('listener options and modifiers combine without disturbing context', () => {
  const js = clientScript(doc => doc.a('/x', 'go').onClick(function () { State.n = 1; },
    { k: 1 }, { once: true, preventDefault: true }));
  assert(js.includes('event.preventDefault();'), 'modifier emitted');
  assert(js.includes('},{once:true})'), 'listener option emitted');
  assert(js.includes('{"k":1}'), 'the context argument still reaches the handler');
  assertParses(js, 'combined output compiles to valid JavaScript');
});

test('every shorthand accepts options', () => {
  for (const [method, event] of Object.entries(SHORTHANDS)) {
    const js = clientScript(doc => doc.button('go')[method](function () { State.n = 1; },
      undefined, { once: true }));
    assert(js.includes(`addEventListener("${event}",function(event){`) && js.includes('},{once:true})'),
      `${method}() forwards its options argument`);
  }
});

test('unknown and non-boolean option values cannot reach the script', () => {
  const js = clientScript(doc => doc.button('go').onClick(function () { State.n = 1; },
    undefined, { once: 'true);alert(1);({', evil: 'alert(1)', capture: 1 }));
  assert(!js.includes('alert(1)'), 'a crafted option value is not emitted');
  assert(js.includes('},{once:true,capture:true})'), 'known keys are coerced to boolean true');
  assert(!js.includes('evil'), 'an unknown key is dropped');
  assertParses(js, 'hostile options still compile to valid JavaScript');
});

test('options are read as own properties only', () => {
  const inherited = Object.create({ capture: true });
  inherited.passive = true;
  const js = clientScript(doc => doc.div().onScroll(function () { State.n = 1; }, undefined, inherited));
  assert(js.includes('},{passive:true})'), 'the own property is applied');
  assert(!js.includes('capture'), 'an inherited flag is ignored');
});

test('options survive a toJSON/fromJSON round trip', () => {
  const build = (d) => d.div().onScroll(function () { State.n = 1; },
    undefined, { passive: true, preventDefault: true });
  const source = new Document();
  build(source);
  const restored = new Document();
  restored.fromJSON(source.toJSON());

  const norm = (d) => {
    const m = d.render().match(/<script>([^]*?)<\/script>/);
    return (m ? m[1] : '').replace(/id-[a-z0-9]+/g, 'ID').replace(/_ssr[a-z0-9]+/g, 'SSR');
  };
  const a = norm(source);
  const b = norm(restored);
  assert(a === b, 'the restored document compiles the same script');
  assert(b.includes('},{passive:true})'), 'the listener option survived');
  assert(b.includes('event.preventDefault();'), 'the modifier survived');
});

// Two independent layers reduce options to safe values: normalizeEventOptions()
// at the point of storage, and listenerOptionsSource() which emits the literal
// `true` whatever it is handed. Each alone is sufficient, so asserting only on
// the rendered script cannot tell them apart — remove either and the output is
// unchanged. These two tests pin the layers separately.
test('fromJSON stores normalised options, not what the payload supplied', () => {
  const doc = new Document();
  doc.fromJSON({
    body: [{
      tag: 'button', text: 'x',
      events: [{
        event: 'click', id: 'b1', fn: 'function(){State.n=1;}',
        options: { once: 'evil', capture: 0, nope: true }
      }]
    }]
  });
  const stored = doc.toJSON().body[0].events[0].options;
  assert(JSON.stringify(stored) === '{"once":true}',
    `stored options are reduced to {"once":true} (got ${JSON.stringify(stored)})`);
});

test('the emitted options argument is literal true whatever it is handed', () => {
  assert(listenerOptionsSource({ once: 'evil', passive: 1 }) === ',{once:true,passive:true}',
    'un-normalised truthy values still emit boolean true');
  assert(listenerOptionsSource({ preventDefault: true }) === '',
    'a modifier never becomes a listener option');
  assert(listenerOptionsSource(null) === '', 'no options emits no argument');
});

// normalizeEventOptions() reads properties off a caller-supplied object, so a
// throwing getter (or Proxy trap) is its identifiable failure mode. It has no
// catch of its own by design: both call sites already wrap the whole
// registration in try/catch and record the failure, which is the convention the
// rest of the callback path uses. These two tests exercise that caught path.
test('a throwing options getter is caught and drops only the handler', () => {
  const originalMode = CONFIG.mode;
  const originalError = console.error;
  configure({ mode: 'prod' });
  console.error = () => {};
  try {
    const doc = new Document();
    doc.button('go')
      .onClick(function () { State.n = 1; }, undefined, { get once() { throw new Error('getter exploded'); } })
      .addClass('survived');
    const html = doc.render();
    assert(html.includes('class="survived"'), 'the element still renders');
    assert(!html.includes('addEventListener'), 'the handler is dropped rather than half-registered');
  } catch (e) {
    assert(false, `the error escaped to the caller: ${e.message}`);
  } finally {
    console.error = originalError;
    configure({ mode: originalMode });
  }
});

test('a throwing options getter in restored JSON is caught the same way', () => {
  const originalMode = CONFIG.mode;
  const originalError = console.error;
  configure({ mode: 'prod' });
  console.error = () => {};
  try {
    const doc = new Document();
    doc.fromJSON({
      body: [{
        tag: 'button', text: 'x', class: 'survived',
        events: [{
          event: 'click', id: 'b1', fn: 'function(){State.n=1;}',
          options: { get capture() { throw new Error('json getter exploded'); } }
        }]
      }]
    });
    const html = doc.render();
    assert(html.includes('class="survived"'), 'the element still renders');
    assert(!html.includes('addEventListener'), 'the handler is dropped');
  } catch (e) {
    assert(false, `the error escaped to the caller: ${e.message}`);
  } finally {
    console.error = originalError;
    configure({ mode: originalMode });
  }
});

test('tampered options in restored JSON are re-normalised', () => {
  const originalMode = CONFIG.mode;
  const originalError = console.error;
  configure({ mode: 'prod' });
  console.error = () => {};
  try {
    const doc = new Document();
    doc.fromJSON({
      body: [{
        tag: 'button', text: 'x',
        events: [{
          event: 'click', id: 'b1', fn: 'function(){State.n=1;}',
          options: { once: 'x);alert(1);({', nope: true }
        }]
      }]
    });
    const m = doc.render().match(/<script>([^]*?)<\/script>/);
    const js = m ? m[1] : '';
    assert(!js.includes('alert(1)'), 'a crafted option in JSON is not emitted');
    assert(js.includes('},{once:true})'), 'the known key is reduced to boolean true');
    assertParses(js, 'restored hostile options still compile to valid JavaScript');
  } finally {
    console.error = originalError;
    configure({ mode: originalMode });
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
