'use strict';

const { Document, CONFIG, configure } = require('../index');
const vm = require('vm');

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

function runClient(doc, elements = {}, globals = {}, allScripts = false) {
  const html = doc.render();
  const matches = Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g));
  if (!matches.length) throw new Error('compiled client script not found');
  const getElementById = typeof elements === 'function'
    ? elements
    : id => elements[id] || null;

  const context = {
    console,
    ...globals,
    document: {
      readyState: 'complete',
      body: {},
      getElementById,
      addEventListener: () => {},
      ...(globals.document || {}),
    },
  };
  context.window = context;
  const scripts = allScripts ? matches : matches.slice(0, 1);
  for (const match of scripts) vm.runInNewContext(match[1], context);
  return context;
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

/* ---- deep reactive state ---- */
test('nested object mutation updates bindings for the root state key', () => {
  const doc = new Document();
  doc.states({ profile: { name: 'Ada', address: { city: 'London' } } });
  const output = doc.span().bind('profile', profile => profile.name + ' — ' + profile.address.city);
  const outputId = output.attrs.id;
  const element = { textContent: '' };
  const context = runClient(doc, { [outputId]: element });

  assert(element.textContent === 'Ada — London', 'nested binding receives initial state');
  context.State.profile.name = 'Grace';
  assert(element.textContent === 'Grace — London', 'nested property set updates binding');
  context.State.profile.address.city = 'New York';
  assert(element.textContent === 'Grace — New York', 'deep property set updates binding');
});

test('development client runtime reports binding failures with context', () => {
  const doc = new Document();
  doc.states({ count: 1 });
  doc.div().bind('count', () => missingBrowserVariable);
  const html = doc.render();
  assert(html.includes('reportClientError({type:"binding:text"'), 'binding failure reporter compiled');
  assert(html.includes('stateKey:"count"'), 'binding state key included in error context');
});

test('client reporter covers computed, lifecycle, oncreate, and liveList failures', () => {
  const doc = new Document();
  doc.states({ items: [{ label: 'one' }] });
  doc.span().computed(() => 'ok');
  doc.div().onMount(function () {});
  doc.oncreate(function () {});
  doc.liveList('items', item => ({ tag: 'span', text: item.label }));
  const html = doc.render();
  for (const type of ['computed', 'lifecycle:mount', 'oncreate', 'liveList:item']) {
    assert(html.includes(`type:"${type}"`) || html.includes(`_report("${type}"`), `${type} reporter compiled`);
  }
  assert(html.includes('window.BuildHTML._reportClientError=reportClientError'), 'shared browser error reporter exposed');
});

test('showWhen and classWhen serialize comparison values without closures', () => {
  const doc = new Document();
  doc.states({ view: 'overview' });
  doc.section('Overview').showWhen('view', 'overview');
  doc.button('Overview').addClass('nav').classWhen('view', 'overview', 'active');
  const html = doc.render();
  assert(html.includes('Object.is(value,"overview")'), 'showWhen embeds its comparison value');
  assert(html.includes('classList.toggle("active",Object.is(val,"overview"))'), 'classWhen toggles only the requested class');
});

test('setStateOnClick safely serializes state keys and values', () => {
  const doc = new Document();
  doc.states({ view: 'overview' });
  doc.button('Projects').setStateOnClick('view', 'projects');
  const html = doc.render();
  assert(html.includes('State["view"]="projects"'), 'state key and value are embedded in the click handler');
});

test('nested arrays notify root watchers for mutating methods', () => {
  const doc = new Document();
  doc.states({ board: { tasks: [{ title: 'One' }] } });
  const context = runClient(doc);
  let notifications = 0;
  let latestLength = 0;
  context.watchState('board', board => {
    notifications++;
    latestLength = board.tasks.length;
  });

  context.State.board.tasks.push({ title: 'Two' });
  assert(notifications > 0, 'array push notifies the root watcher');
  assert(latestLength === 2, 'watcher receives the updated root object');

  const beforeSplice = notifications;
  context.State.board.tasks.splice(0, 1);
  assert(notifications > beforeSplice, 'array splice notifies the root watcher');
  assert(context.State.board.tasks[0].title === 'Two', 'array mutation is retained');
});

