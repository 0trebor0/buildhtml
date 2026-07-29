'use strict';

const { performance } = require('perf_hooks');
const { gzipSync } = require('zlib');
const { Document, configure, resetPools } = require('..');

const ITEM_COUNT = readPositiveInteger('BENCH_ITEMS', 50);
const SAMPLE_COUNT = readPositiveInteger('BENCH_SAMPLES', 7);
const SAMPLE_TIME_MS = readPositiveInteger('BENCH_TIME_MS', 250);
const WARMUP_TIME_MS = Math.min(100, SAMPLE_TIME_MS);

const items = Array.from({ length: ITEM_COUNT }, (_, index) => ({
  id: index + 1,
  title: `Item ${index + 1}`,
  detail: `Rendered value ${index + 1}`,
}));

function readPositiveInteger(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function packageVersion(name) {
  try {
    return require(`${name}/package.json`).version;
  } catch (_error) {
    return 'unknown';
  }
}

function buildStaticWithBuildhtml() {
  const doc = new Document();
  doc.title('Benchmark');
  const main = doc.main().attr('class', 'content');
  main.h1().text('Benchmark items');
  const list = main.ul().attr('class', 'items');
  for (const item of items) {
    const row = list.li().attr('data-id', item.id);
    row.child('strong').text(item.title);
    row.span().text(item.detail);
  }
  return doc.render();
}

function buildReactiveWithBuildhtml() {
  const doc = new Document();
  doc.title('Reactive benchmark');
  doc.states({ items, selected: 0, view: 'all' });
  doc.h1().bind('view', value => `View: ${value}`);
  doc.button('Select').onClick(function () { State.selected += 1; });
  doc.div()
    .onMount(function () { this.dataset.ready = 'true'; })
    .onUpdate('selected', function (value) { this.dataset.selected = String(value); });
  doc.liveList('items', function (item) {
    return {
      tag: 'article',
      attrs: { 'data-id': item.id },
      children: [
        { tag: 'strong', text: item.title },
        { tag: 'span', text: item.detail },
      ],
    };
  });
  doc.hashRouter({ stateKey: 'view', default: 'all' });
  return doc.render();
}

function buildStaticWithStrings() {
  let rows = '';
  for (const item of items) {
    rows += `<li data-id="${item.id}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></li>`;
  }
  return `<!DOCTYPE html><html><head><title>Benchmark</title></head><body><main class="content"><h1>Benchmark items</h1><ul class="items">${rows}</ul></main></body></html>`;
}

function loadReactAdapter() {
  try {
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const h = React.createElement;
    return {
      name: `React ${packageVersion('react')} static`,
      render() {
        return '<!DOCTYPE html>' + renderToStaticMarkup(
          h('html', null,
            h('head', null, h('title', null, 'Benchmark')),
            h('body', null,
              h('main', { className: 'content' },
                h('h1', null, 'Benchmark items'),
                h('ul', { className: 'items' }, items.map(item =>
                  h('li', { key: item.id, 'data-id': item.id },
                    h('strong', null, item.title),
                    h('span', null, item.detail)
                  )
                ))
              )
            )
          )
        );
      },
    };
  } catch (_error) {
    return null;
  }
}

function loadPreactAdapter() {
  try {
    const { h } = require('preact');
    const render = require('preact-render-to-string');
    return {
      name: `Preact ${packageVersion('preact')} string`,
      render() {
        return '<!DOCTYPE html>' + render(
          h('html', null,
            h('head', null, h('title', null, 'Benchmark')),
            h('body', null,
              h('main', { class: 'content' },
                h('h1', null, 'Benchmark items'),
                h('ul', { class: 'items' }, items.map(item =>
                  h('li', { key: item.id, 'data-id': item.id },
                    h('strong', null, item.title),
                    h('span', null, item.detail)
                  )
                ))
              )
            )
          )
        );
      },
    };
  } catch (_error) {
    return null;
  }
}

function validateStaticOutput(html, name) {
  if (typeof html !== 'string' || !html.startsWith('<!DOCTYPE html>')) {
    throw new Error(`${name} did not return a complete HTML document`);
  }
  if (!html.includes('Benchmark items') || !html.includes(`Item ${ITEM_COUNT}`)) {
    throw new Error(`${name} output is missing benchmark content`);
  }
  const rowCount = (html.match(/<li(?:\s|>)/g) || []).length;
  if (rowCount !== ITEM_COUNT) {
    throw new Error(`${name} rendered ${rowCount} rows; expected ${ITEM_COUNT}`);
  }
}

function validateReactiveOutput(html) {
  if (!html.includes('window.State=new Proxy') ||
      !html.includes('initLifecycles') ||
      !html.includes('window._mkEl') ||
      !html.includes('hashchange')) {
    throw new Error('buildhtml reactive output is missing compiled runtime features');
  }
}

function runBatch(render, iterations) {
  const start = performance.now();
  for (let index = 0; index < iterations; index++) render();
  return performance.now() - start;
}

function calibratedIterations(render) {
  let iterations = 1;
  let elapsed = runBatch(render, iterations);
  while (elapsed < WARMUP_TIME_MS && iterations < 1e6) {
    iterations *= 2;
    elapsed = runBatch(render, iterations);
  }
  return Math.max(1, Math.round(iterations * SAMPLE_TIME_MS / Math.max(elapsed, 0.01)));
}

function percentile(sorted, fraction) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function benchmark(name, render, validate) {
  const output = render();
  validate(output, name);
  const iterations = calibratedIterations(render);
  const latencies = [];

  for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
    latencies.push(runBatch(render, iterations) / iterations);
  }

  latencies.sort((a, b) => a - b);
  const medianMs = percentile(latencies, 0.5);
  return {
    name,
    iterations,
    medianOps: 1000 / medianMs,
    medianMs,
    p95Ms: percentile(latencies, 0.95),
    outputBytes: Buffer.byteLength(output),
    gzipBytes: gzipSync(output).length,
  };
}

