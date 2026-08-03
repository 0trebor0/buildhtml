'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
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

for (let index = 0; index < javascriptBlocks.length; index++) {
  assert.doesNotThrow(
    () => new Function(javascriptBlocks[index]),
    `README JavaScript block ${index + 1} must parse`
  );
}
for (let index = 0; index < guideJavaScriptBlocks.length; index++) {
  assert.doesNotThrow(
    () => new Function(guideJavaScriptBlocks[index]),
    `HTML guide JavaScript block ${index + 1} must parse`
  );
}

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
assert.match(hello.logs[0], /Rendered safely on the server/);

const counter = executeReadmeBlock(1, 'globalThis.__renderedReadmeHtml = html;');
assert.match(counter.context.__renderedReadmeHtml, /Count:/);
assert.match(counter.context.__renderedReadmeHtml, /<button[^>]*>\+1<\/button>/);
assert.match(counter.context.__renderedReadmeHtml, /<button[^>]*>Reset<\/button>/);
assert.match(counter.context.__renderedReadmeHtml, /addEventListener\("click"/);

console.log(
  `Documentation examples passed: ${javascriptBlocks.length} README and ${guideJavaScriptBlocks.length} guide JavaScript blocks parse, 2 complete quick starts execute, ${localLinks.length + guideLocalLinks.length} local links resolve, and ${documentedShortcuts.length} runtime shortcuts are documented.`
);
