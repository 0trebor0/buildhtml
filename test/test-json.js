'use strict';

const { Document, renderFromJSON } = require('../index');

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

function roundTrip(doc) {
  return new Document().fromJSON(doc.toJSON());
}

/* ---- text nodes ---- */
test('text node round-trip: plain text', () => {
  const doc = new Document();
  doc.create('div').text('Hello World');
  const html = roundTrip(doc).render();
  assert(html.includes('<div>Hello World</div>'), 'plain text preserved');
});

test('text node round-trip: special chars escaped', () => {
  const doc = new Document();
  doc.create('p').text('Some & <escaped> "text"');
  const html = roundTrip(doc).render();
  assert(html.includes('&amp;'), 'ampersand escaped');
  assert(html.includes('&lt;escaped&gt;'), 'angle brackets escaped');
});

test('text node round-trip: multiple text nodes on one element', () => {
  const doc = new Document();
  const p = doc.create('p');
  p.text('First ');
  p.child('strong').text('bold');
  p.text(' last');
  const html = roundTrip(doc).render();
  assert(html.includes('<strong>bold</strong>'), 'child element preserved');
  assert(html.includes('First '), 'text before child preserved');
  assert(html.includes(' last'), 'text after child preserved');
});

test('text node round-trip: does NOT create empty div for text nodes', () => {
  const doc = new Document();
  doc.create('p').text('just text');
  const html = roundTrip(doc).render();
  assert(!html.includes('<div></div>'), 'no phantom empty div');
  assert(html.includes('<p>just text</p>'), 'paragraph preserved');
});

/* ---- nested elements ---- */
test('nested element round-trip', () => {
  const doc = new Document();
  const div = doc.create('div').addClass('container');
  div.child('h1').text('Title');
  div.child('p').text('Body');
  const html = roundTrip(doc).render();
  assert(html.includes('<h1>Title</h1>'), 'h1 preserved');
  assert(html.includes('<p>Body</p>'), 'p preserved');
  assert(html.includes('class="container"'), 'class preserved');
});

test('deep nesting round-trip', () => {
  const doc = new Document();
  const ul = doc.create('ul');
  ul.child('li').text('One');
  ul.child('li').text('Two');
  ul.child('li').child('strong').text('Three');
  const html = roundTrip(doc).render();
  assert(html.includes('<li>One</li>'), 'li One preserved');
  assert(html.includes('<li>Two</li>'), 'li Two preserved');
  assert(html.includes('<strong>Three</strong>'), 'nested strong preserved');
});

/* ---- attributes ---- */
test('attrs round-trip', () => {
  const doc = new Document();
  doc.create('a').attr('href', '/page').attr('target', '_blank').text('link');
  const html = roundTrip(doc).render();
  assert(html.includes('href="/page"'), 'href preserved');
  assert(html.includes('target="_blank"'), 'target preserved');
});

test('id round-trip', () => {
  const doc = new Document();
  doc.create('div').id('myDiv').text('content');
  const html = roundTrip(doc).render();
  assert(html.includes('id="myDiv"'), 'id preserved');
});

test('data-* and aria-* attrs round-trip', () => {
  const doc = new Document();
  doc.create('div')
    .data({ userId: '42' })
    .aria({ label: 'Close' });
  const html = roundTrip(doc).render();
  assert(html.includes('data-user-id="42"'), 'data attr preserved');
  assert(html.includes('aria-label="Close"'), 'aria attr preserved');
});

/* ---- CSS & classes ---- */
test('class round-trip', () => {
  const doc = new Document();
  doc.create('div').addClass('btn', 'btn-primary');
  const html = roundTrip(doc).render();
  assert(html.includes('btn'), 'class btn preserved');
  assert(html.includes('btn-primary'), 'class btn-primary preserved');
});

test('scoped CSS round-trip', () => {
  const doc = new Document();
  doc.create('div').css({ color: 'red', fontSize: '14px' }).text('styled');
  const html = roundTrip(doc).render();
  assert(html.includes('color:red'), 'CSS color preserved');
  assert(html.includes('font-size:14px'), 'CSS font-size preserved');
});

/* ---- events ---- */
test('event handler round-trip', () => {
  const doc = new Document();
  doc.states({ n: 0 });
  doc.create('button').text('Go').onClick(function() { State.n++; });
  const html = roundTrip(doc).render();
  assert(html.includes('addEventListener'), 'event listener compiled after round-trip');
  assert(html.includes('"click"'), 'click event after round-trip');
  assert(html.includes('State.n++'), 'handler body after round-trip');
});

test('event and binding callback contexts survive round-trip', () => {
  const doc = new Document();
  doc.states({ view: 'home' });
  doc.button('Open').onClick(function (event, state, element, context) {
    state.view = context.page;
  }, { page: 'account' });
  doc.section('Home').bindShow('view', function (value, state, context) {
    return value === context.page;
  }, { page: 'home' });

  const restored = new Document().fromJSON(doc.toJSON());
  const html = restored.render();
  assert(html.includes('{"page":"account"}'), 'event context preserved');
  assert(html.includes('{"page":"home"}'), 'binding context preserved');
});

/* ---- state bindings ---- */
test('bind() round-trip', () => {
  const doc = new Document();
  doc.states({ count: 0 });
  doc.create('span').bind('count', (val) => `Count: ${val}`);
  const html = roundTrip(doc).render();
  assert(html.includes('"count"'), 'state key in compiled script after round-trip');
  assert(html.includes('watchState'), 'watchState in compiled script after round-trip');
});

