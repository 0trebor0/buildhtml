# Task Progress

Tasks currently in flight. Completed work is not kept here: what changed and why
is recorded in `CHANGELOG.md`, and the full detail is in git history.

The notes for the 2.0.2 security release (2,140 lines) were pruned on 2026-09-10
once that release shipped — see the `[2.0.2]` section of the changelog and the
commits it references. Prune a section here when its work reaches a release.

---

# Task: CSS foundations (six-item roadmap)

## Objective

Make the CSS layer smaller, more consistent and safer before any new CSS
features are added. Six items, given in this order by the user:

1. Fix `live.js` CSS semantics
2. Fix CSS security validation
3. Deduplicate CSS
4. Canonicalise CSS before hashing
5. Remove/deprecate duplicate public APIs
6. Extract CSS into `lib/css.js`

## Status

Complete. All six landed.

### Ordering deviation, and why

Items 2, 3 and 4 are all changes to *the CSS compiler*, and the compiler existed
in four partial copies (`element.js`, `head.js`, `document.js`, `live.js`).
Implementing them in the given order would have meant writing each fix up to four
times and then deleting all four copies in item 6. Item 6 was therefore done
first, and 2/3/4 were implemented once inside the new module. Item 1 followed,
because a consistent `css` inside `liveList` needs the shared hash on both the
server and the client, and item 5 last. The six outcomes are unchanged.

## Files created, modified, or deleted

- Created: `lib/css.js` — the CSS compiler. Declaration compilation and canonical
  ordering, value sanitisation, property/selector/class/pseudo/media validation,
  the scoped class hash, `RuleSet` de-duplication, every rule shape (scoped,
  global, `@media`, `@keyframes`), and the generated client runtime.
- Created: `test/test-css.js` — 82 assertions across all six items.
- Modified: `lib/utils.js` — CSS helpers moved out to `lib/css.js`; added
  `warnDeprecated()`.
- Modified: `lib/element.js` — uses the shared compiler; `cssText` is now an
  accessor over a keyed `RuleSet`; `pseudo()`, `media()` and `_pseudoClass()`
  (and so `nthChild()`) validate their arguments; `clone()` copies rules by key;
  `attribute()` deprecated.
- Modified: `lib/renderer.js` — de-duplicates one rule at a time instead of
  comparing whole concatenated `cssText` strings.
- Modified: `lib/live.js` — `css` compiles to a scoped class on both the server
  and the client; `style` stays inline; the client CSS runtime is generated from
  `lib/css.js`; nested children contribute their rules to the page.
- Modified: `lib/document.js` — uses the shared compiler; `globalCss()` is the
  canonical name; `globalStyle()`, `createElement()`, `child()` and
  `defineClass()` deprecated; `mediaQuery()` uses the named at-rule check.
- Modified: `lib/head.js`, `lib/builder.js`, `lib/pools.js` — import from
  `lib/css.js`; `builder.js` now uses `create()`, the name both `Document` and
  `Element` share, so a top-level `doc.build()` no longer routes through the
  deprecated `Document.child()`.
- Modified: `lib/shortcuts.js` — bound to `create` rather than `createElement`.
- Modified: `test/test-fuzz.js`, `test/test-security.js` — import
  `sanitizeCssValue` from its new home; the client-runtime parity test follows
  the renamed generated functions.
- Modified: `test/browser-fixture.js`, `test/test-browser.js` — browser-level CSS
  security and semantics regression tests (below).
- Modified: `test/run-all.js` — registers `test-css.js`.
- Modified: `typescript/index.d.ts`, `README.md`, `docs/index.html`,
  `example/*.js` — canonical API names, and the new `liveList` CSS semantics.
- Modified: `CHANGELOG.md` — Unreleased section.

## Findings

1. **`Element.pseudo()`, `Element.media()`, `Element.nthChild()` were unvalidated.**
   Arguments were interpolated straight into an emitted rule. Reproduction:
   `doc.create('div').nthChild('1){} body{display:none} .x:nth-child(1', { color: 'red' })`
   emitted `body{display:none}` as a rule of its own. The `</style><script>`
   variant materialised a script element. The document-level equivalents had
   always validated; only the element-level paths had not. FIXED.

2. **`liveList` never validated CSS property names.** The item renderer built
   declarations by hand. The style attribute is HTML-escaped at render, so this
   was a depth gap rather than a reachable injection — stated plainly because the
   probe below passes on the pre-change tree. FIXED.

3. **`css` meant two different things.** An element compiled it to a shared
   scoped class; a `liveList` row compiled it to an inline `style` attribute.
   Anything selecting on the class — a stylesheet override, a `:hover` rule, a
   test selector — silently did not apply inside a list. FIXED (behaviour change,
   recorded in the changelog).

4. **Identical rules were emitted more than once.** `el.css(X).css(X)` appended
   the rule twice, and the renderer's whole-string comparison could not see
   inside a concatenation, so a rule shared between `.css(A).hover(B)` and
   `.css(A)` went out twice. FIXED.

5. **Declaration order changed the class name.** `{color, margin}` and
   `{margin, color}` produced two classes carrying the same declarations. FIXED,
   with the cascade-safety constraint recorded below.

## Design decision: how far canonical ordering goes

