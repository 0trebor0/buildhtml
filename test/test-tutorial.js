'use strict';

// The tutorial states that every code block in it is executed here. This file
// keeps that promise: it runs each block, then asserts the behavioural claims
// the prose makes around them, so a change in the library that contradicts the
// documentation fails the suite rather than shipping a misleading tutorial.

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { page, Document } = require('../index');
const { TEXT_TAGS } = require('../lib/shortcuts');

// The tutorial lives in the guide itself, so the site and the tests cannot drift
// apart. Sections are identified by their `tut-` id prefix.
const guidePath = path.join(__dirname, '..', 'docs', 'index.html');
const guide = fs.readFileSync(guidePath, 'utf8');

function decodeHtml(value) {
  return value
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

// Only the tutorial's own sections, not the whole guide.
const tutorial = Array.from(
  guide.matchAll(/<section id="tut-[^"]*"[\s\S]*?<\/section>/g),
  (match) => match[0]
).join('\n');

let passed = 0;
let failed = 0;
function check(condition, msg) {
  if (condition) { passed++; } else { failed++; console.error(`  ✗ ${msg}`); }
}

/* ---- every javascript block executes ---- */

const codeBlocks = Array.from(
  tutorial.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g),
  (match) => decodeHtml(match[1])
);
// Shell and diagram blocks are documentation, not runnable JavaScript.
const blocks = codeBlocks.filter((source) => /(?:^|\n)\s*(?:const |let |var |function |doc\.|box\.|form\.)/.test(source));
check(blocks.length > 25, `expected a substantial tutorial, found ${blocks.length} runnable blocks`);
check(tutorial.length > 0, 'the guide contains the tutorial sections');

for (const [index, source] of blocks.entries()) {
  // Browser-side globals are referenced by name inside serialized callbacks.
  // They are never invoked on the server; they only need to resolve.
  const sandbox = {
    require: (id) => require(id.startsWith('@trebor/buildhtml')
      ? path.join(__dirname, '..', id.replace('@trebor/buildhtml', 'index.js').replace('index.js/', ''))
      : id),
    console: { log() {}, warn() {}, error() {} },
    Buffer,
    State: new Proxy({}, { get: () => 0, set: () => true }),
  };
  sandbox.globalThis = sandbox;
  try {
    vm.runInNewContext(source, sandbox, {
      filename: `docs/index.html#tutorial-javascript-${index + 1}`,
      timeout: 15000,
    });
  } catch (error) {
    failed++;
    console.error(`  ✗ tutorial block ${index + 1} threw: ${error.message}`);
    continue;
  }
  passed++;
}

/* ---- the tag list the tutorial prints must match the implementation ---- */

const listedTags = (codeBlocks.find((block) => block.trim().startsWith('div span')) || '');
check(listedTags.length > 0, "tutorial lists the tag shortcuts");
if (listedTags) {
  const documented = listedTags.split(/\s+/).filter(Boolean);
  check(documented.length === TEXT_TAGS.length,
    `tutorial lists ${documented.length} tags, TEXT_TAGS has ${TEXT_TAGS.length}`);
  const missing = TEXT_TAGS.filter((tag) => !documented.includes(tag));
  check(missing.length === 0, `tags missing from the tutorial: ${missing.join(', ')}`);
  const invented = documented.filter((tag) => !TEXT_TAGS.includes(tag));
  check(invented.length === 0, `tags in the tutorial that do not exist: ${invented.join(', ')}`);
  const claimed = (tutorial.match(/(\d+) common tags have a shortcut/) || [])[1];
  check(Number(claimed) === TEXT_TAGS.length,
    `tutorial claims ${claimed} tags, TEXT_TAGS has ${TEXT_TAGS.length}`);
}

/* ---- the behavioural claims the prose makes ---- */

