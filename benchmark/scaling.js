'use strict';

/**
 * How buildhtml scales, measured on its own rather than against other renderers.
 *
 * `render.js` answers "how fast is one page compared to React and Preact". This
 * answers the questions that only matter as a document grows: does cost stay
 * linear in tree size, does the CSS compiler stay flat when rules repeat, does
 * streaming reach the first byte before the whole page is built, and do repeated
 * renders keep reusing pooled objects instead of allocating fresh ones.
 *
 *   node benchmark/scaling.js
 *
 * Numbers vary with CPU, Node version and background load. Compare only within
 * one run; the per-unit columns are the ones that should stay flat as N grows.
 */

const { performance } = require('perf_hooks');
const { gzipSync } = require('zlib');
const { Document, configure, resetPools } = require('..');
const { pools } = require('../lib/pools');

configure({ mode: 'prod' });

const SAMPLES = Number(process.env.BUILDHTML_BENCH_SAMPLES) || 5;

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median wall time of `fn` over SAMPLES runs, plus whatever it returned last. */
function time(fn) {
  let result;
  const times = [];
  fn(); // warm up: the first run pays for lazy requires and an empty pool
  for (let i = 0; i < SAMPLES; i++) {
    const start = performance.now();
    result = fn();
    times.push(performance.now() - start);
  }
  return { ms: median(times), result };
}

function table(title, columns, rows) {
  console.log('\n' + title);
  const widths = columns.map((c, i) => Math.max(c.length, ...rows.map(r => String(r[i]).length)));
  const line = cells => cells.map((c, i) => String(c).padStart(widths[i])).join('  ');
  console.log(line(columns));
  console.log(widths.map(w => '-'.repeat(w)).join('  '));
  for (const row of rows) console.log(line(row));
}

const kb = bytes => (bytes / 1024).toFixed(1);

/* ---- Breadth: many sibling elements ---- */

function wideTree(n) {
  const doc = new Document();
  const root = doc.create('div');
  for (let i = 0; i < n; i++) {
    root.child('p').attr('data-i', String(i)).text('row ' + i);
  }
  return doc.render();
}

/* ---- Depth: one long chain ---- */

function deepTree(depth) {
  const doc = new Document();
  let el = doc.create('div');
  for (let i = 0; i < depth; i++) el = el.child('div');
  el.text('leaf');
  return doc.render();
}

/* ---- CSS: distinct rules versus repeated ones ---- */

function cssTree(elements, distinctRules) {
  const doc = new Document();
  const root = doc.create('div');
  for (let i = 0; i < elements; i++) {
    const k = i % distinctRules;
    root.child('span').css({ padding: k + 'px', color: '#' + (k % 10) + '33' }).text('x');
  }
  return doc.render();
}

/* ---- Reactive list ---- */

function liveList(n) {
  const doc = new Document();
  doc.states({ rows: Array.from({ length: n }, (_, i) => ({ id: i, label: 'Item ' + i })) });
  doc.div().liveList('rows', item => ({
    tag: 'span', text: item.label, attrs: { 'data-id': item.id }, css: { padding: '4px' },
  }));
  return doc.render();
}

/* ---- Streaming: time to first chunk against full render ---- */

/**
 * Streaming granularity is per TOP-LEVEL BODY NODE, because renderNode() renders
 * a subtree in one recursive call. Both shapes are measured because the
 * difference between them is the whole point: a page built under a single root
 * element streams its body as one chunk and gains almost nothing over render().
 *
 * `wrapped` reproduces the common shape, `flat` the one streaming is good at.
 */
function streamFirstChunk(n, shape) {
  return new Promise(resolve => {
    const doc = new Document();
    if (shape === 'wrapped') {
      const root = doc.create('div');
      for (let i = 0; i < n; i++) root.child('p').text('row ' + i);
    } else {
      for (let i = 0; i < n; i++) doc.create('p').text('row ' + i);
    }
    // The clock starts at renderStream(), not before the tree is built. Timing
    // construction as part of "time to first chunk" made streaming look like it
    // delivered nothing until the page was 90% done, when what was actually
    // being measured was the build that every render pays for either way.
    const started = performance.now();
    const stream = doc.renderStream();
    let first = null;
    let bytes = 0;
    let chunks = 0;
    stream.on('data', chunk => {
      if (first === null) first = performance.now() - started;
      chunks++;
      bytes += chunk.length;
    });
    stream.on('end', () => resolve({ first, total: performance.now() - started, bytes, chunks }));
  });
}

