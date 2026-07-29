'use strict';

const { Document, components } = require('../index');
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

/* ---- Basic rendering ---- */
test('Basic element creation', () => {
  const doc = new Document();
  doc.title('Test');
  doc.create('h1').text('Hello').addClass('title');
  doc.create('p').text('World');
  const html = doc.render();
  assert(html.includes('<h1 class="title">Hello</h1>'), 'h1 rendered');
  assert(html.includes('<p>World</p>'), 'p rendered');
  assert(html.includes('<title>Test</title>'), 'title set');
});

/* ---- Tag shortcuts ---- */
test('Tag shortcut methods', () => {
  const doc = new Document();
  doc.div().text('div');
  doc.p('paragraph');
  doc.a('https://example.com', 'link');
  doc.button('click');
  doc.img('/photo.jpg', 'alt text');
  doc.input('email', { placeholder: 'you@example.com' });
  const html = doc.render();
  assert(html.includes('<div>div</div>'), 'div()');
  assert(html.includes('<p>paragraph</p>'), 'p()');
  assert(html.includes('href="https://example.com"'), 'a()');
  assert(html.includes('<button>click</button>'), 'button()');
  assert(html.includes('src="/photo.jpg"'), 'img()');
  assert(html.includes('type="email"'), 'input()');
});

/* ---- Attribute helpers ---- */
test('setAttrs, data, aria', () => {
  const doc = new Document();
  const el = doc.create('div')
    .setAttrs({ role: 'dialog', tabindex: 0 })
    .data({ userId: '42', role: 'admin' })
    .aria({ label: 'Close', expanded: 'false' });
  const html = doc.render();
  assert(html.includes('role="dialog"'), 'setAttrs');
  assert(html.includes('data-user-id="42"'), 'data()');
  assert(html.includes('aria-label="Close"'), 'aria()');
});

/* ---- CSS & Classes ---- */
test('addClass, classIf, classMap', () => {
  const doc = new Document();
  const el = doc.create('div')
    .addClass('btn', 'btn-primary')
    .classIf(true, 'active')
    .classIf(false, 'hidden', 'visible')
    .classMap({ bold: true, italic: false, underline: true });
  const html = doc.render();
  assert(html.includes('btn'), 'addClass');
  assert(html.includes('active'), 'classIf true');
  assert(html.includes('visible'), 'classIf false branch');
  assert(html.includes('bold'), 'classMap true');
  assert(!html.includes('italic'), 'classMap false excluded');
  assert(html.includes('underline'), 'classMap true 2');
});

/* ---- Inline CSS ---- */
test('Scoped CSS', () => {
  const doc = new Document();
  doc.create('div').css({ color: 'red', fontSize: '14px' }).text('styled');
  const html = doc.render();
  assert(html.includes('color:red'), 'CSS value');
  assert(html.includes('font-size:14px'), 'kebab conversion');
});

/* ---- Component system ---- */
test('Component registration and usage', () => {
  function Card(el, { title, body }) {
    el.addClass('card');
    el.child('h2').text(title);
    el.child('p').text(body);
  }

  components.register('Card', Card);
  assert(components.has('Card'), 'registered');

  const doc = new Document();
  doc.component('Card', { title: 'Hello', body: 'World' });
  const html = doc.render();
  assert(html.includes('class="card"'), 'component class');
  assert(html.includes('<h2>Hello</h2>'), 'component title');
  assert(html.includes('<p>World</p>'), 'component body');

  components.unregister('Card');
});

/* ---- doc.use() (inline component) ---- */
test('Inline component with doc.use()', () => {
  function Alert(el, { message, type }) {
    el.addClass('alert', `alert-${type}`);
    el.child('span').text(message);
  }

  const doc = new Document();
  doc.use(Alert, { message: 'Warning!', type: 'danger' });
  const html = doc.render();
  assert(html.includes('alert-danger'), 'inline component class');
  assert(html.includes('Warning!'), 'inline component content');
});

