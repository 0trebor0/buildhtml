'use strict';

/**
 * Regression suite for the injection, resource and tree-ownership defects fixed
 * in 2.0.2. Every test here failed against 2.0.1.
 *
 * The payload used throughout is a breakout of whatever element the value is
 * being written into, followed by a <script> the browser would then execute. A
 * test asserts on the RENDERED PAGE rather than on an internal field, because
 * what matters is whether the byte sequence reaches the browser.
 */

const { Document, renderFromJSON, configure, CONFIG } = require('../index');
const { pools, resetPools } = require('../lib/pools');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

function test(name, fn) {
  console.log(`\n▸ ${name}`);
  try { fn(); } catch (e) { failed++; console.error(`  ✗ THREW: ${e.stack}`); }
}

// Stream cleanup can only be observed after the stream ends, so those tests are
// async. They are QUEUED rather than started here: an async body that awaits
// would otherwise yield to the synchronous tests declared below it, and those
// tests render documents — which moves the very pool counts being asserted.
// Running them after the synchronous ones, one at a time, keeps the measurement
// meaningful.
const pending = [];
function testAsync(name, fn) {
  pending.push(async () => {
    console.log(`\n▸ ${name}`);
    try { await fn(); } catch (e) { failed++; console.error(`  ✗ THREW: ${e.stack}`); }
  });
}

/** Run fn with console.warn/error muted — rejections are expected to be noisy. */
function quiet(fn) {
  const warn = console.warn, error = console.error;
  const notices = [];
  console.warn = (...a) => notices.push(a.join(' '));
  console.error = (...a) => notices.push(a.join(' '));
  try { return { result: fn(), notices }; }
  finally { console.warn = warn; console.error = error; }
}

/** No element beyond the ones the test itself created may appear. */
function hasInjectedScript(html) {
  return /<script(?![^>]*\bnonce=)[^>]*>[^<]*alert\(/.test(html) || html.includes('alert(1)');
}

const BREAK_STYLE = '</style><script>alert(1)</script>';
const BREAK_SCRIPT = '</script><script>alert(1)</script>';

/* ==================================================================== */
/* Phase 1 — callbacks restored from JSON                               */
/* ==================================================================== */

const jsonDoc = (node) => ({ title: 'T', body: [node] });

test('fromJSON rejects a </script> breakout in an event function', () => {
  const { result: html } = quiet(() => renderFromJSON(jsonDoc({
    tag: 'button', id: 'b1',
    events: [{ event: 'click', id: 'b1', fn: `() => {}; ${BREAK_SCRIPT}` }]
  })));
  assert(!hasInjectedScript(html), 'no injected script in the page');
  assert(!html.includes('addEventListener'), 'the rejected handler registers nothing');
});

test('fromJSON rejects a breakout in a computed source', () => {
  const { result: html } = quiet(() => renderFromJSON(jsonDoc({
    tag: 'div', id: 'c1', computed: BREAK_SCRIPT
  })));
  assert(!hasInjectedScript(html), 'no injected script in the page');
  assert(!html.includes('textContent=('), 'the rejected computed emits no client code');
});

test('fromJSON rejects a breakout in a state-binding callback', () => {
  const { result: html } = quiet(() => renderFromJSON(jsonDoc({
    tag: 'div', id: 's1',
    stateBindings: [{ stateKey: 'k', id: 's1', bindType: 'text', templateFn: `() => {}; ${BREAK_SCRIPT}` }]
  })));
  assert(!hasInjectedScript(html), 'no injected script in the page');
  assert(!html.includes('watchState('), 'the rejected binding emits no watcher');
});

test('fromJSON rejects a non-JSON event context', () => {
  // context is interpolated as a bare argument expression, never quoted, so a
  // crafted one is executable code rather than data.
  const { result: html } = quiet(() => renderFromJSON(jsonDoc({
    tag: 'button', id: 'b2',
    events: [{ event: 'click', id: 'b2', fn: '() => {}', context: `(function(){${BREAK_SCRIPT}})()` }]
  })));
  assert(!hasInjectedScript(html), 'no injected script in the page');
  assert(!html.includes('addEventListener'), 'the whole event is dropped, not just its context');
});

test('fromJSON rejects a crafted classToggle expectedValue', () => {
  const { result: html } = quiet(() => renderFromJSON(jsonDoc({
    tag: 'div', id: 'ct1',
    stateBindings: [{
      stateKey: 'k', id: 'ct1', bindType: 'classToggle', className: 'on',
      expectedValue: `1);alert(1);Object.is(1,1`
    }]
  })));
  assert(!hasInjectedScript(html), 'no injected script in the page');
});

test('fromJSON rejects a malformed event name and element id', () => {
  const { result: html } = quiet(() => renderFromJSON(jsonDoc({
    tag: 'button', id: 'b3',
    events: [{ event: 'click");alert(1);//', id: 'b3', fn: '() => {}' }]
  })));
  assert(!hasInjectedScript(html), 'malformed event name rejected');

  const { result: html2 } = quiet(() => renderFromJSON(jsonDoc({
    tag: 'button', id: 'b4',
    events: [{ event: 'click', id: 'b4");alert(1);//', fn: '() => {}' }]
  })));
  assert(!hasInjectedScript(html2), 'malformed element id rejected');
});

test('a rejected callback is never partially registered', () => {
  const doc = new Document();
  quiet(() => doc.fromJSON(jsonDoc({
    tag: 'button', id: 'b5',
    events: [{ event: 'click', id: 'b5', fn: `() => {}; ${BREAK_SCRIPT}` }]
  })));
  const el = doc.body[0];
  assert(el.events.length === 0, 'no event stored on the element');
  assert(el.hydrate === false, 'the element is not marked for hydration');
});

test('a rejected callback is recorded as a registration failure', () => {
  const doc = new Document();
  quiet(() => doc.fromJSON(jsonDoc({
    tag: 'button', id: 'b6',
    events: [{ event: 'click', id: 'b6', fn: `() => {}; ${BREAK_SCRIPT}` }]
  })));
  const errors = doc._registrationErrors || [];
  assert(errors.length > 0, 'the rejection is recorded');
  assert(errors.some(e => String(e.type || e.callbackType || '').includes('event')),
    'the record names the callback type');
});

test('a legitimate toJSON -> fromJSON round trip still hydrates', () => {
  const doc = new Document();
  doc.title('Round trip');
  const btn = doc.create('button').text('Click');
  btn.on('click', (event, State) => { State.clicks = (State.clicks || 0) + 1; });
  doc.create('span').bind('clicks', (val) => `Clicks: ${val}`);
  doc.state('clicks', 0);

  const restored = new Document().fromJSON(doc.toJSON());
  const html = restored.render();
  assert(html.includes('addEventListener("click"'), 'the round-tripped handler is registered');
  assert(html.includes('watchState("clicks"'), 'the round-tripped binding is registered');
  assert((restored._registrationErrors || []).length === 0, 'no legitimate callback was rejected');
});

test('callback validation holds in prod mode as well as dev', () => {
  const originalMode = CONFIG.mode;
  try {
    for (const mode of ['dev', 'prod']) {
      configure({ mode });
      const { result: html } = quiet(() => renderFromJSON(jsonDoc({
        tag: 'button', id: 'm1',
        events: [{ event: 'click', id: 'm1', fn: `() => {}; ${BREAK_SCRIPT}` }]
      })));
      assert(!hasInjectedScript(html), `breakout rejected in ${mode} mode`);
    }
  } finally {
    configure({ mode: originalMode });
  }
});

/* ==================================================================== */
/* Phase 2 — CSS injection                                              */
/* ==================================================================== */

test('css() rejects a property name that breaks out of <style>', () => {
  const doc = new Document();
  quiet(() => doc.create('div').css({ [`color:red}${BREAK_STYLE}<style>x`]: 'y' }));
  const html = doc.render();
  assert(!hasInjectedScript(html), 'no injected script in the page');
  assert(!html.includes('</style><script'), 'the style element is not closed early');
});

test('style() rejects a property name carrying a second declaration', () => {
  const doc = new Document();
  quiet(() => doc.create('div').style({ 'color:red;pointer-events': 'none' }));
  const html = doc.render();
  assert(!html.includes('pointer-events'), 'the smuggled declaration is dropped');
  assert(!/style="[^"]*color:red/.test(html), 'the invalid name contributes nothing');
});