Sorting every declaration alphabetically would reorder
`{ marginTop: '5px', margin: '0' }` into `margin; margin-top` and silently invert
which one wins. Ordering is therefore canonical *between* property families and
preserved *within* one — two declarations can only override each other when they
share a family. `{ color, margin }` and `{ margin, color }` collapse to one class;
`{ margin, marginTop }` and `{ marginTop, margin }` stay distinct. Tested both
ways.

## Tests run

```
node test/run-all.js     -> All 24 automated suites passed (test-css.js added, 82 assertions)
npm run test:browser     -> 4 Playwright suites passed
tsc --noEmit             -> exit 0
node --check lib/*.js    -> every file parses
```

Regression value was verified rather than assumed: each fix was disabled in turn,
in place, and the probe covering it was confirmed to fail. All seven probes pass
on the restored tree.

| Probe | Fix disabled to make it fail |
|-------|------------------------------|
| `validate-nthchild` | `isSafePseudoSelector()` forced to `true` |
| `validate-pseudo` | `isSafePseudoElement()` forced to `true` |
| `validate-media` | `isSafeMediaQuery()` forced to `true` |
| `canonical-order-shares-a-class` | canonical `declarations.sort()` removed |
| `dedup-same-rule-twice` | `RuleSet.add()` key check removed |
| `dedup-shared-rule-across-elements` | renderer per-rule `seenCss` check removed |
| `livelist-css-is-a-class` | `nodeDefToHtml()` class compilation branch disabled |

Isolating them one at a time caught a mistake in the first attempt:
`validate-pseudo` still passed with `isSafePseudoSelector()` disabled, because
`pseudo()` guards with `isSafePseudoElement()`. A coarser check would have
credited the wrong function.

The browser assertions were checked for vacuity the same way — forcing
`isSafePseudoSelector()` to return true made `test-browser.js` fail on "a crafted
nth-child argument must not write a rule that hides another element", and pass
again once reverted.

Finding 2 has no probe of its own. It was a defence-in-depth gap rather than a
reachable injection — the style attribute was already HTML-escaped — so there is
no pre-change behaviour that a probe could show failing. It is not claimed as a
fixed vulnerability.

### Note on verification method

An earlier run of this comparison used a `git worktree` checked out to a
temporary directory outside the repository. The user then added the
"Repository / Working Directory Lock" rule to `AGENTS.md`, which disallows that.
The worktree was removed (`git worktree list` shows only the main tree, and
`git worktree prune --dry-run` reports nothing), and the comparison above was
redone entirely inside the working directory. Nothing outside the repository
influenced any source, test, or documentation change: the temporary worktree was
a checkout of this repository's own `HEAD`, used only to observe pre-change
behaviour, and the scratch files were transient captures of command output.

## Browser-level security regression tests

Item 2 asked for these specifically. A server-side assertion can only prove which
characters were emitted; whether the browser's CSS parser reassembles them into a
rule or an element is only observable in a browser. Added to the fixture and
`test-browser.js`:

- A hostile `pseudo()`, `media()` and `nthChild()` argument executes no script,
  leaves no `__cssPwned` text in any `<style>` or `<script>`, and does not hide a
  canary element.
- Every emitted rule parses (`document.styleSheets` walks without error).
- Rejected rules apply no styling; a real `:hover` and a real `:nth-child(odd)`
  still do.
- Declarations written in either order share one class, and that rule appears in
  the stylesheet exactly once.
- A `liveList` row carries a scoped class and no `color` in its inline style;
  after a client rebuild both the existing and the brand-new row hold the same
  class the server rendered, with the declarations actually computed — which is
  only true if the client also inserted the rule.

## Completion audit

Asked afterwards whether the six items were actually done, each was re-checked
against the code rather than from memory. Five were complete. Item 6 was not:
`Document.keyframes()`, `Document.mediaQuery()` and `Head.globalCss()` still
assembled their own rule text, so "media rules" was only half-centralised —
`Element.media()` went through `lib/css.js` and `Document.mediaQuery()` did not,
which is the same split the item existed to remove.

Closed by adding `compileGlobalRule()`, `compileMediaRule()` and
`compileKeyframesRule()` to `lib/css.js` and routing all three callers through
them. Verified: the only `@media`/`@keyframes` text outside `lib/css.js` is in
doc comments, and a hostile query is now refused identically by
`Document.mediaQuery()`, `Element.media()` and `Document.keyframes()`.

One deliberate exception remains. `Head.render()` builds `.name{declarations}`
when writing the stylesheet. That is emission of already-compiled, already-
validated input, not compilation — `Head` is the stylesheet writer, and moving
the string concatenation into `lib/css.js` would spread the writer across two
modules for no safety gain.

`head.globalStyles` still de-duplicates with `Array.includes()` rather than a
`RuleSet`. It is a plain string array in the `toJSON()`/`fromJSON()` contract, so
changing its shape would be a serialisation change for no behavioural gain. It
does de-duplicate; it just does so with a different mechanism. Left alone and
recorded here rather than changed silently.

## Not done

- **Consolidating the pseudo helpers into one API.** The user marked this
  "eventually"; `hover()`, `focusCss()`, `active()`, `firstChild()`,
  `lastChild()` and `nthChild()` are unchanged. They now share one validated
  implementation, so the consolidation is a naming decision, not a safety one.
- **`Element.create()`** is still an undeprecated alias of `Element.child()`. It
  was not on the list, and it is now the polymorphic seam `builder.js` uses to
  treat a `Document` and an `Element` alike. Flagged for the maintainer.
