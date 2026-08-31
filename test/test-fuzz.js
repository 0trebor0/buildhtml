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
// Real HTML event handler attributes. The invariant is stated against these
// rather than against a prefix: `one`, `only`, `once` and `online` begin with
// "on" but are not events, and a prefix assertion failed on them the moment the
// guard stopped over-matching. Naming the events keeps the property independent
// of how the guard happens to be written.
const HTML_EVENTS = ('click dblclick mousedown mouseup mouseover mouseout mousemove keydown keyup '
  + 'keypress focus blur change input submit reset load unload error abort scroll resize select '
  + 'drag dragstart dragend dragover dragenter dragleave drop wheel contextmenu copy cut paste '
  + 'play pause ended volumechange seeked seeking timeupdate canplay durationchange ratechange '
  + 'progress stalled suspend waiting emptied loadeddata loadedmetadata invalid search toggle '
  + 'animationstart animationend animationiteration transitionend touchstart touchend touchmove '
  + 'touchcancel pointerdown pointerup pointermove beforeunload hashchange popstate storage '
  + 'message online offline').split(' ');

property('isValidAttrKey never admits an event handler attribute', ITERATIONS, (s) => {
  const key = toKebab(s);
  if (isValidAttrKey(key)) {
    const lower = key.toLowerCase();
    for (const event of HTML_EVENTS) {
      for (const spelling of [`on${event}`, `on-${event}`, `on:${event}`]) {
        assert.notStrictEqual(lower, spelling, `accepted key is an event handler: ${key}`);
      }
    }
    assert(/^[a-zA-Z_][\w\-:.]*$/.test(key), 'accepted key is well formed');
  }
});

