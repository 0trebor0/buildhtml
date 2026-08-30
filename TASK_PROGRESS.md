# Task Progress

## Objective

Exercise every exported function, class, and public method of the library and
report what passes, what fails, and what is not covered. Fix what failed, then
write an in-depth tutorial covering the API and shortcuts.

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
- Modified: `docs/index.html` — 21 tutorial sections, a labelled sidebar nav
  group, a hero link, and styling for the nav group labels
- Created: `test/test-tutorial.js` — executes every tutorial code block and
  asserts the behavioural claims the prose makes
- Modified: `test/run-all.js` — registers the tutorial suite
- Modified: `README.md` — links to the tutorial
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

Harness C covers, per method group: all 41 `TEXT_TAGS` on both `Document` and
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

Decision (2026-08-11): 2.0.0 stands. The version is correct semver — the helper
changes alter existing callers' rendered output, so a major is required, and
2.0.0 is the next major after 1.2.5. The alternative considered and declined was
shipping the new behaviour opt-in as 1.3.0 with a deprecation window. Release is
deliberately on hold; nothing tagged or published.

## Tutorial

Written as markdown, verified, then converted into the guide's markup with a
throwaway script so the code blocks stayed byte-identical to the ones already
being executed. It lives in `docs/index.html` rather than as a separate
`.md`, because GitHub Pages serves `index.html` as the site and a loose markdown
file beside it would not be part of it.

`test/test-tutorial.js` extracts the `tut-` sections from the guide, executes
each runnable block, and then asserts the prose: that `css()` dedupes, that
`text()` escapes while `appendUnsafe()` does not, that `validate()` names a
captured server variable, that a static page emits no script, that the nonce
reaches the generated script, that `list(items, null, 'ol')` and `ol()` differ,
that `new Document({ title })` is ignored, and that `toggleClass` applies
nothing in the reversed order. The tag list and its stated count are checked
against `TEXT_TAGS`, which caught a wrong count (43 claimed, 41 actual) while
writing it.

Verified in a browser: 36/36 sections balanced, no duplicate ids, all 22 nav
links resolve, callouts and code blocks render, and the guide's search filters
tutorial sections correctly.

## Documentation audit

Cross-checked the guide against the implementation, then fixed what it found.

Three statements were **wrong**, each silent when followed:

- `component(name, props?, children?)` and `use(fn, props?, children?)` — the
  third parameter is `overrides` (an object whose `tag` replaces the registered
  tag) and `tag` (a string) respectively. Proven: `component('C', {}, { tag:
  'article' })` yields `<article>`, `use(fn, {}, 'section')` yields `<section>`.
- `oncreate | fn(State)` — the generated code invokes it as `(source)()` with no
  arguments (`lib/renderer.js:322`), so the parameter was always `undefined`.
- `output()` was described as returning the rendered page. It returns
  `this._lastRendered` (`lib/document.js:746`) and never renders, so it is `''`
  until `render()` or `save()` has run. Found while verifying the replacement
  wording, not in the original audit.

**Sixty public methods and exports** were never mentioned anywhere in the guide —
47 on `Element`, 7 on `Document`, 6 top-level. All are now in the reference. The
audit re-run reports 0. All 60 were already in `index.d.ts`, so autocomplete had
them; only the prose was missing.

Also verified as correct and left alone: no method is documented that does not
exist; all 55 guide code blocks execute (the suite only *parses* the
non-tutorial ones); `Document` option defaults; `views` selectors; and the
`bindShow`/`bindClass`/`bindAttr`/`bindStyle`/`bindProp`/`state`/`addLink`
signatures.

Two of my own first-pass readings were wrong and are recorded so they are not
repeated: `addLink` takes a stylesheet URL *string* and hardcodes
`rel="stylesheet"` (the guide was right), and `TemplateParser` *is* declared in
`index.d.ts` at line 924 — a too-strict regex reported it missing.

Note that `render()` consuming the document is still explained only in the
tutorial sections; the reference tables mention it under `validate` but not
under `render`.

## Remaining items, fixed

Everything outstanding apart from the npm release itself:

- **`select()` dropped primitive options.** A string or number fell through the
  object property reads and emitted `<option></option>` — no value, no label, no
  warning, the same silent-wrong-output class as the `dataTable` headers bug. It
  is now used as both value and label. Objects unchanged, forms mix, nullish
  entries still skipped, and both value and label are escaped. Declaration
  widened to `Array<SelectOption | string | number>`; four tests added.
- **`State` was undeclared in TypeScript.** Every reactive callback produced
  `TS2304: Cannot find name 'State'` under `.ts` or `@ts-check`. Declared as a
  global typed by a new exported `BuildHtmlState` interface, so it works out of
  the box and can be sharpened by declaration merging. Verified against a clean
  consumer project: the file that previously failed now compiles with exit 0.
- **JSDoc was sparse** (36 blocks in 1,068 lines). Added 38 covering argument
  order, return shapes, no-argument callbacks, and the methods whose behaviour
  is not guessable from the signature. One block landed on `Head.render()` by
  prefix collision and was corrected to describe the head, not the document; a
  placement audit over all 39 documented declarations found no other mismatch.
- **`render()` consuming the document** is now stated in the reference row, not
  only in the tutorial.
- **`example/server.js`** exits with an explanation and the install command when
  Express is missing, rather than a bare `MODULE_NOT_FOUND` stack.

`express` was deliberately **not** added to `devDependencies`: the project has
none at all, and CI installs its tooling with `--no-save --package-lock=false`.
Adding one to make a single example run would break that stance. Harness F still
reports `server.js`, because that harness asserts every example runs with no
setup — which is not true of this one by design.

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

## Injection, resource and tree-ownership audit (2026-08-22)

A six-phase remediation brief was checked claim by claim against the code before
anything was changed. Every claim in phases 1-5 reproduced. Two were narrower
than stated and are recorded as such below.

### Verification method

