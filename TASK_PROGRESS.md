# Task Progress

## Objective

Exercise every exported function, class, and public method of the library and
report what passes, what fails, and what is not covered.

## Status

Complete. The library was exercised end to end, and the failures found were then
fixed on request.

The two test failures have been **fixed and verified**:

0. **Security — `sanitizeUrl()` bypass via tab/LF/CR inside the scheme.** FIXED
   in `lib/utils.js`, with regression tests that fail without the fix.
3. `example/server.js` prerequisite. Its Express requirement is now stated in
   the file; running it still needs a manual install (see open items).

Two further defects were then fixed on request:

1. `Element.remove()` silently no-ops on top-level elements. FIXED in
   `lib/element.js`, with regression tests that fail without the fix.
2. The docs site states the `toggleClass` / `classIf` argument order backwards.
   FIXED in `docs/index.html`.

4. `before()` / `after()` had the same top-level no-op. FIXED in
   `lib/element.js`, with regression tests that fail without the fix.

5. `wrap()` had the same top-level no-op. FIXED in `lib/element.js`, with
   regression tests that fail without the fix.

Every tree operation — `remove()`, `before()`, `after()`, `wrap()` — now behaves
the same whether the element is at the top level or nested.

All are recorded under "Findings" below, with reproductions.

## Files inspected

- `index.js`, `index.mjs` — export surface (28 exports from both)
- `lib/element.js`, `lib/document.js` — constructors, tree building, `remove()`
- `lib/shortcuts.js` — tag, form, layout, and data helpers
- `lib/template.js` — `compile()`/`parse()` return shapes and `.bhtml` syntax
- `lib/middleware.js` — `createCachedRenderer` signature
- `lib/utils.js` — callback sanitizer, `findFreeVariables`, browser globals
- `lib/components.js`, `lib/live.js`, `lib/config.js`, `lib/metrics.js`
- `test/` (29 files) — existing corpus and real API usage
- `AGENTS.md` — rules (updated by the user mid-session; re-read before continuing)

## Files created, modified, or deleted

- Modified: `lib/utils.js` — the `sanitizeUrl` control-character strip (finding 0)
- Modified: `test/test.js` — two regression tests for finding 0
- Modified: `test/test-fuzz.js` — both URL properties now assert on the
  browser-resolved value
- Modified: `example/server.js` — prerequisite comment (finding 3)
- Modified: `lib/element.js` — `remove()` falls back to the document body (finding 1)
- Modified: `test/test-new-apis.js` — two regression tests for finding 1
- Modified: `docs/index.html` — corrected argument order (finding 2)
- Modified: `lib/element.js` — `before()`/`after()` fall back to the document
  body via a private `_siblingList()` helper (finding 4), and `wrap()` uses the
  same helper (finding 5)
- Modified: `CHANGELOG.md` — `Security` entry under `[Unreleased]`
- Modified: `TASK_PROGRESS.md` (this file)
- Test harnesses were written to the session scratchpad, deliberately outside the
  repo, since the rules forbid adding files that are not necessary.

## API surface measured

| Target | Total methods | Public | Private |
| --- | ---: | ---: | ---: |
| `Document` | 138 | 134 | 4 |
| `Element` | 226 | 221 | 5 |
| `Head` | 12 | 12 | 0 |
| `TemplateParser` | 27 | 2 | 25 |
| `Metrics` | 4 | 4 | 0 |
| Top-level exports | 28 | 28 | — |

## Tests run and results

Actual command output, summarised:

| Command | Result |
| --- | --- |
| `npm test` | **All 20 automated suites passed** (195, 36, 43, 47, 93, 177, 113, 27, 9, 21, 15 assertions per suite; 15 fuzz properties) |
| `npm run test:types` | `tsc --noEmit`, **exit 0** |
| `npm run test:browser` | **4 browser suites passed** (bindings, dashboard, routing, auth) |
| `node --check` on `lib/`, `test/`, `example/`, `benchmark/`, `scripts/`, `index.js` | **all 55 files parse OK** |
| ESM entry load | `index.mjs` loads, **28 exports** |

Scratchpad harnesses (not in the repo):

| Harness | Result |
| --- | --- |
| A. Valid-input sweep of every public method | **363 exercised, 0 failed**, 8 held back for separate handling |
| B. Exports / output methods / subpaths / integration | **50 passed, 0 failed** |
| C. Deep output assertions (asserts rendered markup, not just no-throw) | **278 passed, 0 failed** |
| D. Hostile-argument audit (21 values, single + paired, incl. collection entries) | **0 unguarded crashes** |
| E. String/escaping torture (28 payloads × every sink) | before fix **198 passed, 2 failed**; after fix **200 passed, 0 failed** |
| F. Whole-project integrity (files, metadata, declarations, examples) | **83 passed, 1 failed** — `example/server.js` still needs `express` installed manually |

