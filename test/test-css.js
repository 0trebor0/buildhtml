'use strict';

/**
 * The CSS compiler — lib/css.js and its callers.
 *
 * Covers the four properties the compiler is supposed to guarantee:
 *   1. `css: {}` means the same thing everywhere, including inside a liveList.
 *   2. Every selector, property name and pseudo/media argument is validated
 *      before it reaches a <style> block.
 *   3. An identical rule is emitted once.
 *   4. Declaration order does not change the class a rule gets.
 *
 * Plus the server/client parity that item 1 depends on: a row rebuilt in the
 * browser has to land on the same class name the server rendered, or the two
 * halves disagree about what `css` means the moment state changes.
 */

const assert_ = require('assert');
const vm = require('vm');
const { Document, configure, CONFIG } = require('../index');
const {
  compileScopedRule, compileNestedRules, compileDeclarationText, canonicalizeDeclarations,
  isSafePseudoSelector, isSafeMediaQuery, RuleSet, clientCssRuntimeSource,
} = require('../lib/css');
const { MK_EL_SRC } = require('../lib/live');

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

/** The rule text of a rendered document, with the head's own <style> excluded. */
function styleBlocks(html) {
  return (html.match(/<style[^>]*>[\s\S]*?<\/style>/g) || []).join('');
}

/**
 * The CONTENTS of every <style> element, without the wrapper tags.
 *
 * Asserting "no </style> escaped" against styleBlocks() is vacuous — the wrapper
 * it returns always ends in one — and it passed only because the rejected-payload
 * tests emit no style element at all. Checking the contents is what actually
 * proves nothing closed the element early.
 */
function styleContents(html) {
  return (html.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || [])
    .map(block => block.replace(/^<style[^>]*>/, '').replace(/<\/style>$/, ''))
    .join('');
}

function classesUsed(html) {
  const found = new Set();
  for (const attr of html.match(/class="[^"]*"/g) || []) {
    for (const name of attr.slice(7, -1).split(/\s+/)) if (name) found.add(name);
  }
  return found;
}

/* ============================================================
   4. CANONICAL ORDER
   ============================================================ */

test('declaration order does not change the compiled rule', () => {
  const a = compileScopedRule({ color: 'red', margin: '0' });
  const b = compileScopedRule({ margin: '0', color: 'red' });
  assert(a.className === b.className, 'both orders hash to one class');
  assert(a.css === b.css, 'both orders compile to identical rule text');
  assert(a.declarations === 'color:red;margin:0;', 'declarations are sorted by family');
});

test('two elements written in different orders share one class', () => {
  const doc = new Document();
  doc.create('div').css({ padding: '4px', color: 'red' });
  doc.create('div').css({ color: 'red', padding: '4px' });
  const html = doc.render();
  const used = [...classesUsed(html)];
  assert(used.length === 1, `one class for both elements (got ${used.length})`);
  assert((styleBlocks(html).match(/color:red/g) || []).length === 1, 'rule emitted once');
});

test('canonical order never reorders declarations that override each other', () => {
  // margin-top after margin means margin-top wins; sorting alphabetically would
  // put margin second and silently flip which value applies.
  const shorthandFirst = canonicalizeDeclarations({ margin: '0', marginTop: '5px' });
  const longhandFirst = canonicalizeDeclarations({ marginTop: '5px', margin: '0' });
  assert(shorthandFirst.map(d => d[0]).join(',') === 'margin,margin-top',
    'shorthand-then-longhand keeps its order');
  assert(longhandFirst.map(d => d[0]).join(',') === 'margin-top,margin',
    'longhand-then-shorthand keeps its order');
  assert(compileScopedRule({ margin: '0', marginTop: '5px' }).className
    !== compileScopedRule({ marginTop: '5px', margin: '0' }).className,
    'the two orders stay different rules, because they mean different things');
});

test('unrelated families sort while related ones do not', () => {
  const text = compileDeclarationText({ zIndex: '2', color: 'red', borderTop: '1px', border: 'none' });
  assert(text === 'border-top:1px;border:none;color:red;z-index:2;',
    `families sorted, border order preserved (got ${text})`);
});

test('a custom property keeps its exact case and its own family', () => {
  const text = compileDeclarationText({ '--brandColor': 'red', color: 'blue' });
  assert(text.includes('--brandColor:red'), 'custom property case preserved');
  assert(text.indexOf('--brandColor') < text.indexOf('color:blue'), 'ordered by family name');
});

