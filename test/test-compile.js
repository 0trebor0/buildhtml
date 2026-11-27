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
const wired = new Document();
const message = wired.p('Waiting');
const trigger = wired.button('Ready');
const controller = { module: './status-panel.js', elements: [trigger, message] };
const wiredSource = wired.compile({ output: 'class', controller });
assert.match(wiredSource, /^import \* as __buildhtmlController from "\.\/status-panel\.js";/);
assert.match(wiredSource, /const elements = \[node\d+,node0\];/);
assert.match(wiredSource, /new __buildhtmlController\["default"\]\(\.\.\.elements\)/);
assert.throws(() => wired.compile({ controller }), /controller requires class output/);
assert.throws(() => wired.compile({ output: 'class', controller: { ...controller, elements: [] } }), /nonempty array/);
assert.throws(() => wired.compile({
  output: 'class', controller: { ...controller, elements: [new Document().p()] },
}), /mounted by this page/);
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
assert(js.includes('--accent:blue;'));
assert(!js.includes('attachShadow'), 'the generated class uses the supplied target directly');
assert(!js.includes('local-html') && !js.includes('local-body'), 'standalone mounts leave host attributes alone');
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
  bundle.bodyId('bundle-body').bodyClass('bundle-page');
  bundle.addLink('./theme.css').favicon('./icon.ico').addScript('./head.js');
  bundle.rawHead('<meta name="bundle-extra" content="yes">');
  bundle.inlineStyle('.note::after{content:"</STYLE>"}');
  bundle.globalCss(':root', { color: 'purple' });
  bundle.create('script').text('window.bodyScript = true;');
  bundle.create('svg').attr('viewbox', '0 0 10 10').create('circle').attr('r', 5);
  bundle.create('math').create('mi').text('x');
  bundle.inlineScript('window.first = "first";').inlineScript('window.second = window.first + " second";');
  bundle.h1('Saved bundle').css({ letterSpacing: '3px' });
  const htmlFile = path.join(fixture, 'nested', 'home #page.html');
  const jsFile = path.join(fixture, 'nested', 'home #page.js');
  assert.equal(bundle.saveBundle(htmlFile, { className: 'SavedPage' }), bundle);
  assert.match(fs.readFileSync(htmlFile, 'utf8'), /<title>Bundle &lt;title&gt; café 😀<\/title>/);
  assert.match(fs.readFileSync(htmlFile, 'utf8'), /<meta charset="UTF-8">/, 'bundle host declares the UTF-8 encoding used by file writes');
  assert.equal(bundle.head.charset, 'windows-1252', 'bundle generation leaves source charset unchanged');
  assert.match(fs.readFileSync(htmlFile, 'utf8'), /<html lang="fr" id="app" dir="ltr">/);
  assert.match(fs.readFileSync(htmlFile, 'utf8'), /<body id="bundle-body" class="bundle-page"><div id="app">/);
  const savedHtml = fs.readFileSync(htmlFile, 'utf8');
  assert.match(savedHtml, /<link rel="stylesheet" href="\.\/theme\.css"><link rel="icon" href="\.\/icon\.ico"><link rel="stylesheet" href="\.\/home%20%23page.css"><script src="\.\/head\.js"><\/script><meta name="bundle-extra" content="yes"><\/head>/);
  assert(!savedHtml.includes('<style>'));
  const savedCss = fs.readFileSync(path.join(fixture, 'nested', 'home #page.css'), 'utf8');
  assert(savedCss.startsWith('@charset "UTF-8";\n'));
  assert.match(savedCss, /:root\{color:purple;/);
  assert.match(savedCss, /\.note::after\{content:"<\/STYLE>"\}/);
  assert.match(savedCss, /letter-spacing:3px;/);
  assert.match(fs.readFileSync(htmlFile, 'utf8'), /<script type="module" src="\.\/home%20%23page.js"><\/script>/);
  const savedJs = fs.readFileSync(jsFile, 'utf8');
  assert(!savedJs.includes('.note::after'));
  assert(!savedJs.includes('letter-spacing:3px;'));
  assert.match(savedJs, /export \{ __buildhtmlPage as SavedPage \}/);
  assert.match(savedJs, /__buildhtmlInstance.mount/);
  assert(savedJs.indexOf('window.first =') > savedJs.indexOf('__buildhtmlInstance.mount'));
  assert(savedJs.indexOf('window.second =') > savedJs.indexOf('window.first ='));
  const bundleSyntax = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: savedJs, encoding: 'utf8' });
  assert.equal(bundleSyntax.status, 0, bundleSyntax.stderr);
  assert.equal(bundle.body.length, 4, 'saving a bundle preserves the source tree');
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
  assert.equal(bundle.body.length, 5, 'renaming outputs preserves the document');

  const directory = path.join(fixture, 'directory-output');
  assert.equal(bundle.saveBundle(directory, { className: 'HomePage', filename: 'named' }), bundle);
  assert.match(fs.readFileSync(path.join(directory, 'named.html'), 'utf8'), /src="\.\/named.js"/);
  assert.match(fs.readFileSync(path.join(directory, 'named.js'), 'utf8'), /export \{ __buildhtmlPage as HomePage \}/);
  bundle.saveBundle(directory);
  assert.match(fs.readFileSync(path.join(directory, 'index.html'), 'utf8'), /src="\.\/index.js"/);
  assert(fs.existsSync(path.join(directory, 'index.js')));

  const dottedDirectory = path.join(fixture, 'nested.html');
  bundle.saveBundle(dottedDirectory + path.sep, { filename: 'nested' });
  assert(fs.existsSync(path.join(dottedDirectory, 'nested.html')));

  const cascade = new Document();
  cascade.globalCss('.probe', { color: 'green' });
  cascade.rawHead('<link rel="stylesheet" href="./raw.css">');
  cascade.p('Probe').addClass('probe').css({ color: 'red' });
  const cascadeDir = path.join(fixture, 'cascade');
  cascade.saveBundle(cascadeDir);
  const cascadeHtml = fs.readFileSync(path.join(cascadeDir, 'index.html'), 'utf8');
  assert.match(cascadeHtml, /<link rel="stylesheet" href="\.\/index.css"><link rel="stylesheet" href="\.\/raw.css"><link rel="stylesheet" href="\.\/index.buildhtml-elements.css">/);
  assert.match(fs.readFileSync(path.join(cascadeDir, 'index.css'), 'utf8'), /color:green/);
  assert.match(fs.readFileSync(path.join(cascadeDir, 'index.buildhtml-elements.css'), 'utf8'), /color:red/);
  assert.throws(() => bundle.saveBundle(cascadeDir, { filename: 'index.BUILDHTML-ELEMENTS' }), /suffix .* is reserved/);
  assert.throws(() => bundle.saveBundle(path.join(cascadeDir, 'index.buildhtml-elements.html')), /suffix .* is reserved/);
  bundle.saveBundle(cascadeDir, { filename: 'index.elements' });
  assert.match(fs.readFileSync(path.join(cascadeDir, 'index.buildhtml-elements.css'), 'utf8'), /color:red/);
  const cascadeFiles = fs.readdirSync(cascadeDir).sort();
  const cascadeBefore = cascadeFiles.map(name => fs.readFileSync(path.join(cascadeDir, name), 'utf8'));
  cascade.p('New rule').css({ color: 'purple' });
  const renameCascade = fs.renameSync;
  try {
    fs.renameSync = (from, to) => {
      if (path.basename(from) === 'next.html') throw Object.assign(new Error('replacement denied'), { code: 'EACCES' });
      return renameCascade(from, to);
    };
    assert.throws(() => cascade.saveBundle(cascadeDir), { code: 'EACCES' });
  } finally { fs.renameSync = renameCascade; }
  assert.deepEqual(fs.readdirSync(cascadeDir).sort(), cascadeFiles);
  assert.deepEqual(cascadeFiles.map(name => fs.readFileSync(path.join(cascadeDir, name), 'utf8')), cascadeBefore);

  const elementOnly = new Document();
  elementOnly.rawHead('<style>.probe{color:blue}</style>');
  elementOnly.p('Probe').addClass('probe').css({ color: 'red' });
  const elementOnlyDir = path.join(fixture, 'element-only');
  elementOnly.saveBundle(elementOnlyDir);
  assert.deepEqual(fs.readdirSync(elementOnlyDir).sort(), ['index.css', 'index.html', 'index.js']);
  assert.match(fs.readFileSync(path.join(elementOnlyDir, 'index.html'), 'utf8'), /<\/style><link rel="stylesheet" href="\.\/index.css">/);

  for (const filename of ['', null, 42, '.', '..', '../escape', '..\\escape', 'bad/name', 'name.html', 'name.js', 'bad:name', 'name.', 'name ', 'CON']) {
    const invalidDir = path.join(fixture, 'invalid-filename');
    assert.throws(() => bundle.saveBundle(path.join(invalidDir, 'index.html'), { filename }), /filename/);
    assert(!fs.existsSync(invalidDir), 'invalid filename is rejected before creating outputs');
  }

  for (const invalidPath of [undefined, 42, '', '  ', path.join(fixture, 'invalid.js')]) {
    assert.throws(() => bundle.saveBundle(invalidPath), /destination must be a directory or an HTML path/);
  }
  assert.throws(() => bundle.saveBundle(htmlFile, null), /Expected bundle options/);
  for (const router of ['hashRouter', 'historyRouter']) {
    const routed = new Document()[router]();
    const routeDir = path.join(fixture, router);
    assert.throws(() => routed.compile({ output: 'class' }), /routers/);
    routed.saveBundle(path.join(routeDir, 'index.html'));
    const routeJs = fs.readFileSync(path.join(routeDir, 'index.js'), 'utf8');
    const event = router === 'hashRouter' ? 'hashchange' : 'popstate';
    assert(routeJs.indexOf(`addEventListener("${event}"`) > routeJs.indexOf('_initialize(){'));
    assert(routeJs.indexOf(`addEventListener("${event}"`) < routeJs.indexOf('__buildhtmlInstance.mount'));
  }
  assert.throws(() => new Document({ nonce: 'test-response-nonce' }).saveBundle(htmlFile), /cannot reuse a response nonce/);
  const headNonce = new Document();
  headNonce.head.setNonce('test-response-nonce');
  assert.throws(() => headNonce.saveBundle(htmlFile), /cannot reuse a response nonce/);
  assert.throws(() => bundle.saveBundle(path.join(fixture, 'invalid-class', 'index.html'), { className: 'bad-name' }), /className/);
  assert(!fs.existsSync(path.join(fixture, 'invalid-class')));

  const originalWrite = fs.writeFileSync;
  for (const extension of ['.css', '.js', '.html']) {
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
    assert.deepEqual(fs.readdirSync(path.dirname(target)), [], 'staging failures leave no partial output');
  }
  const originalRename = fs.renameSync;
  for (const existing of [false, true]) {
    const directory = path.join(fixture, existing ? 'replace-existing' : 'replace-new');
    const target = path.join(directory, 'index.html');
    if (existing) {
      fs.mkdirSync(directory);
      fs.writeFileSync(target, 'previous HTML');
      fs.writeFileSync(path.join(directory, 'index.js'), 'previous JS');
      fs.writeFileSync(path.join(directory, 'index.css'), 'previous CSS');
    }
    const failure = Object.assign(new Error('replacement denied'), { code: 'EACCES' });
    try {
      fs.renameSync = (from, to) => {
        if (to === target && path.basename(from) === 'next.html') throw failure;
        return originalRename(from, to);
      };
      assert.throws(() => bundle.saveBundle(target), error => error.code === 'EACCES' && error.cause === failure);
    } finally { fs.renameSync = originalRename; }
    assert.deepEqual(fs.readdirSync(directory).sort(), existing ? ['index.css', 'index.html', 'index.js'] : []);
    if (existing) {
      assert.equal(fs.readFileSync(target, 'utf8'), 'previous HTML');
      assert.equal(fs.readFileSync(path.join(directory, 'index.js'), 'utf8'), 'previous JS');
      assert.equal(fs.readFileSync(path.join(directory, 'index.css'), 'utf8'), 'previous CSS');
    }
    bundle.saveBundle(target);
    assert.deepEqual(fs.readdirSync(directory).sort(), ['index.css', 'index.html', 'index.js'], 'a retry publishes all files and removes staging');
  }
  const lockedDir = path.join(fixture, 'locked');
  const lockedHtml = path.join(lockedDir, 'index.html');
  let competingWriterChecked = false;
  try {
    fs.writeFileSync = (file, ...args) => {
      if (!competingWriterChecked && path.basename(file) === 'next.js') {
        competingWriterChecked = true;
        assert.throws(() => bundle.saveBundle(lockedHtml), { code: 'EEXIST' });
      }
      return originalWrite(file, ...args);
    };
    bundle.saveBundle(lockedHtml);
  } finally { fs.writeFileSync = originalWrite; }
  assert(competingWriterChecked);
  assert.deepEqual(fs.readdirSync(lockedDir).sort(), ['index.css', 'index.html', 'index.js']);

  const recoveryDir = path.join(fixture, 'recovery');
  fs.mkdirSync(recoveryDir);
  const recoveryHtml = path.join(recoveryDir, 'index.html');
  const recoveryJs = path.join(recoveryDir, 'index.js');
  fs.writeFileSync(recoveryHtml, 'previous HTML');
  fs.writeFileSync(recoveryJs, 'previous JS');
  const inaccessible = Object.assign(new Error('file in use'), { code: 'EACCES' });
  try {
    fs.renameSync = (from, to) => {
      if ((to === recoveryHtml && path.basename(from) === 'next.html')
        || (to === recoveryJs && path.basename(from) === 'previous.js')) throw inaccessible;
      return originalRename(from, to);
    };
    assert.throws(() => bundle.saveBundle(recoveryHtml), error => error.code === 'EACCES'
      && error.cause.errors.length === 2 && error.message.includes('Recovery files remain'));
  } finally { fs.renameSync = originalRename; }
  const staging = fs.readdirSync(recoveryDir).find(name => name.startsWith('.buildhtml-bundle-'));
  assert(staging, 'a failed rollback leaves its backup directory in place');
  assert.equal(fs.readFileSync(path.join(recoveryDir, staging, 'previous.js'), 'utf8'), 'previous JS');
  assert.equal(fs.readFileSync(recoveryHtml, 'utf8'), 'previous HTML', 'rollback still attempts to restore the other file');
  assert.throws(() => bundle.saveBundle(recoveryHtml), { code: 'EEXIST' });
  assert.equal(bundle.body.length, 5, 'write failures preserve the source tree');

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
  assert(fs.existsSync(cliFile) && fs.existsSync(cliFile.replace(/\.html$/, '.js')) && fs.existsSync(cliFile.replace(/\.html$/, '.css')));
  const invalidCli = spawnSync(process.execPath, ['example/compilation.js', '--build'], { cwd: workspace, encoding: 'utf8' });
  assert.equal(invalidCli.status, 1);
  assert.match(invalidCli.stderr, /destination must be a directory or an HTML path/);
  const navigationDir = path.join(fixture, 'navigation');
  const navCli = spawnSync(process.execPath, ['example/bundle-navigation.js', navigationDir], { cwd: workspace, encoding: 'utf8' });
  assert.equal(navCli.status, 0, navCli.stderr);
  for (const name of ['basic', 'panels', 'dashboard']) {
    assert.deepEqual(fs.readdirSync(path.join(navigationDir, name)).sort(), ['index.css', 'index.html', 'index.js']);
  }
} finally {
  const relative = path.relative(fs.realpathSync(workspace), fs.realpathSync(fixture));
  assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'fixture cleanup stays inside the repository');
  fs.rmSync(fixture, { recursive: true, force: true });
}

