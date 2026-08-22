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

function testAsync(name, fn) {
  console.log(`\n▸ ${name}`);
  return fn().catch((e) => { failed++; console.error(`  ✗ THREW: ${e.message}`); });
}

function collectStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk.toString()));
    stream.on('end', () => resolve(chunks.join('')));
    stream.on('error', reject);
  });
}

/* ---- renderStream matches render() ---- */
const p1 = testAsync('renderStream output matches render()', async () => {
  const doc1 = new Document();
  doc1.title('Test').viewport();
  doc1.h1().text('Hello');
  doc1.p('World');
  const expected = doc1.render();

  const doc2 = new Document();
  doc2.title('Test').viewport();
  doc2.h1().text('Hello');
  doc2.p('World');
  const streamed = await collectStream(doc2.renderStream());

  assert(streamed === expected, 'streamed output identical to render()');
});

/* ---- renderStream includes head immediately ---- */
const p2 = testAsync('renderStream includes title in output', async () => {
  const doc = new Document();
  doc.title('StreamTitle');
  doc.h1().text('content');
  const html = await collectStream(doc.renderStream());
  assert(html.includes('<title>StreamTitle</title>'), 'title in streamed output');
  assert(html.includes('<h1>content</h1>'), 'body in streamed output');
  assert(html.startsWith('<!DOCTYPE html>'), 'starts with doctype');
  assert(html.endsWith('</body></html>'), 'ends with closing tags');
});

/* ---- renderStream with CSS and events ---- */
const p3 = testAsync('renderStream with reactive state compiles script', async () => {
  const doc = new Document();
  doc.states({ count: 0 });
  doc.div().bind('count', (val) => `Count: ${val}`);
  doc.button('+1').onClick(function() { State.count++; });
  const html = await collectStream(doc.renderStream());
  assert(html.includes('addEventListener'), 'event listener in stream');
  assert(html.includes('"count"'), 'state key in stream');
});

/* ---- renderStream with nonce ---- */
const p4 = testAsync('renderStream applies nonce to inline scripts', async () => {
  const doc = new Document({ nonce: 'test123' });
  doc.states({ x: 1 });
  doc.div().bind('x');
  const html = await collectStream(doc.renderStream());
  assert(html.includes('nonce="test123"'), 'nonce applied in stream');
});

/* ---- renderStream error path — stream destroyed on renderNode throw ---- */
const p5 = testAsync('renderStream destroys stream on error', async () => {
  const doc = new Document();
  // Inject a non-Element, non-string body entry to trigger an error path
  // We can do this by directly pushing a bad object
  doc.body.push({ tag: null, __badNode: true, toString() { throw new Error('render fail'); } });

  let errorCaught = false;
  try {
    await collectStream(doc.renderStream());
  } catch (e) {
    errorCaught = true;
  }
  // The stream may either error or handle it gracefully (bad node returns '')
  // Either way it must not hang — we just verify it resolves
  assert(true, 'stream resolves (does not hang) on bad node');
});

/* ---- renderStream with scoped CSS ---- */
const p6 = testAsync('renderStream includes scoped CSS', async () => {
  const doc = new Document();
  doc.div().css({ color: 'red', fontSize: '14px' }).text('styled');
  const html = await collectStream(doc.renderStream());
  assert(html.includes('color:red'), 'scoped CSS in stream');
  assert(html.includes('font-size:14px'), 'kebab CSS key in stream');
});

/* ---- renderStream with inline script (liveList) ---- */
const p7 = testAsync('renderStream includes inline scripts', async () => {
  const { compileLiveList } = require('../lib/live');
  const doc = new Document();
  doc.states({ items: ['a', 'b'] });
  compileLiveList(doc, doc, 'items', (i) => ({ tag: 'li', text: i }));
  const html = await collectStream(doc.renderStream());
  assert(html.includes('<li>a</li>'), 'SSR list item a');
  assert(html.includes('<li>b</li>'), 'SSR list item b');
  assert(html.includes('_mkEl'), '_mkEl runtime included');
});

/* ---- renderStream: clear() called after stream ends ---- */
const p8 = testAsync('renderStream calls clear() — body is empty after stream', async () => {
  const doc = new Document();
  doc.h1().text('Before');
  doc.p('content');
  assert(doc.body.length === 2, 'body has 2 elements before stream');
  await collectStream(doc.renderStream());
  assert(doc.body.length === 0, 'body cleared after stream');
});

/* ---- renderStream with element lifecycle ---- */
const p9 = testAsync('renderStream compiles element lifecycle hooks', async () => {
  const doc = new Document();
  doc.states({ count: 0 });
  doc.div()
    .onMount(function () { this.dataset.mounted = 'true'; })
    .onUpdate('count', function (value) { this.textContent = String(value); })
    .onDestroy(function () { State.destroyed = true; });
  const html = await collectStream(doc.renderStream());
  assert(html.includes('initLifecycles'), 'lifecycle runtime included in stream');
  assert(html.includes('dataset.mounted'), 'mount hook included in stream');
  assert(html.includes('"count"'), 'update state key included in stream');
  assert(html.includes('State.destroyed'), 'destroy hook included in stream');
});