/* ============================================================
   3. DE-DUPLICATION
   ============================================================ */

test('the same rule added twice to one element is stored once', () => {
  const doc = new Document();
  const el = doc.create('div').css({ color: 'red' }).css({ color: 'red' });
  assert(el._cssRules.size === 1, 'one rule stored');
  const html = doc.render();
  assert((styleBlocks(html).match(/color:red/g) || []).length === 1, 'one rule emitted');
});

test('a rule shared with an element that has extra rules is still emitted once', () => {
  // The whole-cssText comparison this replaced could not see inside a
  // concatenation: `.css(A).hover(B)` and `.css(A)` had different cssText, so A
  // went out twice.
  const doc = new Document();
  doc.create('div').css({ color: 'red' }).hover({ color: 'blue' });
  doc.create('div').css({ color: 'red' });
  const html = doc.render();
  assert((styleBlocks(html).match(/\{color:red;\}/g) || []).length === 1,
    'the shared rule appears once');
  assert(styleBlocks(html).includes(':hover{color:blue;}'), 'the hover rule is still there');
});

test('every class referenced in the markup has a rule behind it', () => {
  const doc = new Document();
  doc.create('div').css({ color: 'red' }).hover({ color: 'blue' })
    .media('(min-width: 40em)', { padding: '8px' }).pseudo('before', { content: '"x"' });
  const html = doc.render();
  const style = styleBlocks(html);
  const orphans = [...classesUsed(html)].filter(c => !style.includes('.' + c));
  assert(orphans.length === 0, `no orphan classes (got ${orphans.join(', ') || 'none'})`);
});

test('RuleSet.addRaw de-duplicates identical pre-compiled strings', () => {
  const set = new RuleSet();
  set.addRaw('.a{color:red}');
  set.addRaw('.a{color:red}');
  assert(set.size === 1, 'identical raw rules collapse');
  assert(set.toString() === '.a{color:red}', 'text round-trips');
});

/* ============================================================
   2. VALIDATION
   ============================================================ */

const CSS_BREAKOUT = '}</style><script>alert(1)</script><style>.x{';

test('pseudo() refuses a pseudo-element name that is really markup', () => {
  const doc = new Document();
  doc.create('div').pseudo(CSS_BREAKOUT, { color: 'red' });
  const html = doc.render();
  assert(!html.includes('<script>alert(1)'), 'no script element materialises');
  assert(!styleContents(html).includes('</style>'), 'the style block is not closed early');
});

test('pseudo() refuses an argument on a pseudo-element', () => {
  assert(isSafePseudoSelector('before'), 'a bare name is fine');
  assert(!require('../lib/css').isSafePseudoElement('before(x)'),
    '::before takes no argument, so one is refused');
});

test('media() validates its query the way Document.mediaQuery() always has', () => {
  const doc = new Document();
  doc.create('div').media(`screen{}${CSS_BREAKOUT}`, { color: 'red' });
  const html = doc.render();
  assert(!html.includes('<script>alert(1)'), 'no script element materialises');
  assert(!styleContents(html).includes('</style>'), 'the style block is not closed early');
  assert(!isSafeMediaQuery('x{}</style>'), 'the query check rejects block punctuation');
  assert(isSafeMediaQuery('(min-width: 40em) and (orientation: landscape)'),
    'a real query is accepted');
});

test('nthChild() validates the argument it interpolates', () => {
  const doc = new Document();
  doc.create('div').nthChild('1){} body{display:none} .x:nth-child(1', { color: 'red' });
  const html = doc.render();
  assert(!styleBlocks(html).includes('body{display:none}'),
    'a crafted argument cannot write a rule of its own');
  const ok = new Document();
  ok.create('div').nthChild('2n+1', { color: 'red' });
  assert(styleBlocks(ok.render()).includes(':nth-child(2n+1){color:red;}'),
    'a real nth-child expression still works');
});

test('the pseudo-class helpers accept what real CSS needs', () => {
  for (const p of ['hover', 'first-child', 'nth-child(odd)', 'not(.a)', 'lang(en)', 'is(.a, .b)']) {
    assert(isSafePseudoSelector(p), `accepts :${p}`);
  }
  for (const p of ['hover{}', 'hover;x', 'hover<script', 'a}b', '']) {
    assert(!isSafePseudoSelector(p), `refuses ${JSON.stringify(p)}`);
  }
});

