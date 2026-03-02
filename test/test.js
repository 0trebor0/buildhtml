'use strict';

const { Document, components } = require('./index');

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
  assert(html.includes('href="https:&#x2F;&#x2F;example.com"'), 'a()');
  assert(html.includes('<button>click</button>'), 'button()');
  assert(html.includes('src="&#x2F;photo.jpg"'), 'img()');
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

/* ---- Summary ---- */
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(40));
process.exit(failed > 0 ? 1 : 0);