- **No new CSS features** — `@supports`, `@container`, `@layer` and nesting were
  explicitly deferred.

## Risks

- The `liveList` `css` change is a real behaviour change. Rendered appearance is
  unchanged, but code reading a row's inline `style` attribute for a value that
  came from `css` must read the class instead.
- Client-minted rules accumulate in `<style id="_bh-live-css">` for the life of
  the page and are never removed. A class name is a pure function of its
  declarations, so a rule stays correct once inserted and a re-rendering list
  reuses what it already created; the stylesheet grows only with the number of
  *distinct* declaration sets a list produces.

---

# Task: Security review findings — Phases 1 to 4

## Objective

Fix or improve the findings from the senior-developer review of every file in
the repository. The review's roadmap had five phases; phase 5 was new CSS
features (`@supports`, `@container`, `@layer`, nesting), which the user had
already deferred, so it is out of scope here. Phases 1 to 4 are all findings.

## Status

Complete. Every finding is fixed, improved, or explicitly recorded as declined
below.

## The pattern behind most of the findings

Nearly every defect was the same shape: **a guard applied to one path but not
its twin.** `Document.mediaQuery()` validated while `Element.media()` did not.
`setAttrs()` refused `__proto__` while `attr()` did not. `bindProp()` refused
`srcdoc` while `attr()` emitted it. `Element.style()` validated property names
while the compiled `bindStyle()` did not. Fixing instances one at a time is what
allowed the class to persist, so each fix below routes both twins through one
implementation rather than adding a second copy of a check.

## Findings and disposition

| ID | Finding | Disposition |
|----|---------|-------------|
| H-1 | `srcdoc` emitted from every static attribute path; HTML-escaping is not a defence for it | Fixed — refused in `isValidAttrKey`, server and generated client |
| M-2 | Callback denylist bypassable (`document["cookie"]`, `constructor.constructor`, …) | Improved — comment corrected, `fromJSON(def, { callbacks: false })` added, SECURITY.md states the boundary |
| M-3 | Prototype-chain leakage into attributes, state and CSS via `for...in` | Fixed — `Object.keys()` throughout, plus `attr()` key guard |
| M-4 | `bindStyle()` skipped name validation and value sanitisation | Fixed — shared applier generated from `lib/css.js` |
| L-5 | 32-bit class hash collides at scale | Fixed — two FNV-1a lanes |
| L-6 | `String(value)` coercion can throw out of `render()` | Declined — see below |
| L-7 | Client stylesheet never shrinks | Declined — see below |
| L-8 | Stack overflow at ~5,000 nesting depth | Improved — reported clearly, no cap imposed |
| L-9 | `renderFile`/`compileFile` unguarded, path traversal invited | Fixed — guarded, documented |
| L-10 | `Document.save()` unguarded | Fixed |
| P-11 | No `devDependencies`, floating CI installs | Fixed — declared and pinned; lockfile left to the maintainer |
| P-12 | Three test files never executed | Fixed — removed |
| P-13 | SECURITY.md drift | Fixed |
| — | Version | Bumped to 2.1.0 |

## Verification

Each fix was confirmed to fail before and pass after, in place, inside the
repository — no external worktree, per the Repository / Working Directory Lock
rule.

```
node --check lib/*.js test/*.js  -> every file parses
node test/run-all.js             -> All 24 automated suites passed
npm run test:browser             -> 4 Playwright suites passed
tsc --noEmit                     -> exit 0
node scripts/release-notes.js --dry-run -> extracts the 2.1.0 section (8851 bytes)
```

Measurements taken rather than assumed:

- Callback denylist: 7 of 11 hostile payloads accepted, including
  `({}).constructor.constructor("…")()`. Recorded as a test so the limitation
  cannot quietly be forgotten again.
- Class hash: the old single lane produced 4 collisions over 150,000 distinct
  declaration blocks and 17 over 400,000, matching the birthday bound. The two
  lanes produce none at 1,000,000.
- Prototype pollution: verified end to end by polluting `Object.prototype` with
  `data-evil`, `srcdoc` and `color`, then asserting none reaches markup,
  serialised state, or a compiled rule.
- ReDoS: the template attribute regex was tested to 4,000 characters of
  pathological input and showed no backtracking blowup. **Not a finding** — the
  alternation branches barely overlap. Recorded so it is not re-investigated.

## Declined, with reasons

- **L-6, `String(value)` coercion.** A CSS or attribute value whose `toString()`
  throws propagates out of `render()`. The code is pre-existing and byte-identical
  to 2.0.2, and fixing it means choosing a fallback — drop the declaration, or
  substitute an empty value — which changes rendered output for a case nobody has
  reported. Flagged for the maintainer rather than decided unilaterally.

- **L-7, client stylesheet growth.** Rules minted during a browser rebuild
  accumulate in `<style id="_bh-live-css">` and are never removed. A class name is
  a pure function of its declarations, so a rule stays correct once inserted and a
  re-rendering list reuses what it already created; the sheet grows only with the
  number of *distinct* declaration sets. Bounded in practice, and eviction would
  need reference counting that the current design has no place for.

- **A depth cap in `renderNode()`.** `builder.js` declines one for a reason
  recorded there: the real ceiling varies with platform, Node version and
  `--stack-size`, so a fixed limit would refuse trees that render today. The
  failure is now reported clearly instead of being prevented.

