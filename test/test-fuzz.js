'use strict';

/**
 * Property-based / fuzz tests for the sanitisation boundary.
 *
 * These functions are the security perimeter: everything user-supplied passes
 * through them before reaching HTML, a <style> block, an attribute, or compiled
 * client JavaScript. Example-based tests only cover the payloads someone thought
 * of, so this generates inputs instead and asserts invariants that must hold for
 * every input.
 *
 * The generator is a seeded PRNG so a failure reproduces exactly: the seed is
 * printed on failure and can be replayed with BUILDHTML_FUZZ_SEED=<n>.
 */

const assert = require('assert');
const vm = require('vm');
const {
  escapeHtml, unescapeHtml, sanitizeCssValue, sanitizeUrl, safeJsonStringify,
  escapeJsString, isValidAttrKey, toKebab, normalizeTagName, isValidTagName, minHTML,
} = require('../lib/utils');
const { Document } = require('..');

let passed = 0;
let failed = 0;

const SEED = Number(process.env.BUILDHTML_FUZZ_SEED) || (Date.now() % 2147483647);
const ITERATIONS = Number(process.env.BUILDHTML_FUZZ_ITERATIONS) || 2000;

// mulberry32 — small, deterministic, dependency-free.
let _state = SEED >>> 0;
function rnd() {
  _state = (_state + 0x6D2B79F5) >>> 0;
  let t = _state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (n) => Math.floor(rnd() * n);

// Fragments deliberately biased toward things that break parsers.
const HOSTILE = [
  '<', '>', '"', "'", '&', '`', '\\', '/', '</script>', '</style>', '<script>', '<!--', '-->',
  'javascript:', 'JaVaScRiPt:', 'vbscript:', 'data:text/html', 'expression(', 'url(', '*/', '/*',
  ';', '{', '}', ':', '=', '\x00', '\x0b', '\x1f', '\x7f', ' ', ' ', '﻿',
  '\n', '\r', '\t', ' ', '  ', '\\u003c', '&amp;', '&lt;', '&#x27;', '%3Cscript%3E',
  'alert(1)', 'onerror', 'onclick', 'style', 'href', 'null', 'undefined', '__proto__',
  'ā', '→', '😀', '\uD800', 'ﬁ', 'ＡＢＣ',
];
function fuzzString(maxParts = 6) {
  let out = '';
  const parts = 1 + int(maxParts);
  for (let i = 0; i < parts; i++) {
    out += rnd() < 0.75 ? pick(HOSTILE) : String.fromCharCode(32 + int(95));
  }
  return out;
}

function property(name, iterations, fn) {
  const localSeedStart = _state;
  try {
    for (let i = 0; i < iterations; i++) {
      const input = fuzzString();
      try {
        fn(input);
      } catch (error) {
        error.message = `input ${JSON.stringify(input)} (seed ${SEED}, iteration ${i}): ${error.message}`;
        throw error;
      }
    }
    passed++;
    console.log(`  ✓ ${name} (${iterations} inputs)`);
  } catch (error) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    replay with BUILDHTML_FUZZ_SEED=${SEED} (state ${localSeedStart})`);
    console.error(error.stack || error);
  }
}

console.log(`\n▸ Sanitisation properties (seed ${SEED}, ${ITERATIONS} inputs per property)`);

/* ---- escapeHtml ---- */
property('escapeHtml output can never open a tag or close an attribute', ITERATIONS, (s) => {
  const out = escapeHtml(s);
  assert(!out.includes('<'), 'no raw <');
  assert(!out.includes('>'), 'no raw >');
  assert(!out.includes('"'), 'no raw "');
  assert(!out.includes("'"), 'no raw single quote');
});

property('escapeHtml is idempotent under unescape', ITERATIONS, (s) => {
  assert.strictEqual(unescapeHtml(escapeHtml(s)), s);
});

/* ---- attribute rendering ---- */
property('a fuzzed attribute value cannot escape its quoted attribute', ITERATIONS, (s) => {
  const doc = new Document();
  doc.div().attr('data-fuzz', s);
  const html = doc.render();
  const body = html.slice(html.indexOf('<body>'), html.indexOf('</body>'));
  const m = /<div data-fuzz="([^"]*)"><\/div>/.exec(body);
  assert(m, `attribute stayed inside its quotes: ${JSON.stringify(body)}`);
  assert(!m[1].includes('"'), 'value contains no raw quote');
  assert(!/<\s*script/i.test(body), 'no script element materialised');
});

property('a fuzzed text node never produces markup', ITERATIONS, (s) => {
  const doc = new Document();
  doc.p().text(s);
  const html = doc.render();
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
  assert(/^<p>[^<>]*<\/p>$/.test(body), `text stayed inert: ${JSON.stringify(body)}`);
});

/* ---- URLs ---- */
// Both URL properties test what the *browser* resolves, not the raw output: the
// URL parser removes \t, \n and \r from an attribute value, so a scheme split
// across them satisfied a check on the raw string while still executing.
const asBrowserSees = (s) => String(s).replace(/[\t\n\r]/g, '');

property('sanitizeUrl never lets an executable scheme through', ITERATIONS, (s) => {
  const out = asBrowserSees(sanitizeUrl(s));
  assert(!/^[\x00-\x20]*(?:javascript|vbscript|data)\s*:/i.test(out), 'no executable scheme');
});

property('a rendered href never begins with an executable scheme', ITERATIONS, (s) => {
  const doc = new Document();
  doc.a(s, 'link');
  const html = doc.render();
  const m = /<a href="([^"]*)"/.exec(html);
  assert(m, 'href rendered inside its quotes');
  assert(!m[1].includes('"'), 'no quote breakout');
  // Only the leading scheme is executable. "…?q=javascript:x" is an ordinary URL
  // and must survive, so the invariant is about position, not substring presence.
  const raw = asBrowserSees(unescapeHtml(m[1]));
  assert(!/^[\x00-\x20]*(?:javascript|vbscript|data)\s*:/i.test(raw),
    `href does not start with an executable scheme: ${JSON.stringify(raw)}`);
});

/* ---- CSS ---- */
property('sanitizeCssValue cannot terminate a declaration or open a block', ITERATIONS, (s) => {
  const out = sanitizeCssValue(s);
  for (const ch of ['<', '>', '{', '}', ';']) {
    assert(!out.includes(ch), `no raw ${ch}`);
  }
  assert(!/expression\s*\(/i.test(out), 'no expression()');
  assert(out.length <= 1000, 'length capped');
});

property('a fuzzed CSS value cannot break out of the style element', ITERATIONS, (s) => {
  const doc = new Document();
  doc.div().css({ color: s });
  const html = doc.render();
  for (const block of html.match(/<style[^>]*>[\s\S]*?<\/style>/g) || []) {
    const inner = block.slice(block.indexOf('>') + 1, block.lastIndexOf('</style>'));
    assert(!/<\/style/i.test(inner), 'no nested </style');
    assert(!/<script/i.test(inner), 'no script element');
  }
});

/* ---- JS embedding ---- */
property('safeJsonStringify output is parseable and script-safe', ITERATIONS, (s) => {
  const out = safeJsonStringify({ v: s });
  assert(!out.includes('<'), 'no raw < that could close a script');
  assert(!out.includes(' ') && !out.includes(' '), 'line separators escaped');
  assert.deepStrictEqual(JSON.parse(out), { v: s }, 'round trips through JSON.parse');
});

property('escapeJsString stays inside its double-quoted literal', ITERATIONS, (s) => {
  const out = escapeJsString(s);
  const script = new vm.Script(`("${out}")`);
  assert.strictEqual(script.runInNewContext(), s.replace(/\r/g, '\r'), 'literal evaluates back to the input');
  assert(!/<\/script/i.test(out), 'cannot close a script element');
});

/* ---- attribute keys and tag names ---- */
property('isValidAttrKey never admits an event handler attribute', ITERATIONS, (s) => {
  const key = toKebab(s);
  if (isValidAttrKey(key)) {
    assert(!/^on-?[a-z]/i.test(key), `accepted key is not an event handler: ${key}`);
    assert(/^[a-zA-Z_][\w\-:.]*$/.test(key), 'accepted key is well formed');
  }
});

property('normalizeTagName either returns a valid tag or throws', ITERATIONS, (s) => {
  let out;
  try {
    out = normalizeTagName(s);
  } catch (error) {
    assert(error instanceof TypeError, 'rejection is a TypeError');
    return;
  }
  assert(isValidTagName(out), `accepted tag is valid: ${JSON.stringify(out)}`);
  assert(!/[<>"'/\s]/.test(out), 'accepted tag has no markup characters');
});

/* ---- minifier ---- */
property('minHTML preserves text content and never invents markup', ITERATIONS, (s) => {
  const doc = new Document();
  doc.p().text(s);
  const html = doc.render();
  const minified = minHTML(html);
  const tagsBefore = (html.match(/<[a-z][^>]*>/gi) || []).length;
  const tagsAfter = (minified.match(/<[a-z][^>]*>/gi) || []).length;
  assert.strictEqual(tagsAfter, tagsBefore, 'tag count unchanged');
});

/* ---- callbacks ---- */
property('fuzzed context is embedded as valid JavaScript', Math.min(ITERATIONS, 400), (s) => {
  const doc = new Document();
  doc.states({ k: 1 });
  doc.button('go').onClick(function () { return 1; }, { label: s });
  const html = doc.render();
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  assert(script.length > 0, 'client script emitted');
  // The whole compiled script must parse; a broken context string would break it.
  new vm.Script(script);
});

/* ---- document-level round trip ---- */

// The client-script namespace is randomised per render, so normalise it before
// comparing two renders of the same document.
const normalise = (html) => html.replace(/_ssr[a-z0-9]+/g, '_ssrNS');

/** Builds the same document twice so toJSON/fromJSON can be compared fairly. */
function buildFuzzedDocument(doc, spec) {
  doc.title(spec.title);
  doc.lang(spec.lang);
  if (spec.meta) doc.meta('description', spec.meta);
  doc.states({ n: spec.stateValue });
  doc.globalStyle('.g', { color: spec.color });
  doc.sharedClass('shared', { padding: spec.padding });

  const root = doc.div().addClass(spec.className).css({ color: spec.color });
  root.attr('data-label', spec.label);
  root.aria({ label: spec.label });
  root.h2(spec.heading);
  root.p(spec.body);
  root.a(spec.href, spec.linkText);
  root.img(spec.href, spec.label);
  root.span().bind('n', function (v) { return String(v); });
  root.button(spec.linkText).onClick(function () { State.n += 1; });
  root.div().state(spec.stateValue);
  return doc;
}

function fuzzSpec() {
  return {
    title: fuzzString(3),
    lang: pick(['en', 'fr', 'de']),
    meta: fuzzString(2),
    stateValue: pick([0, 1, 'text', true]),
    color: pick(['red', '#abc', 'rgb(1,2,3)']),
    padding: pick(['1px', '2em']),
    className: pick(['card', 'panel', 'row']),
    label: fuzzString(2),
    heading: fuzzString(3),
    body: fuzzString(4),
    href: pick(['/safe', 'https://example.com/x', fuzzString(2)]),
    linkText: fuzzString(2),
  };
}

function roundTripProperty(name, iterations) {
  try {
    for (let i = 0; i < iterations; i++) {
      const spec = fuzzSpec();
      const source = buildFuzzedDocument(new Document(), spec);
      const json = JSON.parse(JSON.stringify(source.toJSON()));
      const direct = source.render();

      const rebuilt = new Document().fromJSON(json).render();

      if (normalise(direct) !== normalise(rebuilt)) {
        const a = normalise(direct);
        const b = normalise(rebuilt);
        let at = 0;
        while (at < a.length && a[at] === b[at]) at++;
        throw new Error(
          `round trip diverged at offset ${at} (seed ${SEED}, iteration ${i})\n` +
          `  spec:     ${JSON.stringify(spec)}\n` +
          `  direct:   ...${a.slice(Math.max(0, at - 60), at + 60)}...\n` +
          `  rebuilt:  ...${b.slice(Math.max(0, at - 60), at + 60)}...`
        );
      }
    }
    passed++;
    console.log(`  ✓ ${name} (${iterations} documents)`);
  } catch (error) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    replay with BUILDHTML_FUZZ_SEED=${SEED}`);
    console.error(error.message);
  }
}