test('deep proxies preserve identity and ignore unchanged assignments', () => {
  const doc = new Document();
  doc.states({ profile: { address: { city: 'London' } } });
  const context = runClient(doc);
  const profile = context.State.profile;
  const address = context.State.profile.address;
  let notifications = 0;
  context.watchState('profile', () => { notifications++; });

  assert(profile === context.State.profile, 'root proxy identity is stable');
  assert(address === context.State.profile.address, 'nested proxy identity is stable');
  context.State.profile = profile;
  context.State.profile.address = address;
  context.State.profile.address.city = 'London';
  assert(notifications === 0, 'assigning unchanged raw or proxied values does not notify');
});

test('nested and root deletion notify watchers', () => {
  const doc = new Document();
  doc.states({ settings: { theme: 'dark', compact: true } });
  const context = runClient(doc);
  const values = [];
  context.watchState('settings', value => { values.push(value); });

  delete context.State.settings.compact;
  assert(values.length === 1, 'nested deletion notifies root watcher');
  assert(!('compact' in values[0]), 'deleted nested property is absent');

  delete context.State.settings;
  assert(values.length === 2, 'root deletion notifies root watcher');
  assert(values[1] === undefined, 'root deletion supplies undefined');
});

test('replaced root objects remain deeply reactive', () => {
  const doc = new Document();
  doc.states({ user: { name: 'Ada' } });
  const context = runClient(doc);
  const names = [];
  context.watchState('user', user => { names.push(user.name); });

  context.State.user = { name: 'Grace', details: { role: 'admin' } };
  context.State.user.details.role = 'editor';
  assert(names[0] === 'Grace', 'root replacement notifies with replacement object');
  assert(names.length === 2, 'nested mutation on replacement remains reactive');
  assert(context.State.user.details.role === 'editor', 'replacement mutation is retained');
});

test('prototype-named root state remains isolated and reactive', () => {
  const doc = new Document();
  doc.state('__proto__', { value: 1 });
  const context = runClient(doc);
  let latest = 0;
  context.watchState('__proto__', value => { latest = value.value; });

  context.State.__proto__.value = 2;
  assert(latest === 2, '__proto__ state key notifies its watcher');
  assert(Object.getPrototypeOf(doc._globalState) === null, 'server state registry has no mutable prototype');
  assert(Object.prototype.value === undefined, 'global object prototype is not polluted');
});

/* ---- watcher lifecycle and cleanup ---- */
test('watchState returns an idempotent unsubscribe function', () => {
  const doc = new Document();
  doc.states({ count: 0 });
  const context = runClient(doc);
  let firstCalls = 0;
  let secondCalls = 0;
  let stopFirst;
  stopFirst = context.watchState('count', () => {
    firstCalls++;
    stopFirst();
  });
  const stopSecond = context.watchState('count', () => { secondCalls++; });

  context.State.count = 1;
  context.State.count = 2;
  stopFirst();
  stopSecond();
  stopSecond();
  context.State.count = 3;

  assert(firstCalls === 1, 'watcher can unsubscribe during notification');
  assert(secondCalls === 2, 'other watchers retain stable notification order');
});

test('removed binding targets are disposed by MutationObserver', () => {
  const doc = new Document();
  doc.states({ count: 0 });
  const output = doc.span().bind('count', value => String(value));
  const outputId = output.attrs.id;
  const element = { textContent: '' };
  let currentElement = element;
  let lookups = 0;
  let observer = null;

  class TestMutationObserver {
    constructor(callback) { this.callback = callback; observer = this; }
    observe() {}
    disconnect() {}
  }

  const context = runClient(
    doc,
    id => {
      if (id !== outputId) return null;
      lookups++;
      return currentElement;
    },
    { MutationObserver: TestMutationObserver }
  );

  assert(element.textContent === '0', 'binding initializes before cleanup');
  currentElement = null;
  observer.callback();
  const lookupsAfterCleanup = lookups;
  context.State.count = 1;

  assert(lookups === lookupsAfterCleanup, 'disposed binding is not queried on later state changes');
});