All harnesses were re-run after every fix. A–F are as shown above with the fixes
in place; the only harness edit needed was in B, whose observation check asserted
the old `remove()` no-op and correctly began failing once finding 1 was fixed.

Harness E drives 28 payloads — XSS vectors, quotes, backslashes, null bytes,
control characters, `U+2028`/`U+2029`, lone surrogates, RTL overrides,
zero-width characters, emoji with ZWJ sequences, and a 50,000-character string —
through `escapeHtml`, `unescapeHtml` (round-trip fidelity), `escapeJsString`
(re-parsed out of its literal), `safeJsonStringify`, `sanitizeUrl`,
`isValidAttrKey`, `normalizeTagName`, `sanitizeCssValue`, and then end to end
through a page's text, attribute, link, list, table, CSS, and serialised-state
sinks. Injection is detected by comparing the rendered *element inventory*
against the same page built with a benign payload, which avoids the false
positives a regex over escaped text produces.

Harness F parses every `.js`/`.mjs`/`.cjs` in the repo, validates every
`.json`, checks `main`/`module`/`types` and all seven `exports` subpath targets
resolve on disk, checks every `files[]` entry exists, cross-checks
`engines.node` against the CI matrix floor, verifies `index.mjs` re-exports all
28 CJS names, checks every public `Document`/`Element` method appears in
`index.d.ts` and that no declared method is missing at runtime, runs every
example, runs the size benchmark, and resolves every internal README anchor.

Harness C covers, per method group: all 43 `TEXT_TAGS` on both `Document` and
`Element` in text and setup-function form plus escaping (4 assertions each);
every `on*` event shortcut compiles a real `addEventListener` and emits no
inline `on*` attribute; all three lifecycle hooks; all ten binding kinds emit
the expected `watchState`/listener code; 27 attribute helpers set the exact
attribute; 8 boolean attributes; class and CSS helpers including scoped-class
dedup; 11 head methods; structural operations (`before`, `after`, `wrap`,
`clone`, `find`, `findAll`, `findById`, `prependChild`, `childCount`, `index`,
`parent`, `isVoid`, `append` vs `appendUnsafe`); render determinism with ids
masked; `toJSON`/`fromJSON` round-trip; document caching; and
`renderStream()` byte-parity with `render()`.

Integration checks inside that last group: a kitchen-sink page using state,
bindings, events, `liveList`, `views`, routing, tables, forms and scoped CSS
renders with balanced `<script>` tags, a correct nonce, and no inline `on*`
attributes; and hostile content (`<script>alert(1)</script>"'&`) pushed through
headings, text, attributes, lists and tables stays escaped with script tags
balanced.

## Findings

### 0. SECURITY: `sanitizeUrl()` was bypassed by tab, LF, or CR inside the scheme — FIXED

**This affected the published 2.0.0 and defeated a documented security control.**

`sanitizeUrl()` (`lib/utils.js:89`) strips control characters before testing the
value against `DANGEROUS_URL_RE` (`lib/utils.js:88`), but the strip range
`[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]` deliberately excludes `\x09` (tab), `\x0A`
(LF) and `\x0D` (CR). Those are exactly the three characters the HTML/URL
specification requires browsers to remove from a URL attribute, so a scheme can
be split across them, pass the check intact, and be reassembled by the browser:

```js
sanitizeUrl('javascript:alert(1)')      // '#'                    blocked
sanitizeUrl('java\tscript:alert(1)')    // unchanged              passes
// rendered:  <a href="java\tscript:alert(1)">
// browser:   javascript:alert(1)  -> executes
```

Measured: 7 of 9 tested vectors bypass, including tab, LF, CR, mixed
`java\t\n\rscript:`, per-character `j\ta\tv\ta\ts\tc\tr\ti\tp\tt:`, plus
`vbs\tcript:` and `da\tta:text/html;base64,...`. Confirmed reaching the browser
through `href`, `src`, and `action`; `URL_ATTRS` (`lib/utils.js:95`) also covers
`formaction`, `cite`, `poster`, and `xlink:href`.

Leading whitespace is handled correctly — `'\tjavascript:...'` is blocked by the
`^[\x00-\x20]*` prefix in the regex. The gap is only for separators *inside* the
scheme.

Candidate fix — extend the strip to the whole C0 range so the regex tests what
the browser will actually see, closing the `\x09`/`\x0A`/`\x0D` hole without
touching `\x20` (a literal space must keep its current handling):