const live = new Document();
const repeatedLists = new Document();
repeatedLists.states({ items: ['One'] });
const listDef = { id: 'initial', liveList: { stateKey: 'items', itemFn: item => ({ tag: 'p', text: item }) } };
for (const id of ['first-list', 'second-list']) {
  repeatedLists.build(listDef);
  repeatedLists.body.at(-1).id(id);
}
for (const output of ['html', 'class']) {
  const ids = Array.from(repeatedLists.compile({ output }).matchAll(/var _cid="([^"]+)";/g), match => match[1]);
  assert.deepEqual(ids, ['first-list', 'second-list'], `${output} preserves both list registrations`);
}
const templateDoc = new Document();
templateDoc.create('template').span('Reusable template');
const templateSource = templateDoc.compile({ output: 'class' });
assert(templateSource.includes('.content.appendChild('), 'native template children are emitted into their content fragment');
assert(templateDoc.compile().includes('<template><span>Reusable template</span></template>'));

live.states({ items: [{ id: 1, title: 'One' }] });
live.liveList('items', item => ({ tag: 'p', text: item.title }), { key: 'id' }).id('compiled-list');
live.views();
const liveClass = live.compile({ output: 'class' });
new Script(liveClass.replace(/export \{[^}]+\};\s*$/, ''));
assert.match(liveClass, /var _cid="compiled-list";/);
assert.match(live.compile(), /var _cid="compiled-list";/);
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