/* ---- Declarative builder ---- */
test('doc.build() declarative API', () => {
  const doc = new Document();
  doc.build({
    tag: 'div', class: 'container', children: [
      { tag: 'h1', text: 'Title', class: 'heading' },
      { tag: 'p', text: 'Paragraph', css: { color: 'blue' } },
      { tag: 'ul', children: [
        { tag: 'li', text: 'One' },
        { tag: 'li', text: 'Two' },
        { tag: 'li', text: 'Three' },
      ]}
    ]
  });
  const html = doc.render();
  assert(html.includes('class="container"'), 'root class');
  assert(html.includes('<h1 class="heading">Title</h1>'), 'child h1');
  assert(html.includes('color:blue'), 'child css');
  assert(html.includes('<li>One</li>'), 'nested li');
  assert(html.includes('<li>Three</li>'), 'nested li 3');
});

/* ---- Conditional rendering ---- */
test('Conditional rendering in build()', () => {
  const doc = new Document();
  doc.build({
    tag: 'div', children: [
      { tag: 'p', text: 'Visible', if: true },
      { tag: 'p', text: 'Hidden', if: false },
    ]
  });
  const html = doc.render();
  assert(html.includes('Visible'), 'if: true rendered');
  assert(!html.includes('Hidden'), 'if: false skipped');
});

/* ---- Iteration ---- */
test('Iteration with each + itemTemplate', () => {
  const doc = new Document();
  doc.build({
    tag: 'ul', children: [
      {
        each: ['Apple', 'Banana', 'Cherry'],
        itemTemplate: (item, i) => ({ tag: 'li', text: `${i + 1}. ${item}` })
      }
    ]
  });
  const html = doc.render();
  assert(html.includes('1. Apple'), 'item 0');
  assert(html.includes('2. Banana'), 'item 1');
  assert(html.includes('3. Cherry'), 'item 2');
});

/* ---- List helper ---- */
test('doc.list() helper', () => {
  const doc = new Document();
  doc.list(['A', 'B', 'C']);
  const html = doc.render();
  assert(html.includes('<ul>'), 'ul tag');
  assert(html.includes('<li>A</li>'), 'li A');
  assert(html.includes('<li>C</li>'), 'li C');
});

/* ---- Custom list renderer ---- */
test('doc.list() with custom renderer', () => {
  const doc = new Document();
  doc.list(
    [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }],
    (li, user) => { li.text(`${user.name} (${user.age})`); }
  );
  const html = doc.render();
  assert(html.includes('Alice (30)'), 'custom renderer');
});

/* ---- Data table ---- */
test('doc.dataTable()', () => {
  const doc = new Document();
  doc.dataTable(
    ['Name', 'Age'],
    [['Alice', 30], ['Bob', 25]]
  );
  const html = doc.render();
  assert(html.includes('<th>Name</th>'), 'th');
  assert(html.includes('<td>Alice</td>'), 'td');
});

/* ---- Data table from objects ---- */
test('doc.dataTable() with autoHeaders', () => {
  const doc = new Document();
  doc.dataTable(null, [
    { name: 'Alice', age: 30 },
    { name: 'Bob', age: 25 }
  ], { autoHeaders: true });
  const html = doc.render();
  assert(html.includes('<th>name</th>'), 'auto header');
  assert(html.includes('<td>30</td>'), 'object value');
});

/* ---- Select helper ---- */
test('doc.select()', () => {
  const doc = new Document();
  doc.select([
    { value: 'a', text: 'Option A' },
    { value: 'b', text: 'Option B', selected: true },
  ], { name: 'choice' });
  const html = doc.render();
  assert(html.includes('name="choice"'), 'select name');
  assert(html.includes('value="a"'), 'option value');
  assert(html.includes('selected="selected"'), 'selected attr');
});

/* ---- Global styles ---- */
test('Global styles and reset', () => {
  const doc = new Document();
  doc.resetCss();
  doc.globalStyle('body', { fontFamily: 'sans-serif' });
  doc.sharedClass('btn', { padding: '8px 16px', borderRadius: '4px' });
  doc.create('button').addClass('btn').text('Click');
  const html = doc.render();
  assert(html.includes('box-sizing:border-box'), 'resetCss');
  assert(html.includes('font-family:sans-serif'), 'globalStyle');
  assert(html.includes('.btn{'), 'sharedClass');
});