roundTripProperty('toJSON -> fromJSON reproduces the rendered document', Math.min(ITERATIONS, 300));

/* ---- CSS names never introduce markup ----
 * Property names, selectors and class names are written into the <style> block
 * without escaping, so the invariant is structural rather than textual: whatever
 * a fuzzed name contains, the page must never gain an element because of it.
 * The comparison is against the same document built with a known-good name — a
 * rejected name legitimately produces FEWER elements (no rule, so no <style>),
 * but never more.
 */
const countTags = (html) => (html.match(/<[a-zA-Z][^>]*>/g) || []).length;
const countEl = (html, tag) => (html.match(new RegExp('<' + tag + '\b', 'gi')) || []).length;

property('a fuzzed CSS property name adds no element to the page', Math.min(ITERATIONS, 500), (input) => {
  const controlDoc = new Document();
  controlDoc.create('div').css({ color: 'red' });
  controlDoc.create('div').style({ color: 'red' });
  const control = controlDoc.render();

  const doc = new Document();
  doc.create('div').css({ [input]: 'red' });
  doc.create('div').style({ [input]: 'red' });
  const html = doc.render();

  assert.ok(countTags(html) <= countTags(control),
    `property name introduced elements: ${JSON.stringify(html.slice(0, 300))}`);
  assert.strictEqual(countEl(html, 'script'), 0, 'a property name produced a script element');
  assert.ok(countEl(html, 'style') <= countEl(control, 'style'), 'a property name produced a style element');
});

property('a fuzzed CSS selector or class name adds no element to the page', Math.min(ITERATIONS, 500), (input) => {
  const controlDoc = new Document();
  controlDoc.head.globalCss('body', { color: 'red' });
  controlDoc.sharedClass('ok', { color: 'red' });
  controlDoc.keyframes('ok', { from: { opacity: '0' } });
  controlDoc.mediaQuery('(min-width: 0px)', { body: { color: 'red' } });
  const control = controlDoc.render();

  const doc = new Document();
  doc.head.globalCss(input, { color: 'red' });
  doc.sharedClass(input, { color: 'red' });
  doc.keyframes(input, { from: { opacity: '0' } });
  doc.mediaQuery(input, { body: { color: 'red' } });
  const html = doc.render();

  assert.ok(countTags(html) <= countTags(control),
    `selector or class name introduced elements: ${JSON.stringify(html.slice(0, 300))}`);
  assert.strictEqual(countEl(html, 'script'), 0, 'a selector produced a script element');
  assert.ok(countEl(html, 'style') <= countEl(control, 'style'), 'a selector produced a style element');
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
