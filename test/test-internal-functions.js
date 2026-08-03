'use strict';

const assert = require('assert');
const {
  Document, TemplateParser, components, configure, CONFIG
} = require('..');
const { buildNodes } = require('../lib/builder');
const { minHTML, findFreeVariables } = require('../lib/utils');

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

test('document validation reports heading, form, URL, ARIA, and nesting mistakes', () => {
  const doc = new Document();
  doc.h1('Dashboard');
  doc.h3('Skipped level');
  doc.input('email').id('unlabelled');
  doc.a('javascript:alert(1)', 'Unsafe');
  doc.div('Named elsewhere').aria({ labelledby: 'missing-label' });
  doc.button('Outer').button('Inner');

  const codes = new Set(doc.validate().warnings.map((issue) => issue.code));
  for (const code of ['W_HEADING_ORDER', 'W_CONTROL_LABEL', 'W_UNSAFE_URL', 'W_ARIA_TARGET', 'W_NESTED_INTERACTIVE']) {
    assert(codes.has(code), `validation should report ${code}`);
  }
});

test('document validation accepts accessible controls and sequential headings', () => {
  const doc = new Document();
  doc.h1('Dashboard');
  doc.h2('Account');
  doc.label((label) => label.input('email'));
  doc.input('search').aria({ label: 'Search' });
  doc.a('/account', 'Account');

  assert.deepStrictEqual(doc.validate(), { valid: true, errors: [], warnings: [] });
});

test('document validation reports ineffective caching and History fallback requirements', () => {
  const doc = new Document({ cache: true });
  doc.historyRouter({ base: '/app' });
  const warnings = doc.validate().warnings;
  assert.deepStrictEqual(
    warnings.map((issue) => issue.code).sort(),
    ['W_CACHE_KEY', 'W_HISTORY_FALLBACK']
  );
  assert(warnings.find((issue) => issue.code === 'W_HISTORY_FALLBACK').message.includes('/app'));

  const configured = new Document({ cache: true, cacheKey: 'public-home' });
  configured.hashRouter();
  assert.deepStrictEqual(configured.validate(), { valid: true, errors: [], warnings: [] });
});

test('free-variable analysis detects captures and accepts browser callback patterns', () => {
  assert.deepStrictEqual(findFreeVariables('(value) => value === pageName'), ['pageName']);
  assert.deepStrictEqual(findFreeVariables('(value) => `${prefix}: ${value}`'), ['prefix']);
  assert.deepStrictEqual(findFreeVariables('(value) => /ready|done/gi.test(value)'), []);
  assert.deepStrictEqual(
    findFreeVariables('async function(event, state, element, context){const response=await fetch(context.url);state.items=await response.json();element.dataset.ready=String(response.ok);}'),
    []
  );
  assert.deepStrictEqual(
    findFreeVariables('(items) => items.map(item => ({ id: item.id, label: String(item.label) }))'),
    []
  );
});

test('document validation identifies captured server variables with callback context', () => {
  const pageName = 'projects';
  const doc = new Document();
  doc.states({ activePage: 'overview' });
  doc.section('Projects').bindShow('activePage', (value) => value === pageName);
  doc.button('Safe').onClick(function (_event, state, _element, context) {
    state.activePage = context.page;
  }, { page: pageName });

  const captures = doc.validate().warnings.filter((issue) => issue.code === 'W_CALLBACK_CAPTURE');
  assert.strictEqual(captures.length, 1);
  assert.deepStrictEqual(captures[0].variables, ['pageName']);
  assert.strictEqual(captures[0].callbackType, 'binding:show');
});

test('document validation checks event, lifecycle, computed, and oncreate sources', () => {
  const serverValue = 'server-only';
  const doc = new Document();
  doc.button('Captured event').onClick(() => console.log(serverValue));
  doc.div('Captured lifecycle').onMount(() => console.log(serverValue));
  doc.span().computed(() => serverValue);
  doc.oncreate(() => console.log(serverValue));

  const types = new Set(doc.validate().warnings
    .filter((issue) => issue.code === 'W_CALLBACK_CAPTURE')
    .map((issue) => issue.callbackType));
  assert.deepStrictEqual(types, new Set(['event:click', 'lifecycle:mount', 'computed', 'oncreate']));
});

test('document validation checks liveList item, filter, and sort callbacks', () => {
  const prefix = 'server';
  const allowedTeam = 'Platform';
  const sortDirection = 1;
  const doc = new Document();
  doc.states({ items: [{ label: 'One', team: 'Platform' }] });
  doc.liveList('items', (item) => ({ tag: 'span', text: prefix + item.label }), {
    filter: (item) => item.team === allowedTeam,
    sort: (a, b) => sortDirection * a.label.localeCompare(b.label),
  });

  const captures = doc.validate().warnings.filter((issue) => issue.code === 'W_CALLBACK_CAPTURE');
  assert.deepStrictEqual(captures.map((issue) => issue.callbackType).sort(), ['liveList:filter', 'liveList:item', 'liveList:sort']);
  assert.deepStrictEqual(captures.flatMap((issue) => issue.variables).sort(), ['allowedTeam', 'prefix', 'sortDirection']);
});

test('document validation retains rejected callback registration failures', () => {
  const original = { ...CONFIG };
  try {
    configure({ mode: 'prod', maxEventFnSize: 80, maxComputedFnSize: 80 });
    const doc = new Document();
    doc.states({ items: [], filteredItems: [] });
    doc.button('Unsafe').id('unsafe-event').onClick(function () { eval('alert(1)'); });
    doc.span().bind('value', function (value) {
      return `This intentionally oversized binding callback keeps repeating its value: ${value}:${value}:${value}:${value}`;
    });
    doc.oncreate(function () { return new Function('return 1')(); });
    doc.div().computed(function () { return eval('1'); });
    doc.section('Lifecycle').onMount(function () { return new Function('return 1')(); });
    doc.liveList('items', function (item) { return eval('item'); });
    doc.liveList('filteredItems', function (item) { return { tag: 'span', text: item }; }, {
      filter: function (item) { return eval('item'); },
    });

    const result = doc.validate();
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.errors.length, 7);
    assert(result.errors.every((issue) => issue.code === 'E_CALLBACK_REGISTRATION'));
    assert.deepStrictEqual(
      result.errors.map((issue) => issue.callbackType).sort(),
      ['binding:text', 'computed', 'event:click', 'lifecycle:mount', 'liveList:filter', 'liveList:item', 'oncreate']
    );
    const eventFailure = result.errors.find((issue) => issue.callbackType === 'event:click');
    assert.strictEqual(eventFailure.id, 'unsafe-event');
    assert.strictEqual(eventFailure.tag, 'button');
    assert(eventFailure.reason.includes('dangerous'));
    assert(eventFailure.message.includes('configured size limit'));

    doc.clear();
    assert.deepStrictEqual(doc.validate(), { valid: true, errors: [], warnings: [] });
  } finally {
    configure(original);
  }
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