/* ---- Event shorthand ---- */
test('Event shorthands', () => {
  const doc = new Document();
  doc.create('button').text('Go').onClick(function() { alert('hi'); });
  const html = doc.render();
  assert(html.includes('addEventListener'), 'event listener compiled');
  assert(html.includes('"click"'), 'click event');
});

/* ---- Nested components ---- */
test('Nested components', () => {
  function ListItem(el, { text }) {
    el.addClass('list-item');
    el.child('span').text(text);
  }

  function List(el, { items }) {
    el.addClass('list');
    for (const item of items) {
      const li = el.child('div');
      ListItem(li, { text: item });
    }
  }

  const doc = new Document();
  doc.use(List, { items: ['One', 'Two', 'Three'] });
  const html = doc.render();
  assert(html.includes('class="list"'), 'parent component');
  assert(html.includes('<span>One</span>'), 'nested child 1');
  assert(html.includes('<span>Three</span>'), 'nested child 3');
});

/* ---- Build with components ---- */
test('build() with registered components', () => {
  function Badge(el, { label, color }) {
    el.addClass('badge').css({ backgroundColor: color, padding: '2px 6px', borderRadius: '4px' });
    el.text(label);
  }

  components.register('Badge', Badge, { tag: 'span' });

  const doc = new Document();
  doc.build({
    tag: 'div', children: [
      { component: 'Badge', props: { label: 'New', color: '#0f0' } },
      { component: 'Badge', props: { label: 'Hot', color: '#f00' } },
    ]
  });
  const html = doc.render();
  assert(html.includes('New'), 'badge 1');
  assert(html.includes('Hot'), 'badge 2');
  assert(html.includes('badge'), 'badge class');

  components.unregister('Badge');
});

/* ---- Multiple root builds ---- */
test('build() with array of roots', () => {
  const doc = new Document();
  doc.build([
    { tag: 'header', text: 'Top' },
    { tag: 'main', text: 'Middle' },
    { tag: 'footer', text: 'Bottom' },
  ]);
  const html = doc.render();
  assert(html.includes('<header>Top</header>'), 'header');
  assert(html.includes('<main>Middle</main>'), 'main');
  assert(html.includes('<footer>Bottom</footer>'), 'footer');
});

/* ---- Bug regressions ---- */

test('clone() preserves events', () => {
  const doc = new Document();
  doc.states({ count: 0 });
  const btn = doc.button('+1').onClick(function() { State.count++; });
  const clone = btn.clone();
  const html = doc.render();
  assert(clone.events.length === 1, 'cloned element has 1 event');
  assert(html.includes('State.count++'), 'event compiled into output');
});

test('clone() preserves _stateBindings', () => {
  const doc = new Document();
  doc.states({ label: 'hello' });
  const span = doc.span().bind('label', v => v.toUpperCase());
  const clone = span.clone();
  assert(clone._stateBindings.length === 1, 'cloned element has 1 binding');
  assert(clone._stateBindings[0].stateKey === 'label', 'binding stateKey preserved');
});

test('clone() preserves _computed', () => {
  const doc = new Document();
  const el = doc.div().id('x').computed(function(state) { return state.v; });
  const clone = el.clone();
  assert(typeof clone._computed === 'string', 'cloned _computed is a string');
  assert(clone._computed.includes('state.v'), 'computed source preserved');
});

test('setAttrs() blocks prototype pollution', () => {
  const doc = new Document();
  const el = doc.div();
  const before = ({}).polluted;
  el.setAttrs({ '__proto__': { polluted: true }, 'class': 'safe' });
  assert(({}).polluted === before, '__proto__ key not assigned to prototype');
  assert(el.attrs['class'] === 'safe', 'safe keys still applied');
});

test('clear() resets _cssVarsRuleIdx', () => {
  const doc = new Document();
  doc.cssVar('--color', 'red');
  const idxBefore = doc._cssVarsRuleIdx;
  doc.clear();
  assert(doc._cssVarsRuleIdx === undefined, '_cssVarsRuleIdx cleared after clear()');
});