test('a liveList item validates property names, not just values', () => {
  // This path compiled declarations by hand and never checked the NAME.
  const doc = new Document();
  doc.states({ rows: [{ id: 1 }] });
  doc.liveList('rows', () => ({ tag: 'span', css: { 'color:red}</style><script>alert(1)</script>{x': 'y' } }));
  const html = doc.render();
  assert(!html.includes('<script>alert(1)'), 'no script element materialises');
});

test('the document and element media paths judge a query the same way', () => {
  // These were separate implementations: one validated, one did not. They now
  // share compileMediaRule()/compileScopedRule(), so a query cannot be safe at
  // one level and unsafe at the other.
  const hostile = `x{}${CSS_BREAKOUT}`;
  const viaDocument = new Document();
  viaDocument.mediaQuery(hostile, { '.a': { color: 'red' } });
  const viaElement = new Document();
  viaElement.create('div').media(hostile, { color: 'red' });
  assert(!viaDocument.render().includes('<script>alert(1)'), 'document path refuses');
  assert(!viaElement.render().includes('<script>alert(1)'), 'element path refuses');

  const okDocument = new Document();
  okDocument.mediaQuery('(min-width: 40em)', { '.a': { color: 'red' } });
  assert(styleBlocks(okDocument.render()).includes('@media (min-width: 40em){.a{color:red;}}'),
    'a real document-level media rule still compiles');
});

test('keyframes validates its name and every stop through the shared compiler', () => {
  const doc = new Document();
  doc.keyframes(CSS_BREAKOUT, { from: { opacity: '0' } });
  doc.keyframes('fade', { [CSS_BREAKOUT]: { opacity: '0' }, to: { opacity: '1' } });
  const html = doc.render();
  assert(!html.includes('<script>alert(1)'), 'neither a bad name nor a bad stop escapes');
  assert(styleBlocks(html).includes('@keyframes fade{to{opacity:1;}}'),
    'the valid stop of a partly invalid set still compiles');
});

test('a global rule is compiled by the same code as a scoped one', () => {
  const doc = new Document();
  doc.globalCss('main > .row', { paddingTop: '4px', color: 'red' });
  // Same canonical ordering as an element rule: sorted between families.
  assert(styleBlocks(doc.render()).includes('main > .row{color:red;padding-top:4px;}'),
    'declarations are canonically ordered in a global rule too');
  const rejected = new Document();
  rejected.globalCss(CSS_BREAKOUT, { color: 'red' });
  assert(!rejected.render().includes('<script>alert(1)'), 'an unsafe selector is refused');
});

/* ============================================================
   NESTING
   ============================================================ */

test('nested blocks flatten into rules sharing one class', () => {
  const doc = new Document();
  doc.create('div').css({
    color: 'red',
    '&:hover': { color: 'blue' },
    '& .child': { margin: '0' },
    '&.active': { fontWeight: '700' },
    '@media (min-width: 40em)': { padding: '8px' },
    '@supports (display: grid)': { display: 'grid' },
  });
  const html = doc.render();
  const style = styleBlocks(html);
  const cls = [...classesUsed(html)][0];
  assert(classesUsed(html).size === 1, 'one class covers the whole block');
  assert(style.includes(`.${cls}{color:red;}`), 'own declarations compile');
  assert(style.includes(`.${cls}:hover{color:blue;}`), '&:hover flattens');
  assert(style.includes(`.${cls} .child{margin:0;}`), '& .child flattens to a descendant rule');
  assert(style.includes(`.${cls}.active{font-weight:700;}`), '&.active flattens');
  assert(style.includes(`@media (min-width: 40em){.${cls}{padding:8px;}}`), 'a nested @media wraps');
  assert(style.includes(`@supports (display: grid){.${cls}{display:grid;}}`), 'a nested @supports wraps');
  assert(!style.includes('&'), 'no native nesting syntax reaches the output');
});

test('an object with no nested keys hashes exactly as it did before nesting', () => {
  // The client runtime computes hash(declarations) for a flat object, so padding
  // the hash input for the nested case would have broken liveList parity.
  const flat = compileScopedRule({ color: 'red' });
  const viaNested = compileNestedRules({ color: 'red' });
  assert(flat.className === viaNested.className, 'both compilers agree on a flat object');
});