test('globalCss() rejects an unsafe selector', () => {
  const doc = new Document();
  quiet(() => doc.head.globalCss(`body${BREAK_STYLE}`, { color: 'red' }));
  assert(!hasInjectedScript(doc.render()), 'no injected script in the page');
});

test('sharedClass() rejects an unsafe class name', () => {
  const doc = new Document();
  quiet(() => doc.sharedClass(`x${BREAK_STYLE}`, { color: 'red' }));
  assert(!hasInjectedScript(doc.render()), 'no injected script in the page');
});

test('defineClass() rejects unsafe names in both selector modes', () => {
  const doc = new Document();
  quiet(() => doc.defineClass(`x${BREAK_STYLE}`, { color: 'red' }));
  quiet(() => doc.defineClass(`body${BREAK_STYLE}`, { color: 'red' }, true));
  assert(!hasInjectedScript(doc.render()), 'no injected script in the page');
});

test('keyframes() and mediaQuery() reject unsafe names, stops and queries', () => {
  const doc = new Document();
  quiet(() => doc.keyframes(`spin${BREAK_STYLE}`, { from: { opacity: '0' } }));
  quiet(() => doc.keyframes('ok', { [`from}${BREAK_STYLE}`]: { opacity: '0' } }));
  quiet(() => doc.mediaQuery(`(max-width:600px)}${BREAK_STYLE}`, { body: { color: 'red' } }));
  quiet(() => doc.mediaQuery('(max-width:600px)', { [`body}${BREAK_STYLE}`]: { color: 'red' } }));
  assert(!hasInjectedScript(doc.render()), 'no injected script in the page');
});

test('bodyCss() rejects an unsafe property name', () => {
  const doc = new Document();
  quiet(() => doc.bodyCss({ [`color:red}${BREAK_STYLE}<style>x`]: 'y' }));
  assert(!hasInjectedScript(doc.render()), 'no injected script in the page');
});

test('pseudo, hover and media element helpers reject unsafe property names', () => {
  const doc = new Document();
  const el = doc.create('div');
  const bad = { [`color:red}${BREAK_STYLE}<style>x`]: 'y' };
  quiet(() => { el.pseudo('before', bad); el.hover(bad); el.media('(min-width:0px)', bad); });
  assert(!hasInjectedScript(doc.render()), 'no injected script in the page');
});