test('toJSON/fromJSON round-trip preserves text content', () => {
  const doc = new Document();
  doc.create('div').text('Hello World');
  doc.create('p').text('Some & <escaped> text');
  const doc2 = new Document().fromJSON(doc.toJSON());
  const html = doc2.render();
  assert(html.includes('<div>Hello World</div>'), 'text content round-tripped');
  assert(html.includes('Some &amp; &lt;escaped&gt; text'), 'special chars preserved and escaped');
});

test('toJSON/fromJSON round-trip nested text', () => {
  const doc = new Document();
  const p = doc.create('p');
  p.text('Before ');
  p.child('strong').text('bold');
  p.text(' after');
  const doc2 = new Document().fromJSON(doc.toJSON());
  const html = doc2.render();
  assert(html.includes('<strong>bold</strong>'), 'nested element text preserved');
  assert(html.includes('Before '), 'text before child preserved');
  assert(html.includes(' after'), 'text after child preserved');
});

test('nonce not applied to external script tags', () => {
  const doc = new Document({ nonce: 'abc123' });
  doc.addScript('/app.js');
  const html = doc.render();
  assert(!html.includes('<script nonce='), 'no nonce on external script');
  assert(html.includes('src="/app.js"'), 'src attribute present');
});

/* ---- slot() / fillSlot() ---- */
test('slot() marks element with data-slot attribute', () => {
  const doc = new Document();
  const container = doc.div();
  container.div().slot('header');
  const html = doc.render();
  assert(html.includes('data-slot="header"'), 'data-slot attribute set');
  assert(html.includes('id='), 'slot element gets an id');
});

test('fillSlot() injects content into named slot', () => {
  const doc = new Document();
  function Modal(el) {
    el.addClass('modal');
    el.div().slot('header');
    el.div().slot('body');
  }
  const modal = doc.use(Modal);
  modal.fillSlot('header', (slot) => slot.h2().text('My Title'));
  modal.fillSlot('body', (slot) => slot.p('My Body'));
  const html = doc.render();
  assert(html.includes('class="modal"'), 'modal class rendered');
  assert(html.includes('<h2>My Title</h2>'), 'slot header content rendered');
  assert(html.includes('<p>My Body</p>'), 'slot body content rendered');
});

test('fillSlot() with unknown slot name does nothing', () => {
  const doc = new Document();
  const el = doc.div();
  el.div().slot('known');
  el.fillSlot('unknown', (slot) => slot.p('should not appear'));
  const html = doc.render();
  assert(!html.includes('should not appear'), 'unknown slot produces no output');
});

test('fillSlot() default slot name', () => {
  const doc = new Document();
  const wrapper = doc.div();
  wrapper.div().slot(); // default slot
  wrapper.fillSlot('default', (slot) => slot.span().text('default content'));
  const html = doc.render();
  assert(html.includes('<span>default content</span>'), 'default slot content rendered');
});

/* ---- portal() ---- */
test('portal() sets _portalTarget property', () => {
  const doc = new Document();
  const el = doc.div().text('portaled');
  el.portal('target-container');
  assert(el._portalTarget === 'target-container', '_portalTarget set correctly');
});

test('portal() element still renders at its original position server-side', () => {
  const doc = new Document();
  doc.div().text('portaled content').portal('somewhere-else');
  const html = doc.render();
  assert(html.includes('portaled content'), 'portaled element renders in-place server-side');
});

test('portal() compiles automatic client relocation', () => {
  const doc = new Document();
  doc.div().id('overlay-root');
  const modal = doc.div().text('Modal').portal('overlay-root');
  const sourceId = modal.attrs.id;
  const html = doc.render();
  assert(html.includes(`getById("${sourceId}")`), 'portal source id compiled');
  assert(html.includes('getById("overlay-root")'), 'portal target id compiled');
  assert(html.includes('target.appendChild(el)'), 'portal relocation compiled');
  assert(html.includes('initPortals();'), 'portal initialization runs automatically');
});

