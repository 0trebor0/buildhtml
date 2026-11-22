'use strict';

const assert = require('node:assert/strict');
const { Script } = require('node:vm');
const { Document, page } = require('../index');
const { pools, resetPools } = require('../lib/pools');

const doc = page('Two targets');
doc.states({ count: 1 });
doc.h1('Hello <world>');
doc.button('+1').onClick(function () { State.count++; });
doc.span().bind('count');
doc.div().appendUnsafe('<strong>Explicit raw markup</strong>');
doc.inlineScript('console.log("HTML only")');
const html = doc.compile({ output: 'html' });
assert(html.includes('Hello &lt;world&gt;'));
assert(html.includes('<strong>Explicit raw markup</strong>'));
assert(html.includes('console.log("HTML only")'));
assert.equal(doc.body.length, 4, 'HTML compilation preserves the source tree');
assert.equal(doc.output(), '', 'compilation does not overwrite render output');
assert.throws(() => doc.compile({ output: 'class' }), /authored inlineScript/);
assert.equal(doc.body.length, 4, 'failed class compilation preserves the tree');
assert(doc.render().includes('Hello &lt;world&gt;'), 'normal render still works after compilation');
assert.equal(doc.body.length, 0, 'normal rendering still consumes the source');

const cached = new Document({ cache: true, cacheKey: 'compile-cache-test' });
cached.h1('Fresh compile');
const { responseCache } = require('../index');
responseCache.set('compile-cache-test', 'stale response');
try {
  assert(cached.compile().includes('Fresh compile'));
  assert.equal(responseCache.get('compile-cache-test'), 'stale response', 'compilation neither reads nor overwrites response cache');
} finally { responseCache.delete('compile-cache-test'); }

const reusable = page('Reusable');
reusable.h1('Native DOM');
reusable.input('text', { value: 'a & b' });
reusable.a('javascript:alert(1)', 'Blocked link');
reusable.cssVars({ accent: 'blue' });
reusable.htmlAttr('class', 'local-html').bodyAttr('class', 'local-body');
reusable.p('Styled').css({ color: 'var(--accent)' });
const js = reusable.compile({ output: 'class', className: 'HomePage' });
assert(js.includes('export { __buildhtmlPage as HomePage }'));
new Script(js.replace(/export \{[^}]+\};\s*$/, ''));
assert(js.includes('this.createElement("h1")'));
assert(js.includes('.appendChild('));
assert(js.includes('createTextNode("Native DOM")'));
assert(js.includes('setAttribute("href","#")'));
assert(js.includes(':host{--accent:blue;'));
assert(js.includes('this._html.setAttribute("class","local-html")'));
assert(js.includes('this._body.setAttribute("class","local-body")'));
assert(!/\beval\(|new Function\(/.test(js));
assert.equal(reusable.body.length, 4);
assert(reusable.compile().includes('<h1>Native DOM</h1>'));
assert(reusable.compile({ output: 'class' }).includes('export { __buildhtmlPage as GeneratedPage }'));
for (const className of ['Object', 'undefined', 'State', '__buildhtmlPage']) {
  new Script(reusable.compile({ output: 'class', className }).replace(/export \{[^}]+\};\s*$/, ''));
}

for (const className of ['bad-name', '1Page', 'class', 'await', 'eval', 'x{};globalThis.bad=true;//']) {
  assert.throws(() => reusable.compile({ output: 'class', className }), /Document.compile/);
}
for (const options of [null, [], { output: 'unknown' }]) {
  assert.throws(() => reusable.compile(options), /Document.compile/);
}
for (const configure of [
  d => d.addScript('/external.js'),
  d => d.addLink('/external.css'),
  d => d.rawHead('<meta name="unsupported">'),
  d => d.hashRouter(),
  d => d.create('script').text('alert(1)'),
  d => d.create('svg'),
  d => d.globalCss(':root', { color: 'red' }),
]) {
  const unsupported = new Document();
  configure(unsupported);
  assert.throws(() => unsupported.compile({ output: 'class' }), /Document.compile/);
}

const live = new Document();
const templateDoc = new Document();
templateDoc.create('template').span('Reusable template');
const templateSource = templateDoc.compile({ output: 'class' });
assert(templateSource.includes('.content.appendChild('), 'native template children are emitted into their content fragment');
assert(templateDoc.compile().includes('<template><span>Reusable template</span></template>'));

live.states({ items: [{ id: 1, title: 'One' }] });
live.liveList('items', item => ({ tag: 'p', text: item.title }), { key: 'id' });
live.views();
new Script(live.compile({ output: 'class' }).replace(/export \{[^}]+\};\s*$/, ''));
assert(live.compile().includes('<p>One</p>'), 'HTML compilation retains generated inline scripts');
assert(live._classScripts.size > 0);
live.clear();
assert.equal(live._classScripts.size, 0, 'clear discards generated-script classification');

resetPools();
const badAttribute = new Document();
let coercions = 0;
badAttribute.div().attrs.title = { toString() {
  if (++coercions > 1) throw new Error('attribute conversion failed');
  return 'initial attribute';
} };
assert.throws(() => badAttribute.compile({ output: 'class' }), /Unable to compile DOM content: Unable to compile attributes.*attribute conversion failed/);
assert.equal(badAttribute.body.length, 1, 'attribute compilation failure preserves its source');

resetPools();
const broken = new Document();
broken.body.push({ toString() { throw new Error('conversion failed'); } });
assert.throws(() => broken.compile(), /conversion failed/);
assert.equal(broken.body.length, 1, 'failed HTML compilation preserves its source');
assert.equal(pools.arrays.length, 6, 'failed compilation returns all context arrays');
console.log('Compilation passed: HTML/class outputs, source preservation, DOM generation, validation, supported scripts, and failure cleanup.');