test('control characters and quotes in a property name are rejected', () => {
  const doc = new Document();
  for (const name of ['a b', 'a"b', "a'b", 'a<b', 'a>b', 'a{b', 'a}b', 'a;b', 'a\nb']) {
    quiet(() => doc.create('div').css({ [name]: 'red' }));
  }
  const html = doc.render();
  assert(!/<style[^>]*>[\s\S]*a["'<>{};]/.test(html), 'no invalid name reached the stylesheet');
  assert(!hasInjectedScript(html), 'no injected script in the page');
});

test('valid CSS output is unchanged', () => {
  const doc = new Document();
  doc.create('div').css({
    color: 'red', fontSize: '14px',
    '--brand-color': '#fff', WebkitFontSmoothing: 'antialiased'
  });
  doc.head.globalCss('.a > .b:hover, [data-x="y"]', { margin: '0' });
  doc.sharedClass('btn-primary', { padding: '4px' });
  doc.keyframes('spin', { from: { opacity: '0' }, '50%': { opacity: '1' } });
  doc.mediaQuery('(max-width: 600px)', { body: { fontSize: '12px' } });
  doc.cssVar('--gap', '8px');
  const html = doc.render();

  assert(html.includes('color:red'), 'standard property kept');
  assert(html.includes('font-size:14px'), 'camelCase property still kebab-cased');
  assert(html.includes('--brand-color:#fff'), 'custom property kept');
  assert(html.includes('-webkit-font-smoothing:antialiased'), 'vendor-prefixed property kept');
  assert(html.includes('.a > .b:hover, [data-x="y"]{margin:0;}'), 'combinator and attribute selector kept');
  assert(html.includes('.btn-primary{padding:4px;}'), 'shared class kept');
  assert(html.includes('@keyframes spin{from{opacity:0;}50%{opacity:1;}}'), 'keyframes kept');
  assert(html.includes('@media (max-width: 600px){body{font-size:12px;}}'), 'media query kept');
  assert(html.includes('--gap:8px'), 'css variable kept');
});

test('fromJSON rejects compiled CSS carrying markup', () => {
  const doc = new Document();
  quiet(() => doc.fromJSON({
    title: 'T',
    globalStyles: [`body{color:red}${BREAK_STYLE}`],
    classStyles: { evil: `color:red}${BREAK_STYLE}` },
    styles: [`.z{}${BREAK_STYLE}`],
    body: [{ tag: 'div', cssText: `.a{}${BREAK_STYLE}` }]
  }));
  const html = doc.render();
  assert(!hasInjectedScript(html), 'no injected script in the page');
  assert(!html.includes('</style><script'), 'the style element is not closed early');
});

test('fromJSON rejects an unsafe classStyles key', () => {
  const doc = new Document();
  quiet(() => doc.fromJSON({ title: 'T', classStyles: { [`x${BREAK_STYLE}`]: 'color:red;' } }));
  assert(!hasInjectedScript(doc.render()), 'no injected script in the page');
});

test('trustedCss opts a caller back into raw snapshot restoration', () => {
  const doc = new Document();
  doc.fromJSON({
    title: 'T', trustedCss: true,
    globalStyles: ['body{color:red}'],
    body: [{ tag: 'div', cssText: '.mine{color:blue}' }]
  });
  const html = doc.render();
  assert(html.includes('body{color:red}'), 'trusted global rule restored');
  assert(html.includes('.mine{color:blue}'), 'trusted element cssText restored');
});

test('a genuine CSS round trip survives the raw-CSS check', () => {
  const doc = new Document();
  doc.create('div').css({ color: 'red', '--brand': '#fff' });
  doc.head.globalCss('body', { margin: '0' });
  doc.sharedClass('card', { padding: '8px' });
  const original = doc.toJSON();

  const restored = new Document().fromJSON(original);
  const html = restored.render();
  assert(html.includes('color:red'), 'scoped element CSS restored untrusted');
  assert(html.includes('body{margin:0;}'), 'global rule restored untrusted');
  assert(html.includes('.card{padding:8px;}'), 'shared class restored untrusted');
});

/* ==================================================================== */
/* Phase 3 — render() cleanup                                           */
/* ==================================================================== */

/** An element whose tag getter throws when the renderer walks it. */
function poisonElement(doc, phase) {
  const el = doc.create('div');
  Object.defineProperty(el, 'tag', { configurable: true, get() { throw new Error(phase); } });
  return el;
}

test('a failed render recycles every pooled array exactly once', () => {
  resetPools();
  for (let i = 0; i < 5; i++) { const d = new Document(); d.create('div').text('x'); d.render(); }
  const baseline = pools.arrays.length;
  assert(baseline > 0, `the array pool is warm (${baseline} arrays)`);

  for (let i = 0; i < 20; i++) {
    const doc = new Document();
    poisonElement(doc, 'body node conversion');
    try { doc.render(); assert(false, 'render should have thrown'); } catch { /* expected */ }
  }
  assert(pools.arrays.length === baseline,
    `pool size stable across repeated failures (${baseline} -> ${pools.arrays.length})`);

  const unique = new Set(pools.arrays);
  assert(unique.size === pools.arrays.length, 'no array was recycled twice into the pool');
});

test('a throwing head render is cleaned up too', () => {
  resetPools();
  for (let i = 0; i < 5; i++) { const d = new Document(); d.create('div').text('x'); d.render(); }
  const baseline = pools.arrays.length;

  const doc = new Document();
  doc.create('div').text('ok');
  doc.head.render = () => { throw new Error('head boom'); };
  let threw = false;
  try { doc.render(); } catch (e) { threw = e.message === 'head boom'; }
  assert(threw, 'the head failure reaches the caller');
  assert(pools.arrays.length === baseline, 'pooled arrays released after a head failure');
});

test('a throwing client compilation is cleaned up too', () => {
  resetPools();
  for (let i = 0; i < 5; i++) { const d = new Document(); d.create('div').text('x'); d.render(); }
  const baseline = pools.arrays.length;

  const doc = new Document();
  const el = doc.create('button').text('go');
  el.on('click', () => {});
  // A binding whose stateKey getter throws once compileClient walks it.
  el._stateBindings.push(Object.defineProperty({ id: el.attrs.id, templateFn: '(v)=>v' }, 'stateKey', {
    enumerable: true, get() { throw new Error('compile boom'); }
  }));
  el.hydrate = true;

  let threw = false;
  try { doc.render(); } catch (e) { threw = e.message === 'compile boom'; }
  assert(threw, 'the compilation failure reaches the caller');
  assert(pools.arrays.length === baseline, 'pooled arrays released after a compilation failure');
});

test('a failed render caches nothing and leaves the document intact', () => {
  const doc = new Document({ cache: true, cacheKey: 'fail-key' });
  doc.create('div').text('kept');
  poisonElement(doc, 'body node conversion');

  try { doc.render(); } catch { /* expected */ }

  assert(doc.output() === '', '_lastRendered is unchanged after a failure');
  assert(doc.body.length === 2, 'the document is not consumed by a failed render');

  const { getResponseCache } = require('../lib/document');
  assert(!getResponseCache().get('fail-key'), 'no cache entry after a failure');
});

test('a successful render is unaffected', () => {
  const doc = new Document();
  doc.title('Fine');
  doc.create('p').text('body text');
  const html = doc.render();
  assert(html.includes('<p>body text</p>'), 'content rendered');
  assert(html.endsWith('</body></html>'), 'document complete');
  assert(doc.body.length === 0, 'a completed render consumes the document');
  assert(doc.output() === html, 'output() records the render');
});

testAsync('the stream path releases pooled arrays exactly once on every ending', async () => {
  const settle = () => new Promise((resolve) => setImmediate(resolve));

  // Completed, destroyed-early, and errored-mid-iteration all run finalize();
  // recycle() is not idempotent, so a double release would put one array into
  // the pool twice and hand two later renders the same buffer.
  resetPools();
  for (let i = 0; i < 5; i++) { const d = new Document(); d.create('div').text('x'); d.render(); }
  const baseline = pools.arrays.length;

  const collect = (stream) => new Promise((resolve, reject) => {
    let out = '';
    stream.on('data', (c) => { out += c; });
    stream.on('end', () => resolve(out));
    stream.on('error', reject);
  });

  const completed = new Document();
  completed.create('p').text('done');
  await collect(completed.renderStream());
  await settle();
  assert(pools.arrays.length === baseline, 'a completed stream releases its arrays');
  assert(new Set(pools.arrays).size === pools.arrays.length, 'no array entered the pool twice');

  const abandoned = new Document();
  for (let i = 0; i < 200; i++) abandoned.create('p').text('filler text ' + i);
  const stream = abandoned.renderStream();
  stream.read(0);
  await new Promise((resolve) => { stream.on('close', resolve); stream.destroy(); });
  await settle();
  assert(pools.arrays.length === baseline, 'an abandoned stream releases its arrays');
  assert(new Set(pools.arrays).size === pools.arrays.length, 'no array entered the pool twice');

  const failing = new Document();
  failing.create('p').text('ok');
  const bad = failing.create('div');
  Object.defineProperty(bad, 'tag', { configurable: true, get() { throw new Error('stream boom'); } });
  let caught = null;
  try { await collect(failing.renderStream()); } catch (e) { caught = e; }
  await settle();
  assert(caught && caught.message === 'stream boom', 'the original error reaches the consumer intact');
  assert(caught.stack && caught.stack.includes('stream boom'), 'the original stack is preserved');
  assert(pools.arrays.length === baseline, 'an errored stream releases its arrays');
  assert(new Set(pools.arrays).size === pools.arrays.length, 'no array entered the pool twice');
});

test('the release helper is idempotent', () => {
  resetPools();
  const doc = new Document();
  const ctx = doc._createRenderContext();
  doc._releaseRenderContext(ctx);
  const afterFirst = pools.arrays.length;
  doc._releaseRenderContext(ctx);
  doc._releaseRenderContext(ctx);
  assert(pools.arrays.length === afterFirst, 'extra releases add nothing to the pool');
  assert(new Set(pools.arrays).size === pools.arrays.length, 'no duplicate array in the pool');
});

/* ==================================================================== */
/* Phase 4 — tree ownership                                             */
/* ==================================================================== */

const bodyOf = (html) => html.slice(html.indexOf('<body'), html.indexOf('</body>'));
const count = (html, needle) => html.split(needle).length - 1;

test('append() moves an element between sibling containers', () => {
  const doc = new Document();
  const a = doc.create('div').addClass('a');
  const b = doc.create('div').addClass('b');
  const item = a.child('span').text('X');
  b.append(item);

  const body = bodyOf(doc.render());
  assert(count(body, '<span>X</span>') === 1, 'the element renders exactly once');
  assert(body.includes('<div class="b"><span>X</span></div>'), 'it renders under its new parent');
  assert(body.includes('<div class="a"></div>'), 'the old parent no longer holds it');
});

test('a top-level element moves into a container', () => {
  const doc = new Document();
  const top = doc.create('p').text('T');
  const box = doc.create('div').addClass('box');
  box.append(top);

  const body = bodyOf(doc.render());
  assert(count(body, '<p>T</p>') === 1, 'the element renders exactly once');
  assert(body === '<body><div class="box"><p>T</p></div>', 'it left the document body list');
});

test('a nested element moves back to document level', () => {
  const doc = new Document();
  const box = doc.create('div').addClass('box');
  const inner = box.child('em').text('I');
  // after() on a top-level element inserts into the document body list, which is
  // the only public route from inside a container back out to document level.
  box.after(inner);

  assert(inner._parent === null, '_parent is cleared for a document-level element');
  assert(doc.body.indexOf(inner) === 1, 'the document body holds it exactly once');
  assert(box.children.length === 0, 'the former parent dropped it');

  // render() consumes the document, so tree assertions have to come first.
  const body = bodyOf(doc.render());
  assert(count(body, '<em>I</em>') === 1, 'the element renders exactly once');
  assert(body === '<body><div class="box"></div><em>I</em>', 'it sits beside its former parent');
});

test('remove() works after a move', () => {
  const doc = new Document();
  const a = doc.create('div').addClass('a');
  const b = doc.create('div').addClass('b');
  const item = a.child('span').text('X');
  b.append(item);
  item.remove();

  const body = bodyOf(doc.render());
  assert(!body.includes('<span>'), 'the element is gone');
  assert(body === '<body><div class="a"></div><div class="b"></div>', 'both containers are empty');
});

test('repeating a move is idempotent', () => {
  const doc = new Document();
  const a = doc.create('div').addClass('a');
  const b = doc.create('div').addClass('b');
  const item = a.child('span').text('X');
  b.append(item); b.append(item); b.append(item);

  const body = bodyOf(doc.render());
  assert(count(body, '<span>X</span>') === 1, 'the element still renders exactly once');
});

test('prependChild, insertAt, before, after and replaceWith all move rather than copy', () => {
  const cases = [
    ['prependChild', (a, b, item) => b.prependChild(item)],
    ['insertAt', (a, b, item) => b.insertAt(0, item)],
    ['before', (a, b, item) => b.child('i').text('anchor').before(item)],
    ['after', (a, b, item) => b.child('i').text('anchor').after(item)],
    ['replaceWith', (a, b, item) => b.child('i').text('anchor').replaceWith(item)],
  ];
  for (const [name, move] of cases) {
    const doc = new Document();
    const a = doc.create('div').addClass('a');
    const b = doc.create('div').addClass('b');
    const item = a.child('span').text('X');
    move(a, b, item);
    const body = bodyOf(doc.render());
    assert(count(body, '<span>X</span>') === 1, `${name}() renders the element exactly once`);
    assert(body.includes('<div class="a"></div>'), `${name}() empties the old parent`);
  }
});

test('self-insertion is rejected instead of overflowing the stack', () => {
  const doc = new Document();
  const el = doc.create('div').addClass('self');
  quiet(() => { el.append(el); el.prependChild(el); el.insertAt(0, el); });
  const body = bodyOf(doc.render());
  assert(body === '<body><div class="self"></div>', 'the element is untouched and renders once');
});

test('an ancestor cycle is rejected instead of overflowing the stack', () => {
  const doc = new Document();
  const parent = doc.create('div').addClass('p1');
  const child = parent.child('div').addClass('c1');
  quiet(() => child.append(parent));
  const body = bodyOf(doc.render());
  assert(body === '<body><div class="p1"><div class="c1"></div></div>', 'the tree is unchanged');
});

test('cross-document insertion is rejected', () => {
  const docA = new Document();
  const docB = new Document();
  const foreign = docA.create('span').text('A');
  const host = docB.create('div').addClass('host');
  quiet(() => host.append(foreign));

  assert(bodyOf(docB.render()) === '<body><div class="host"></div>', 'the foreign element was not adopted');
  assert(bodyOf(docA.render()).includes('<span>A</span>'), 'it stays in its own document');
});

test('_parent and _document stay correct across a move', () => {
  const doc = new Document();
  const a = doc.create('div').addClass('a');
  const b = doc.create('div').addClass('b');
  const item = a.child('span').text('X');
  b.append(item);

  assert(item._parent === b, '_parent points at the new parent');
  assert(item._document === doc, '_document is preserved');
  assert(a.children.length === 0, 'the old parent dropped the reference');
  assert(b.children[0] === item, 'the new parent holds the reference');
  assert(item.closest('div') === b, 'ancestor lookup follows the new position');
});

/* ==================================================================== */
/* bindProp() sinks                                                     */
/* ==================================================================== */

const bindPropHtml = (prop) => {
  const doc = new Document();
  doc.create('div').bindProp('k', prop, (v) => v);
  return { doc, html: doc.render() };
};

test('bindProp never compiles a markup parsing sink', () => {
  for (const prop of ['innerHTML', 'outerHTML', 'srcdoc']) {
    const { html } = quiet(() => bindPropHtml(prop)).result;
    assert(!html.includes(`el["${prop}"]=`), `${prop} binding is not compiled`);
    assert(!html.includes(prop), `${prop} does not appear in the page at all`);
  }
});

test('bindProp refuses a property outside the allowlist', () => {
  for (const prop of ['onclick', 'onmouseover', 'className', 'nodeValue']) {
    const { html } = quiet(() => bindPropHtml(prop)).result;
    assert(!html.includes(`el["${prop}"]=`), `${prop} binding is not compiled`);
  }
});

test('a rejected bindProp is recorded for validate()', () => {
  const doc = new Document();
  quiet(() => doc.create('div').bindProp('k', 'innerHTML', (v) => v));
  const errors = doc._registrationErrors || [];
  assert(errors.length > 0, 'the rejection is recorded');
  assert(errors.some(e => String(e.type || e.callbackType || '').includes('prop')),
    'the record names the binding type');
});

test('bindProp guards URL properties against control-character bypasses', () => {
  const { sanitizeUrl } = require('../lib/utils');
  for (const prop of ['href', 'src', 'action', 'formAction', 'poster', 'cite']) {
    const { html } = bindPropHtml(prop);
    assert(html.includes(`el["${prop}"]=(function(v){`), `${prop} compiles with a URL guard`);

    const guard = new RegExp('el\\["' + prop + '"\\]=\\(function\\(v\\)\\{([\\s\\S]*?)\\}\\)').exec(html);
    assert(guard, `${prop} guard body extracted`);
    const sanitize = new Function('v', guard[1]);
    for (const url of ['javascript:alert(1)', 'java\tscript:alert(1)', 'java\nscript:alert(1)',
      'java\rscript:alert(1)', 'v\tbscript:x', 'da\nta:text/html,x']) {
      assert(sanitize(url) === '#', `${prop} blocks ${JSON.stringify(url)}`);
    }
    for (const url of ['/rel', 'https://a.test', '#frag', 'mailto:a@b.test']) {
      assert(sanitize(url) === sanitizeUrl(url), `${prop} preserves ${JSON.stringify(url)}`);
    }
  }
});

test('ordinary property bindings and bindInput still work', () => {
  for (const prop of ['value', 'checked', 'selected', 'disabled', 'open', 'hidden', 'readOnly', 'required', 'textContent']) {
    const { html } = bindPropHtml(prop);
    assert(html.includes(`el["${prop}"]=`), `${prop} still compiles`);
  }
  const doc = new Document();
  doc.create('input').bindInput('name');
  const html = doc.render();
  assert(html.includes('el["value"]='), 'bindInput still compiles its value binding');
  assert(html.includes('addEventListener("input"'), 'bindInput still attaches its listener');
});

test('a JSON-imported property binding follows the same restrictions', () => {
  const { result: html } = quiet(() => renderFromJSON(jsonDoc({
    tag: 'div', id: 'p1',
    stateBindings: [{ stateKey: 'k', id: 'p1', bindType: 'prop', prop: 'innerHTML', templateFn: '(v)=>v' }]
  })));
  assert(!html.includes('innerHTML'), 'the markup sink never reaches the page');

  const { result: html2 } = quiet(() => renderFromJSON(jsonDoc({
    tag: 'div', id: 'p2',
    stateBindings: [{ stateKey: 'k', id: 'p2', bindType: 'prop', prop: 'href', templateFn: '(v)=>v' }]
  })));
  assert(html2.includes('el["href"]=(function(v){'), 'a URL property is still guarded when restored');
});

/* ==================================================================== */
/* CSP nonce is never served from the response cache                    */
/* ==================================================================== */

const noncePage = (nonce, text) => {
  const doc = new Document({ cache: true, cacheKey: 'nonce-cache-test', nonce });
  doc.create('p').text(text);
  doc.create('button').on('click', () => { window.clicked = true; });
  return doc.render();
};

test('two nonces on one cache key produce two independently rendered pages', () => {
  const first = quiet(() => noncePage('NONCE-AAA', 'first')).result;
  const second = quiet(() => noncePage('NONCE-BBB', 'second')).result;

  assert(first.includes('NONCE-AAA') && first.includes('first'), 'first response is its own page');
  assert(second.includes('NONCE-BBB'), 'second response carries the second nonce');
  assert(!second.includes('NONCE-AAA'), 'second response does not leak the first nonce');
  assert(second.includes('second') && !second.includes('first'), 'second response carries its own content');
  assert(first !== second, 'the two responses are not the same bytes');
});

test('a nonce-bearing document is never written to the cache', () => {
  const { getResponseCache } = require('../lib/document');
  quiet(() => noncePage('NONCE-CCC', 'only'));
  assert(!getResponseCache().get('nonce-cache-test'), 'no cache entry was created');
});

test('a dev warning names the ignored cache key', () => {
  const originalMode = CONFIG.mode;
  try {
    configure({ mode: 'dev' });
    const { notices } = quiet(() => noncePage('NONCE-DDD', 'warn'));
    assert(notices.some(n => n.includes('nonce-cache-test') && n.toLowerCase().includes('nonce')),
      'the warning names both the key and the reason');

    configure({ mode: 'prod' });
    const { notices: quietNotices } = quiet(() => noncePage('NONCE-EEE', 'warn'));
    assert(!quietNotices.some(n => n.includes('nonce-cache-test')), 'prod mode does not warn');
  } finally {
    configure({ mode: originalMode });
  }
});

test('caching without a nonce still hits the cache', () => {
  const page = (text) => {
    const doc = new Document({ cache: true, cacheKey: 'plain-cache-test' });
    doc.create('p').text(text);
    return doc.render();
  };
  const first = page('first');
  const second = page('second');
  assert(second === first, 'the second render is served from the cache');
  assert(second.includes('first'), 'the cached body is returned');
});

/* ==================================================================== */
/* Minifier placeholders are not caller-forgeable                       */
/* ==================================================================== */

test('a forged preserve token cannot duplicate or relocate a protected block', () => {
  const { minHTML } = require('../lib/utils');
  const forged = '\x00PRESERVE0\x00';

  const cases = [
    [`<p>${forged}</p><pre>  keep  me  </pre>`, 'payload before the block'],
    [`<pre>  keep  me  </pre><p>${forged}</p>`, 'payload after the block'],
    [`<pre> a </pre><p>${forged}</p><pre> b </pre>`, 'payload between two blocks'],
    [`<p>${forged}\x00PRESERVE1\x00\x00PRESERVE2\x00</p><pre> a </pre><code> b </code>`, 'multiple forged indices'],
  ];
  for (const [input, label] of cases) {
    const out = minHTML(input);
    assert(out.includes(forged), `${label}: the literal text survives as text`);
    const blocks = (input.match(/<(pre|code)\b/g) || []).length;
    assert((out.match(/<(pre|code)\b/g) || []).length === blocks,
      `${label}: the protected block count is unchanged`);
  }
});

test('protected block contents survive minification byte for byte', () => {
  const { minHTML } = require('../lib/utils');
  const blocks = [
    '<pre>  a\n\n   b  </pre>',
    '<code>  <pre> nested-looking </pre>  </code>',
    '<script>  var a = 1;   var b = 2;  </script>',
    '<style>  .a  {  color : red  }  </style>',
    '<textarea>  spaced   text  </textarea>',
  ];
  const out = minHTML(`<div>   ${blocks.join('   ')}   </div>`);
  for (const block of blocks) {
    assert(out.includes(block), `preserved verbatim: ${block.slice(0, 24)}`);
  }
  assert(out.startsWith('<div> ') && out.endsWith(' </div>'), 'surrounding whitespace still collapsed');
});

test('whitespace between inline elements is still collapsed, not deleted', () => {
  const { minHTML } = require('../lib/utils');
  assert(minHTML('<span>a</span>   <span>b</span>') === '<span>a</span> <span>b</span>',
    'a single separating space is kept');
  assert(minHTML('   <p>x</p>   ') === '<p>x</p>', 'leading and trailing whitespace is trimmed');
});

/* ==================================================================== */
/* Server / client sanitizer parity                                     */
/* ==================================================================== */

/**
 * The _mkEl list runtime re-implements three checks that also run on the server.
 * They were separate hand-copied regex literals and they drifted: the client
 * missed tab/LF/CR in URLs, accepted "on-click" as an ordinary attribute, and
 * stripped quotes out of CSS values. This extracts the ACTUAL generated
 * functions from a rendered page and compares them against the server helpers,
 * so a future edit to one side without the other fails here.
 */
test('the generated client runtime agrees with the server sanitizers', () => {
  const { isValidAttrKey, sanitizeCssValue, sanitizeUrl } = require('../lib/utils');

  const doc = new Document();
  doc.states({ items: [{ x: 1 }] });
  doc.liveList('items', () => ({ tag: 'span', text: 'x' }));
  const html = doc.render();

  const between = (startMarker, endMarker) => {
    const a = html.indexOf(startMarker);
    const b = html.indexOf(endMarker, a);
    assert(a >= 0 && b >= 0, `extracted ${startMarker}`);
    return html.slice(a + startMarker.length, b);
  };
  const ak = new Function('k', between('function ak(k){', '}function uv('));
  const uv = new Function('v', between('function uv(v){', '}function sv('));
  const sv = new Function('v', between('function sv(v){', '}function mk('));

  const attrKeys = ['on-click', 'on-error', 'onclick', 'onClick', 'data-x', 'aria-label',
    'href', 'xlink:href', '1bad', 'a b', ''];
  for (const k of attrKeys) {
    assert(isValidAttrKey(k) === ak(k), `attribute key parity for ${JSON.stringify(k)}`);
  }
  assert(!ak('on-click'), 'the client refuses on-click, the kebab form of attr("onClick")');

  const cssValues = ['"Fira Code"', "'x'", 'red', 'url(a.png)', 'a;b',
    'expression(alert(1))', '</style>', 'url("javascript:x")', ' '];
  for (const v of cssValues) {
    assert(sanitizeCssValue(v) === sv(v), `CSS value parity for ${JSON.stringify(v)}`);
  }
  assert(sv('"Fira Code"') === '"Fira Code"', 'the client keeps quotes CSS actually needs');

  const urls = ['javascript:x', 'JaVaScRiPt:x', 'java\tscript:x', 'java\nscript:x',
    'java\rscript:x', 'v\tbscript:x', 'da\nta:text/html,x',
    '/rel', 'https://a.test', '#f', 'mailto:a@b.test', '?q=javascript:x'];
  for (const u of urls) {
    assert(sanitizeUrl(u) === uv(u), `URL parity for ${JSON.stringify(u)}`);
  }
});

test('SSR and the client build equivalent DOM for the same NodeDef', () => {
  // nodeDefToHtml() is the server half of the pair; the assertions compare the
  // decision each side makes about every hostile field, since only one of them
  // can be executed outside a browser.
  const { nodeDefToHtml } = require('../lib/live');
  const { isValidAttrKey } = require('../lib/utils');

  const defs = [
    { tag: 'a', attrs: { href: 'java\tscript:alert(1)' }, text: 'x' },
    { tag: 'a', attrs: { href: '/safe' }, text: 'x' },
    { tag: 'div', attrs: { 'on-click': 'alert(1)', onclick: 'alert(1)' }, text: 'x' },
    { tag: '<script>', text: 'x' },
    { tag: 'div', css: { color: 'red}</style><script>alert(1)</script>' } },
    { tag: 'div', data: { userId: 42 }, aria: { label: 'Close' } },
    { tag: 'div', attrs: { title: null, hidden: false, lang: 'en' } },
    { tag: 'div', text: 'a\u2028b c', children: [{ tag: 'span', text: '<b>' }] },
  ];

  for (const def of defs) {
    const ssr = nodeDefToHtml(def);
    assert(!/on-?click=/i.test(ssr), `no inline handler survives SSR for ${JSON.stringify(def).slice(0, 60)}`);
    assert(!ssr.includes('<script'), 'no script element materialises');
    assert(!/href="\s*javascript:/i.test(ssr), 'no executable href');
    if (def.tag === '<script>') assert(ssr.startsWith('<div'), 'a malformed tag falls back to div');
  }

  // The attribute decision is the one that used to differ, so assert it directly.
  for (const k of ['on-click', 'onclick', 'data-x', 'href']) {
    const ssr = nodeDefToHtml({ tag: 'div', attrs: { [k]: 'v' } });
    assert(ssr.includes(` ${k}=`) === isValidAttrKey(k), `SSR follows isValidAttrKey for ${k}`);
  }
});

/* ==================================================================== */
/* Script-data escaping and raw-string insertion                        */
/* ==================================================================== */

test('escapeJsString neutralises both quote styles and angle brackets', () => {
  const { escapeJsString } = require('../lib/utils');
  const vm = require('vm');

  // The result is interpolated into single-quoted, double-quoted and template
  // literals in different places, so it must be inert in all three and must
  // still evaluate back to the original string.
  const inputs = ['<!--<script>', "x');alert(1);//", '</script>', '<script>', 'a"b',
    "a'b", 'a\\b', 'a\nb', 'a\rb', 'plain-id', '\u2028\u2029', ''];
  for (const input of inputs) {
    const out = escapeJsString(input);
    assert(!/[<>']/.test(out), `no raw angle bracket or apostrophe for ${JSON.stringify(input)}`);
    assert(new vm.Script(`("${out}")`).runInNewContext() === input, `double-quoted round trip for ${JSON.stringify(input)}`);
    assert(new vm.Script(`('${out}')`).runInNewContext() === input, `single-quoted round trip for ${JSON.stringify(input)}`);
    assert(new vm.Script('(`' + out + '`)').runInNewContext() === input, `template round trip for ${JSON.stringify(input)}`);
  }
});

test('an element id cannot corrupt script-data parsing', () => {
  // "<!--<script>" puts the HTML tokenizer into script-data-double-escaped
  // state, where </script> no longer ends the element and the rest of the
  // document is swallowed as script text.
  const doc = new Document();
  doc.states({ k: 1 });
  doc.create('span').id('<!--<script>').bind('k', (v) => v);
  const html = doc.render();

  const scriptRegion = html.slice(html.indexOf('<script'), html.lastIndexOf('</script>'));
  assert(!scriptRegion.includes('<!--'), 'no raw comment opener inside the script element');
  assert(!/<script/i.test(scriptRegion.slice(scriptRegion.indexOf('>'))), 'no raw script opener inside the script element');
  assert(html.endsWith('</body></html>'), 'the document still closes normally');
});

test('an element id cannot break out of a __STATE_ID__ substitution', () => {
  // renderNode substitutes the id into the CALLER's source, where the enclosing
  // literal is usually single-quoted: getElementById('__STATE_ID__').
  const doc = new Document();
  doc.states({ k: 1 });
  const target = doc.create('div').id("x');alert(1);//");
  doc.create('button').bindState(target, 'click', function () {
    var el = document.getElementById('__STATE_ID__');
    return el;
  });
  const html = doc.render();

  assert(!/getElementById\('x'\)/.test(html), 'the id did not close its literal');
  assert(html.includes("getElementById('x\\u0027);alert(1);//')"),
    'the apostrophe is escaped, so the payload stays inert text inside the literal');

  // Decisive: evaluate the compiled script with a tripwire alert(). If the
  // payload had escaped its literal it would run; escaped, it never does.
  const script = /<script>([\s\S]*?)<\/script>/.exec(html);
  assert(script, 'client script compiled');
  let fired = false;
  const sandbox = {
    alert: () => { fired = true; },
    window: {}, document: { getElementById: () => null, addEventListener: () => {} },
    console: { error: () => {} },
  };
  sandbox.window = sandbox;
  try { require('vm').runInNewContext(script[1], sandbox, { timeout: 2000 }); } catch { /* DOM stub is partial */ }
  assert(!fired, 'the injected alert() never executes');
});

test('replaceWith escapes a string replacement like every other insertion point', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const cases = {
    append: (el) => el.append(payload),
    text: (el) => el.text(payload),
    before: (el) => el.before(payload),
    after: (el) => el.after(payload),
    insertAt: (el) => el.insertAt(0, payload),
    prependChild: (el) => el.prependChild(payload),
    replaceWith: (el) => el.replaceWith(payload),
  };
  for (const [name, apply] of Object.entries(cases)) {
    const doc = new Document();
    apply(doc.create('div'));
    const html = doc.render();
    assert(!html.includes(payload), `${name}() escapes a raw string`);
    // The escaped text still reads "onerror=", which is inert. What must not
    // exist is an actual <img> element carrying it.
    assert(!/<img/i.test(html), `${name}() creates no element from the string`);
    assert(html.includes('&lt;img'), `${name}() escaped the payload into text`);
  }
});

test('jsonLd cannot corrupt script-data parsing', () => {
  const doc = new Document();
  doc.jsonLd({ '@type': 'Thing', name: '<!--<script>', url: '</script><script>alert(1)</script>' });
  const html = doc.render();

  const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  assert(block, 'the ld+json block is emitted');
  assert(!block[1].includes('<'), 'no raw less-than sign inside the JSON payload');
  // alert(1) survives as escaped text inside the JSON string, which is inert;
  // what matters is that no second script element was created.
  assert((html.match(/<script/gi) || []).length === 1, 'exactly the one ld+json script element');
  assert(html.endsWith('</body></html>'), 'the document still closes normally');

  // The payload must still be valid JSON that decodes to the original values.
  const parsed = JSON.parse(block[1]);
  assert(parsed.name === '<!--<script>', 'the original value survives for a JSON-LD consumer');
  assert(parsed.url === '</script><script>alert(1)</script>', 'the second value survives too');
});

/* ==================================================================== */

(async () => {
  for (const run of pending) await run();
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(40));
  if (failed > 0) process.exit(1);
})();