- **Committing a lockfile.** `devDependencies` are declared and CI installs are
  pinned, which addresses the floating-version half of P-11. Generating a
  lockfile requires a network install and adds a large generated artefact to the
  repository; that is the maintainer's call, and CI does not use `npm ci` today.

- **`Head.render()` assembling `.name{…}` itself.** That is emission of
  already-compiled, already-validated input. `Head` is the stylesheet writer, and
  moving the concatenation into `lib/css.js` would split the writer across two
  modules for no safety gain.

- **`head.globalStyles` de-duplicating with `Array.includes()`** rather than a
  `RuleSet`. It is a plain string array in the `toJSON()`/`fromJSON()` contract,
  so changing its shape would be a serialisation change for no behavioural gain.

## Breaking-change notes for the release

- Generated scoped class names differ from 2.0.x (wider hash). Never stable API,
  but a snapshot test asserting on one will need updating.
- A `liveList` item's `css` object compiles to a class, not an inline style.
  Rendered appearance is unchanged; code reading a row's inline `style` attribute
  for a value that came from `css` must read the class instead.
- `srcdoc` is now refused on the static attribute paths. Nothing in this
  repository used it, and the README and type declarations already said it was
  refused.

## Files changed

- Created: `lib/css.js`, `test/test-css.js`.
- Removed: `test/test-xss-debug.js`, `test/test-server.js`, `test/example.js`.
- Modified: `lib/utils.js`, `lib/element.js`, `lib/document.js`, `lib/renderer.js`,
  `lib/live.js`, `lib/head.js`, `lib/builder.js`, `lib/pools.js`,
  `lib/shortcuts.js`, `lib/template.js`, `lib/css.js`.
- Modified: `test/test-security.js`, `test/test-bindings.js`, `test/test-template.js`,
  `test/test-fuzz.js`, `test/test-browser.js`, `test/browser-fixture.js`,
  `test/run-all.js`.
- Modified: `package.json` (version 2.1.0, `devDependencies`),
  `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.gitignore`.
- Modified: `typescript/index.d.ts`, `README.md`, `docs/index.html`,
  `SECURITY.md`, `CHANGELOG.md`, `example/*.js`.

## Phase 5 — modern CSS features

Added after phases 1 to 4, once the compiler was a single module and the at-rule
shapes were centralised. `@supports`, `@container` and `@layer` needed no new
validation and no second copy of anything: `compileScopedRule()` gained two
options, and `compileMediaRule()` became a thin wrapper over a generic
`compileConditionalRule()` that the three conditional at-rules share.

- `Document.supports()` / `Element.supports()`
- `Document.containerQuery()` / `Element.containerQuery()`
- `Document.layer()`, `Document.layerOrder()`

### Two problems the work surfaced

**A silent API collision.** `container()` already exists on both prototypes as a
layout helper, and `applyShortcuts()` runs *after* the class body — so defining
`container()` as a query method did not raise an error, it was silently
overwritten. The symptom was a rule reading `max-width:[object Object]`: the
layout helper had received the selector-rules object as its `maxWidth` argument.
Renamed to `containerQuery()` on both, with a test asserting the layout helper
still behaves as before. Worth remembering that this prototype is open to silent
replacement by any name `shortcuts.js` uses.

**Three vacuous assertions.** Several tests asserted
`!styleBlocks(html).includes('</style>')`, but `styleBlocks()` returns the
matched `<style>…</style>` blocks *including* their closing tags, so the check
could only ever pass when no style element existed at all — which was exactly the
case in the rejected-payload tests that used it. Added `styleContents()`, which
strips the wrappers, and moved all three assertions onto it. They now test what
they claimed to.

Also fixed: a NUL byte written into `lib/css.js` by an editing script, which made
`grep` treat the file as binary. Removed; verified no other source file carries
one. The three NUL bytes in `test/test-security.js` are deliberate
control-character payloads and are present in the committed file.

### Native CSS nesting — decision and implementation

Flagged first as needing a decision, then decided and built. Two questions had to
be answered:

**Native nesting or flattening?** Flattening. `hover()`, `pseudo()` and `media()`
already produce exactly these flattened rules, so nesting becomes a second
spelling of something the library does rather than a second mechanism, and
flattened output parses in every browser. `compileNestedRules()` splits a rules
object into its own declarations and its nested blocks, and emits one rule each.

**Does the client learn it too?** Yes, and this was not really optional. Leaving
nesting server-only would mean a `liveList` row's `css` flattened one way during
rendering and another during a browser rebuild — the exact inconsistency this
compiler was written to remove. The client runtime therefore carries the same
split, the same canonical ordering of nested keys, and the same hash input;
`test-css.js` asserts class AND rule-text parity over an 11-case corpus that
includes malformed and hostile keys.

Two design points worth recording:

- The class is derived from the declarations AND the nested blocks, so
  `css({color:'red'})` and `css({color:'red','&:hover':{…}})` are different
  classes. Sharing the base name would let the hover rule apply to elements that
  asked only for the base declarations.
- An object with no nested keys hashes to exactly what it hashed before nesting
  existed. That is deliberate: the client computes `hash(declarations)` for a
  flat object, and padding the hash input for the nested case would have broken
  liveList parity silently. The same trap as the at-rule scope separator, caught
  the same way — by the parity test.

