'use strict';

const { renderTemplate, compileTemplate, parseTemplate, renderFile, compileFile, templateEngine, components } = require('../index');
const fs = require('fs');
const os = require('os');
const path = require('path');

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

test('parseTemplate returns a document AST', () => {
  const ast = parseTemplate(`h1 "AST"`);
  assert(ast.type === 'document', 'AST has document type');
  assert(Array.isArray(ast.body), 'AST has body nodes');
  assert(ast.body[0].type === 'element', 'AST body contains element node');
});

test('file helpers are synchronous and templateEngine follows the Express callback contract', () => {
  const fixturePath = path.join(os.tmpdir(), `buildhtml-template-${process.pid}.bhtml`);
  fs.writeFileSync(fixturePath, `h1 "Hello #{name}"`, 'utf8');
  try {
    const html = renderFile(fixturePath, { name: 'File' });
    const doc = compileFile(fixturePath, { name: 'Document' });
    let callbackResult = null;
    templateEngine(fixturePath, { name: 'Engine' }, (error, output) => {
      callbackResult = { error, output };
    });

    assert(typeof html === 'string' && html.includes('Hello File'), 'renderFile returns HTML synchronously');
    assert(typeof doc.render === 'function', 'compileFile returns a Document synchronously');
    assert(doc.render().includes('Hello Document'), 'compileFile applies variables');
    assert(callbackResult && callbackResult.error === null, 'templateEngine calls back without an error');
    assert(callbackResult.output.includes('Hello Engine'), 'templateEngine returns rendered HTML');
  } finally {
    fs.unlinkSync(fixturePath);
  }
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

/* ---- Attribute interpolation ---- */
test('#{} interpolates in attribute and data values', () => {
  assert(renderTemplate('a(href="#{u}") "go"', { u: '/about' }).includes('href="/about"'),
    'href interpolates');
  assert(renderTemplate('p(title="#{v}") "t"', { v: 'hello' }).includes('title="hello"'),
    'title interpolates');
  assert(renderTemplate('a(title="a #{v} b") "go"', { v: 'X' }).includes('title="a X b"'),
    'interpolation composes with surrounding literal text');
  assert(renderTemplate('div[userId=#{id}]', { id: 42 }).includes('data-user-id="42"'),
    'data attribute values interpolate');
});

test('an unresolved attribute token is left alone rather than emptied', () => {
  const html = renderTemplate('a(href="#{nope}") "go"');
  assert(html.includes('href="#{nope}"'), 'the literal token survives when no variable matches');
});

test('a valueless attribute survives interpolation', () => {
  assert(renderTemplate('button(disabled) "s"').includes('disabled'),
    'boolean attributes are not broken by the interpolation pass');
});

test('interpolated attribute values are still escaped and sanitized', () => {
  // The payload appears in the output as escaped TEXT, so a substring search for
  // "onload=" matches a perfectly safe page. What matters is whether it became a
  // real attribute, which means looking inside the tag itself.
  const quoted = renderTemplate('a(title="#{v}") "go"', { v: '" onload="alert(1)' });
  // A breakout needs raw quotes to close the value and open another attribute.
  // The safe render has exactly the two that delimit title="...".
  const tag = quoted.match(/<a[^>]*>/)[0];
  assert((tag.match(/"/g) || []).length === 2,
    `a quote in a variable cannot open a second attribute (tag was ${tag})`);
  assert(tag.includes('&quot;'), 'the quote survives as an escaped entity');
  const scheme = renderTemplate('a(href="#{v}") "go"', { v: 'javascript:alert(1)' });
  assert(scheme.includes('href="#"'), 'an executable scheme is still neutralised');
  const tabbed = renderTemplate('a(href="#{v}") "go"', { v: 'java	script:alert(1)' });
  assert(tabbed.includes('href="#"'), 'a control-character split scheme is still neutralised');
});

test('event attribute values are not interpolated', () => {
  const calls = [];
  const html = renderTemplate('button(@click="save") "Save"', { save: function () { State.n = 1; } });
  assert(html.includes('addEventListener("click"'), 'a named handler still wires up');
});

/* ---- Malformed tag recovery ---- */
test('an invalid tag drops its line instead of throwing', () => {
  let html;
  try {
    html = renderTemplate(['div', '  SPAN "y"', '  p "kept"'].join('\n'));
  } catch (e) {
    assert(false, `renderTemplate threw instead of recovering: ${e.message}`);
    return;
  }
  assert(html.includes('<p>kept</p>'), 'the rest of the template still renders');
  assert(!html.includes('SPAN'), 'the malformed line is dropped');
  assert(html.includes('<div>'), 'the surrounding structure survives');
});

test('an invalid tag at the top level does not throw', () => {
  let threw = false;
  try { renderTemplate('DIV "x"'); } catch (e) { threw = true; }
  assert(!threw, 'a top-level invalid tag is recovered, not thrown');
});

test('content dropped after a tag is reported', () => {
  const { configure, CONFIG } = require('../index');
  const originalMode = CONFIG.mode;
  const originalWarn = console.warn;
  const warnings = [];
  try {
    console.warn = message => warnings.push(message);
    configure({ mode: 'dev' });

    // The selector stops at the first invalid character, so "scr<ipt" renders
    // <scr> and the rest of the line vanished without a word before this.
    const html = renderTemplate('scr<ipt "x"');
    assert(warnings.length === 1, `the dropped remainder is reported once (got ${warnings.length})`);
    assert(warnings[0].includes('[BuildHTML W_TEMPLATE_SYNTAX]'), 'it uses the shared code');
    assert(warnings[0].includes('Unexpected'), 'it names the unexpected content');
    assert(html.includes('<scr>'), 'the element still renders — the parser recovers');

    warnings.length = 0;
    renderTemplate('a(href="/x") "fine"');
    assert(warnings.length === 0, 'a well-formed line stays silent');

    warnings.length = 0;
    configure({ mode: 'prod' });
    renderTemplate('scr<ipt "x"');
    assert(warnings.length === 0, 'production stays silent');
  } finally {
    console.warn = originalWarn;
    configure({ mode: originalMode });
  }
});

/* ---- Malformed input diagnostics ---- */
test('Malformed template lines warn in development', () => {
  const { configure, CONFIG } = require('../index');
  const originalMode = CONFIG.mode;
  const originalWarn = console.warn;
  const warnings = [];
  try {
    console.warn = message => warnings.push(message);
    configure({ mode: 'dev' });

    renderTemplate('a(href="/x" "Text"');
    renderTemplate('?each item in\n  li "x"');
    renderTemplate('?else\n  p "x"');
    renderTemplate(':global body font-size: 12px');
    renderTemplate(':class btn padding: 4px');

    assert(warnings.length === 5, `each malformed line warned once (got ${warnings.length})`);
    assert(warnings.every(m => m.includes('[BuildHTML W_TEMPLATE_SYNTAX]')), 'warnings share one code');
    assert(warnings[0].includes('Unclosed "("'), 'unclosed attribute paren reported');
    assert(warnings[1].includes('Invalid loop syntax'), 'invalid loop reported');
    assert(warnings[2].includes('Unknown directive'), 'stray ?else reported');
    assert(warnings[3].includes('Missing "{"'), ':global without braces reported');
    assert(warnings[4].includes('Missing "{"'), ':class without braces reported');

    warnings.length = 0;
    configure({ mode: 'prod' });
    renderTemplate('?each item in\n  li "x"');
    assert(warnings.length === 0, 'production stays silent');

    warnings.length = 0;
    configure({ mode: 'dev' });
    renderTemplate('div\n  h1 "Title"\n  ?if ok\n    p "yes"');
    assert(warnings.length === 0, 'valid templates do not warn');
  } finally {
    console.warn = originalWarn;
    configure({ mode: originalMode });
  }
});

/* ---- Summary ---- */
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(40));
process.exit(failed > 0 ? 1 : 0);
