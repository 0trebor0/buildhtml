'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const buildhtml = require('../index');
const { TEXT_TAGS } = require('../lib/shortcuts');

const readmePath = path.join(__dirname, '..', 'README.md');
const readme = fs.readFileSync(readmePath, 'utf8');
const guide = fs.readFileSync(path.join(__dirname, '..', 'docs', 'index.html'), 'utf8');
function decodeHtml(value) {
  return value
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}
const guideJavaScriptBlocks = Array.from(
  guide.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g),
  match => decodeHtml(match[1])
).filter(source => (
  /(?:^|\n)\s*(?:const |let |var |function |doc\.|app\.|State\.|card\.)/.test(source)
  && !/(?:^|\n)\s*type\s+\w+\s*=/.test(source)
));
const javascriptBlocks = Array.from(
  readme.matchAll(/```javascript\r?\n([\s\S]*?)```/g),
  match => match[1]
);

assert(javascriptBlocks.length >= 2, 'README must contain the two executable quick-start examples');

// ESM blocks cannot go through new Function(), which only accepts script source.
// Compile them as modules so import/export examples are still checked rather than
// skipped or downgraded to a non-JavaScript fence.
const isModuleSource = (source) => /(?:^|\n)\s*(?:import|export)\s/.test(source);
function assertModuleParses(source, label) {
  const file = path.join(
    os.tmpdir(),
    `buildhtml-readme-${process.pid}-${Math.random().toString(36).slice(2)}.mjs`
  );
  fs.writeFileSync(file, source);
  try {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${label} must parse as ESM: ${result.stderr}`);
  } finally {
    fs.unlinkSync(file);
  }
}

let esmBlockCount = 0;
for (let index = 0; index < javascriptBlocks.length; index++) {
  const source = javascriptBlocks[index];
  const label = `README JavaScript block ${index + 1}`;
  if (isModuleSource(source)) {
    esmBlockCount++;
    assertModuleParses(source, label);
  } else {
    assert.doesNotThrow(() => new Function(source), `${label} must parse`);
  }
}
assert(esmBlockCount >= 1, 'README must document at least one ESM example');
let guideEsmBlockCount = 0;
for (let index = 0; index < guideJavaScriptBlocks.length; index++) {
  const source = guideJavaScriptBlocks[index];
  const label = `HTML guide JavaScript block ${index + 1}`;
  if (isModuleSource(source)) {
    guideEsmBlockCount++;
    assertModuleParses(source, label);
  } else {
    assert.doesNotThrow(() => new Function(source), `${label} must parse`);
  }
}
assert(guideEsmBlockCount >= 1, 'the guide must document at least one ESM example');

const localLinks = Array.from(readme.matchAll(/\[[^\]]+\]\(([^)]+)\)/g), match => match[1])
  .filter(target => !/^(?:https?:|mailto:|#)/.test(target))
  .map(target => target.split('#')[0])
  .filter(Boolean);
for (const target of localLinks) {
  assert(fs.existsSync(path.join(__dirname, '..', target)), `README local link must exist: ${target}`);
}
const guideLocalLinks = Array.from(guide.matchAll(/href="([^"]+)"/g), match => match[1])
  .filter(target => !/^(?:https?:|mailto:|#)/.test(target))
  .map(target => target.split('#')[0])
  .filter(Boolean);
for (const target of guideLocalLinks) {
  assert(fs.existsSync(path.join(__dirname, '..', 'docs', target)), `HTML guide local link must exist: ${target}`);
}

const documentedShortcuts = [...TEXT_TAGS, 'a', 'button', 'img', 'input', 'textarea', 'select', 'hr', 'br'];
for (const shortcut of documentedShortcuts) {
  assert(readme.includes(`\`${shortcut}\``), `README shortcut reference must include ${shortcut}()`);
  assert(guide.includes(`<code>${shortcut}</code>`), `HTML guide shortcut reference must include ${shortcut}()`);
}
for (const heading of ['Signature', 'Returns', 'Void', 'Setup callback', 'Example']) {
  assert(readme.includes(`| ${heading} |`) || readme.includes(`| ${heading}`), `README shortcut table must document ${heading}`);
  assert(guide.includes(`<th>${heading}</th>`), `HTML guide shortcut table must document ${heading}`);
}

function executeReadmeBlock(index, suffix = '') {
  const logs = [];
  const context = {
    console: { log: (...values) => logs.push(values.join(' ')) },
    require(specifier) {
      assert.equal(specifier, '@trebor/buildhtml');
      return buildhtml;
    },
  };
  context.globalThis = context;
  vm.runInNewContext(`${javascriptBlocks[index]}\n${suffix}`, context, {
    filename: `README.md#javascript-${index + 1}`,
  });
  return { context, logs };
}

const hello = executeReadmeBlock(0);
assert.equal(hello.logs.length, 1);
assert.match(hello.logs[0], /<!DOCTYPE html>/);
assert.match(hello.logs[0], /<h1>Hello world<\/h1>/);
assert.match(hello.logs[0], /Rendered on the server/);
// The README's headline claim: a page using no reactive API ships no JavaScript.
assert.doesNotMatch(hello.logs[0], /<script/i, 'static quick start must emit no <script>');
assert.equal(hello.logs[0].length, 461, 'README quotes 461 bytes for the static quick start');

const counter = executeReadmeBlock(1);
assert.equal(counter.logs.length, 1);
assert.match(counter.logs[0], /Count:/);
assert.match(counter.logs[0], /<button[^>]*>\+1<\/button>/);
assert.match(counter.logs[0], /addEventListener\("click"/);
// The counter's companion claim: reactive pages do carry generated browser JS.
// Deliberately a range, not an exact count: callbacks are serialized as source
// text, so the byte total shifts by the line endings of the checkout.
assert.match(counter.logs[0], /<script/i, 'reactive quick start must emit a <script>');
assert.ok(
  counter.logs[0].length > 4000 && counter.logs[0].length < 7000,
  `README quotes ~5 KB for the counter; got ${counter.logs[0].length}`
);

console.log(
  `Documentation examples passed: ${javascriptBlocks.length} README and ${guideJavaScriptBlocks.length} guide JavaScript blocks parse, 2 complete quick starts execute, ${localLinks.length + guideLocalLinks.length} local links resolve, and ${documentedShortcuts.length} runtime shortcuts are documented.`
);