Each claim was reproduced with a script that asserts on the **rendered page**,
not on an internal field — what matters is whether the byte sequence reaches the
browser. After the fixes, the new suite was run against a pristine checkout of
`HEAD` (`git archive HEAD` into a scratch tree): **59 assertions fail on the
unfixed library and 0 on the fixed one**, which is what distinguishes a
regression test from a tautology.

### Confirmed and fixed

- **Phase 1 - JSON callback restoration.** All five sinks reproduced:
  `events[].fn`, `computed`, `stateBindings[].templateFn`, event `context`, and
  element `cssText` each rendered `</script><script>alert(1)</script>` into the
  page. A sixth, not in the brief, was found while reading `lib/renderer.js:217`:
  a `classToggle` binding's `expectedValue` is interpolated into
  `Object.is(val,${expectedValue})` as a bare expression. Fixed in
  `lib/builder.js`.
- **Phase 2 - CSS injection.** `css()`, `globalCss()` and `Head.addClass()`
  reproduced a full `</style><script>` breakout. `style()` was **narrower than
  claimed**: the style attribute is HTML-escaped at render, so a property name
  cannot introduce markup there — but it could smuggle a second declaration
  (`{'color:red;pointer-events': 'none'}`), which is still a real defect and is
  fixed. Validators live in `lib/utils.js`; call sites in `lib/element.js`,
  `lib/head.js`, `lib/document.js`.
- **Phase 3 - render() cleanup.** Reproduced: 10 failed renders drained the array
  pool from 6 to 0. Two sub-claims were **already true before the change** and
  needed no fix — `_lastRendered` was already untouched on failure, and the cache
  write already happened after the render, so no partial entry was possible. The
  leak was the real defect. Fixed with `try/finally` in `lib/document.js`.
- **Phase 4 - tree ownership.** Reproduced in full: a moved element rendered
  twice, and both self-insertion and an ancestor cycle overflowed the stack.
  Fixed in `lib/element.js` with `_detach()`, `_adopt()` and
  `_containsSelfOrAncestor()`.
- **Phase 5 - stream test.** Confirmed: `html.length > afterOne * 5` asserted a
  ratio between two document sizes and only held because the fixture happened to
  be 5000 paragraphs. Replaced with behavioural assertions. `renderStream()`
  itself was not changed.

### Sub-claims that were already mitigated

- "Reject malformed event names, IDs, and target IDs." These are interpolated
  into the client script through `escapeJsString()`, which already neutralises
  `</script`, so no breakout was possible. Validation was added anyway — it is
  cheap and turns a typo into a recorded failure instead of a dead `getById()` —
  but it closed no hole.

### Deviation from the brief