function inlineScriptBytes(html) {
  let bytes = 0;
  const pattern = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(html))) bytes += Buffer.byteLength(match[1]);
  return bytes;
}

function inlineScriptContent(html) {
  let content = '';
  const pattern = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(html))) content += match[1];
  return content;
}

function printTable(results) {
  const headings = ['Renderer', 'median ops/s', 'median ms', 'p95 ms', 'HTML bytes', 'gzip bytes'];
  const rows = results.map(result => [
    result.name,
    result.medianOps.toFixed(0),
    result.medianMs.toFixed(4),
    result.p95Ms.toFixed(4),
    String(result.outputBytes),
    String(result.gzipBytes),
  ]);
  const widths = headings.map((heading, column) =>
    Math.max(heading.length, ...rows.map(row => row[column].length))
  );
  const format = row => row.map((cell, column) =>
    column === 0 ? cell.padEnd(widths[column]) : cell.padStart(widths[column])
  ).join('  ');

  console.log(format(headings));
  console.log(widths.map(width => '-'.repeat(width)).join('  '));
  for (const row of rows) console.log(format(row));
}

configure({ mode: 'prod', enableMetrics: false });
resetPools();

console.log(`buildhtml render benchmark (Node ${process.version}, ${process.platform} ${process.arch})`);
console.log(`${ITEM_COUNT} rows, ${SAMPLE_COUNT} samples, approximately ${SAMPLE_TIME_MS}ms per sample`);
console.log('Static comparison measures end-to-end element construction plus HTML serialization.\n');

const staticRenderers = [
  { name: 'Raw string baseline', render: buildStaticWithStrings },
  { name: `buildhtml ${require('../package.json').version}`, render: buildStaticWithBuildhtml },
  loadReactAdapter(),
  loadPreactAdapter(),
].filter(Boolean);

const staticResults = staticRenderers.map(renderer =>
  benchmark(renderer.name, renderer.render, validateStaticOutput)
);
printTable(staticResults);

const missing = [];
if (!staticRenderers.some(renderer => renderer.name.startsWith('React'))) missing.push('React');
if (!staticRenderers.some(renderer => renderer.name.startsWith('Preact'))) missing.push('Preact');
if (missing.length) {
  console.log(`\nOptional comparisons skipped: ${missing.join(', ')} (packages are not installed).`);
}

resetPools();
const reactiveResult = benchmark(
  `buildhtml ${require('../package.json').version} reactive`,
  buildReactiveWithBuildhtml,
  validateReactiveOutput
);
const reactiveOutput = buildReactiveWithBuildhtml();
const reactiveScripts = inlineScriptContent(reactiveOutput);

console.log('\nReactive compilation (buildhtml-specific; not compared to static renderers):');
printTable([reactiveResult]);
console.log(`Compiled inline JavaScript: ${inlineScriptBytes(reactiveOutput)} bytes (${gzipSync(reactiveScripts).length} gzip bytes)`);
console.log('\nResults vary by CPU, Node version, power state, and background load. Compare results only from the same run.');