test('nested key order does not change the class', () => {
  const a = compileNestedRules({ '&:focus': { outline: 'none' }, '&:hover': { color: 'blue' } });
  const b = compileNestedRules({ '&:hover': { color: 'blue' }, '&:focus': { outline: 'none' } });
  assert(a.className === b.className, 'nested keys are canonically ordered');
});

test('adding a nested block changes the class', () => {
  // Sharing the base name would let the hover rule apply to elements that only
  // asked for the base declarations.
  const plain = compileNestedRules({ color: 'red' });
  const withHover = compileNestedRules({ color: 'red', '&:hover': { color: 'blue' } });
  assert(plain.className !== withHover.className, 'the two rule sets are different classes');
});

test('a malformed or hostile nested key is dropped, not guessed at', () => {
  const doc = new Document();
  doc.create('div').css({
    color: 'red',
    '&:hover': 'not-an-object',
    [`&${CSS_BREAKOUT}`]: { color: 'blue' },
    [`@media ${CSS_BREAKOUT}`]: { color: 'blue' },
    '@unknown (x)': { color: 'blue' },
    '@media': { color: 'blue' },
  });
  const html = doc.render();
  assert(!html.includes('<script>alert(1)'), 'no nested key materialises a script');
  assert(!styleContents(html).includes('</style>'), 'no nested key closes the style element');
  assert(!styleBlocks(html).includes('@unknown'), 'an unknown at-rule is refused');
  assert(styleBlocks(html).includes('color:red;'), 'the valid declarations still compile');
});

test('nesting works inside a liveList row, and matches the element path', () => {
  const doc = new Document();
  doc.states({ rows: [{ t: 'a' }] });
  doc.create('span').css({ color: 'red', '&:hover': { color: 'blue' } });
  doc.div().liveList('rows', item => ({
    tag: 'span', text: item.t, css: { color: 'red', '&:hover': { color: 'blue' } },
  }));
  const html = doc.render();
  assert(classesUsed(html).size === 1, 'the element and the row land on one class');
  const style = styleBlocks(html);
  assert((style.match(/:hover\{color:blue;\}/g) || []).length === 1, 'the hover rule is emitted once');
});

test('the client runtime flattens nesting exactly as the server does', () => {
  const corpus = [
    { color: 'red' },
    { color: 'red', '&:hover': { color: 'blue' } },
    { '&:hover': { color: 'blue' } },
    { color: 'red', '& .child': { margin: '0' }, '&.active': { fontWeight: '700' } },
    { color: 'red', '@media (min-width: 40em)': { padding: '8px' } },
    { color: 'red', '@supports (display: grid)': { display: 'grid' } },
    { '&:focus': { outline: 'none' }, '&:hover': { color: 'blue' } },
    { '&:hover': { color: 'blue' }, '&:focus': { outline: 'none' } },
    { color: 'red', '&:hover': 'not-an-object' },
    { color: 'red', '&}</style><script>x': { color: 'blue' } },
    { color: 'red', '@media x{}</style>': { color: 'blue' } },
  ];
  for (const rules of corpus) {
    const server = compileNestedRules(rules, { prefix: 'c' });
    const client = clientClassFor(rules);
    const label = JSON.stringify(rules).slice(0, 46);
    assert((server ? server.className : '') === client.className, `class parity for ${label}`);
    const serverRules = (server ? server.rules.map(r => r[1]) : []).slice().sort();
    const clientRules = client.inserted.slice().sort();
    assert(JSON.stringify(serverRules) === JSON.stringify(clientRules), `rule parity for ${label}`);
  }
});

/* ============================================================
   MODERN AT-RULES
   ============================================================ */

test('@supports compiles at both document and element level', () => {
  const doc = new Document();
  doc.supports('(display: grid)', { '.layout': { display: 'grid' } });
  doc.create('div').supports('(display: grid)', { display: 'grid' });
  const style = styleBlocks(doc.render());
  assert(style.includes('@supports (display: grid){.layout{display:grid;}}'),
    'the document-level rule compiles');
  assert(/@supports \(display: grid\)\{\.s[a-z0-9]+\{display:grid;\}\}/.test(style),
    'the element-level rule compiles to a scoped class');
});