test('clone() preserves portal target', () => {
  const doc = new Document();
  const original = doc.div().portal('overlay-root');
  const cloned = original.clone();
  assert(cloned._portalTarget === 'overlay-root', 'cloned portal target preserved');
});

/* ---- Bug regressions: security fixes ---- */

test('sanitizeUrl strips control chars from safe URLs (no phantom control chars in output)', () => {
  const doc = new Document();
  // URL with a null byte — used to bypass naive URL checks
  doc.a('/page\x00extra', 'link');
  const html = doc.render();
  assert(!html.includes('\x00'), 'null byte stripped from href');
  assert(html.includes('href="/pageextra"'), 'cleaned URL in output');
});

test('sanitizeUrl still blocks javascript: with control char prefix', () => {
  const doc = new Document();
  doc.a('java\x00script:alert()', 'xss');
  const html = doc.render();
  assert(!html.includes('javascript:'), 'javascript: blocked');
  assert(html.includes('href="#"'), 'replaced with #');
});

test('hashRouter uses JSON.stringify for stateKey — no JS injection', () => {
  const { compileHashRouter } = require('../lib/live');
  const doc = new Document();
  doc.states({ 'my.key': 'all' });
  compileHashRouter(doc, { stateKey: 'my.key', default: 'all' });
  const html = doc.render();
  // stateKey should be JSON-encoded, not bare — State["my.key"]=h not State.my.key=h
  assert(html.includes('State["my.key"]='), 'stateKey JSON-stringified in hashRouter');
  assert(!html.includes('State.my.key='), 'bare dot-notation stateKey not present');
});

test('hashRouter matches route parameters and handles not-found routes', () => {
  const { compileHashRouter } = require('../lib/live');
  const doc = new Document();
  compileHashRouter(doc, {
    stateKey: 'view',
    paramsKey: 'params',
    default: 'home',
    routes: {
      home: 'home',
      'users/:id': 'user',
    },
    notFound: 'missing',
  });

  const listeners = {};
  const context = {
    State: {},
    location: { hash: '' },
    document: { querySelectorAll: () => [] },
    window: { addEventListener: (event, fn) => { listeners[event] = fn; } },
  };
  vm.runInNewContext(doc._inlineScripts[0], context);

  assert(context.State.view === 'home', 'empty hash matches the configured default route');

  context.location.hash = '#users/alice%20smith';
  listeners.hashchange();
  assert(context.State.view === 'user', 'route pattern maps to configured state value');
  assert(context.State.params.id === 'alice smith', 'named route parameter is decoded');

  context.location.hash = '#unknown/path';
  listeners.hashchange();
  assert(context.State.view === 'missing', 'unmatched route uses configured not-found state');
  assert(Object.keys(context.State.params).length === 0, 'unmatched route clears stale parameters');
});

test('hashRouter wildcard route overrides the default not-found value', () => {
  const { compileHashRouter } = require('../lib/live');
  const doc = new Document();
  compileHashRouter(doc, {
    routes: { all: 'all', '*': '404' },
  });

  const context = {
    State: {},
    location: { hash: '#does-not-exist' },
    document: { querySelectorAll: () => [] },
    window: { addEventListener: () => {} },
  };
  vm.runInNewContext(doc._inlineScripts[0], context);

  assert(context.State.view === '404', 'wildcard route supplies unmatched state value');
});