async function main() {
  console.log(`buildhtml scaling benchmark (Node ${process.version}, ${process.platform} ${process.arch})`);
  console.log(`${SAMPLES} samples per measurement, median reported, mode=prod`);

  table('Breadth — sibling elements', ['elements', 'ms', 'us/element', 'HTML KB', 'gzip KB'], [500, 2000, 10000, 50000].map(n => {
    const { ms, result } = time(() => wideTree(n));
    return [n, ms.toFixed(2), ((ms * 1000) / n).toFixed(2), kb(result.length), kb(gzipSync(Buffer.from(result)).length)];
  }));

  table('Depth — nested elements', ['depth', 'ms', 'us/level', 'HTML KB'], [100, 500, 1500, 3000].map(d => {
    const { ms, result } = time(() => deepTree(d));
    return [d, ms.toFixed(2), ((ms * 1000) / d).toFixed(2), kb(result.length)];
  }));

  // The per-rule column is the one to watch: de-duplication should make cost
  // track the number of DISTINCT rules, not the number of elements using them.
  table('CSS — 5000 elements, varying distinct rules', ['distinct', 'ms', 'CSS KB', 'HTML KB', 'gzip KB'], [1, 10, 100, 1000, 5000].map(d => {
    const { ms, result } = time(() => cssTree(5000, d));
    const css = (result.match(/<style[^>]*>([\s\S]*?)<\/style>/) || ['', ''])[1];
    return [d, ms.toFixed(2), kb(css.length), kb(result.length), kb(gzipSync(Buffer.from(result)).length)];
  }));

  table('Reactive list', ['rows', 'ms', 'us/row', 'HTML KB', 'gzip KB'], [100, 1000, 5000, 20000].map(n => {
    const { ms, result } = time(() => liveList(n));
    return [n, ms.toFixed(2), ((ms * 1000) / n).toFixed(2), kb(result.length), kb(gzipSync(Buffer.from(result)).length)];
  }));

  // Repeated renders of the same shape: the pool should be warm after the first,
  // so a later render must not cost more than an early one.
  resetPools();
  const repeatRows = [];
  for (const count of [1, 100, 1000, 5000]) {
    const start = performance.now();
    for (let i = 0; i < count; i++) wideTree(200);
    const total = performance.now() - start;
    repeatRows.push([count, total.toFixed(1), (total / count).toFixed(3), pools.elements.length, pools.arrays.length]);
  }
  table('Repeated renders — 200 elements each', ['renders', 'total ms', 'ms/render', 'pooled els', 'pooled arrays'], repeatRows);

  const streamRows = [];
  for (const n of [5000, 20000]) {
    for (const shape of ['wrapped', 'flat']) {
      const { first, total, bytes, chunks } = await streamFirstChunk(n, shape);
      streamRows.push([n, shape, chunks, first.toFixed(2), total.toFixed(2),
        ((first / total) * 100).toFixed(1) + '%', kb(bytes)]);
    }
  }
  table('Streaming — granularity is per top-level body node',
    ['elements', 'shape', 'chunks', 'first ms', 'total ms', 'first/total', 'KB'], streamRows);

  console.log('\nWatch the per-unit columns rather than the totals: they should stay flat as N grows,');
  console.log('and CSS cost should track distinct rules rather than element count.');
  console.log('');
  console.log('In the streaming table, compare the two shapes. "wrapped" puts everything under one');
  console.log('root element and emits the body as a single chunk; "flat" uses many top-level nodes');
  console.log('and streams incrementally. renderNode() renders a subtree in one call, so that is');
  console.log('the granularity streaming can offer without a generator-based renderer.');
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