The client rule injector is now keyed by rule rather than by class, since one
class can own several rules.

### Verification

```
node test/run-all.js  -> All 24 suites passed (test-css.js now 135 assertions)
npm run test:browser  -> 4 Playwright suites passed
tsc --noEmit          -> exit 0
```

## Pre-completion audit

A systematic pass over the finished diff, rather than trusting that each step had
been clean. Three things it caught:

- **Six unused exports on `lib/css.js`.** `clientCssValueSanitizerBody`,
  `CSS_VALUE_STRIP_SOURCE`, `compileCssDeclarations`, `propertyFamily`,
  `scopedClassName` and `isValidLayerName` are building blocks used only inside
  the module. The export list of a file written in this task is that task's
  authorship, so leaving them exported would be leaving unused symbols behind.
  Removed from `module.exports`; all six are still defined and used internally.

- **Two files whose line endings had been flipped** by editing scripts writing
  `
` into a repository configured for CRLF (`core.autocrlf=true`).
  `test/test-security.js` (CRLF at HEAD) had become LF, turning a ~180-line
  addition into a **2,303-line diff**; `CHANGELOG.md` (LF at HEAD) had become
  CRLF. Both restored byte-wise, preserving the three deliberate NUL payloads in
  the security tests. The whole diff went from 2,728/1,353 to 1,680/305.

- **A pre-existing unused import**, `sanitizeFunctionSource` in
  `lib/renderer.js`. Present at HEAD, unrelated to any finding, so it is reported
  here rather than removed — "do not clean up unrelated code".

Also verified: no dangling references to the three removed test files, every
method the README and docs now promise exists and is callable, and the packaged
tarball still contains 31 files with no dev dependency leaking in.

## Final verification

```
node --check lib/*.js test/*.js  -> every file parses
node test/run-all.js             -> All 24 suites passed
npm run test:browser             -> 4 Playwright suites passed
tsc --noEmit                     -> exit 0
node scripts/release-notes.js --dry-run -> extracts the 2.1.0 section
npm pack --dry-run               -> 31 files, zero runtime dependencies
```

---

# Task: Remote audit follow-up

## Objective

Audit what the remote repository carries that it does not need, and fix what the
audit turned up.

## Findings

The repository itself was clean: no branches but `main`, three legitimate release
tags, no tracked file matching `.gitignore`, no orphaned test files, and a
published tarball of exactly 31 files — library, entry points, type declarations
and four documents, with nothing repository-only leaking in.

One item was genuine bloat, and two were regressions from this session's own work.

1. **`TASK_PROGRESS.md` was 127 KB across 2,613 lines**, of which 2,140 were
   notes for the already-shipped 2.0.2 release. That content is duplicated by the
   `[2.0.2]` changelog section and by git history, and this file is supposed to
   stay concise. Pruned to the two in-flight sections: **127 KB -> 24.7 KB**. The
   new header states the rule — prune a section once its work reaches a release —
   so the file does not silently accumulate again.

2. **`example/server.js` claimed the project has "no devDependencies".** True
   when written; false as of this session, which declared six. Reworded to say
   what still holds: Express is not among them either, which is the point the
   comment exists to make.

3. **`CONTRIBUTING.md` told contributors to install the dev tooling by hand** —
   `npm i --no-save typescript@5`, `npm i --no-save playwright@1`. A plain
   `npm install` now provides both. The table no longer says otherwise, and the
   setup section states that the tooling is a devDependency while the published
   package still has zero runtime dependencies.

Items 2 and 3 were documentation drift introduced by declaring `devDependencies`,
and should have been caught in that change under "Documentation Consistency"
rather than by a later audit.

## Not changed

- **`CHANGELOG.md`** has no entry for this. Nothing user-facing or published
  changed: `CONTRIBUTING.md`, `example/server.js` and `TASK_PROGRESS.md` are all
  repository-only and excluded from the package.
- **A pre-existing unused import**, `sanitizeFunctionSource` in
  `lib/renderer.js`, is still reported rather than removed — unrelated to any
  finding.
- **No lockfile.** `devDependencies` are declared and CI installs are pinned, so
  the floating-version risk is closed; committing a lockfile remains open.

## Tests run

```
node --check example/server.js  -> parses
node test/run-all.js            -> All 24 automated suites passed
```

No library code changed, so the type and browser suites were not re-run for this
follow-up; they passed on the commit these files sit on.

---

# Task: Close the two remaining API-surface gaps

## Objective

A handoff summary listed the CSS foundations work. Audited against the code, all
of it was done except two items under "reduce duplicate/overlapping APIs":
`renderJSON()` vs `renderFromJSON()`, and the inflation of one-off CSS helpers.

## 1. renderJSON()

An exact alias, and the only pair in the export surface where two names named one
function with nothing to tell them apart. Deprecated in favour of
`renderFromJSON()`, following the pattern the other five aliases already use:
still works, warns once per name in dev, silent in prod.

## 2. CSS helper inflation

The handoff asked for "a smaller, validated primitive rather than continually
adding one-off methods". Usage was counted first rather than deprecating
wholesale — `hover()` alone has 17 call sites in this repository, and churning
~100 of them would have been cost without benefit.

What the API actually lacked was the primitive, not fewer helpers:

- **Added `Element.pseudoClass(name, rules)`.** `:checked`, `:focus-visible`,
  `:nth-of-type()` and `:is()` were previously unreachable without adding a
  seventh named helper. Now they are not, so the set can stop growing. The six
  named helpers delegate to it, so there is one implementation and one
  validation path.
- **Deprecated the six one-property aliases** over `style()`: `opacity`,
  `zIndex`, `cursor`, `overflow`, `display`, `position`. Each saved nothing over
  the primitive it called and each invited a seventh for the next property.
- **Kept** `size()`, `transition()`, `transform()` and `animate()` — each builds
  a composite value or sets more than one property, so they do work rather than
  rename it. Kept the six named pseudo-class helpers for the same reason of
  proportion: they cover the states most pages use.

Only test files called the deprecated six; no example, README or docs code used
them, so migration was one chained call site. The tests that exercise the
aliases deliberately still call them, as the other alias tests do.

## Tests run

```
node test/run-all.js  -> All 24 automated suites passed (test-css.js now 142 assertions)
tsc --noEmit          -> exit 0
```

New assertions cover the primitive reaching states the helpers never did, the
primitive being validated identically (`hover()` and `pseudoClass('hover')`
compile byte-identically), the six aliases still matching `style()`, and
`renderJSON` still matching `renderFromJSON`.

## Note on the handoff

It described the branch as "around v2.0.2". Main is at 2.1.0, unreleased and
untagged, so these changes fold into the existing `[2.1.0]` changelog section
rather than opening a new one.

---

# Task: Validation phase — regression, API audit, docs, performance

## Objective

A second handoff listed five items for after the CSS refactor: regression
testing, a public API audit, documentation of the final CSS model, a
performance/output audit, and an architectural review. Audit what was already
done and close the gaps.

## Status by item

| # | Item | Status |
|---|------|--------|
| 1 | Regression testing | Was covered except repeated components and large live lists; now measured |
| 2 | Public API audit | Done — all five named candidates deprecated |
| 3 | Documentation | Gap closed: de-duplication and deterministic class generation now documented |
| 4 | Performance/output audit | Was never run; run here, and it corrected a decision |
| 5 | Architectural review | Not started — still open |

## Item 1: the untested cases

| Case | CSS rules emitted | HTML | Time |
|------|------------------|------|------|
| 1,000 identical components | 2 (base + hover) | 53.8 KB | 13 ms |
| 5,000-row live list | 1 | 483 KB | 26 ms |

De-duplication holds at scale. Client runtime added by the CSS work: 2,785 bytes
(1,312 gzip) on pages with a liveList, 674 bytes (434 gzip) on pages with a
style binding, and nothing on pages with neither.

## Item 4: the performance audit corrected the hash width

The earlier widening to two full FNV-1a lanes was justified by a real
measurement — 4 collisions over 150,000 distinct rules with one lane — but the
*cost* was never measured against it. Measured here, gzipped, against a single
lane:

| Distinct rules | Two full lanes | Three digits | One-lane collision risk |
|---------------|---------------|--------------|------------------------|
| 20 | +10.1% | +4.5% | 0.0000044% |
| 100 | +17.9% | +7.5% | 0.00012% |
| 250 | +18.1% | +9.3% | 0.00072% |
| 1000 | +48.6% | +26.1% | 0.0116% |

Ten to eighteen per cent of a page's compressed weight, at the scale real pages
occupy, to close a risk near one in a million, is the wrong trade. The second
lane is now truncated to its low three base-36 digits (~47 bits total): zero
collisions through 400,000 distinct rules, at half the byte cost.

Two notes for anyone touching this again:

- The cost scales with the number of **distinct** rules, not with page size. A
  page of a thousand identical elements compresses so well that the wider hash
  measured *negative* — 41 bytes smaller gzipped. Benchmarking on repetitive
  markup would have hidden the cost entirely.
- The padding idiom is deliberately ES5 (`('00' + n.toString(36)).slice(-3)`,
  not `padStart`). The client runtime has to spell the hash identically, and it
  is ES5; `test-css.js` asserts the two agree over a corpus.

## Item 3: what was missing

`css()` vs `style()` was documented; de-duplication and deterministic class
generation were not. Both are now in the README and the docs site, together with
the validation rule — invalid names are dropped and reported in development,
never rewritten, because silently removing a `;` would emit a declaration the
caller never wrote.

## Still open

Item 5, the architectural review: `Document` and `Element` carry a lot of
responsibility, `Head` still stores compiled CSS as strings, and `live.js` keeps
its own client-side node representation. Not started, and not urgent.

## Tests run

```
node test/run-all.js  -> All 24 automated suites passed (test-css.js 142 assertions)
npm run test:browser  -> 4 Playwright suites passed
tsc --noEmit          -> exit 0
npm run benchmark     -> no regression against the static renderers
```

---

# Task: Release hardening — closing the last gaps

## Objective

A third handoff listed eight release-hardening items. Regression testing, the API
audit and the package audit were already done; memory testing, TypeScript parity
and the fresh-install test were run and passed. This closes the three that
remained: scaling benchmarks, in-browser Unicode, and the unfuzzed surfaces.

Note on the handoff's premise: it lists "Architecture cleanup" as done. It is
not, and never was — `Document`/`Element` responsibilities, `Head` storing
compiled CSS as strings, and `live.js`'s own client node representation are all
untouched. That item is still open.

