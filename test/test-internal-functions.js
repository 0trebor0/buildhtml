'use strict';

const assert = require('assert');
const {
  Document, TemplateParser, components, configure, CONFIG
} = require('..');
const { buildNodes } = require('../lib/builder');
const { minHTML } = require('../lib/utils');

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

console.log('\n▸ Internal function and branch coverage');

test('buildNodes handles arrays, single definitions, and skipped nodes', () => {
  const doc = new Document();
  const arrayResult = buildNodes(doc, [
    { tag: 'h1', text: 'one' },
    null,
    { tag: 'p', text: 'two' }
  ]);
  const singleResult = buildNodes(doc, { tag: 'aside', text: 'single' });
  assert.strictEqual(arrayResult.length, 2);
  assert.strictEqual(singleResult.length, 1);
  const html = doc.render();
  assert(html.includes('one'));
  assert(html.includes('two'));
  assert(html.includes('single'));
});

test('renderStream read callback is callable and stream remains consumable', () => {
  const doc = new Document();
  doc.p('stream body');
  const stream = doc.renderStream();
  stream._read(0);
  const chunks = [];
  let chunk;
  while ((chunk = stream.read()) !== null) chunks.push(chunk);
  assert(Buffer.concat(chunks).toString().includes('stream body'));
});

test('toJSON serializes oncreate callbacks', () => {
  const doc = new Document();
  doc.oncreate(function () { State.ready = true; });
  const json = doc.toJSON();
  assert.strictEqual(json.oncreateCallbacks.length, 1);
  assert(json.oncreateCallbacks[0].includes('State.ready'));
});

test('template compiler builds nested components', () => {
  components.clear();
  components.register('NestedAudit', (el, props) => {
    el.addClass('nested-audit').text(props.label);
  });
  try {
    const doc = new TemplateParser().compile([
      'section',
      '  @NestedAudit(label="inside")'
    ].join('\n'));
    const html = doc.render();
    assert(html.includes('<section>'));
    assert(html.includes('nested-audit'));
    assert(html.includes('inside'));
  } finally {
    components.clear();
  }
});

test('template deep resolution covers nested conditional branches in loops', () => {
  const source = [
    'ul',
    '  ?each user in users',
    '    ?if user.active',
    '      li',
    '        span "#{user.name}"',
    '    ?else',
    '      li',
    '        em "inactive #{user.name}"'
  ].join('\n');
  const html = new TemplateParser().compile(source, {
    users: [
      { name: 'Ada', active: true },
      { name: 'Lin', active: false }
    ]
  }).render();
  assert(html.includes('<span>Ada</span>'));
  assert(html.includes('<em>inactive Lin</em>'));
});

test('template deep resolver interpolates explicit false branches', () => {
  const parser = new TemplateParser();
  const resolved = parser._deepResolve({
    type: 'conditional',
    trueBranch: [{ type: 'element', text: '#{name} true' }],
    falseBranch: [{ type: 'element', text: '#{name} false' }]
  }, { name: 'Ada' });
  assert.strictEqual(resolved.trueBranch[0].text, 'Ada true');
  assert.strictEqual(resolved.falseBranch[0].text, 'Ada false');
});

test('template strict equality and inequality conditions trim operands', () => {
  const parser = new TemplateParser();
  const equal = parser.compile([
    '?if role === "admin"',
    '  p "allowed"'
  ].join('\n'), { role: 'admin' }).render();
  const unequal = parser.compile([
    '?if role !== "guest"',
    '  p "member"'
  ].join('\n'), { role: 'admin' }).render();
  assert(equal.includes('allowed'));
  assert(unequal.includes('member'));
});

test('minHTML preserves whitespace-sensitive element contents', () => {
  const originalMode = CONFIG.mode;
  try {
    configure({ mode: 'prod' });
    const source = [
      '<div>  outer  </div>',
      '<pre>  keep  pre\n spacing </pre>',
      '<code>  keep code  </code>',
      '<script>  keep script  </script>',
      '<style>  keep style  </style>',
      '<textarea>  keep textarea  </textarea>'
    ].join('  ');
    const html = minHTML(source);
    assert(html.includes('<pre>  keep  pre\n spacing </pre>'));
    assert(html.includes('<code>  keep code  </code>'));
    assert(html.includes('<script>  keep script  </script>'));
    assert(html.includes('<style>  keep style  </style>'));
    assert(html.includes('<textarea>  keep textarea  </textarea>'));
    assert(!html.includes('</div>  <pre>'));
  } finally {
    configure({ mode: originalMode });
  }
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
