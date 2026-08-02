'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const api = require('..');
const { Head } = api;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(error.stack || error);
  }
}

console.log('\n▸ Public API coverage');

test('page options and renderFromJSON overloads', () => {
  const minimal = api.page('Minimal', { lang: 'fr', viewport: false, resetCss: false });
  const minimalHtml = minimal.render();
  assert(minimalHtml.includes('<html lang="fr">'));
  assert(!minimalHtml.includes('name="viewport"'));
  assert(!minimalHtml.includes('box-sizing:border-box'));

  const withSetup = api.renderFromJSON(
    { title: 'JSON', body: { tag: 'p', text: 'body' } },
    (doc) => doc.p('setup')
  );
  assert(withSetup.includes('<title>JSON</title>'));
  assert(withSetup.includes('body'));
  assert(withSetup.includes('setup'));

  const withOptions = api.renderJSON(
    { body: { tag: 'p', text: 'cached' } },
    { nonce: 'json-nonce' }
  );
  assert(withOptions.includes('cached'));
});

test('Document aliases, head helpers, fragments, output, and save', () => {
  const doc = new api.Document();
  doc.meta('description', 'api audit')
    .charset('ISO-8859-1')
    .favicon('/icon.svg', 'image/svg+xml')
    .addStyle('body{margin:0}')
    .defineClass('notice', { color: 'red' })
    .defineClass('.raw-selector', { display: 'block' }, true);

  const created = doc.createElement('section');
  created.create('span').textContent = 'setter';
  doc.child('p').text('child alias');

  const fragmentSource = doc.create('aside').css({ color: 'blue' }).text('fragment');
  const fragment = fragmentSource.renderFragment();
  const stamped = new api.Document().stamp(fragment).stamp(null);
  assert(stamped.render().includes('fragment'));

  const html = doc.render();
  assert.strictEqual(doc.output(), html);
  assert(html.includes('charset="ISO-8859-1"'));
  assert(html.includes('rel="icon"'));
  assert(html.includes('setter'));
  assert(html.includes('child alias'));
  assert(html.includes('.raw-selector{display:block;}'));

  const savePath = path.join(os.tmpdir(), `buildhtml-public-api-${process.pid}-${Date.now()}.html`);
  try {
    const saved = new api.Document();
    saved.h1().text('saved');
    saved.save(savePath);
    assert(fs.readFileSync(savePath, 'utf8').includes('saved'));
  } finally {
    if (fs.existsSync(savePath)) fs.unlinkSync(savePath);
  }
});

test('Head methods render metadata, raw links, scripts, and styles', () => {
  const head = new Head();
  head.setTitle('Title')
    .setCharset('UTF-16')
    .setNonce('head-nonce')
    .addMeta({ name: 'description', content: 'Head test' })
    .addLink('/site.css')
    .addRawLink('<link rel="alternate" href="/feed">')
    .addStyle('body{color:red}')
    .addScript('/site.js')
    .globalCss('main', { display: 'grid' })
    .addClass('card', { padding: '1rem' });
  assert.strictEqual(head.hasStyles(), true);
  const html = head.render();
  assert(html.includes('charset="UTF-16"'));
  assert(html.includes('rel="alternate"'));
  assert(html.includes('nonce="head-nonce"'));
  assert(html.includes('/site.js'));
});

test('Element aliases and attribute shortcuts preserve expected values', () => {
  const doc = new api.Document();
  const parent = doc.div();
  const child = parent.create('a')
    .attribute('data-alias', 'yes')
    .href('/path')
    .src('/asset')
    .role('button')
    .target('_blank')
    .rel('noopener')
    .alt('alt text')
    .width(100)
    .height(50)
    .autocomplete()
    .selected()
    .disabled(false)
    .hidden(false);
  child.append('safe <text>').append(null).appendUnsafe('<strong>trusted</strong>');
  child.textContent = 'replaced';
  assert.strictEqual(child.attrs['data-alias'], 'yes');
  assert.strictEqual(child.attrs.autocomplete, 'off');
  assert.strictEqual(child.attrs.selected, 'selected');
  assert(!('disabled' in child.attrs));
  assert(!('hidden' in child.attrs));
  assert(child.html().includes('replaced'));
});