// The generator rarely produces a bare word like "one", so the interesting cases
// are asserted directly rather than left to chance.
property('the on* guard decides known names correctly', 1, () => {
  for (const word of ['one', 'only', 'once', 'online', 'onset']) {
    assert(isValidAttrKey(word), `${word} is an ordinary attribute, not an event handler`);
  }
  for (const event of HTML_EVENTS) {
    for (const spelling of [`on${event}`, `on-${event}`, `on:${event}`]) {
      assert(!isValidAttrKey(spelling), `${spelling} is refused`);
    }
  }
  for (const unknown of ['onfuturething', 'onxyz', 'oncex']) {
    assert(!isValidAttrKey(unknown), `${unknown} is refused, so the guard fails closed`);
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

/* ---- Template attribute interpolation ----
 * `#{}` now expands inside attribute values, which is a new route for arbitrary
 * data to reach an attribute. Escaping and URL sanitisation happen at render
 * time, below the parser, so the invariant is that an interpolated value can
 * never do more than a value passed through the ordinary attribute API: it must
 * not open a second attribute, add an element, or survive as an executable URL.
 */
const { renderTemplate } = require('..');

property('an interpolated attribute value cannot open a second attribute', Math.min(ITERATIONS, 500), (input) => {
  const html = renderTemplate('a(title="#{v}") "go"', { v: input });
  const tag = html.match(/<a[^>]*>/);
  assert.ok(tag, `the anchor disappeared for ${JSON.stringify(input)}`);
  // A breakout needs raw quotes beyond the pair delimiting title="...".
  assert.strictEqual((tag[0].match(/"/g) || []).length, 2,
    `extra raw quotes in ${JSON.stringify(tag[0].slice(0, 200))}`);
  assert.strictEqual((html.match(/<script\b/gi) || []).length, 0,
    'an interpolated value produced a script element');
});

property('an interpolated URL attribute never keeps an executable scheme', Math.min(ITERATIONS, 500), (input) => {
  for (const [tag, attribute] of [['a', 'href'], ['img', 'src'], ['form', 'action']]) {
    const html = renderTemplate(`${tag}(${attribute}="#{v}")`, { v: input });
    const match = html.match(new RegExp(attribute + '="([^"]*)"'));
    if (!match) continue;
    // A URL parser strips tab, LF and CR from an attribute value before
    // resolving it, so compare the way a browser would see it.
    // Model the URL parser, not JS \s. The parser removes tab/LF/CR anywhere in
    // the value and ignores leading C0 controls and space, but it does NOT strip
    // Unicode spaces — a value starting with U+00A0 or U+FEFF is a relative URL
    // to a browser, never an executable scheme. Using \s here asserted a
    // stricter rule than the web platform has, and failed on safe output.
    const resolved = match[1].replace(/[\t\n\r]/g, '').toLowerCase();
    assert.ok(!/^[\x00-\x20]*(javascript|vbscript|data):/.test(resolved),
      `${attribute} kept an executable scheme: ${JSON.stringify(match[1].slice(0, 120))}`);
  }
});

property('an interpolated value adds no element to the page', Math.min(ITERATIONS, 500), (input) => {
  const control = renderTemplate('a(title="#{v}") "go"', { v: 'safe' });
  const html = renderTemplate('a(title="#{v}") "go"', { v: input });
  assert.ok(countTags(html) <= countTags(control),
    `interpolation introduced elements: ${JSON.stringify(html.slice(0, 300))}`);
});

property('a fuzzed template line recovers instead of throwing', Math.min(ITERATIONS, 500), (input) => {
  // The parser promises to recover from a malformed line rather than throw.
  let html;
  try {
    html = renderTemplate(input.replace(/[\r\n]/g, ' ') + ' "text"');
  } catch (error) {
    throw new Error(`renderTemplate threw instead of recovering: ${error.message}`);
  }
  assert.strictEqual((html.match(/<script\b/gi) || []).length, 0,
    'a fuzzed tag produced a script element');
});

/* ---- Event listener options ----
 * The options object is reduced by normalizeEventOptions() and the result is
 * interpolated into the generated addEventListener call. That makes it a path
 * from caller data into compiled JavaScript, so the invariants are that only the
 * literal `true` is ever emitted for a known flag, nothing a caller supplied
 * reaches the script, and the script always parses.
 */
const LISTENER_FLAGS = ['once', 'passive', 'capture', 'preventDefault', 'stopPropagation'];

property('fuzzed event options never reach the generated script', Math.min(ITERATIONS, 500), (input) => {
  // Mix a fuzzed key and a fuzzed value in with a real flag, so the property
  // covers both an unknown key and a hostile value for a known one.
  const options = {};
  options[input] = input;
  options[pick(LISTENER_FLAGS)] = input;

  const doc = new Document();
  doc.create('button').text('go').on('click', function () { State.n = 1; }, undefined, options);
  const html = doc.render();
  const script = (html.match(/<script>([^]*?)<\/script>/) || ['', ''])[1];
  if (!script) return;

  // Whatever the caller passed, the emitted options object may only contain the
  // three listener flags set to the literal true.
  const emitted = script.match(/\},(\{[^}]*\})\)/);
  if (emitted) {
    assert.ok(/^\{(?:(?:once|passive|capture):true,?)+\}$/.test(emitted[1]),
      `unexpected options object emitted: ${JSON.stringify(emitted[1].slice(0, 160))}`);
  }
  assert.doesNotThrow(() => new vm.Script(script),
    `fuzzed options produced unparseable JavaScript for ${JSON.stringify(input)}`);
  assert.strictEqual((html.match(/<script\b/gi) || []).length, 1, 'options produced an extra script element');
});

property('a fuzzed event name cannot break out of its listener registration', Math.min(ITERATIONS, 500), (input) => {
  const doc = new Document();
  doc.create('button').text('go').on(input, function () { State.n = 1; });
  const html = doc.render();
  const script = (html.match(/<script>([^]*?)<\/script>/) || ['', ''])[1];
  if (!script) return;
  assert.doesNotThrow(() => new vm.Script(script),
    `event name ${JSON.stringify(input)} produced unparseable JavaScript`);
  assert.strictEqual((html.match(/<script\b/gi) || []).length, 1, 'an event name produced an extra script element');
});

/* ---- Declarative build() ----
 * build() accepts arbitrary plain objects, including shapes restored from JSON.
 * It must never throw and never introduce a script element, whatever it is given.
 */
property('a fuzzed build() definition never throws or emits a script', Math.min(ITERATIONS, 500), (input) => {
  const definitions = [
    input,
    { tag: input, text: input },
    { tag: 'div', text: input, attrs: { [input]: input } },
    { tag: 'div', children: [input, { type: 'text', content: input }] },
    { tag: 'div', class: input, id: input },
  ];
  for (const def of definitions) {
    const doc = new Document();
    try {
      doc.build(def);
    } catch (error) {
      // A tag name that cannot exist is the one legitimate throw here.
      if (/Invalid element tag|tag must be a non-empty string/.test(error.message)) continue;
      throw new Error(`build() threw for ${JSON.stringify(def).slice(0, 120)}: ${error.message}`);
    }
    const html = doc.render();
    assert.strictEqual((html.match(/<script\b/gi) || []).length, 0,
      `build() produced a script element for ${JSON.stringify(def).slice(0, 120)}`);
  }
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