test('missing targets self-dispose without MutationObserver', () => {
  const doc = new Document();
  doc.states({ count: 0 });
  const output = doc.span().bind('count', value => String(value));
  const outputId = output.attrs.id;
  let currentElement = { textContent: '' };
  let lookups = 0;
  const context = runClient(doc, id => {
    if (id !== outputId) return null;
    lookups++;
    return currentElement;
  });

  currentElement = null;
  context.State.count = 1;
  const lookupsAfterCleanup = lookups;
  context.State.count = 2;

  assert(lookups === lookupsAfterCleanup, 'fallback cleanup stops later target queries');
});

test('removed liveList containers dispose every state watcher', () => {
  const doc = new Document();
  doc.states({ items: [], view: 'all' });
  const list = doc.liveList('items', item => ({ tag: 'span', text: item }), {
    filter: () => true,
    filterKeys: ['view'],
  });
  const listId = list.attrs.id;
  const container = {
    firstChild: null,
    removeChild: () => {},
    appendChild: () => {},
  };
  let currentContainer = container;
  let lookups = 0;
  let observer = null;

  class TestMutationObserver {
    constructor(callback) { this.callback = callback; observer = this; }
    observe() {}
    disconnect() {}
  }

  const context = runClient(
    doc,
    id => {
      if (id !== listId) return null;
      lookups++;
      return currentContainer;
    },
    {
      MutationObserver: TestMutationObserver,
      document: {
        createElement: () => ({}),
        createTextNode: value => ({ textContent: value }),
      },
    },
    true
  );

  currentContainer = null;
  observer.callback();
  const lookupsAfterCleanup = lookups;
  context.State.items.push('new');
  context.State.view = 'done';

  assert(lookups === lookupsAfterCleanup, 'all liveList watchers stop after container removal');
});

/* ---- element lifecycle ---- */
test('element lifecycle runs mount, update, cleanup, and destroy in order', () => {
  const doc = new Document();
  doc.states({ profile: { name: 'Ada' }, other: 1 });
  const elementDef = doc.div()
    .onMount(function (state) {
      this.order.push('mount-1');
      this.mountedWith = state.profile.name;
      return function () { this.order.push('cleanup-1'); };
    })
    .onMount(function () {
      this.order.push('mount-2');
      return function () { this.order.push('cleanup-2'); };
    })
    .onUpdate('profile', function (profile, state) {
      this.order.push('update-' + profile.name);
      this.otherValue = state.other;
    })
    .onDestroy(function () { this.order.push('destroy-1'); })
    .onDestroy(function () { this.order.push('destroy-2'); });
  const elementId = elementDef.attrs.id;
  const element = { order: [] };
  let currentElement = element;
  let observer = null;

  class TestMutationObserver {
    constructor(callback) { this.callback = callback; observer = this; }
    observe() {}
    disconnect() {}
  }

  const context = runClient(
    doc,
    id => id === elementId ? currentElement : null,
    { MutationObserver: TestMutationObserver }
  );

  assert(element.mountedWith === 'Ada', 'mount receives complete State and DOM this');
  assert(element.order.join(',') === 'mount-1,mount-2', 'mount hooks run once in registration order');

  context.State.profile.name = 'Grace';
  assert(element.otherValue === 1, 'update receives changed value and complete State');
  assert(element.order[2] === 'update-Grace', 'update runs only after state changes');

  currentElement = null;
  observer.callback();
  assert(
    element.order.join(',') === 'mount-1,mount-2,update-Grace,cleanup-2,cleanup-1,destroy-1,destroy-2',
    'mount cleanups run in reverse order before destroy hooks'
  );

  context.State.profile.name = 'Ignored';
  observer.callback();
  assert(element.order.length === 7, 'destroy and update hooks do not run again');
});