The brief said the default JSON import "must reject `cssText`, compiled
`globalStyles`, and compiled `classStyles`", with a trusted option only "if
round-trip restoration requires them". Round-trip restoration **does** require
them — scoped `css()` output exists nowhere else — so rejecting them by default
would have broken `toJSON()` -> `fromJSON()` for every document using scoped CSS.
They are instead **validated** by default (`isSafeRawCss`: no `<`, no control
characters), which blocks every breakout while leaving all legitimate round trips
untouched, plus an explicit `trustedCss: true` opt-out. This satisfies the stated
completion criterion ("raw snapshot restoration is explicitly trusted or
removed") without the compatibility break.

### Files changed

`lib/utils.js` (validators `isValidCssProperty`, `isValidCssCustomProperty`,
`isSafeCssSelector`, `isValidClassName`, `isSafeRawCss`, plus
`compileCssDeclarations` and `warnInvalidCss`), `lib/builder.js`,
`lib/element.js`, `lib/head.js`, `lib/document.js`, `test/test-security.js`
(new, 95 assertions), `test/test-fuzz.js` (two CSS structural invariants),
`test/test-stream.js`, `test/run-all.js`.

### Commands run and results

```
node --check lib/utils.js lib/builder.js lib/element.js lib/head.js lib/document.js
                              -> all OK (run individually)
node test/run-all.js          -> All 22 automated suites passed
                                 (test-security.js: 95 passed, 0 failed;
                                  test-fuzz.js: 17 passed, 0 failed)
npm run test:types            -> tsc --noEmit, no output, exit 0
npm run test:browser          -> 4 Playwright suites passed
npm pack --dry-run            -> 38 files, 139.9 kB packed, 515.6 kB unpacked
new suite vs unfixed HEAD     -> 59 assertions fail (fixed tree: 0)
```

### Open items

- The public API surface is unchanged except for the additive `trustedCss` flag
  on `fromJSON()`, so `typescript/index.d.ts` was not touched. If `trustedCss` is
  to be a supported option rather than an escape hatch, it needs a declaration
  and a README entry.
- No version bump or release was made; the changes sit under `Unreleased`.

## Reactive sanitiser, nonce, minifier and parity audit (2026-08-22)

A second seven-phase brief, checked the same way: reproduce first, fix only what
reproduces. All six substantive claims reproduced. Two further defects were found
while inventorying phase 5 and are fixed alongside them.

### Confirmed and fixed

- **Phase 1 - reactive URL sanitisation.** Reproduced. `lib/renderer.js` (the
  `bindAttr` guard) and `lib/live.js` (`_mkEl`'s `uv()`) both used
  `[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]`, which omits tab, LF and CR. The server-side
  `sanitizeUrl()` had already been widened to the full C0 range in `55dc0b6`; the
  two generated copies never got that fix, so every reactive update re-admitted
  `java\tscript:`. Both are now generated from `clientUrlSanitizerBody()` in
  `utils.js`. Verified in Playwright against the resolved `element.href` after
  hydration, on both the `bindAttr` and `liveList` paths - and confirmed the new
  Playwright assertions **fail against unfixed `HEAD`**, at exactly the
  tab-split payload.
- **Phase 2 - `bindProp()`.** Reproduced: `bindProp('k','innerHTML')` compiled
  `el["innerHTML"]=...`, and URL properties compiled with no guard. Now an
  allowlist with three classes (refused / URL-guarded / inert), enforced in
  `Element.bindProp()` *and* in `compileClient()` so a JSON-restored binding
  cannot bypass it.
- **Phase 3 - CSP nonce caching.** Reproduced, and the worst of the batch: with
  `cache: true`, `cacheKey` and `nonce`, the second request received a
  byte-identical cached page carrying the *first* request's nonce. `render()` now
  bypasses the cache entirely when a nonce is present. Note the middleware
  already did this and the README already documented it for the middleware -
  `Document.render()` was the inconsistent path.
- **Phase 4 - minifier placeholders.** Reproduced dramatically: the input
  `<p>\x00PRESERVE0\x00</p><pre>  keep  me  </pre>` minified to
  `<p><pre>  keep  me  </pre></p><pre>  keep  me  </pre>` - the protected block
  both duplicated and relocated. Replaced the placeholder substitution with a
  segment scanner that inserts nothing into the string.
- **Phase 5 - sanitiser parity.** The URL drift was the claimed one; a direct
  comparison of the two implementations found **two more**:
  - `_mkEl`'s attribute check tested `/^on[a-z]/i` without the optional dash, so
    it **accepted `on-click`** - the kebab form of `attr('onClick')` - which the
    server rejects. That is a live inline handler appearing on hydration, not
    just cosmetic drift.
  - `_mkEl`'s CSS value sanitiser also stripped quotes, so
    `font-family: "Fira Code"` lost them on client rebuild.
  All three checks are now generated from shared sources, and a parity harness
  extracts the real generated functions from a rendered page and compares them
  against the server helpers across 30+ payloads.
- **Phase 6 - render lifecycle.** Extracted `_createRenderContext()` and an
  idempotent `_releaseRenderContext()`, used by both `render()` and
  `renderStream()`. The `try/finally` was already added in the previous audit.

### Test-quality changes made along the way

Three existing assertions matched the *source text* of generated code and were
replaced with assertions that **execute** it. Each had been passing while the
code it checked was wrong:

- `test-bindings.js` asserted the literal `?'#':_u`, which held for a guard that
  missed tab/LF/CR.
- `test.js` asserted the literal `!/^on[a-z]/i.test(k)`, which held for a check
  that accepted `on-click`.
- `test-stream.js` (previous audit) asserted a document-size ratio.

This is the brief's own point - "source-string assertions alone are
insufficient" - and it is why these bugs survived a green suite.

### Files changed

`lib/utils.js` (shared sources `URL_CONTROL_STRIP_SOURCE`,
`DANGEROUS_URL_SOURCE`, `CSS_VALUE_STRIP_SOURCE`, `ATTR_KEY_SOURCE`,
`EVENT_ATTR_SOURCE`; generators `clientUrlSanitizerBody`,
`clientCssValueSanitizerBody`, `clientAttrKeyValidatorBody`;
`classifyBindableProp`; rewritten `minHTML`), `lib/renderer.js`, `lib/live.js`,
`lib/element.js`, `lib/document.js`, `typescript/index.d.ts` (new `BindableProp`
type), `README.md`, `test/test-security.js`, `test/test-bindings.js`,
`test/test.js`, `test/test-browser.js`, `test/browser-fixture.js`.

### Commands run and results

```
node --check lib/{utils,element,renderer,live,document,builder,head}.js
                              -> all OK (run individually)
node test/run-all.js          -> All 22 automated suites passed
                                 (test-security.js: 294 passed, 0 failed)
npm run test:types            -> tsc --noEmit, no output, exit 0
npm run test:browser          -> 4 Playwright suites passed
npm run benchmark             -> static 4586 ops/s vs 4437 on unfixed HEAD,
                                 3929 HTML bytes on both (no regression;
                                 the raw-string baseline moved the same way)
npm run benchmark:size        -> unchanged
npm pack --dry-run            -> 38 files, 529.9 kB unpacked
CJS + ESM entry load          -> 28 exports each
packed artifact reproductions -> 10/10 blocked (extracted tarball, run directly)
new Playwright assertions vs unfixed HEAD -> fail at "java\tscript:"
```

### Incident during verification

`npm install <tarball>` was run from a scratch directory that had no
`package.json` of its own. npm walked up to the repository root and installed
there: it added a `dependencies` entry to `package.json`, created a
`package-lock.json`, and pruned the eight `--no-save` dev packages. Recovered
with `git checkout -- package.json`, deleting the lockfile, and one combined
`npm install --no-save --package-lock=false react react-dom preact
preact-render-to-string typescript@5 playwright` - combined because, as this file
already notes, a later `--no-save` install prunes earlier unsaved packages. Note
`typescript@5` specifically: an unpinned reinstall pulled TypeScript 7, which has
removed `moduleResolution: node10` and fails `test:types`; `CONTRIBUTING.md`
already documents the `typescript@5` pin. `package.json` and the absent lockfile
were verified back to their committed state, and the full suite, type check and
browser suites were re-run green afterwards. The packed-artifact check was then
redone by extracting the tarball outside the repository, with no `npm install`.

### Open items

- The `docs/index.html` guide still describes `bindProp` as "Assigns a DOM
  property" with no mention of the allowlist. `README.md` and the TypeScript
  declarations were updated; the guide was not.
- No version bump or release. Everything sits under `Unreleased`. The security
  entries warrant a patch release through the provenance workflow when you are
  ready.

## Whole-surface method audit (2026-08-22)

Brief: debug every method, test every method, confirm security.

### Method

Enumerated the real API surface by reflection rather than from the docs: 28 module
exports, 140 `Document` methods, 231 `Element` methods and 1 accessor, 12 `Head`
methods - **411 entry points**.

Two passes:

1. **Coverage.** Wrapped every prototype method, loaded the 13 pure-node suites
   in-process, and recorded which were never invoked. 310/383 prototype methods
   were exercised; the 73 untouched ones were all tag shortcuts and layout
   helpers (`article`, `td`, `grid`, `stack`, ...), no security-relevant logic.
2. **Hostile sweep.** Called every method with 24 argument shapes carrying
   attribute-breakout, script-breakout, style-breakout and control-character-split
   URL payloads, rendered the resulting page each time, and asserted security
   invariants on the output. **8,794 calls, 8,794 pages checked.**

Invariants asserted per page: no executable `alert()` inside a script element, no
injected inline `<script>`, no `on*=` attribute in the body, no executable scheme
in any URL attribute (compared after removing tab/LF/CR the way a URL parser
does), no `<style>` closed early, no attribute-breakout sequence.

### Four genuine bugs found and fixed

All four were live in `HEAD`, all four reachable through the ordinary public API,
and none were caught by the existing suite.

1. **`escapeJsString()` did not escape `'` - arbitrary JS execution.** The most
   serious of the four. `renderer.js` substitutes an escaped id into the caller's
   own function source at `__STATE_ID__`, and that placeholder conventionally sits
   in a single-quoted literal. Reproduced: an id of `x');alert(1);//` compiled to
   `getElementById('x');alert(1);//');` - the `alert(1)` is a real statement and
   the surrounding script still parsed as valid JS, so it would have run.
2. **`escapeJsString()` did not escape `<` - script-data parsing corruption.** An
   id of `<!--<script>` put four raw copies of that sequence inside the generated
   `<script>`. Per the HTML tokenizer this enters script-data-double-escaped
   state, where `</script>` stops closing the element.
3. **`jsonLd()` escaped only `</`.** Same double-escape hazard, through a plain
   data API rather than a raw one.
4. **`replaceWith(string)` skipped escaping.** Verified by comparing all seven
   insertion points side by side: `append`, `text`, `before`, `after`, `insertAt`
   and `prependChild` escaped; `replaceWith` alone emitted raw HTML.

Fixes: `escapeJsString()` now escapes `'`, `<`, `>`, U+2028 and U+2029 as
`\uXXXX` - inert in single-quoted, double-quoted and template literals alike, and
still round-tripping to the original character (asserted in all three literal
forms). `jsonLd()` uses `safeJsonStringify()`. `replaceWith()` escapes a
non-Element argument.

### Not bugs

- **8 methods still flagged by the sweep** are documented raw-content APIs, the
  equivalent of `dangerouslySetInnerHTML`: `appendUnsafe`, `raw`, `rawHead`,
  `inlineScript`, `inlineStyle`, `Document.addStyle`, `Head.addStyle`,
  `Head.addRawLink`. README already says "Reserve `appendUnsafe()`, `rawHead()`,
  and inline scripts for trusted content."
- **`component()` threw for every argument shape** - correct behaviour, it
  reports that the component is not registered.

### Commands run and results

```
reflection surface scan        -> 411 entry points
in-process coverage pass       -> 310/383 prototype methods exercised by suites
hostile sweep                  -> 8794 calls, 8794 pages checked,
                                  0 violations outside documented raw APIs
node --check lib/*.js          -> all parse
node test/run-all.js           -> All 22 automated suites passed
                                  (test-security.js: 376 passed, 0 failed)
BUILDHTML_FUZZ_ITERATIONS=20000 node test/test-fuzz.js -> 17 passed, 0 failed
npm run test:types             -> tsc --noEmit, exit 0
npm run test:browser           -> 4 Playwright suites passed
new tests vs unfixed HEAD      -> 113 assertions fail; all four new regression
                                  tests fail there and pass here
```

### Open items

- `docs/index.html` still lacks the `bindProp` allowlist note (carried over).
- Still no version bump or release; everything remains under `Unreleased`.

## Regression run and adversarial probe (2026-08-22)

### Method

Ran every automated suite the repository ships, then probed the public surface
with inputs the suites do not cover: cyclic and deeply nested `fromJSON()`
definitions, recursion depth binary-searched to the exact failing value,
attribute-position template interpolation, malformed template tag names, and
non-string template sources. Escaping claims were re-checked against the raw
rendered bytes rather than a loose regex.

### Tests run and results

```
node test/run-all.js                        -> All 22 automated suites passed
                                               (test-security.js: 376 passed, 0 failed)
node test/test-browser.js                   -> passed
node test/test-dashboard-browser.js         -> passed
node test/test-routing-browser.js           -> passed
node test/test-auth-interface-browser.js    -> passed
node test/test-server.js                    -> passed (starts, serves, shuts down)
node test/test-xss-debug.js                 -> passed
node test/example.js                        -> passed
BUILDHTML_FUZZ_ITERATIONS=20000 test-fuzz.js -> 17 passed, 0 failed
tsc --project typescript/tsconfig.json      -> exit 0, no diagnostics
node benchmark/render.js                    -> completed, 4698 ops/s static
node benchmark/runtime-size.js              -> completed
example/*.js (5 files, required)            -> all load without error
```

No shipped test fails. Everything below was found outside the suite.

### Findings — not yet fixed

None of these are fixed; they are recorded here for a decision on scope.

#### 7. Recursion depth: deep trees abort with `RangeError`, not a clear error

Four recursive descents have no depth guard. Binary-searched thresholds on
Node v22.23.2 (default stack):

| Path | Deepest nesting that works | Fails at |
|------|---------------------------|----------|
| `fromJSON()` / `renderFromJSON()` | 1717 | 1718 |
| `renderTemplate()` (indentation) | 2499 | 2500 |
| `Document.render()` | 4374 | 4375 |
| `Element.clone()` | 4999 | 5000 |

Reproduction:

```javascript
const { Document } = require('@trebor/buildhtml');
const doc = new Document();
let cur = doc;
for (let i = 0; i < 4375; i++) cur = cur.div();
doc.render(); // RangeError: Maximum call stack size exceeded
```

The failure is a catchable `RangeError`, not a crash, and the thresholds are far
above any realistic page. The defect is the diagnostic: a caller sees a stack
overflow from library internals rather than a stated limit. Severity: low.

#### 8. `fromJSON()` has no cycle detection

A definition object whose `children` reach back to an ancestor recurses until
the stack is exhausted:

```javascript
const { renderFromJSON } = require('@trebor/buildhtml');
const node = { tag: 'div', children: [] };
node.children.push(node);
renderFromJSON({ body: [node] }); // RangeError: Maximum call stack size exceeded
```

Only reachable when the definition is an in-memory object graph — a cycle cannot
survive `JSON.parse`, so a genuine JSON payload cannot trigger it. Severity: low.

Checked and **not** a defect: a shared (acyclic) node referenced twice per level
expands exponentially and can exhaust the heap, but its serialized form grows at
the same rate, so there is no small-input amplification. `__proto__` and
`constructor.prototype` keys in a JSON definition do **not** pollute
`Object.prototype` — verified clean.

#### 9. `#{}` interpolation is inert outside quoted text

Interpolation resolves in a quoted text body and nowhere else. In an attribute
value it emits the literal placeholder; in a class or id selector it drops the
selector entirely. All four cases are silent — no warning in dev mode.

```javascript
renderTemplate('p "#{v}"',            { v: 'hello' }); // <p>hello</p>          correct
renderTemplate('a(href="#{u}") "go"', { u: '/about' }); // <a href="#{u}">go</a>  literal
renderTemplate('p(title="#{v}") "t"', { v: 'hello' }); // <p title="#{v}">t</p>  literal
renderTemplate('div.#{c}',            { c: 'card' });  // <div></div>            class lost
renderTemplate('div##{i}',            { i: 'app' });   // <div></div>            id lost
```

The `href` case is the damaging one: the template reads correctly and ships a
broken link. README documents `#{}` only in text position, so this is a gap
rather than a contract violation, but the silence makes it hard to diagnose.
Severity: medium.

#### 10. A malformed tag name aborts the whole template instead of recovering

README states: "The parser recovers from a malformed line rather than throwing,
so a mistake still produces output. In development it reports what it dropped as
`W_TEMPLATE_SYNTAX`." Neither half holds for a malformed tag name.

An uppercase tag — a plausible typo — throws out of `renderTemplate()` and the
rest of the template is lost:

```javascript
renderTemplate('div\n  SPAN "y"\n  p "kept"');
// TypeError: Invalid element tag: SPAN  — the p line never renders
```

Other malformed names do not throw but are truncated at the first invalid
character, inventing an element the author never wrote and discarding the
quoted text with it. No `W_TEMPLATE_SYNTAX` warning is emitted for any of them
(verified by capturing `console.warn` in dev mode):

| Source | Rendered |
|--------|----------|
| `scr<ipt "x"` | `<scr></scr>` |
| `my tag "x"` | `<my></my>` |
| `di$v "x"` | `<di></di>` |
| `1div "x"` | `<div></div>` (leading digit stripped) |

Severity: medium — the throw contradicts a documented guarantee, and the
truncation silently changes the author's markup.

#### 11. Non-string template source throws an internal `TypeError`

`renderTemplate`, `compileTemplate` and `parseTemplate` reach `source.split`
before validating the argument:

```javascript
renderTemplate(null);      // TypeError: Cannot read properties of null (reading 'split')
renderTemplate(12345);     // TypeError: source.split is not a function
parseTemplate(['div']);    // TypeError: source.split is not a function
```

Elsewhere the library rejects a bad argument with a named message
(`normalizeTagName` throws `Element tag must be a non-empty string`). Severity:
low, API hygiene only.

### Checked and confirmed correct

- Attribute-name injection via `attr()`, `data()`, `aria()` and `setAttrs()` —
  escaped, no attribute or tag break.
- `id()` and `addClass()` with quote payloads — escaped.
- State keys carrying JS (`x;alert(1);var y`, `a";alert(1);var z="`) — embedded
  through `JSON.parse` of an escaped string literal; generated script parses and
  the payload stays data.
- `on()` / `onClick()` reject `eval(` and `document.cookie` sources.
- `toJSON()` → `fromJSON()` round trip is byte-identical (ids normalized) for
  static, reactive-binding and event-handler documents.
- `render()` clearing the document is intended and documented in
  `typescript/index.d.ts` and in `docs/index.html` in four places.
- `configure()` rejects an unknown `mode` with a warning and keeps the old value.

### Open items

- Findings 7-11 are unfixed and unscoped. 9 and 10 are the two worth fixing;
  7, 8 and 11 are diagnostic quality.
- Carried over from earlier sessions: `docs/index.html` still lacks the
  `bindProp` allowlist note; no version bump, everything remains `Unreleased`.

## Coverage gap closed: event shorthands and h4-h6 (2026-08-22)

### How the gap was identified

Enumerated every public prototype method by reflection (`Document`, `Element`,
`Head`, skipping `_`-prefixed internals) and searched the whole `test/` corpus
for a call site of each. An earlier in-process instrumentation attempt was
abandoned: loading the suites into one process shares module-level cache and
pool state between them, which produced two false failures in `test-middleware.js`
that do not occur when each suite runs in its own process.

Result — every one of the 28 module exports is referenced by the corpus, and
`Head` is fully covered. Two groups were never referenced anywhere:

- **24 of the 26 `on<Event>()` shorthands.** Only `onClick` and `onSubmit` were
  used. Each shorthand hard-codes a DOM event name, so a typo there compiles a
  listener for an event that never fires — silent at render time and invisible to
  every other assertion in the corpus.
- **`h4`, `h5`, `h6`** on both `Document` and `Element`.

### Tests added

`test/test-event-shortcuts.js` — new file, 153 assertions, registered in
`test/run-all.js` after `test-security.js`.

Per shorthand (all 26, table-driven, so a new shorthand is one line):

- compiles to `addEventListener("<event>")` with the correct event name
- registers *only* that event — the set of registered listeners in the compiled
  script must be exactly `["<event>"]`, which catches a copy-paste that leaves
  two shorthands sharing one event name
- returns the element, so chaining is unbroken
- serializes its `context` argument into the generated `fn.call(...)`
- routes through the same source sanitizer as `on()`: a handler reading
  `document.cookie` is dropped rather than compiled

Plus: a rejected handler leaves the element renderable and emits no source;
three shorthands stack on one element without clobbering each other.

For `h4`/`h5`/`h6`: correct tag from `Document` and nested under an element,
text escaping, and chainability.

### Verifying the tests are not vacuous

Mutation-tested against `lib/element.js`, restored after each run:

```
onDblclick -> this.on('doubleclick', ...)   -> 2 assertions fail (151 passed, 2 failed)
onChange   -> context argument dropped      -> 1 assertion fails  (152 passed, 1 failed)
git diff --stat lib/element.js              -> empty, source restored
```

### Results

```
node test/test-event-shortcuts.js  -> 153 passed, 0 failed
node test/run-all.js               -> All 23 automated suites passed
tsc --project typescript/...       -> exit 0
node --check test/test-event-shortcuts.js, test/run-all.js -> both parse
```

**No new test failed.** The previously untested surface is correct as written;
the gap was in the corpus, not the library.

### Files changed

- Added: `test/test-event-shortcuts.js`
- Modified: `test/run-all.js` — registers the new suite

### Remaining coverage gaps

- Findings 9 and 10 (template attribute interpolation, malformed tag recovery)
  have **no regression tests**, because they are unfixed — a test asserting the
  correct behaviour would fail today. They should be written together with the
  fix, not before it.
- `TemplateParser`'s 25 private methods are still reached only indirectly
  through `compile`/`parse`; no line-coverage tool is configured, so
  "referenced by the corpus" remains a proxy for coverage, not proof.
- `test/example.js` writes `test/output.html` on every run and the path is not
  in `.gitignore`, so a test run leaves the working tree dirty.

## Documentation accuracy audit (2026-08-22)

Brief: the guide and API reference must carry enough information to use the
library without reading `lib/`. README stays a small guide — everything else
belongs on the docs site, because an oversized README may not render on npm.

### Method

Enumerated the real surface by reflection and compared it against `README.md`,
`docs/index.html`, and `typescript/*.d.ts`:

1. **Method coverage** — every public prototype method name checked against each
   document.
2. **Option-key coverage** — every `options.*` / `def.*` key read anywhere in
   `lib/` extracted and checked the same way.

A first run reported every key missing. That was a harness bug, not a docs
result: this shell strips one backslash level inside heredocs, so the `\b`
word-boundary regex became a backspace character and matched nothing. Rewritten
with an index-based word match, which is what the numbers below come from.

### What was already correct

- Every public method appears in `typescript/*.d.ts`.
- `docs/index.html` covered every `Document` and `Element` method.
- `live.js` (18 keys), `shortcuts.js` (8), render options (5) and `page()`
  options (3) were fully documented.
- `radio()`'s `label` -> `text` -> `value` fallback and `field()`'s six option
  keys already matched the implementation.

The 46 method names absent from README are covered on the docs site; README is a
guide, not a reference, so that is by design and was left alone.

### Gaps found and fixed

1. **The JSON schema was undocumented.** 12 keys appeared in no document:
   node-level `cssText`, `stateBindings`; document-level `bodyAttrs`,
   `bodyClasses`, `classStyles`, `globalState`, `globalStyles`, `htmlAttrs`,
   `metas`, `oncreateCallbacks`, `sharedClasses`, `trustedCss`. All are genuine
   hand-authorable `fromJSON()` inputs, not internal artifacts. Anyone
   hand-writing a JSON page had to read `lib/builder.js` and `lib/document.js`.
   Added to `docs/index.html`: a full node-key table, a separate table for the
   shapes `toJSON()` emits, a document-key table, and a "Restoring untrusted
   JSON" section covering the compiled-CSS trust boundary and `trustedCss`.
   Also documented the authored/round-trip key pairs (`meta`/`metas`,
   `bodyClass`/`bodyClasses`, `state`/`globalState`) and that `globalStyles`
   accepts both the authored object and the compiled array.
2. **Half of `Head` was undocumented.** `setNonce`, `setTitle`, `setCharset`,
   `addRawLink`, `globalCss`, `hasStyles` appeared only in `.d.ts`. Added a
   `Head` table to `docs/index.html`.
3. **`attrs` versus chained setters was never shown.** Every documented
   `placeholder` used the setter; no example passed a shortcut-named attribute
   through `attrs`. Added both forms to the README form section with the two
   ways their output differs.
4. **`README.md` ID sentence was wrong.** It read "`field({ id })`, or
   `attrs.id` on `formGroup()`", implying `attrs.id` was the `formGroup` route.
   `lib/shortcuts.js:145` shows `field()` honours `attrs.id` as a fallback too.
   Corrected.

### README size

The JSON reference was drafted into README first, taking it from 62,273 to
69,869 bytes. That is the wrong place for it under the npm-rendering
constraint, so it was moved to `docs/index.html` and replaced with a one-line
pointer. Final: **63,487 bytes** (+1,214 over HEAD), the increase being the form
`attrs` example and the corrected ID sentence.

### Verification

Every key documented in the new tables was executed against the library rather
than transcribed from source comments — 48 cases, one per node key and per
document key, each asserting on rendered output.

```
node key + document key execution check -> 47 passed, 1 failed
node test/test-readme-examples.js       -> 51 README and 56 guide blocks parse,
                                           2 quick starts execute, 14 links resolve
node test/test-tutorial.js              -> 36 blocks execute, 23 behaviours hold
node test/run-all.js                    -> All 23 automated suites passed
docs/index.html tag balance             -> table 26/26, section 36/36, tbody 26/26
```

Two claims were caught wrong by that check and corrected before they shipped:

- A draft README passage claimed `attrs: { required: true }` and `.required()`
  produce identical markup. They do not: `required="true"` versus
  `required="required"`, and `attrs` is applied before `name` so attribute order
  differs. Reworded to state the difference.
- `{ type: 'text', content }` was documented without position. It works inside
  `children`, where `toJSON()` emits it, and throws at the top level. The table
  now says so.

### Files changed

- Modified: `README.md` — form `attrs` example, corrected ID sentence, JSON
  reference pointer
- Modified: `docs/index.html` — `Head` table, node-key table, `toJSON()` shapes
  table, document-key table, untrusted-JSON section

### Finding 12 — a top-level text node throws an internal TypeError

`doc.build({ type: 'text', content: 'x' })` throws
`TypeError: parentEl.text is not a function`. Valid in child position; at the
top level there is no parent to receive the text. Documented rather than fixed,
consistent with findings 7-11. Severity: low, diagnostic quality only.

### Re-check against the updated `AGENTS.md` (2026-08-22)

`AGENTS.md` was revised mid-task. The pending documentation change was re-checked
against every new rule; nothing in it needed to change.

| New rule | Status for this change |
|----------|------------------------|
| Flag task/code discrepancies before proceeding | Done — the audit *is* the discrepancy report; the two wrong draft claims were corrected before shipping rather than assumed correct |
| Check for overlapping branches, PRs, or in-progress work | Only the two local `backup/*` branches exist; no other branches. **`gh` is not installed here, so open GitHub PRs could not be checked** |
| Run the project's formatter if one is configured | **None is configured** — no prettier/eslint/editorconfig/biome config, no lint or format script, no dev dependencies. Manual style matching stands |
| Confirm runtime matches the declared version | No `.nvmrc`. `package.json` declares `node >=18.0.0`; ran Node v22.23.2, inside that range and one of the four CI versions (18, 20, 22, 24). **Only 22 was exercised locally; CI covers the rest** |
| No public API signature or behavior change | Satisfied — the change is documentation only. `git diff` against `lib/`, `index.js`, `index.mjs` and `typescript/` is empty |
| Update docs in the same change as behavior changes | Satisfied — `README.md`, `docs/index.html` and `CHANGELOG.md` were updated together; `CHANGELOG.md` is not the only record |
| Note pre-existing test failures separately | **No test was failing before or after.** All 23 suites passed at the start of this task and still pass |
| State what manual verification was or was not performed | See below |
| Respect `CODEOWNERS` | **No `CODEOWNERS` file exists** in `.github/` or the repo root |
| Do not rewrite git history | No history operation in this change. The earlier `filter-branch` was done on explicit instruction and confirmed first, per the new conflict rule |

### Manual verification of `docs/index.html`

The docs site is a rendered page, so tag-balance counting is not sufficient. It
was opened in a browser and inspected:

```
#builder section present                -> yes
new h3 headings rendered                -> "Node definition keys",
                                           "Document definition keys",
                                           "Restoring untrusted JSON"
tables / rows in that section           -> 4 tables, 62 rows
all six Head methods present in a table -> setTitle setCharset setNonce
                                           addRawLink globalCss hasStyles
horizontal overflow at 718px            -> none (scrollWidth == clientWidth)
```

The site's search concatenates `data-search` with `textContent`, so the new
tables are indexed without touching the `data-search` attribute. Verified by
driving the search box: `trustedcss`, `cssText`, `htmlAttrs` and
`oncreateCallbacks` each resolve to the `builder` section, `setNonce` and
`hasStyles` to the `document` section.

Not verified manually: rendering on a real mobile viewport, and the published
GitHub Pages build (only the local file was opened).

## Event listener options and modifiers (2026-08-22)

Brief: expand event handling with listener options (#1) and declarative
modifiers (#2). Do not break anything; run the tests and debug.

### What was added

`on()` and all 26 `on<Event>()` shorthands take an optional **fourth** argument.
The third slot still means `context`, so the change is purely additive and no
existing call site changes meaning.

| Option | Compiles to |
|--------|-------------|
| `once`, `passive`, `capture` | `addEventListener`'s third argument |
| `preventDefault`, `stopPropagation` | statements in the generated wrapper, ahead of the user callback |

`passive` was previously unreachable, which meant the `onScroll`,
`onTouchstart`, `onTouchend` and `onTouchmove` shorthands could only ever
produce the non-passive listeners browsers warn about on those events. That was
the motivation for doing this one first.

### Design

A single `normalizeEventOptions()` in `lib/utils.js` is the only place the key
set is defined. Three consumers read it — `on()`, the JSON restore in
`builder.js`, and the renderer that emits the call — which follows the same
single-source-of-truth convention the URL and CSS sanitisers in that file
already use, and for the same stated reason: hand-copied duplicates are how the
tab/LF/CR hole survived.

Security properties, all asserted by tests:

- Unknown keys are dropped; values are coerced, so the renderer only ever emits
  the literal `true`. Nothing a caller supplies is interpolated into the script.
- Own properties only. An inherited flag — from a polluted `Object.prototype` or
  an object literal carrying `__proto__` — cannot switch an option on for
  listeners that never asked for it. This was found while testing: the first
  implementation read through the prototype chain and a `__proto__: { capture:
  true }` literal silently enabled capture. Not injectable, but wrong.
- `fromJSON()` re-normalises restored options rather than trusting them, matching
  how it already treats serialized callback sources.
- No options set produces `null`, and the emitted call stays byte-identical to
  what every existing page has always compiled to.

### Files changed

- `lib/utils.js` — `normalizeEventOptions`, `listenerOptionsSource`,
  `eventModifierSource`, plus exports
- `lib/element.js` — `on()` stores normalized options; 26 shorthands forward a
  fourth argument
- `lib/renderer.js` — emits the listener options argument and modifier statements
- `lib/document.js` — `toJSON()` carries `options`
- `lib/builder.js` — `fromJSON()` restores and re-normalises `options`
- `typescript/index.d.ts` — new `EventOptions` interface; `on()` and all 26
  shorthands take `options?: EventOptions`
- `test/test-event-shortcuts.js` — 13 new groups, 216 assertions total
- `test/browser-fixture.js`, `test/test-browser.js` — real-browser coverage
- `README.md`, `docs/index.html`, `CHANGELOG.md` — documentation

### Tests added

Server-side (`test-event-shortcuts.js`): a handler without options compiles
unchanged; each listener option and combination reaches `addEventListener`;
modifiers run before the callback and do not leak into the options argument;
options combine without disturbing `context`; all 26 shorthands forward the
argument; hostile and unknown values cannot reach the script; inherited
properties are ignored; options survive a `toJSON`/`fromJSON` round trip;
tampered options in restored JSON are re-normalised. Every generated script is
also parsed with `node:vm`, so no option shape can emit invalid JavaScript.

Browser (`test-browser.js`): `once` stops firing after one click, a plain
listener keeps firing, and `preventDefault` actually cancels the event —
runtime behaviour no server-side assertion can prove.

### Verification

```
node --check lib/*.js test/*.js        -> all parse
tsc --project typescript/tsconfig.json -> exit 0
node test/test-event-shortcuts.js      -> 216 passed, 0 failed
node test/run-all.js                   -> All 23 automated suites passed
npm run test:browser                   -> 4 Playwright suites passed
BUILDHTML_FUZZ_ITERATIONS=20000        -> 17 passed, 0 failed
benchmark/render.js                    -> static 3929 HTML bytes, unchanged;
                                          ops/s within run-to-run noise
docs/index.html tag balance            -> table 27/27, section 36/36,
                                          tbody 27/27, div 50/50
```

Mutation-tested — every mutation was reverted and the source confirmed restored:

```
drop the own-property guard              -> 2 assertions fail
emit the raw option value, not `true`    -> 6 fail, incl. "Unexpected token ':'"
move modifiers inside the try block      -> 1 fails
remove { once: true } from the fixture   -> browser test fails '3' !== '1'
```

Two mutations initially reported a pass for the wrong reason. `perl`
substitutions containing `${...}` were mangled or silently not applied, so the
runs proved nothing. Re-applied through a base64 helper that verifies the target
string is present before writing, which exposed **two genuine coverage gaps**
that the first pass had wrongly recorded as covered:

- **`fromJSON` trusting raw options was not caught.** Every assertion looked at
  the rendered script, and `listenerOptionsSource()` re-derives the literal
  `true` on its own, so removing the normalisation in `builder.js` changed no
  output. Fixed by asserting the *stored* value through `toJSON()`.
- **Emitting the raw option value instead of the literal was not caught**, for
  the mirror-image reason: with normalisation upstream the values are already
  booleans, so the mutant is output-equivalent. Fixed by unit-testing
  `listenerOptionsSource()` with deliberately un-normalised input.

The two are independent layers and either alone is sufficient, which is why
asserting only on rendered output could not tell them apart. They are now
pinned separately.

Full mutation matrix after those tests were added (each reverted, source
confirmed restored and parsing):

```
own-property guard removed              -> 2 failed
emit raw option value, not `true`       -> 1 failed
modifiers moved inside the try block    -> 1 failed
fromJSON trusts options unchecked       -> 1 failed
a shorthand drops its options argument  -> 8 failed
preventDefault modifier never emitted   -> 3 failed
remove { once: true } from the fixture  -> browser test fails '3' !== '1'
```

### Corrected while writing the docs

A first draft of the docs claimed the modifiers "still work on a `passive`-free
listener where calling `preventDefault()` yourself would be ignored". That is
wrong: a passive listener's `preventDefault()` is ignored by the browser however
it is called, generated or hand-written. Replaced with a warning that `passive`
and `preventDefault` contradict each other and should not be set together.

### Not done

Event delegation (`on(event, selector, fn)`) and `off()` were discussed and
deliberately left out. Delegation is a larger change and `liveList` items
already receive their own events (`lib/live.js:110`), which covers the usual
motivation. `off()` does not fit the compile model: handlers are serialized
source with no runtime handle, so supporting it would mean emitting a handler
registry into every page.

### Re-check against the "Error Handling Requirements" rule (2026-08-22)

`AGENTS.md` gained an Error Handling Requirements section mid-task. The three
functions created in this change were audited against it.

| New function | Identifiable failure mode? | Outcome |
|---|---|---|
| `normalizeEventOptions` | **Yes** — it reads properties off a caller-supplied object, so a throwing getter or Proxy trap can raise | Already handled. Both call sites (`Element.on()` and the `fromJSON` event restore) wrap the whole registration in try/catch and record the failure, which the rule permits as "propagate to an existing error-handling layer" and matches the convention the rest of the callback path uses. No new catch added — one inside this function would have duplicated the layer above it and diverged from project convention |
| `listenerOptionsSource` | No — pure string building over an already-normalized plain object | Exempt as pure/trivial |
| `eventModifierSource` | No — same | Exempt as pure/trivial |

The rule also requires a test exercising at least one caught error path for such
a function. There was none, so two were added: a throwing `once` getter passed to
`onClick()`, and a throwing `capture` getter arriving through `fromJSON()`. Both
assert the error does not escape to the caller, the handler is dropped rather
than half-registered, and the element still renders.

Verified by mutation — both reverted, source confirmed restored and parsing:

```
normalizeEventOptions moved outside on()'s try/catch      -> 1 failed
normalizeEventOptions moved outside fromJSON's try/catch  -> 1 failed
```

Both of those mutations reported "MUTATION DID NOT APPLY" on the first attempt:
the patterns spanned lines and this repo's files are CRLF. The helper now falls
back to CRLF before reporting success, so a pattern that does not match is
surfaced instead of producing a meaningless pass. This is the second time a
silently-inapplicable mutation produced a false clean result in this task.

Final counts: `test-event-shortcuts.js` **216 passed, 0 failed**.