## The finding: renderStream() is far less incremental than documented

`renderStream()` was documented, in three places, as rendering "only as much as
the consumer has room for, so <head> reaches the socket before the body is
built". Measured, that is true only for a document shape almost nobody writes.

`renderNode()` renders a subtree in one recursive call, so the stream can only
stop at TOP-LEVEL BODY NODE boundaries. 20,000 paragraphs:

| Shape | Chunks | First chunk at |
|-------|--------|----------------|
| wrapped in one root `<div>` | 3 | 93.3% of total |
| 20,000 top-level body nodes | 20,002 | 6.0% of total |

A page assembled under a single root element — the usual shape — emits its whole
body as one chunk, so streaming buys almost nothing over `render()`. Corrected in
`lib/document.js`, `README.md` and `docs/index.html`, and the scaling benchmark
now measures both shapes side by side so the limitation cannot be rediscovered
the hard way.

Making it incremental *within* a subtree needs a generator-based `renderNode()`.
That is a real change, not a doc fix, and it belongs after the release rather
than during a hardening phase.

This was nearly missed twice: the first benchmark timed tree construction as part
of "time to first chunk", and the second defaulted the shape argument in a way
that silently measured only the flat case. Both looked plausible.

## What was added

- `benchmark/scaling.js` (`npm run benchmark:scaling`) — breadth, depth, CSS by
  distinct-rule count, reactive lists, repeated renders with pool occupancy, and
  streaming across both document shapes.
- Six fuzz properties for surfaces added in 2.1.0 and never fuzzed:
  `pseudoClass()` names, at-rule preludes across all six entry points, layer
  names, nested `css()` keys, deep element trees, and deep NodeDef trees.
- Browser Unicode coverage: astral plane, combining marks, RTL, bidi override,
  ZWJ, fullwidth forms, NBSP and U+2028/U+2029 — asserted through SSR, a reactive
  binding, and a liveList client rebuild, compared by code point rather than by
  UTF-16 length so a split surrogate pair cannot pass.

Correcting an earlier claim: selectors, templates and NodeDefs were **already**
fuzzed, and the generator already emits astral characters, lone surrogates and
fullwidth forms. The genuine gaps were deep trees and the 2.1.0 CSS surfaces.

## Measurements worth keeping

| Scenario | Result |
|----------|--------|
| Breadth, 500 -> 50,000 elements | 1.45-1.62 us/element, flat |
| Depth, 100 -> 3,000 levels | 1.06 -> 5.42 us/level, degrades with depth |
| CSS, 5,000 elements, 1 -> 5,000 distinct rules | ~15 ms throughout — cost tracks distinct rules, not elements |
| Reactive list, 100 -> 20,000 rows | 2.6-3.9 us/row, flat |
| Repeated renders, 1 -> 5,000 | 0.383-0.386 ms/render, pools stable at 151/6 |

No pooling regression, no drift in per-render cost, and de-duplication holding
flat across three orders of magnitude of rule count.

## Tests run

```
node test/run-all.js       -> All 24 automated suites passed
node test/test-fuzz.js     -> 31 properties passed (6 new)
npm run test:browser       -> 4 Playwright suites passed, Unicode included
tsc --noEmit               -> exit 0
npm run benchmark:scaling  -> no regression; streaming finding above
```

## Still open

- Architecture review: `Document`/`Element` responsibilities, `Head` storing CSS
  as strings, `live.js`'s own node representation.
- Generator-based `renderNode()` for genuinely incremental streaming.
- Depth cost grows super-linearly past ~1,500 levels; not investigated, and not
  a shape real documents take.

---

# Task: Codebase orientation pass

## Objective

Read every file in `lib/` and `README.md` in full, and work under the rules in
`AGENTS.md`. Requested as a comprehension pass ahead of future work, not as a
change to the library.

## Status

Reading complete. No code change was requested and none was made.

## Files inspected

- All 17 files in `lib/` (7,203 lines): `index.js`, `document.js`, `element.js`,
  `renderer.js`, `css.js`, `utils.js`, `live.js`, `template.js`, `builder.js`,
  `shortcuts.js`, `head.js`, `components.js`, `middleware.js`, `config.js`,
  `cache.js`, `pools.js`, `metrics.js`.
- `README.md` (1,688 lines), `package.json`, `index.js`, `index.mjs`.
- `AGENTS.md`, and the headings and tail of this file.

## Files created, modified, or deleted

- Modified: `TASK_PROGRESS.md` — this section.

Nothing under `lib/`, `test/`, `docs/` or `example/` was touched.

## Tests run

None. No source file changed, so no suite is implicated. The last recorded run
is in the release-hardening section above (24 suites, 31 fuzz properties, 4
Playwright suites, `tsc --noEmit` clean); nothing in the tree has changed since,
but that result was not re-confirmed in this session.

## Verification

This file is the only change. The repository has no linter, formatter, or
Markdown check configured — no `.prettierrc`, `.eslintrc`, `.editorconfig`, and
no `lint`/`format` script in `package.json` — so verification was limited to
re-reading the appended section and confirming the heading structure matches the
sections above it. No syntax or build check applies to a Markdown edit.

## Notes carried forward

- Working tree is clean apart from an untracked `CLAUDE.md` (a one-line
  `@AGENTS.md` include). `main` is level with `origin/main` at `fe0797a`.