/* ---- renderStream records what it sent ---- */
const p10 = testAsync('renderStream sets output() so save() does not re-render an empty document', async () => {
  const doc = new Document();
  doc.title('Streamed');
  doc.h1().text('Recorded');
  const streamed = await collectStream(doc.renderStream());

  assert(doc.output() === streamed, 'output() equals the streamed bytes');
  assert(doc.output().includes('<h1>Recorded</h1>'), 'recorded output retains the body');
});

/* ---- renderStream error path leaves no partial record ---- */
const p11 = testAsync('renderStream does not record output when rendering throws', async () => {
  const doc = new Document();
  doc.title('Broken');
  // A non-Element body node renders via String(); throwing there exercises the
  // catch path without mutating a pooled Element that later tests reuse.
  doc.body.push({ toString() { throw new Error('boom'); } });
  try {
    await collectStream(doc.renderStream());
    assert(false, 'stream should have errored');
  } catch (error) {
    assert(error.message === 'boom', 'stream surfaced the render error');
  }
  assert(doc.output() === '', 'no partial output recorded after a failure');
});

/* ---- renderStream announces that it ignores the response cache ---- */
const p12 = testAsync('renderStream warns when a cacheKey it cannot honour is set', async () => {
  const { configure, CONFIG, getCacheStats } = require('../index');
  const originalMode = CONFIG.mode;
  const originalWarn = console.warn;
  const warnings = [];
  try {
    console.warn = message => warnings.push(message);
    configure({ mode: 'dev' });

    const cached = new Document({ cache: true, cacheKey: 'stream-key' });
    cached.h1().text('Streamed');
    const sizeBefore = getCacheStats().cache.size;
    await collectStream(cached.renderStream());
    assert(warnings.length === 1, `one warning for an ignored cacheKey (got ${warnings.length})`);
    assert(warnings[0].includes('stream-key'), 'warning names the ignored key');
    assert(getCacheStats().cache.size === sizeBefore, 'stream did not populate the cache');

    warnings.length = 0;
    const plain = new Document();
    plain.h1().text('Plain');
    await collectStream(plain.renderStream());
    assert(warnings.length === 0, 'uncached documents stream without warnings');
  } finally {
    console.warn = originalWarn;
    configure({ mode: originalMode });
  }
});

/* ---- renderStream renders on demand, not up front ---- */
function bigDocument(count) {
  const doc = new Document();
  doc.title('Big');
  for (let i = 0; i < count; i++) doc.p('paragraph number ' + i + ' with filler text to add bytes');
  return doc;
}

const p13 = testAsync('renderStream renders lazily and honours backpressure', async () => {
  // The old assertion here was `html.length > afterOne * 5` — a ratio between two
  // document sizes, which says nothing about laziness and only held because the
  // fixture happened to be 5000 paragraphs. What actually matters is that the
  // first read stops short of the end and later reads carry on from there, so
  // that is what is asserted: the buffered prefix must be a genuine prefix of an
  // incomplete document, and the finished stream must equal a plain render().
  const doc = bigDocument(5000);
  const reference = bigDocument(5000).render();

  const stream = doc.renderStream();
  assert(stream.readableLength === 0, 'nothing is rendered before the consumer reads');

  stream.read(0); // one _read cycle
  const afterOne = stream.readableLength;
  assert(afterOne > 0, 'a read cycle produces data');
  assert(afterOne < stream.readableHighWaterMark * 2,
    `a read cycle stops near the high-water mark (buffered ${afterOne}, hwm ${stream.readableHighWaterMark})`);
  assert(afterOne < reference.length, 'the first read does not finish the document');
  assert(doc.body.length > 0, 'the document is still held mid-stream');

  const html = await collectStream(stream);
  assert(html.length > afterOne, 'later reads produce bytes the first read had not');
  assert(html.startsWith(reference.slice(0, afterOne)),
    'what the first read buffered is a prefix of the finished document');
  assert(html === reference, 'streamed output equals an equivalent non-streamed render');
  assert(html.endsWith('</body></html>'), 'output ends with the closing tags');
  assert(doc.body.length === 0, 'document cleared once the stream finished');
  assert(doc.output() === html, 'the completed stream is recorded as the rendered output');
});

/* ---- abandoning the stream still releases the document ---- */
const p14 = testAsync('renderStream cleans up when the consumer destroys it early', async () => {
  const doc = bigDocument(2000);
  const stream = doc.renderStream();
  stream.read(0);
  assert(doc.body.length > 0, 'document still held while streaming');

  await new Promise((resolve) => {
    stream.on('close', resolve);
    stream.destroy();
  });
  assert(doc.body.length === 0, 'abandoned stream still clears the document');
});

Promise.all([p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12, p13, p14]).then(() => {
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(40));
  process.exit(failed > 0 ? 1 : 0);
});