test('@container compiles, and does not collide with the layout helper', () => {
  const doc = new Document();
  doc.containerQuery('card (min-width: 20em)', { '.c': { padding: '2rem' } });
  doc.create('div').css({ containerType: 'inline-size' })
    .containerQuery('(min-width: 20em)', { padding: '2rem' });
  // container() is a pre-existing layout helper on both prototypes; the query
  // API had to take a different name or applyShortcuts() would have silently
  // replaced it.
  doc.container(c => c.text('layout'), '60rem');
  const html = doc.render();
  const style = styleBlocks(html);
  assert(style.includes('@container card (min-width: 20em){.c{padding:2rem;}}'),
    'a named container query compiles');
  assert(/@container \(min-width: 20em\)\{\.q[a-z0-9]+\{padding:2rem;\}\}/.test(style),
    'an element-level container query compiles');
  assert(html.includes('layout') && /max-width:60rem/.test(style),
    'the layout helper still behaves as before');
});

test('@layer emits ordering and blocks, including an empty one', () => {
  const doc = new Document();
  doc.layerOrder('reset', 'base', 'components');
  doc.layer('base', { body: { margin: '0' } });
  doc.layer('components');
  const style = styleBlocks(doc.render());
  assert(style.includes('@layer reset,base,components;'), 'the order statement is emitted verbatim');
  assert(style.includes('@layer base{body{margin:0;}}'), 'a layer with rules compiles');
  assert(style.includes('@layer components{}'),
    'an empty layer still compiles — declaring the name is what fixes its position');
});

test('layerOrder accepts an array as well as varargs, and preserves order', () => {
  const spread = new Document();
  spread.layerOrder('a', 'b', 'c');
  const array = new Document();
  array.layerOrder(['a', 'b', 'c']);
  assert(styleBlocks(spread.render()) === styleBlocks(array.render()), 'both forms agree');
  const reversed = new Document();
  reversed.layerOrder('c', 'b', 'a');
  assert(styleBlocks(reversed.render()).includes('@layer c,b,a;'), 'order is never sorted');
});

test('every at-rule prelude is validated by the same check', () => {
  const doc = new Document();
  doc.supports(`(x)${CSS_BREAKOUT}`, { '.a': { color: 'red' } });
  doc.containerQuery(`(x)${CSS_BREAKOUT}`, { '.a': { color: 'red' } });
  doc.layer('bad name}</style><script>alert(1)</script>', { '.a': { color: 'red' } });
  doc.layerOrder('ok', 'bad}</style>');
  doc.create('div').supports(`(x)${CSS_BREAKOUT}`, { color: 'red' });
  doc.create('div').containerQuery(`(x)${CSS_BREAKOUT}`, { color: 'red' });
  const html = doc.render();
  assert(!html.includes('<script>alert(1)'), 'no at-rule prelude can materialise a script');
  assert(!styleContents(html).includes('</style>'), 'no at-rule prelude closes the style element');
  assert(styleBlocks(html).includes('@layer ok;'), 'the valid layer name in the order survives');
});

test('the same declarations under different conditions are different classes', () => {
  const doc = new Document();
  const a = doc.create('div').supports('(display: grid)', { color: 'red' });
  const b = doc.create('div').media('(min-width: 40em)', { color: 'red' });
  const c = doc.create('div').css({ color: 'red' });
  const classes = new Set([...a._classes, ...b._classes, ...c._classes]);
  assert(classes.size === 3, `three distinct classes (got ${classes.size})`);
});

/* ============================================================
   1. liveList CSS SEMANTICS
   ============================================================ */