test('onUpdate self-disposes when its element disappears without MutationObserver', () => {
  const doc = new Document();
  doc.states({ count: 0 });
  const elementDef = doc.div().onUpdate('count', function (count) { this.count = count; });
  const elementId = elementDef.attrs.id;
  const element = {};
  let currentElement = element;
  let lookups = 0;
  const context = runClient(doc, id => {
    if (id !== elementId) return null;
    lookups++;
    return currentElement;
  });

  currentElement = null;
  context.State.count = 1;
  const lookupsAfterCleanup = lookups;
  context.State.count = 2;

  assert(lookups === lookupsAfterCleanup, 'missing lifecycle target removes update watcher');
});

test('clone and JSON round-trip preserve lifecycle hooks', () => {
  const doc = new Document();
  const original = doc.div().onMount(function () { this.lifecycleMarker = 'mounted'; });
  const clone = original.clone();
  doc.body.push(clone);
  const cloneId = clone.attrs.id;

  assert(clone._lifecycle.length === 1, 'clone preserves lifecycle hook');
  assert(clone._lifecycle[0].id === cloneId, 'cloned lifecycle hook uses cloned element id');

  const json = doc.toJSON();
  const restored = new Document().fromJSON(json);
  const html = restored.render();
  assert(html.includes("this.lifecycleMarker = 'mounted'"), 'JSON round-trip preserves lifecycle source');
});

