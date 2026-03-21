'use strict';

const { renderTemplate, compileTemplate, parseTemplate, components } = require('../index');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

function test(name, fn) {
  console.log(`\n▸ ${name}`);
  try { fn(); } catch (e) { failed++; console.error(`  ✗ THREW: ${e.message}\n${e.stack}`); }
}

/* ---- Basic Elements ---- */
test('Basic tags', () => {
  const html = renderTemplate(`h1 "Hello World"`);
  assert(html.includes('<h1>Hello World</h1>'), 'h1 with text');
});

test('Nested elements', () => {
  const html = renderTemplate(`div\n  h1 "Title"\n  p "Body"`);
  assert(html.includes('<h1>Title</h1>'), 'nested h1');
  assert(html.includes('<p>Body</p>'), 'nested p');
  assert(html.includes('<div>'), 'parent div');
});

test('Deep nesting', () => {
  const html = renderTemplate(`div\n  section\n    article\n      p "Deep"`);
  assert(html.includes('<div><section><article><p>Deep</p></article></section></div>'), 'deep nesting');
});

/* ---- Selectors ---- */
test('ID selector', () => {
  const html = renderTemplate(`div#main`);
  assert(html.includes('id="main"'), 'id attribute');
});

test('Class selectors', () => {
  const html = renderTemplate(`div.container.dark`);
  assert(html.includes('class="container dark"'), 'multiple classes');
});

test('ID + classes', () => {
  const html = renderTemplate(`div#app.wrapper.theme-dark "Content"`);
  assert(html.includes('id="app"'), 'id');
  assert(html.includes('wrapper'), 'class 1');
  assert(html.includes('theme-dark'), 'class 2');
  assert(html.includes('Content'), 'text');
});

test('Implicit div with class', () => {
  const html = renderTemplate(`.card "Hello"`);
  assert(html.includes('<div'), 'implicit div');
  assert(html.includes('class="card"'), 'class on implicit div');
  assert(html.includes('Hello'), 'text on implicit div');
});

test('Implicit div with id', () => {
  const html = renderTemplate(`#hero`);
  assert(html.includes('<div'), 'implicit div');
  assert(html.includes('id="hero"'), 'id on implicit div');
});

/* ---- Attributes ---- */
test('Attributes in parentheses', () => {
  const html = renderTemplate(`a(href="/about") "About"`);
  assert(html.includes('href="/about"'), 'href attr');
  assert(html.includes('About'), 'link text');
});

test('Multiple attributes', () => {
  const html = renderTemplate(`input(type="email" placeholder="you@example.com")`);
  assert(html.includes('type="email"'), 'type');
  assert(html.includes('placeholder="you@example.com"'), 'placeholder');
});

test('Boolean attribute', () => {
  const html = renderTemplate(`button(disabled) "Save"`);
  assert(html.includes('disabled'), 'disabled');
});

/* ---- CSS ---- */
test('Inline CSS block', () => {
  const html = renderTemplate(`div.card { padding: 16px; border-radius: 8px }\n  p "Content"`);
  assert(html.includes('padding:16px'), 'css padding');
  assert(html.includes('border-radius:8px'), 'css border-radius');
  assert(html.includes('Content'), 'child content');
});

test('CSS lines with braces', () => {
  const tpl = `div.box\n  { color: red }\n  { font-size: 14px }\n  p "Styled"`;
  const html = renderTemplate(tpl);
  assert(html.includes('color:red'), 'css line 1');
  assert(html.includes('font-size:14px'), 'css line 2');
  assert(html.includes('Styled'), 'child after css');
});

/* ---- Text ---- */
test('Pipe text (multiline)', () => {
  const tpl = `p\n  | This is line one\n  | and this is line two`;
  const html = renderTemplate(tpl);
  assert(html.includes('This is line one'), 'pipe line 1');
  assert(html.includes('and this is line two'), 'pipe line 2');
});

test('Raw HTML', () => {
  const tpl = `div\n  ! <strong>Bold</strong>`;
  const html = renderTemplate(tpl);
  assert(html.includes('<strong>Bold</strong>'), 'raw html');
});

/* ---- Interpolation ---- */
test('String interpolation', () => {
  const html = renderTemplate(`h1 "Hello #{name}"`, { name: 'Alice' });
  assert(html.includes('Hello Alice'), 'interpolated name');
});

test('Nested property interpolation', () => {
  const html = renderTemplate(`p "#{user.name} is #{user.age}"`, { user: { name: 'Bob', age: 30 } });
  assert(html.includes('Bob is 30'), 'nested interpolation');
});

/* ---- Head Section ---- */
test('Head section', () => {
  const tpl = `---\ntitle "My Page"\nviewport\nlink "https://cdn.example.com/style.css"\n---\nh1 "Body"`;
  const html = renderTemplate(tpl);
  assert(html.includes('<title>My Page</title>'), 'title');
  assert(html.includes('viewport'), 'viewport meta');
  assert(html.includes('Body'), 'body content');
});

/* ---- Global Styles ---- */
test(':reset directive', () => {
  const tpl = `:reset\ndiv "Content"`;
  const html = renderTemplate(tpl);
  assert(html.includes('box-sizing:border-box'), 'reset css');
});

test(':global style', () => {
  const tpl = `:global body { font-family: sans-serif; margin: 0 }\ndiv "Content"`;
  const html = renderTemplate(tpl);
  assert(html.includes('font-family:sans-serif'), 'global body style');
});

test(':class directive', () => {
  const tpl = `:class btn { padding: 8px 16px; border-radius: 4px }\nbutton.btn "Click"`;
  const html = renderTemplate(tpl);
  assert(html.includes('.btn{'), 'shared class defined');
  assert(html.includes('Click'), 'button text');
});