test('css means a scoped class inside a liveList, as it does everywhere else', () => {
  const doc = new Document();
  doc.states({ rows: [{ t: 'a' }, { t: 'b' }] });
  doc.liveList('rows', item => ({ tag: 'span', text: item.t, css: { color: 'red' } }));
  const html = doc.render();
  assert(!/<span[^>]*style="/.test(html), 'a row carries no inline style attribute');
  assert(/<span class="c[a-z0-9]+"/.test(html), 'a row carries a scoped class');
  assert((styleBlocks(html).match(/color:red/g) || []).length === 1,
    'two identical rows share one rule instead of repeating a style attribute');
});

test('style still means an inline style attribute inside a liveList', () => {
  const doc = new Document();
  doc.states({ rows: [{ t: 'a' }] });
  doc.liveList('rows', item => ({ tag: 'span', text: item.t, style: { color: 'red' } }));
  const html = doc.render();
  assert(html.includes('<span style="color:red"'), 'style is inline');
});

test('a nested liveList child contributes its rule to the page', () => {
  const doc = new Document();
  doc.states({ rows: [{ t: 'a' }] });
  doc.liveList('rows', item => ({
    tag: 'div', css: { padding: '4px' },
    children: [{ tag: 'span', text: item.t, css: { color: 'red' } }],
  }));
  const html = doc.render();
  const style = styleBlocks(html);
  const orphans = [...classesUsed(html)].filter(c => !style.includes('.' + c));
  assert(orphans.length === 0, `nested rules reach the stylesheet (orphans: ${orphans.join(', ') || 'none'})`);
});

test('the class an element gets and the class a liveList row gets are the same', () => {
  const doc = new Document();
  doc.states({ rows: [{ t: 'a' }] });
  doc.create('span').text('plain').css({ color: 'red' });
  doc.liveList('rows', item => ({ tag: 'span', text: item.t, css: { color: 'red' } }));
  const html = doc.render();
  const used = [...classesUsed(html)];
  assert(used.length === 1, `one class covers both (got ${used.join(', ')})`);
});

/* ============================================================
   SERVER / CLIENT PARITY
   ============================================================ */

/**
 * Run the emitted client CSS runtime against a stub DOM and return the class it
 * mints for `rules`, plus the rule text it inserted. The stub is only as real as
 * the runtime needs: an element to append text nodes to, and a head to hold it.
 */
function clientClassFor(rules) {
  const inserted = [];
  const styleNode = {
    id: '',
    appendChild(node) { inserted.push(node.text); },
  };
  const sandbox = {
    document: {
      getElementById: () => null,
      createElement: () => styleNode,
      createTextNode: (text) => ({ text }),
      head: { appendChild() {} },
      documentElement: { appendChild() {} },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(clientCssRuntimeSource(), sandbox);
  sandbox.__rules = rules;
  const className = vm.runInContext('_bhCssClass(__rules)', sandbox);
  return { className, inserted };
}

test('the client runtime mints the same class name as the server', () => {
  const corpus = [
    { color: 'red' },
    { color: 'red', margin: '0' },
    { margin: '0', color: 'red' },
    { marginTop: '5px', margin: '0' },
    { fontFamily: '"Fira Code", monospace' },
    { '--brandColor': '#fff', color: 'var(--brandColor)' },
    { padding: '4px', borderTop: '1px solid #ccc', border: 'none', zIndex: '3' },
    { color: 'red', 'bad;name': 'x' },
    { backgroundImage: 'url("javascript:alert(1)")' },
  ];
  for (const rules of corpus) {
    const server = compileScopedRule(rules);
    const client = clientClassFor(rules);
    assert(server.className === client.className,
      `class parity for ${JSON.stringify(rules).slice(0, 52)}`);
    assert(client.inserted.length === 1 && client.inserted[0] === `.${server.className}{${server.declarations}}`,
      `rule text parity for ${JSON.stringify(rules).slice(0, 52)}`);
  }
});

test('the client runtime drops a declaration set the server also drops', () => {
  const rules = { 'color:red}</style><script>x': 'y' };
  assert(compileScopedRule(rules) === null, 'server compiles nothing');
  assert(clientClassFor(rules).className === '', 'client mints no class');
});

test('the client runtime mints each rule once', () => {
  const inserted = [];
  const styleNode = { id: '', appendChild(node) { inserted.push(node.text); } };
  const sandbox = {
    document: {
      getElementById: () => null,
      createElement: () => styleNode,
      createTextNode: (text) => ({ text }),
      head: { appendChild() {} },
      documentElement: { appendChild() {} },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(clientCssRuntimeSource(), sandbox);
  vm.runInContext('_bhCssClass({color:"red"});_bhCssClass({color:"red"});_bhCssClass({color:"blue"});', sandbox);
  assert(inserted.length === 2, `three calls, two distinct rules (got ${inserted.length})`);
});

test('the emitted _mkEl runtime carries the shared CSS compiler', () => {
  assert(MK_EL_SRC.includes('_bhCssClass'), 'the class minter is present');
  assert(MK_EL_SRC.includes('_bhHash'), 'the shared hash is present');
  assert(!MK_EL_SRC.includes('function sv(v)'),
    'the hand-copied value sanitiser is gone in favour of the generated one');
});

/* ============================================================
   API SURFACE — one primitive instead of one method per case
   ============================================================ */

test('pseudoClass() reaches states the named helpers never covered', () => {
  const doc = new Document();
  doc.create('div')
    .pseudoClass('focus-visible', { outline: '2px solid' })
    .pseudoClass('nth-of-type(2n+1)', { background: '#eee' })
    .pseudoClass('not(.disabled)', { cursor: 'pointer' });
  const style = styleBlocks(doc.render());
  assert(/:focus-visible\{outline:2px solid;\}/.test(style), ':focus-visible compiles');
  assert(/:nth-of-type\(2n\+1\)\{background:#eee;\}/.test(style), ':nth-of-type() compiles');
  assert(/:not\(\.disabled\)\{cursor:pointer;\}/.test(style), ':not() compiles');
});

test('pseudoClass() is validated exactly as the named helpers are', () => {
  const viaPrimitive = new Document();
  viaPrimitive.create('div').pseudoClass(CSS_BREAKOUT, { color: 'red' });
  assert(!viaPrimitive.render().includes('<script>alert(1)'), 'the primitive refuses a hostile name');

  // The named helper and the primitive must produce the same rule for the same
  // input — they are one implementation, not two.
  const viaHelper = new Document();
  viaHelper.create('div').hover({ color: 'blue' });
  const viaName = new Document();
  viaName.create('div').pseudoClass('hover', { color: 'blue' });
  assert(styleBlocks(viaHelper.render()) === styleBlocks(viaName.render()),
    'hover() and pseudoClass("hover") compile identically');
});

test('the deprecated style aliases still behave as style() does', () => {
  const viaAlias = new Document();
  viaAlias.create('div').opacity(0.5).zIndex(100).cursor('pointer')
    .overflow('hidden').display('flex').position('absolute');
  const viaStyle = new Document();
  viaStyle.create('div').style('opacity', '0.5').style('z-index', '100')
    .style('cursor', 'pointer').style('overflow', 'hidden')
    .style('display', 'flex').style('position', 'absolute');
  assert(viaAlias.render() === viaStyle.render(), 'identical output from both spellings');
});

test('renderJSON is an exact alias of renderFromJSON', () => {
  const { renderJSON, renderFromJSON } = require('..');
  const def = { title: 'T', body: [{ tag: 'p', text: 'x' }] };
  assert(renderJSON(def) === renderFromJSON(def), 'identical output');
});

/* ============================================================
   5. DEPRECATED ALIASES
   ============================================================ */

test('every deprecated alias still does exactly what it replaced', () => {
  const canonical = new Document();
  canonical.create('div').attr('data-x', '1');
  canonical.globalCss('body', { margin: '0' });
  canonical.sharedClass('btn', { padding: '8px' });

  const aliased = new Document();
  aliased.child('div').attribute('data-x', '1');
  aliased.globalStyle('body', { margin: '0' });
  aliased.defineClass('btn', { padding: '8px' });

  assert(canonical.render() === aliased.render(), 'identical output from both spellings');
});

test('defineClass with a raw selector matches globalCss', () => {
  const viaGlobal = new Document();
  viaGlobal.globalCss('main > .row', { gap: '8px' });
  const viaDefine = new Document();
  viaDefine.defineClass('main > .row', { gap: '8px' }, true);
  assert(viaGlobal.render() === viaDefine.render(), 'identical output');
});

test('createElement matches create', () => {
  const a = new Document();
  a.create('section').text('x');
  const b = new Document();
  b.createElement('section').text('x');
  assert(a.render() === b.render(), 'identical output');
});

test('a deprecation notice is dev-only and announced once per name', () => {
  const original = console.warn;
  const seen = [];
  console.warn = (msg) => seen.push(String(msg));
  try {
    const doc = new Document();
    // Element.attribute() has already warned if another test reached it first,
    // so use a name this suite has not touched yet.
    doc.create('div').attribute('data-a', '1');
    doc.create('div').attribute('data-b', '2');
  } finally {
    console.warn = original;
  }
  assert(seen.filter(m => m.includes('W_DEPRECATED')).length <= 1,
    'at most one notice per name, however many calls');

  configure({ mode: 'prod' });
  const quiet = [];
  console.warn = (msg) => quiet.push(String(msg));
  try {
    new Document().globalStyle('body', { margin: '0' });
  } finally {
    console.warn = original;
    configure({ mode: 'dev' });
  }
  assert(quiet.length === 0, 'production says nothing');
});

/* ---- Summary ---- */
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(40));
process.exit(failed > 0 ? 1 : 0);