test('historyRouter handles route parameters, links, base paths, and popstate', () => {
  const { compileHistoryRouter } = require('../index');
  assert(typeof compileHistoryRouter === 'function', 'compileHistoryRouter is exported');

  const doc = new Document();
  doc.historyRouter({
    stateKey: 'view',
    paramsKey: 'params',
    base: '/app',
    routes: {
      '/': 'home',
      '/users/:id': 'user',
      '/about': 'about',
      '*': 'missing',
    },
  });

  const windowListeners = {};
  const documentListeners = {};
  const location = {
    pathname: '/app/users/alice%20smith',
    origin: 'https://example.test',
    href: 'https://example.test/app/users/alice%20smith',
  };
  let pushedUrl = null;
  const context = {
    URL,
    State: {},
    location,
    history: {
      pushState: (_state, _title, url) => {
        pushedUrl = url;
        const parsed = new URL(url, location.href);
        location.pathname = parsed.pathname;
        location.href = parsed.href;
      },
    },
    window: { addEventListener: (event, fn) => { windowListeners[event] = fn; } },
    document: {
      addEventListener: (event, fn) => { documentListeners[event] = fn; },
      querySelectorAll: () => [],
    },
  };
  vm.runInNewContext(doc._inlineScripts[0], context);

  assert(context.State.view === 'user', 'initial history path maps to configured state value');
  assert(context.State.params.id === 'alice smith', 'history route parameter is decoded');

  const anchor = {
    href: 'https://example.test/app/about?from=user',
    target: '',
    hasAttribute: () => false,
  };
  let prevented = false;
  documentListeners.click({
    button: 0,
    target: { closest: () => anchor },
    preventDefault: () => { prevented = true; },
  });

  assert(prevented, 'opted-in same-origin link prevents a full page load');
  assert(pushedUrl === '/app/about?from=user', 'history navigation preserves query strings');
  assert(context.State.view === 'about', 'pushed history path updates router state');

  location.pathname = '/app/';
  location.href = 'https://example.test/app/';
  windowListeners.popstate();
  assert(context.State.view === 'home', 'popstate updates router state');
  assert(Object.keys(context.State.params).length === 0, 'popstate clears stale parameters');
});

test('historyRouter ignores external links and supports raw path state', () => {
  const doc = new Document();
  doc.historyRouter();

  const documentListeners = {};
  const context = {
    URL,
    State: {},
    location: {
      pathname: '/dashboard',
      origin: 'https://example.test',
      href: 'https://example.test/dashboard',
    },
    history: { pushState: () => { throw new Error('external link must not be pushed'); } },
    window: { addEventListener: () => {} },
    document: {
      addEventListener: (event, fn) => { documentListeners[event] = fn; },
      querySelectorAll: () => [],
    },
  };
  vm.runInNewContext(doc._inlineScripts[0], context);

  assert(context.State.view === '/dashboard', 'historyRouter without routes stores the raw path');

  let prevented = false;
  documentListeners.click({
    button: 0,
    target: {
      closest: () => ({
        href: 'https://external.test/page',
        target: '',
        hasAttribute: () => false,
      }),
    },
    preventDefault: () => { prevented = true; },
  });
  assert(!prevented, 'external links retain normal browser navigation');
});

test('nodeDefToHtml filters on* attributes from liveList NodeDef attrs', () => {
  const { compileLiveList, nodeDefToHtml } = require('../lib/live');
  // Test nodeDefToHtml directly — the function that renders SSR HTML
  const ssrHtml = nodeDefToHtml({
    tag: 'div',
    attrs: { onclick: 'alert(1)', 'data-safe': 'ok' },
    text: 'hello',
  });
  assert(!ssrHtml.includes('onclick'), 'onclick blocked in nodeDefToHtml SSR output');
  assert(ssrHtml.includes('data-safe="ok"'), 'safe attrs still pass through');
});

test('nodeDefToHtml renders aria attributes from liveList NodeDef', () => {
  const { compileLiveList } = require('../lib/live');
  const doc = new Document();
  doc.states({ items: [{ label: 'btn' }] });
  compileLiveList(doc, doc, 'items', (item) => ({
    tag: 'button',
    text: item.label,
    aria: { label: 'Close dialog', expanded: 'false' },
  }));
  const html = doc.render();
  assert(html.includes('aria-label="Close dialog"'), 'aria-label rendered in SSR');
  assert(html.includes('aria-expanded="false"'), 'aria-expanded rendered in SSR');
});

test('_mkEl source includes aria attribute support', () => {
  const { MK_EL_SRC } = require('../lib/live');
  assert(MK_EL_SRC.includes('d.aria'), 'aria key handled in _mkEl source');
  assert(MK_EL_SRC.includes('"aria-"'), 'aria- prefix in _mkEl');
});