test('boolean attribute shortcuts can both enable and disable attributes', () => {
  const input = new api.Document().input();
  const methods = ['required', 'readonly', 'autofocus', 'multiple', 'checked', 'selected'];
  for (const method of methods) {
    input[method](true);
    assert(method in input.attrs, `${method}(true) should add the attribute`);
    input[method](false);
    assert(!(method in input.attrs), `${method}(false) should remove the attribute`);
  }
});

test('every event shortcut maps to its browser event', () => {
  const doc = new api.Document();
  const el = doc.button('events');
  const shortcuts = {
    onClick: 'click', onChange: 'change', onInput: 'input', onSubmit: 'submit',
    onKeydown: 'keydown', onKeyup: 'keyup', onKeypress: 'keypress', onFocus: 'focus',
    onBlur: 'blur', onMouseenter: 'mouseenter', onMouseleave: 'mouseleave',
    onMousedown: 'mousedown', onMouseup: 'mouseup', onMousemove: 'mousemove',
    onDblclick: 'dblclick', onContextmenu: 'contextmenu', onScroll: 'scroll',
    onLoad: 'load', onError: 'error', onDragstart: 'dragstart', onDragend: 'dragend',
    onDragover: 'dragover', onDrop: 'drop', onTouchstart: 'touchstart',
    onTouchend: 'touchend', onTouchmove: 'touchmove'
  };
  for (const [method, event] of Object.entries(shortcuts)) {
    el[method](function () {});
    assert.strictEqual(el.events.at(-1).event, event, `${method} should register ${event}`);
  }
  assert(doc.render().includes('addEventListener'));
});

test('component registry list, unregister, and clear are consistent', () => {
  api.components.clear();
  api.components.register('AuditOne', (el) => el.text('one'));
  api.components.register('AuditTwo', (el) => el.text('two'));
  assert.deepStrictEqual(api.components.list().sort(), ['AuditOne', 'AuditTwo']);
  assert.strictEqual(api.components.has('AuditOne'), true);
  api.components.unregister('AuditOne');
  assert.strictEqual(api.components.has('AuditOne'), false);
  api.components.clear();
  assert.deepStrictEqual(api.components.list(), []);
});

test('Element.use builds an inline component below its parent', () => {
  const doc = new api.Document();
  const parent = doc.main();
  const component = parent.use((el, props) => {
    el.addClass('inline-component').text(props.label);
  }, { label: 'nested inline component' }, 'article');
  assert.strictEqual(component.parent(), parent);
  const html = doc.render();
  assert(html.includes('<article'));
  assert(html.includes('inline-component'));
  assert(html.includes('nested inline component'));
});

test('configure validates values and Metrics reports and resets samples', () => {
  const original = { ...api.CONFIG };
  const warn = console.warn;
  try {
    console.warn = () => {};
    api.configure({ enableMetrics: true, cacheLimit: 7, unknown: true, poolSize: 'bad' });
    assert.strictEqual(api.CONFIG.cacheLimit, 7);
    assert.strictEqual(api.CONFIG.poolSize, original.poolSize);

    const metrics = new api.Metrics();
    metrics.increment('requests', 2);
    metrics.timing('render', 10);
    metrics.timing('render', 30);
    const stats = metrics.getStats();
    assert.strictEqual(stats.counters.requests, 2);
    assert.strictEqual(stats.timings.render.count, 2);
    assert.strictEqual(stats.timings.render.avg, 20);
    assert.strictEqual(stats.timings.render.p50, 30);
    metrics.reset();
    assert.deepStrictEqual(metrics.getStats(), { counters: {}, timings: {} });
  } finally {
    console.warn = warn;
    api.configure(original);
  }
});

test('healthCheck and resetPools expose stable operational state', () => {
  const health = api.healthCheck();
  assert.strictEqual(health.status, 'ok');
  assert.strictEqual(typeof health.timestamp, 'number');
  assert.strictEqual(typeof health.stats.cache.size, 'number');
  api.resetPools();
  const stats = api.getCacheStats();
  assert.strictEqual(stats.pools.elements, 0);
  assert.strictEqual(stats.pools.arrays, 0);
});

test('textarea shortcut applies attributes', () => {
  const doc = new api.Document();
  doc.textarea({ name: 'notes', rows: 4 }).text('hello');
  const html = doc.render();
  assert(html.includes('<textarea'));
  assert(html.includes('name="notes"'));
  assert(html.includes('rows="4"'));
  assert(html.includes('hello'));
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