/* ---- Conditionals ---- */
test('Conditional ?if true', () => {
  const tpl = `?if isAdmin\n  button "Delete"`;
  const html = renderTemplate(tpl, { isAdmin: true });
  assert(html.includes('Delete'), 'true branch rendered');
});

test('Conditional ?if false', () => {
  const tpl = `?if isAdmin\n  button "Delete"`;
  const html = renderTemplate(tpl, { isAdmin: false });
  assert(!html.includes('Delete'), 'false branch hidden');
});

test('Conditional ?if / ?else', () => {
  const tpl = `?if isAdmin\n  button "Delete"\n  ?else\n  span "No access"`;
  const htmlTrue = renderTemplate(tpl, { isAdmin: true });
  assert(htmlTrue.includes('Delete'), 'true branch');
  assert(!htmlTrue.includes('No access'), 'else hidden when true');

  const htmlFalse = renderTemplate(tpl, { isAdmin: false });
  assert(!htmlFalse.includes('Delete'), 'true branch hidden');
  assert(htmlFalse.includes('No access'), 'else branch shown');
});

test('Negated condition', () => {
  const tpl = `?if !isGuest\n  span "Welcome back"`;
  const html = renderTemplate(tpl, { isGuest: false });
  assert(html.includes('Welcome back'), 'negated condition');
});

/* ---- Loops ---- */
test('Basic loop', () => {
  const tpl = `ul\n  ?each item in items\n    li "#{item}"`;
  const html = renderTemplate(tpl, { items: ['Apple', 'Banana', 'Cherry'] });
  assert(html.includes('Apple'), 'loop item 1');
  assert(html.includes('Banana'), 'loop item 2');
  assert(html.includes('Cherry'), 'loop item 3');
  assert(html.includes('<ul>'), 'parent ul');
});

test('Loop with index', () => {
  const tpl = `ol\n  ?each item, i in items\n    li "#{i}. #{item}"`;
  const html = renderTemplate(tpl, { items: ['A', 'B', 'C'] });
  assert(html.includes('0. A'), 'index 0');
  assert(html.includes('1. B'), 'index 1');
  assert(html.includes('2. C'), 'index 2');
});

test('Loop with objects', () => {
  const tpl = `ul\n  ?each user in users\n    li "#{user.name} (#{user.age})"`;
  const html = renderTemplate(tpl, {
    users: [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }]
  });
  assert(html.includes('Alice (30)'), 'object loop 1');
  assert(html.includes('Bob (25)'), 'object loop 2');
});

/* ---- Components ---- */
test('Component usage', () => {
  function Card(el, { title, body }) {
    el.addClass('card');
    el.child('h2').text(title);
    el.child('p').text(body);
  }
  components.register('Card', Card);

  const tpl = `@Card(title="Hello" body="World")`;
  const html = renderTemplate(tpl);
  assert(html.includes('class="card"'), 'component class');
  assert(html.includes('<h2>Hello</h2>'), 'component title');
  assert(html.includes('<p>World</p>'), 'component body');

  components.unregister('Card');
});

/* ---- Data attributes ---- */
test('Data attributes [...]', () => {
  const html = renderTemplate(`div[userId=42 role="admin"]`);
  assert(html.includes('data-user-id="42"'), 'data-user-id');
  assert(html.includes('data-role="admin"'), 'data-role');
});

/* ---- Comments ---- */
test('Comments are ignored', () => {
  const tpl = `// This is a comment\nh1 "Visible"\n// Another comment\np "Also visible"`;
  const html = renderTemplate(tpl);
  assert(!html.includes('comment'), 'comments stripped');
  assert(html.includes('Visible'), 'content preserved');
  assert(html.includes('Also visible'), 'content after comment');
});

/* ---- compileTemplate returns Document ---- */
test('compileTemplate returns a Document', () => {
  const doc = compileTemplate(`h1 "Test"`);
  assert(typeof doc.render === 'function', 'has render method');
  assert(typeof doc.addScript === 'function', 'has addScript method');
  const html = doc.render();
  assert(html.includes('<h1>Test</h1>'), 'renders correctly');
});

/* ---- Full page example ---- */
test('Full page template', () => {
  const tpl = `---
title "My App"
viewport
---

:reset
:global body { font-family: system-ui; line-height: 1.6 }
:class container { max-width: 1200px; margin: 0 auto }

div#app.container
  header
    h1 "Welcome #{user.name}"
    nav
      a(href="/") "Home"
      a(href="/about") "About"

  main
    .card { padding: 16px; border: 1px solid #eee }
      h2 "Dashboard"

      ?if user.isAdmin
        button "Admin Panel"

      ul
        ?each item in items
          li "#{item}"

  footer
    | Copyright 2025`;

  const html = renderTemplate(tpl, {
    user: { name: 'Alice', isAdmin: true },
    items: ['Task 1', 'Task 2', 'Task 3']
  });

  assert(html.includes('<title>My App</title>'), 'page title');
  assert(html.includes('box-sizing:border-box'), 'reset');
  assert(html.includes('font-family:system-ui'), 'global style');
  assert(html.includes('Welcome Alice'), 'interpolation');
  assert(html.includes('Admin Panel'), 'conditional true');
  assert(html.includes('Task 1'), 'loop item 1');
  assert(html.includes('Task 3'), 'loop item 3');
  assert(html.includes('Copyright 2025'), 'footer pipe text');
  assert(html.includes('id="app"'), 'root id');
  assert(html.includes('container'), 'root class');
});

/* ---- Summary ---- */
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(40));
process.exit(failed > 0 ? 1 : 0);