test('liveList embeds itemFn source via sanitizeFunctionSource (single toString call)', () => {
  const { compileLiveList } = require('../lib/live');
  const doc = new Document();
  doc.states({ items: ['hello'] });
  let toStringCallCount = 0;
  const fn = (item) => ({ tag: 'span', text: item });
  const origToString = fn.toString.bind(fn);
  fn.toString = () => { toStringCallCount++; return origToString(); };
  compileLiveList(doc, doc, 'items', fn);
  doc.render();
  // sanitizeFunctionSource calls toString once; we must not call it again
  assert(toStringCallCount === 1, 'itemFn.toString() called exactly once (inside sanitizeFunctionSource)');
});

test('compiled state cannot break out of its script tag', () => {
  const doc = new Document();
  doc.states({ payload: '</script><script>alert(1)</script>' });
  doc.div().bind('payload', value => value);
  const html = doc.render();
  assert(!html.includes('</script><script>alert(1)</script>'), 'raw closing script sequence escaped');
  assert(html.includes('\\u003c/script>'), 'less-than characters encoded in compiled state');
});

test('htmlAttr and bodyAttr reject event and malformed attribute names', () => {
  const doc = new Document();
  doc.htmlAttr('onclick', 'alert(1)');
  doc.bodyAttr('onload', 'alert(2)');
  doc.bodyAttr('bad\" key', 'value');
  doc.bodyAttr('data-safe', 'ok');
  const html = doc.render();
  assert(!html.includes('onclick='), 'html onclick attribute blocked');
  assert(!html.includes('onload='), 'body onload attribute blocked');
  assert(!html.includes('bad\" key='), 'malformed body attribute blocked');
  assert(html.includes('data-safe="ok"'), 'valid body attribute preserved');
});

test('head URL helpers sanitize executable protocols', () => {
  const doc = new Document();
  doc.addLink('javascript:alert(1)');
  doc.addScript('data:text/javascript,alert(2)');
  doc.canonical('vbscript:msgbox(3)');
  const html = doc.render();
  assert(!html.includes('javascript:alert'), 'stylesheet URL sanitized');
  assert(!html.includes('data:text/javascript'), 'script URL sanitized');
  assert(!html.includes('vbscript:msgbox'), 'canonical URL sanitized');
});

test('liveList filters unsafe attrs and URLs in SSR and client runtime', () => {
  const { MK_EL_SRC, nodeDefToHtml } = require('../lib/live');
  const ssrHtml = nodeDefToHtml({
    tag: 'a',
    attrs: { onclick: 'alert(1)', href: 'java\x00script:alert(2)' },
    text: 'link',
  });
  assert(!ssrHtml.includes('onclick'), 'SSR event attribute blocked');
  assert(ssrHtml.includes('href="#"'), 'SSR executable URL sanitized');
  assert(MK_EL_SRC.includes('!/^on[a-z]/i.test(k)'), 'client runtime blocks event attributes');
  assert(MK_EL_SRC.includes('javascript|vbscript|data'), 'client runtime sanitizes URL protocols');
});

test('async client fetch event handlers compile without inlineScript()', () => {
  const doc = new Document();
  doc.states({ message: '' });
  doc.button('Load').onClick(async function () {
    const response = await fetch('/api/data');
    const data = await response.json();
    State.message = data.message;
  });
  const html = doc.render();
  assert(html.includes('async function'), 'async event handler compiled');
  assert(html.includes("fetch('/api/data')"), 'client fetch call compiled');
  assert(html.includes('await response.json()'), 'await expression preserved');
});

test('async oncreate fetch callbacks compile and initialize', () => {
  const doc = new Document();
  doc.states({ message: '' });
  doc.oncreate(async function () {
    const response = await fetch('/api/data');
    const data = await response.json();
    State.message = data.message;
  });
  const html = doc.render();
  assert(html.includes("fetch('/api/data')"), 'oncreate fetch call compiled');
  assert(html.includes('initOncreate();'), 'async oncreate initialization runs');
});

/* ---- Summary ---- */
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(40));
process.exit(failed > 0 ? 1 : 0);