test('lifecycle hooks use event sanitizer and pooled elements reset hooks', () => {
  const doc = new Document();
  const unsafe = doc.div().onMount(function () { this.innerHTML = '<b>unsafe</b>'; });
  assert(unsafe._lifecycle.length === 0, 'unsafe lifecycle hook is rejected');

  const marker = 'uniqueLifecyclePoolMarker';
  doc.div().onMount(function () { this.uniqueLifecyclePoolMarker = true; });
  doc.render();

  const next = new Document();
  next.div().text('clean');
  const html = next.render();
  assert(!html.includes(marker), 'pooled element does not retain lifecycle hooks');
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

test('liveList sorting and empty states match the initial server state', () => {
  const { compileLiveList } = require('../lib/live');
  const sorted = new Document();
  sorted.states({ items: [{ name: 'Zulu' }, { name: 'Alpha' }], direction: 'asc' });
  compileLiveList(sorted, sorted, 'items', item => ({ tag: 'p', text: item.name }), {
    sort: (a, b, state) => state.direction === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
    sortKeys: ['direction'],
    empty: { tag: 'p', text: 'Nothing here', attrs: { role: 'status' } },
  });
  const sortedHtml = sorted.render();
  assert(sortedHtml.indexOf('<p>Alpha</p>') < sortedHtml.indexOf('<p>Zulu</p>'), 'SSR uses the configured ordering');
  assert(!sortedHtml.includes('<p role="status">Nothing here</p>'), 'empty state is omitted from SSR when items render');

  const empty = new Document();
  empty.states({ items: [], direction: 'asc' });
  compileLiveList(empty, empty, 'items', item => ({ tag: 'p', text: item.name }), {
    sort: (a, b) => a.name.localeCompare(b.name),
    empty: { tag: 'p', text: 'Nothing here', attrs: { role: 'status' } },
  });
  assert(empty.render().includes('<p role="status">Nothing here</p>'), 'SSR renders the declarative empty state');
});

/* ---- clear() resets inline script state ---- */
test('clear() resets inline scripts, live compilation, callbacks, and router diagnostics', () => {
  const { compileLiveList } = require('../lib/live');
  const doc = new Document();
  doc.states({ items: ['a'] });
  compileLiveList(doc, doc, 'items', i => ({ tag: 'li', text: i }));
  doc.oncreate(function() { console.log('ready'); });
  doc.historyRouter({ base: '/app' });
  assert(doc._inlineScripts.length > 0, 'inlineScripts populated before clear');
  assert(doc._mkElDefined === true, '_mkElDefined true before clear');
  assert(doc._oncreateCallbacks.length > 0, 'oncreateCallbacks populated before clear');
  assert(doc._callbackSources.length > 0, 'callback diagnostics populated before clear');
  assert(doc._historyRouter.base === '/app', 'history router diagnostics populated before clear');
  doc.clear();
  assert(doc._inlineScripts.length === 0, 'inlineScripts cleared');
  assert(doc._mkElDefined === false, '_mkElDefined reset to false');
  assert(doc._oncreateCallbacks.length === 0, 'oncreateCallbacks cleared');
  assert(doc._callbackSources.length === 0, 'callback diagnostics cleared');
  assert(doc._historyRouter === null, 'history router diagnostics cleared');
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

test('bindAttr rejects inline event attributes', () => {
  const doc = new Document();
  const el = doc.div();
  el.bindAttr('payload', 'onclick', value => value);
  assert(el._stateBindings.length === 0, 'onclick binding not registered');
  const html = doc.render();
  assert(!html.includes('setAttribute("onclick"'), 'onclick setter not compiled');
});

test('bindAttr sanitizes reactive URL values', () => {
  const doc = new Document();
  doc.states({ link: 'javascript:alert(1)' });
  doc.a('/safe', 'link').bindAttr('link', 'href', value => value);
  const html = doc.render();
  assert(html.includes('javascript|vbscript|data'), 'URL protocol guard compiled');

  // The guard is asserted by RUNNING it, not by matching its source text. The
  // previous version of this test compared against the literal `?'#':_u`, which
  // passed for a guard that stripped only part of the C0 range — so it went on
  // passing while "java\tscript:" sailed through, because the browser's URL
  // parser removes the tab that the guard had left in place.
  const guard = /_v=\(function\(v\)\{([\s\S]*?)\}\)\(_v\);/.exec(html);
  assert(guard, 'reactive URL guard compiled as a callable body');
  const sanitize = new Function('v', guard[1]);

  const hostile = [
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)', 'java\nscript:alert(1)', 'java\rscript:alert(1)',
    'java\t\n\rscript:alert(1)', 'v\tbscript:alert(1)', 'da\nta:text/html,<b>',
    '\x00javascript:alert(1)', '  javascript:alert(1)',
  ];
  for (const url of hostile) {
    assert(sanitize(url) === '#', `reactive guard blocks ${JSON.stringify(url)}`);
  }

  const legitimate = ['/relative/path', 'https://example.test/a?b=c', '#fragment', 'mailto:a@b.test', '?q=javascript:x'];
  for (const url of legitimate) {
    assert(sanitize(url) === url, `reactive guard preserves ${JSON.stringify(url)}`);
  }
});

test('the liveList client runtime sanitizes URLs the same way the server does', () => {
  const { sanitizeUrl } = require('../lib/utils');
  const doc = new Document();
  doc.states({ items: [{ u: '/ok' }] });
  doc.liveList('items', (item) => ({ tag: 'a', attrs: { href: item.u }, text: 'x' }));
  const html = doc.render();

  const uv = /function uv\(v\)\{([\s\S]*?)\}function /.exec(html);
  assert(uv, '_mkEl URL sanitizer compiled');
  const clientSanitize = new Function('v', uv[1]);

  // Parity is the point: the two implementations used to be separate hand-copied
  // regex literals and drifted, so they are compared directly here.
  const cases = [
    'javascript:alert(1)', 'java\tscript:alert(1)', 'java\nscript:alert(1)',
    'java\rscript:alert(1)', 'v\tbscript:alert(1)', 'da\nta:text/html,<b>',
    '/relative', 'https://example.test', '#frag', 'mailto:a@b.test',
  ];
  for (const url of cases) {
    assert(clientSanitize(url) === sanitizeUrl(url),
      `client and server agree on ${JSON.stringify(url)} (client ${JSON.stringify(clientSanitize(url))}, server ${JSON.stringify(sanitizeUrl(url))})`);
  }
});

test('bindInput safely embeds a hostile state key', () => {
  const doc = new Document();
  doc.states({ safe: '' });
  doc.input('text').bindInput('</script><script>alert(1)</script>');
  const html = doc.render();
  assert(!html.includes('</script><script>alert(1)</script>'), 'state key cannot close compiled script');
  assert(html.includes('\\u003c/script>'), 'hostile state key JSON-escaped');
});

test('debug mode compiles an inspectable browser registry only in development', () => {
  const original = { ...CONFIG };
  try {
    configure({ mode: 'dev', debug: true });
    const doc = new Document();
    doc.states({ count: 0 });
    doc.span().id('count-output').bind('count', value => String(value));
    doc.button('Increment').id('increment').onClick(function () { State.count += 1; });
    const html = doc.render();
    assert(html.includes('window.BuildHTMLDebug={inspect:'), 'development debug inspector compiled');
    assert(html.includes('"stateKeys":["count"]'), 'debug state registry compiled');
    assert(html.includes('"stateKey":"count","elementId":"count-output"'), 'debug binding registry compiled');
    assert(html.includes('"type":"click","elementId":"increment"'), 'debug event registry compiled');
    assert(html.includes('"callbackSources"'), 'serialized callback sources compiled');
    assert(html.includes('"registrationErrors"'), 'registration diagnostics compiled');
    assert(html.includes('hydrationMs'), 'debug hydration timing compiled');

    const elements = {
      'count-output': { tagName: 'SPAN', style: {}, textContent: '' },
      increment: { tagName: 'BUTTON', style: {}, addEventListener() {} },
    };
    const runtimeDoc = (() => {
      const runtimeDoc = new Document();
      runtimeDoc.states({ count: 0 });
      runtimeDoc.span().id('count-output').bind('count', value => String(value));
      runtimeDoc.button('Increment').id('increment').onClick(function () { State.count += 1; });
      const originalError = console.error;
      try {
        console.error = () => {};
        runtimeDoc.button('Unsafe').id('unsafe').onClick(function () { eval('alert(1)'); });
      } finally {
        console.error = originalError;
      }
      return runtimeDoc;
    })();
    const browser = runClient(runtimeDoc, elements);
    const snapshot = browser.BuildHTMLDebug.inspect();
    assert(snapshot.callbackSources.some(item => item.type === 'binding:text' && item.source.includes('String(value)')), 'inspector exposes binding source');
    assert(snapshot.callbackSources.some(item => item.type === 'event:click' && item.source.includes('State.count')), 'inspector exposes event source');
    assert(snapshot.registrationErrors.some(item => item.callbackType === 'event:click' && item.id === 'unsafe'), 'inspector exposes rejected callback registration');
    snapshot.stateKeys.push('mutated');
    snapshot.callbackSources[0].source = 'mutated';
    snapshot.registrationErrors[0].reason = 'mutated';
    assert(browser.BuildHTMLDebug.inspect().stateKeys.length === 1, 'inspect returns a defensive snapshot');
    assert(browser.BuildHTMLDebug.inspect().callbackSources[0].source !== 'mutated', 'callback sources are defensive snapshots');
    assert(browser.BuildHTMLDebug.inspect().registrationErrors[0].reason !== 'mutated', 'registration errors are defensive snapshots');
    assert(typeof snapshot.hydrationMs === 'number' && snapshot.hydrationMs >= 0, 'inspector runs after hydration');

    const errorOnly = new Document();
    const originalError = console.error;
    try {
      console.error = () => {};
      errorOnly.button('Unsafe only').id('unsafe-only').onClick(function () { eval('alert(1)'); });
    } finally {
      console.error = originalError;
    }
    const errorOnlyHtml = errorOnly.render();
    assert(errorOnlyHtml.includes('BuildHTMLDebug'), 'registration failure alone emits the debug inspector');
    assert(errorOnlyHtml.includes('unsafe-only'), 'error-only inspector includes element context');

    configure({ mode: 'prod', debug: true });
    const production = new Document();
    production.states({ count: 0 });
    production.span().bind('count', value => value);
    assert(!production.render().includes('BuildHTMLDebug'), 'production output omits debug inspector');
  } finally {
    configure(original);
  }
});

/* ---- summary ---- */
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