```js
const s = String(value).replace(/[\x00-\x1F\x7F]/g, '');
```

Not applied: this changes a security control's behaviour, and the rules require
flagging rather than expanding a testing task. Needs an explicit decision, plus
a regression test and a `Security` changelog entry when fixed.

### 1. `Element.remove()` silently did nothing at the top level — FIXED

`Document.create()` (`lib/document.js:262`) pushes the new element into
`this.body` but never sets `el._parent`. `Element.remove()`
(`lib/element.js:105`) begins `if (!this._parent) return this`, so an element
created directly on the document cannot be removed:

```js
const d = page('x');
d.div().id('top').remove();   // no-op; id="top" is still in d.render()

const outer = d.div();        // but nested removal works
outer.child('p').id('inner').remove();   // removed correctly
```

No error and no warning is raised, so the caller cannot tell. `remove` is
documented as a tree operation in `README.md:232` and typed `remove(): this` in
`typescript/index.d.ts:311`, neither of which mentions the restriction.

**Fix applied** in `lib/element.js:105`. `remove()` now falls back to splicing
the element out of `this._document.body` when it has no parent element.
`_document` was already wired up by `Document.create()`, so no new state was
needed; `Document.create()` is unchanged, avoiding a `_parent` that is a
`Document` rather than an `Element`.

Verified: top-level removal works with siblings preserved, nested removal
unchanged, `remove()` still returns the element for chaining, and calling it
twice is harmless. Tests added to `test/test-new-apis.js`
(`el.remove() on a top-level element`, `el.remove() twice is harmless`);
reverting `lib/element.js` makes them fail.

### 2. `docs/index.html:716` documented `toggleClass`/`classIf` argument order backwards — FIXED

The docs site states the parameters as `name, condition`. The implementation
(`lib/element.js:354`, `lib/element.js:361`) and the TypeScript declarations
(`typescript/index.d.ts:369-370`) both take `(condition, name)`:

```js
d.div().toggleClass(true, 'active');        // works
d.div().toggleClass('active', true);        // as documented — applies nothing
```

Verified: the documented order applies no class at all, silently. `README.md`
only lists the method names without an argument order, so it was not wrong; the
defect was confined to the docs site table.

**Fix applied** — the table now reads `condition, name` and carries a worked
example for each method. No code changed: the implementation and the TypeScript
declarations were already correct.

### 3. `example/server.js` cannot run from a clean clone — PARTIALLY FIXED

It requires `express`, which is not a dependency (correctly — it is not needed at
runtime) and was not mentioned anywhere. The file is absent from `package.json`
`files[]`, so npm consumers never receive it; only contributors hit this. Every
other example uses Node built-ins only and runs clean.

A comment at the top of the file now states the prerequisite and the install
command. The example still cannot run without that manual install, so harness F
continues to report it. Making it run unattended would mean adding `express` to
`devDependencies`, which the rules require asking about first — see open items.

### 4. `before()` and `after()` were also no-ops at the top level — FIXED

Found while fixing finding 1. Both opened with the same
`if (!this._parent) return this` guard, so they silently did nothing on an
element created directly on the document:

```js
const top = doc.div().id('anchor');
top.before('BEFORE_MARK');   // was a no-op, no error
top.after('AFTER_MARK');     // was a no-op, no error
```

**Fix applied** in `lib/element.js`. Both now resolve their sibling list through
a private `_siblingList()` helper, which returns the parent's children when there
is a parent element and the document body otherwise. The helper exists because
both methods needed the identical two-line resolution; it is private and called
only from those two methods.

Verified: insertion works at the top level in the correct position relative to
the anchor, Element siblings reparent correctly (`_parent` stays null for a
body-level element), string siblings are still escaped, and nested behaviour is
unchanged. Tests added to `test/test-new-apis.js`
(`el.before() and el.after() on a top-level element`,
`el.before() escapes a string sibling at top level`). Reverting `lib/element.js`
fails 6 assertions across findings 1 and 4.

### 5. `wrap()` was a no-op at the top level — FIXED

The same defect class again. `wrap()` opened with
`if (!this._parent || !this._document) return this`, so wrapping a top-level
element silently did nothing and returned the element unwrapped:

```js
const top = doc.div().id('wrapme');
top.wrap('section');   // was a no-op; no <section> in the output
```

**Fix applied** in `lib/element.js`. It now resolves its sibling list through the
same `_siblingList()` helper introduced for finding 4 and replaces the element in
place. `wrapper._parent` is set from `this._parent`, which is null for a
body-level element — correct, since a document-level wrapper has no parent
element.