/* ---- multiple root elements ---- */
test('multiple root elements round-trip', () => {
  const doc = new Document();
  doc.create('header').text('Top');
  doc.create('main').text('Middle');
  doc.create('footer').text('Bottom');
  const html = roundTrip(doc).render();
  assert(html.includes('<header>Top</header>'), 'header preserved');
  assert(html.includes('<main>Middle</main>'), 'main preserved');
  assert(html.includes('<footer>Bottom</footer>'), 'footer preserved');
});

/* ---- toJSON structure ---- */
test('toJSON returns object with version and body fields', () => {
  const doc = new Document();
  doc.create('div').text('hello');
  const json = doc.toJSON();
  assert(json && typeof json === 'object' && !Array.isArray(json), 'toJSON returns object');
  assert(json.version === '2.0', 'version field present');
  assert(Array.isArray(json.body), 'body is an array');
  assert(json.body.length >= 1, 'body has at least one node');
});

test('toJSON text node has type:"text" and content field', () => {
  const doc = new Document();
  const el = doc.create('p');
  el.text('raw text');
  const json = doc.toJSON();
  const pDef = json.body[0];
  // children should contain a text node def
  const textNode = pDef.children && pDef.children.find(c => c.type === 'text');
  assert(textNode !== undefined, 'text node has type:"text"');
  assert(textNode && textNode.content === 'raw text', 'text node content matches');
});

/* ---- fromJSON is idempotent ---- */
test('double round-trip (toJSON → fromJSON → toJSON → fromJSON) is stable', () => {
  const doc = new Document();
  doc.create('section').addClass('main').child('p').text('content');
  const html1 = roundTrip(doc).render();
  // Re-round-trip the already-round-tripped document
  const doc2 = new Document();
  doc2.create('section').addClass('main').child('p').text('content');
  const html2 = roundTrip(roundTrip(doc2)).render();
  assert(html1 === html2, 'double round-trip produces identical output');
});

test('title survives repeated round trips without re-escaping', () => {
  const doc = new Document();
  doc.title('Tom & Jerry <Show>');
  const expected = '<title>Tom &amp; Jerry &lt;Show&gt;</title>';
  assert(doc.render().includes(expected), 'title escaped once when rendered directly');

  const once = roundTrip(doc);
  assert(once.render().includes(expected), 'title unchanged after one round trip');

  const twice = roundTrip(roundTrip(new Document().title('Tom & Jerry <Show>')));
  assert(twice.render().includes(expected), 'title unchanged after two round trips');
});

/* ---- Definition-shape edge cases ---- */

test('a circular node definition is refused instead of exhausting the stack', () => {
  const node = { tag: 'div', children: [] };
  node.children.push(node);
  let html;
  try {
    html = renderFromJSON({ body: [node] });
  } catch (e) {
    assert(false, `renderFromJSON threw instead of recovering: ${e.constructor.name}`);
    return;
  }
  assert(typeof html === 'string' && html.includes('</html>'), 'a complete document is still produced');
});

test('a mutual cycle between two definitions is refused', () => {
  const a = { tag: 'div', children: [] };
  const b = { tag: 'p', children: [a] };
  a.children.push(b);
  let threw = false;
  try { renderFromJSON({ body: [a] }); } catch (e) { threw = true; }
  assert(!threw, 'a two-node cycle is caught the same way');
});

test('the same node used twice as a sibling still builds twice', () => {
  // Cycle detection tracks the current path only, so a shared (acyclic) node is
  // legal and must not be mistaken for a loop.
  const shared = { tag: 'span', text: 'S' };
  const doc = new Document();
  doc.build({ tag: 'div', children: [shared, shared] });
  const html = doc.render();
  assert((html.match(/<span>S<\/span>/g) || []).length === 2, 'both copies render');
});

test('deep-but-finite nesting is not capped', () => {
  // A fixed depth limit would reject trees that render today, so there is none.
  let root = { tag: 'div', children: [] };
  let cursor = root;
  for (let i = 0; i < 1000; i++) {
    const next = { tag: 'div', children: [] };
    cursor.children.push(next);
    cursor = next;
  }
  const doc = new Document();
  doc.build(root);
  assert((doc.render().match(/<div>/g) || []).length === 1001, '1000 levels still render');
});

test('text at document level renders instead of throwing', () => {
  // buildNode() reaches for parentEl.text(), which a Document does not have.
  const cases = [
    ['string', 'hello', 'hello'],
    ['number', 42, '42'],
    ['text node', { type: 'text', content: 'x' }, 'x'],
  ];
  for (const [label, def, expected] of cases) {
    const doc = new Document();
    doc.build(def);
    assert(doc.render().includes(`<body>${expected}</body>`), `build(${label}) renders its text`);
  }
});

test('text at document level is escaped', () => {
  const doc = new Document();
  doc.build('<script>alert(1)</script>');
  const html = doc.render();
  assert(!html.includes('<script>alert(1)'), 'a script payload is not emitted raw');
  assert(html.includes('&lt;script&gt;'), 'it is escaped instead');
});

/* ---- summary ---- */
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(40));
process.exit(failed > 0 ? 1 : 0);
