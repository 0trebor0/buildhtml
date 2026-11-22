'use strict';

const assert = require('node:assert/strict');
const { Script } = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
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

const workspace = path.resolve(__dirname, '..');
const fixtureParent = path.join(workspace, '.baseline');
fs.mkdirSync(fixtureParent, { recursive: true });
const fixture = fs.mkdtempSync(path.join(fixtureParent, 'save-bundle-'));
try {
  const bundle = page('Bundle <title> café 😀');
  bundle.charset('windows-1252');
  bundle.htmlAttr('id', 'app').lang('fr').htmlAttr('dir', 'ltr');
  bundle.h1('Saved bundle');
  const htmlFile = path.join(fixture, 'nested', 'home #page.html');
  const jsFile = path.join(fixture, 'nested', 'home #page.js');
  assert.equal(bundle.saveBundle(htmlFile, { className: 'SavedPage' }), bundle);
  assert.match(fs.readFileSync(htmlFile, 'utf8'), /<title>Bundle &lt;title&gt; café 😀<\/title>/);
  assert.match(fs.readFileSync(htmlFile, 'utf8'), /<meta charset="UTF-8">/, 'bundle host declares the UTF-8 encoding used by file writes');
  assert.equal(bundle.head.charset, 'windows-1252', 'bundle generation leaves source charset unchanged');
  assert.match(fs.readFileSync(htmlFile, 'utf8'), /<html lang="fr" dir="ltr">/, 'host metadata does not duplicate the isolated HTML ID');
  assert.match(fs.readFileSync(htmlFile, 'utf8'), /<script type="module" src="\.\/home%20%23page.js"><\/script>/);
  const savedJs = fs.readFileSync(jsFile, 'utf8');
  assert.match(savedJs, /export \{ __buildhtmlPage as SavedPage \}/);
  assert.match(savedJs, /__buildhtmlInstance.mount/);
  new Script(savedJs.replace(/^export \{[^}]+\};$/m, ''));
  assert.equal(bundle.body.length, 1, 'saving a bundle preserves the source tree');
  assert.equal(bundle.output(), '', 'saving a bundle leaves render output unchanged');
  bundle.h2('Updated bundle');
  bundle.saveBundle(htmlFile);
  assert.match(fs.readFileSync(jsFile, 'utf8'), /Updated bundle/, 'subsequent exports overwrite the named outputs');

  const renamedDir = path.join(fixture, 'renamed');
  bundle.saveBundle(path.join(renamedDir, 'index.html'), { className: 'HomePage', filename: 'name #1' });
  const renamedHtml = path.join(renamedDir, 'name #1.html');
  const renamedJs = path.join(renamedDir, 'name #1.js');
  assert(fs.existsSync(renamedHtml) && fs.existsSync(renamedJs), 'filename overrides both output stems');
  assert(!fs.existsSync(path.join(renamedDir, 'index.html')) && !fs.existsSync(path.join(renamedDir, 'index.js')));
  assert.match(fs.readFileSync(renamedHtml, 'utf8'), /src="\.\/name%20%231.js"/);
  assert.match(fs.readFileSync(renamedJs, 'utf8'), /export \{ __buildhtmlPage as HomePage \}/);
  assert.equal(bundle.body.length, 2, 'renaming outputs preserves the document');

  for (const filename of ['', null, 42, '.', '..', '../escape', '..\\escape', 'bad/name', 'name.html', 'name.js', 'bad:name', 'name.', 'name ', 'CON']) {
    const invalidDir = path.join(fixture, 'invalid-filename');
    assert.throws(() => bundle.saveBundle(path.join(invalidDir, 'index.html'), { filename }), /filename/);
    assert(!fs.existsSync(invalidDir), 'invalid filename is rejected before creating outputs');
  }

  for (const invalidPath of [undefined, 42, '', path.join(fixture, 'invalid.js')]) {
    assert.throws(() => bundle.saveBundle(invalidPath), /output path must end in .html/);
  }
  assert.throws(() => bundle.saveBundle(htmlFile, null), /Expected bundle options/);
  const unsupported = new Document().rawHead('<meta name="unsupported">');
  const unsupportedDir = path.join(fixture, 'unsupported');
  assert.throws(() => unsupported.saveBundle(path.join(unsupportedDir, 'index.html')), /rawHead/);
  assert(!fs.existsSync(unsupportedDir), 'compilation failures do not create output directories');
  assert.throws(() => new Document({ nonce: 'test-response-nonce' }).saveBundle(htmlFile), /cannot reuse a response nonce/);
  const headNonce = new Document();
  headNonce.head.setNonce('test-response-nonce');
  assert.throws(() => headNonce.saveBundle(htmlFile), /cannot reuse a response nonce/);
  assert.throws(() => bundle.saveBundle(path.join(fixture, 'invalid-class', 'index.html'), { className: 'bad-name' }), /className/);
  assert(!fs.existsSync(path.join(fixture, 'invalid-class')));

  const originalWrite = fs.writeFileSync;
  for (const extension of ['.js', '.html']) {
    const failure = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const target = path.join(fixture, 'failed-' + extension.slice(1), 'index.html');
    try {
      fs.writeFileSync = (file, ...args) => {
        if (file.endsWith(extension)) throw failure;
        return originalWrite(file, ...args);
      };
      assert.throws(() => bundle.saveBundle(target), error => error.code === 'EACCES'
        && error.cause === failure && error.message.includes('index' + extension));
    } finally { fs.writeFileSync = originalWrite; }
  }
  assert.equal(bundle.body.length, 2, 'write failures preserve the source tree');

  const originalDirection = Object.getOwnPropertyDescriptor(Object.prototype, 'dir');
  try {
    Object.defineProperty(Object.prototype, 'dir', { value: 'rtl', configurable: true, enumerable: true });
    const cleanHost = path.join(fixture, 'prototype.html');
    new Document().saveBundle(cleanHost);
    assert(!fs.readFileSync(cleanHost, 'utf8').includes(' dir='), 'inherited attributes cannot enter the generated host');
  } finally {
    if (originalDirection) Object.defineProperty(Object.prototype, 'dir', originalDirection);
    else delete Object.prototype.dir;
  }

  const cliFile = path.join(fixture, 'cli', 'index.html');
  const cli = spawnSync(process.execPath, ['example/compilation.js', '--build', cliFile], { cwd: workspace, encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert(fs.existsSync(cliFile) && fs.existsSync(cliFile.replace(/\.html$/, '.js')));
  const invalidCli = spawnSync(process.execPath, ['example/compilation.js', '--build'], { cwd: workspace, encoding: 'utf8' });
  assert.equal(invalidCli.status, 1);
  assert.match(invalidCli.stderr, /output path must end in .html/);
} finally {
  const relative = path.relative(fs.realpathSync(workspace), fs.realpathSync(fixture));
  assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'fixture cleanup stays inside the repository');
  fs.rmSync(fixture, { recursive: true, force: true });
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