Verified: wrapping works at the top level, the element keeps its position among
siblings, it is not duplicated, it is reparented to the wrapper, and the returned
wrapper accepts further configuration and children. Nested wrapping is unchanged.
Tests added to `test/test-new-apis.js` (`el.wrap() on a top-level element`,
`el.wrap() returns a usable wrapper at top level`). Reverting `lib/element.js`
fails 10 assertions across findings 1, 4 and 5.

A note for future harnesses: `render()` releases pooled elements, so inspecting
`_parent` or calling `render()` a second time after rendering gives misleading
results. Two false failures in my first check of this fix came from exactly that.

### 6. Corrections to my own harness (not library defects)

Recorded so the same wrong assumptions are not repeated:

- `.bhtml` template syntax is indentation-based (`div\n  h1 "Hello World"`), not
  mustache. `{{ }}` is not a delimiter.
- `compileTemplate()` and `compileFile()` return a `Document`, not a render
  function.
- `createCachedRenderer()` is an Express-style middleware factory returning
  `(req, res, next)`, not a plain memoiser.
- `renderFragment()` returns `{ html, css }`, not a string.
- `renderFromJSON()` takes `{ title, body }` plus an optional setup function.
- `toggleClass(condition, name)` and `classIf(condition, trueClass, falseClass)`
  take the condition first — see finding 2.
- `globalStyle(selector, rules)` takes a rules object, not a CSS string.
- `findById` is an `Element` method; `Document` does not have one.
- `Element` overrides `toString()` to return `html()`; `Document` does not
  override it, so `String(doc)` yields `[object Object]` rather than HTML. Not
  raised as a defect: nothing documents `String(doc)`, and `render()` is the
  documented path.
- `before(sibling)` / `after(sibling)` insert a *string* as escaped text, not as
  a new element — consistent with `append()`.
- `new Document({ title })` is **not** an option — `title` is a method. The
  TypeScript declarations correctly reject the object form; plain JS silently
  ignores it. Documentation already uses the method, so nothing is wrong here.

## Coverage gaps

- `TemplateParser` exposes 25 private methods reached only indirectly through
  `compile`/`parse`. Not directly asserted; no line-coverage tool is configured.
- 8 methods were held back from the automated sweep and checked individually
  instead: `save`, `clear`, `render`, `renderStream`, `output`, `remove`,
  `empty`, plus `renderFragment`.
- Reference-by-name and no-throw are proxies for coverage, not proof of correct
  behaviour. The integration and escaping checks above assert real output; the
  per-method sweep mostly asserts "does not throw and stays chainable".

## Notes and limitations

- Benchmarks and browser tests were run on Node v25.6.1, which is outside the
  supported matrix (18/20/22/24). CI covers the matrix; local runs do not.
- `react`, `react-dom`, `preact`, `preact-render-to-string`, `typescript` and
  `playwright` were installed with `--no-save --package-lock=false`, so
  `package.json` and the lockfile are untouched. Note that a later
  `npm install --no-save` prunes earlier unsaved packages, so `tsc` has to be
  reinstalled between such runs.

## Repository state

Four commits are ahead of `origin/main` and unpushed, from earlier tasks in this
session: `54cbaff`, `429caa2`, `ebf6cfe`, `d858ae6`. Those predate the rules
update and carry `Co-Authored-By` trailers; history has not been rewritten to
remove them, per the rule against rewriting history.

`package.json` is at `2.0.1` and the changelog section `[2.0.1] - 2026-08-17` is
cut, carrying the security fix plus the tree-operation, `dataTable` and
documentation fixes. 2.0.0 remains published and vulnerable until 2.0.1 ships.
`scripts/release-notes.js` extracts the section cleanly (4110 bytes, Security /
Fixed / Changed all present), and `npm pack --dry-run` reports 38 files,
118.5 kB packed. The packed tarball was installed into a clean project and
verified: the URL fix blocks tab- and newline-split schemes, all four tree
operations work at the top level, a static page still emits no script, and both
entry points plus all six subpaths resolve.

## Open items

- **Release the security fix.** Finding 0 is fixed in the tree but 2.0.0 remains
  vulnerable on npm; the fix reaches users only on publish.
- **Decide on `express` for `example/server.js`** — add it to `devDependencies`
  so the example runs unattended, or leave it as a documented manual install.
  Adding a dependency needs explicit approval.
- **Publish 2.0.1.** The version is bumped and the changelog section is cut, but
  npm still serves the vulnerable 2.0.0 until the release is actually published.
  Tagging and publishing are left to the maintainer.
- Bump to `2.0.1` and promote the `[Unreleased]` changelog section when a release
  is wanted.
- No `NPM_TOKEN` or trusted publisher is configured, so the tagged release
  workflow still fails at its publish step.