{
  const doc = page('t');
  doc.div().css({ color: 'crimson', padding: '16px' });
  doc.div().css({ color: 'crimson', padding: '16px' });
  const html = doc.render();
  check((html.match(/color:crimson/g) || []).length === 1,
    'css() emits identical rules once and shares the class');
}

{
  const doc = page('t');
  doc.p().text('<script>alert(1)</script>');
  const html = doc.render();
  check(!html.includes('<script>alert(1)</script>') && html.includes('&lt;script&gt;'),
    'text() escapes markup');
}

{
  const doc = page('t');
  const box = doc.div();
  box.append('<em>escaped</em>');
  box.appendUnsafe('<em>trusted</em>');
  const html = doc.render();
  check(html.includes('<em>trusted</em>') && html.includes('&lt;em&gt;'),
    'append() escapes and appendUnsafe() does not');
}

{
  const doc = page('t');
  doc.states({ count: 0 });
  const serverValue = 42;
  doc.button('B').onClick(function () { State.count = serverValue; });
  const captures = doc.validate().warnings.filter((w) => w.code === 'W_CALLBACK_CAPTURE');
  check(captures.some((w) => w.variables.includes('serverValue')),
    'validate() reports a captured server variable by name');
}

{
  const doc = page('t');
  doc.states({ count: 0 });
  doc.img('/a.png', 'Meaningful alt text');
  doc.button('Labelled button');
  const report = doc.validate();
  check(report.valid === true && report.errors.length === 0,
    'the validation example in the tutorial reports a clean document');
}

{
  const doc = page('t');
  doc.h1('static');
  check(!/<script/i.test(doc.render()), 'a page using no reactive API emits no script');
}

{
  const doc = page('t');
  doc.states({ n: 0 });
  doc.button('b').onClick(function () { State.n++; });
  const html = doc.render();
  check(html.includes('addEventListener("click"'), 'events attach with addEventListener');
  check(!/\son(click|load|error)=/i.test(html), 'no inline on* attribute is emitted');
}

{
  const doc = page('t', { nonce: 'abc' });
  doc.states({ n: 0 });
  doc.button('b').onClick(function () { State.n++; });
  check(/<script[^>]*nonce="abc"/.test(doc.render()), 'the nonce reaches the generated script');
}

{
  const doc = page('t');
  doc.list(['One', 'Two'], null, 'ol');
  check(/<ol><li>One<\/li><li>Two<\/li><\/ol>/.test(doc.render()),
    'list(items, null, "ol") produces list items');
}

{
  const doc = page('t');
  doc.ol(['a', 'b']);
  check(!/<li>/.test(doc.render()),
    'ol() is a text shortcut and does not produce list items');
}

{
  const doc = page('t');
  doc.divider();
  check(/<hr>/.test(doc.render()), 'divider() with no options is a bare <hr>');
}

{
  // The tutorial warns that title is a method, not a constructor option.
  const viaOption = new Document({ title: 'From option' });
  viaOption.h1('x');
  check(!viaOption.render().includes('<title>From option</title>'),
    'new Document({ title }) is not honoured, as the tutorial warns');

  const viaMethod = new Document();
  viaMethod.title('From method');
  viaMethod.h1('x');
  check(viaMethod.render().includes('<title>From method</title>'),
    'doc.title() sets the title');
}

{
  // The tutorial warns that the condition comes first.
  const doc = page('t');
  doc.div().toggleClass(true, 'right-order');
  doc.div().toggleClass('wrong-order', true);
  const html = doc.render();
  check(html.includes('right-order'), 'toggleClass(condition, name) applies the class');
  check(!html.includes('wrong-order'), 'the reversed order applies nothing, as the tutorial warns');
}

console.log(
  failed === 0
    ? `Tutorial passed: ${blocks.length} javascript blocks execute and ${passed - blocks.length} documented behaviours hold.`
    : `Tutorial FAILED: ${failed} problem(s), ${passed} passed.`
);
if (failed > 0) process.exit(1);