- `package.json` is at 2.1.0 and `CHANGELOG.md` has a dated `[2.1.0]` section,
  but the newest git tag is `v2.0.2`. Whether 2.1.0 was tagged or released
  elsewhere was not investigated.
- Per this file's own header, sections whose work has shipped are prunable. The
  six sections above describe 2.1.0 work and are candidates once its release
  state is confirmed.

## Assumptions and limitations

- Reading was limited to `lib/` and `README.md` as asked. `test/`, `docs/`,
  `example/`, `benchmark/`, `scripts/` and `typescript/` were not read, so any
  claim here about library behaviour rests on the source and the README, not on
  the tests that prove it.

---

# Task: Bring README and the HTML guide back in line with the API

## Objective

Audit `README.md` and `docs/index.html` against the API the library actually
exposes, and correct what has drifted.

## Status

Complete for the defects the audit found. The audit method and its blind spots
are recorded below so the next pass does not have to rediscover them.

## Method

The API surface was taken from the runtime, not from a reading: every
non-underscore own property of `Document.prototype`, `Element.prototype` and
the package exports — 315 names — checked for a word-boundary mention in each
document, then the reverse direction for names the docs present that the
runtime does not have.

Two earlier versions of that script produced wrong answers that looked right,
and both were caught only because the result was implausible:

- A `<<'EOF'` heredoc collapsed `\\b` into a literal backspace, so every
  word-boundary regex silently matched nothing and the report claimed all 315
  names were missing from all three files.
- The rewritten script was saved to the scratchpad but run from an older copy
  of the same name on `$TEMP`, so the corrected logic never executed.

Both files use CRLF line endings, which also broke a fence-matching regex until
the input was normalised. Scripts that edit them assert an exact match count of
1 per replacement and re-check for lone LF afterwards.

## Findings and disposition

- `docs/index.html` and `typescript/index.d.ts` mention all 315 names. The
  README omits 61, which is not a defect on its own — it is a summary that
  defers to the guide — so the omissions were left alone.
- Neither document names an API that does not exist.
- **Fixed.** The README style list presented `display()`, `position()`,
  `overflow()` and `cursor()` as current API; all four are deprecated. `size()`
  is not deprecated and stays.
- **Fixed.** The README JSON example imported and called the deprecated
  `renderJSON()`, and `renderFromJSON()` appeared nowhere in the file.
- **Fixed.** The guide named `renderJSON()` as the entry point in four places.
- **Fixed.** README "At a glance" claimed 23 suites and 24 fuzz properties;
  measured values are 24 and 31.

## Verified as already correct

Checked against the sources rather than assumed: the 461-byte static page (also
asserted by `test/test-readme-examples.js`), the counter page at 5,042 bytes of
HTML and 4,538 of inline JS against the quoted ~5.0 KB and ~4.5 KB, the CI
matrix of Node 18/20/22/24 against `.github/workflows/ci.yml`, six subpath
exports against `package.json`, and the tag-shortcut signature table against
`TEXT_TAGS`.

## Files created, modified, or deleted

- Modified: `README.md` — five corrections (test counts, style list, the JSON
  example import and call, a deprecation note).
- Modified: `docs/index.html` — four corrections, all `renderJSON` to
  `renderFromJSON` with the alias marked deprecated.
- Modified: `CHANGELOG.md` — `Fixed (documentation)` entry under `[Unreleased]`.
- Modified: `TASK_PROGRESS.md` — this section, and a whole-file CRLF
  normalisation (the previous session appended LF lines into a CRLF file;
  `core.autocrlf=true` means git shows no diff for it).

## Tests added or updated

None. No library behaviour changed, and the existing documentation tests
already cover what changed.

## Tests run

```
npm test                      -> All 24 automated suites passed
node test/test-fuzz.js        -> 31 properties passed
node test/test-readme-examples.js
                              -> 55 README and 62 guide JavaScript blocks parse,
                                 2 quick starts execute, 14 local links resolve,
                                 49 runtime shortcuts documented
node test/test-tutorial.js    -> 41 javascript blocks execute, 23 behaviours hold
```

Tag balance in `docs/index.html` was checked after editing (tr 322/322, td
842/842, th 84/84, table 27/27, section 39/39, code 1389/1389, p 167/167). The
repository configures no linter, formatter or HTML validator, so that plus the
suite above is the available verification.

## Not done

- The 61 README omissions were not added. Several are whole features the README
  never mentions — `slot()`/`fillSlot()`, `renderFragment()`/`stamp()`,
  `template()`/`useTemplate()`, `portal()` — and the guide documents all of
  them. Adding them is an editorial decision about how much the README should
  carry, not a correctness fix.
- `Element.attribute()` is deprecated and absent from the guide. Absent is
  defensible for a deprecated alias; the other twelve are marked, so marking it
  would be more consistent. Not changed without a decision.
- The benchmark tables are labelled "measured against the published 2.0.0
  release". 2.1.0 halved the scoped-class hash width, which changes HTML bytes,
  so those figures are historical rather than current. Re-measuring is a
  benchmark run, not a doc edit.

## Risks

The coverage check matches names on word boundaries, so a name that appears as
an ordinary English word counts as documented. `display`, `position`, `cursor`
and `overflow` all passed the guide check that way while the *methods* are
absent from it — which is how the README defect survived a passing check. A
name-level audit cannot see whether a mention is a definition or a coincidence.
