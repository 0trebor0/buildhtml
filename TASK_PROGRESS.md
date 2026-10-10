# Task Progress

Tasks currently in flight. Completed work is not kept here: what changed and why
is recorded in `CHANGELOG.md`, and the full detail is in git history.

Prune a section when its work reaches a release.

- 2026-09-10 — the 2.0.2 security notes (2,140 lines) were pruned once that
  release shipped. See the `[2.0.2]` changelog section.
- 2026-09-29 — the ten sections covering 2.1.0 (1,139 lines) were pruned when
  `v2.1.0` was tagged: the CSS foundations refactor, the security review and its
  four phases, the API-surface gaps, the validation and release-hardening passes,
  the codebase orientation pass, the README/guide correction, the lib/ review,
  and the note on the client-side error swallows. See the `[2.1.0]` changelog
  section and the commits it references.

No task is currently in flight.

---

# Task: Dev auto-reload as an example

## Objective

Give users browser refresh on save, without changing what the project is. Built
as a recipe in `example/`, not as library API — `lib/` is untouched.

## Why an example rather than a feature

buildhtml's contract is input -> HTML string. It never handles a request, never
owns a server. A `devReloadHandler(req, res)` would have been the first thing in
`lib/` to write headers and hold a socket open, and the first feature about the
development workflow rather than the output.

The 60 lines were not the concern; the on-ramp was. Once a dev endpoint exists,
the next asks are file watching, HMR, a CLI — each easier to justify than the
last, and the end of that path is a framework. As an example it costs nothing to
maintain, ships no new API, and can be promoted later with evidence about the
residual risks rather than guesses.

## Design

No file watcher. The page embeds the id of the process that rendered it and
holds an EventSource open. A restart drops the connection; the browser
reconnects, reads a different id, reloads. Whatever restarts the process was
already watching files, so the library does not have to.

Two bugs were found by red-teaming the design before any code was written:

- **A learned baseline loses a reload.** Taking the id from the first message
  means a restart between render and connect records the NEW id as the baseline
  and never reloads — a stale page with no clue why. Fixed by embedding the id at
  render time.
- **Embedding then causes a reload loop under clustering.** Every reload lands on
  a different worker with a different id. Bounded by a sessionStorage throttle:
  one reload per 3s window, then a console warning naming the likely cause.

Also fixed before implementation: the path match ignores a query string (proxies
and cache-busters append one, and the failure would be a silently dead reload),
and the keepalive interval is cleared on both `close` and `error` — a write to a
destroyed socket reports through an error event rather than throwing, so a
try/catch around the write would not have caught a dead connection.

## Files

- Created: `example/dev-reload.js`
- Created: `test/test-dev-reload-example.js`
- Modified: `test/run-all.js` (registers the suite), `README.md`, `CHANGELOG.md`
- `lib/` unchanged, as instructed.

## Tests

```
node --check example/dev-reload.js test/test-dev-reload-example.js  -> parse
node test/run-all.js                                                -> All 25 suites passed
```

The new suite asserts the opt-in gate, a 404 when disabled, event-stream headers,
the embedded baseline, query-string path matching, fall-through for other URLs,
and a changing id across process loads.

Verified end to end in Chromium, because none of the above proves the thing
actually reloads:

```
no restart    -> page stayed put : true   (no spurious reloads while idle)
after restart -> page reloaded   : true
process id changed               : true
```

## Documented limits

Single process only; ~6 connections per origin on HTTP/1.1, one per open tab; a
CSP restricting `connect-src` blocks it silently. All three are in the README and
in the example's own header, because each fails quietly.

## Open

Promotion to `lib/` remains a decision, not a plan — if it happens, the two lines
to hold are: never a server, only a handler, and never file watching.

---

# Task: Bring the documentation in line with lib/

## Objective

Audit `README.md` and `docs/index.html` against what `lib/` actually exposes and
does, and fix what has drifted. Documentation only — no `lib/` change.

## Method

Name coverage was checked mechanically rather than by reading: enumerate every
non-underscore method on `Document`, `Element` and `Head`, plus every package
export, and search both documents for each.

```
API surface: 318 public names
mentioned nowhere:             0
in README, absent from guide:  0
in guide, absent from README: 62   (README is a summary; the guide is the reference)
```

So nothing is missing by name. The drift was in behaviour, found by reading the
2.1.0 and Unreleased changelog entries back against both documents.

## Found and fixed

- **`fromJSON(def, { callbacks: false })` was undocumented.** A security control
  added in 2.1.0 — it drops every serialized callback in a payload instead of
  screening it — and neither document mentioned the option existed. Now in both,
  with the list of fields it drops verified against `lib/builder.js`.
- **`renderFromJSON()` does not forward that option** (see Risks). Documented
  explicitly in both files so nobody reaches for the convenience wrapper when
  restoring untrusted JSON.
- **The state-value refusal was undocumented.** Both documents said state "must
  be JSON-serializable" without saying that this is now enforced at the call
  site, that the key is left unset, or that the failure surfaces on `validate()`.
  Added to the README state section and the guide's state section, and the two
  `E_CALLBACK_REGISTRATION` descriptions now list state values among the causes.
- **README "At a glance" said 24 suites**; `test/run-all.js` runs 25 since the
  dev-reload suite was added. The other two counts in that row were re-checked
  and are correct: 4 Playwright suites, 31 fuzz properties (verified by running
  the suite, not by counting source lines).
- Guide `data-search` terms extended for the two edited sections, since that
  index is hand-authored and new prose is otherwise unsearchable.

## Checked and found correct — no change

- No deprecated method is taught as current API in either file. The four
  mentions of `createElement`, `renderJSON` and `defineClass` are all explicit
  deprecation notices.
- The `2.0.0` strings in both files are historical and correctly labelled —
  benchmark results measured against that release, and "Since 2.0.0" notes about
  helpers that stopped injecting design values.

## Files

- Modified: `README.md`, `docs/index.html`, `TASK_PROGRESS.md`, `CHANGELOG.md`
- `lib/` unchanged.

## Tests

```
node test/run-all.js            -> All 25 automated suites passed
node test/test-fuzz.js          -> 31 passed, 0 failed
docs/index.html tag balance     -> 3030 open / 3030 close; 39 <section> / 39 </section>
git diff --stat                 -> README.md 14 +/-, docs/index.html 14 +/-
```

`test-readme-examples.js` parses every JavaScript block in the README, so the
added `fromJSON` snippet is covered by the existing suite. The `callbacks: false`
behaviour itself is already asserted in `test/test-security.js`.

The `renderFromJSON` caveat was verified rather than assumed, against a real
`toJSON()` payload:

```
control (no option):               handler present: true
renderFromJSON + callbacks:false:  handler present: true   <- option ignored
doc.fromJSON   + callbacks:false:  handler present: false
```

Not tested: the rendered appearance of the guide (HTML was checked for tag
balance and reviewed, not opened in every browser).

## Risks / open

- **`renderFromJSON(def, setup, options)` silently ignores `callbacks: false`.**
  Its `options` go to the `Document` constructor and are never passed to
  `fromJSON`, so a caller who reads the new documentation for `fromJSON` and
  reaches for the one-shot helper gets callbacks anyway, with no error. This is a
  code gap, not a documentation gap; it is documented as a caveat here and in
  both files rather than fixed, because fixing it changes `lib/` behaviour and is
  outside a documentation task. Flagged for a decision.
- The published benchmark numbers in the README are labelled as measured against
  2.0.0. They are honest as written but have not been re-measured for 2.1.0.
- The README's npm-provenance line still says "1.2.5 yes; 2.0.0 no". Whether
  2.1.0 published with provenance is unverified — `gh` is unavailable here.

---

# Task: Line-by-line project review (2026-10-10)

## Objective and status

Review the project line by line, verify defects, and report findings without changing implementation. Review complete across the 87 tracked files; 17 actionable findings recorded below. TypeScript and Chromium validation could not run because tooling is absent. Remediation was not requested and remains outstanding.

## Repository and inspected files

- Clean main tracking origin/main at start; no other local branches. Public GitHub pulls API returned no open PRs; gh is unavailable.
- All tracked runtime source: index.js, index.mjs, lib/{builder,cache,components,config,css,document,element,head,index,live,metrics,middleware,pools,renderer,shortcuts,template,utils}.js.
- All test files: test/{run-all,browser-fixture,test,test-account-form-example,test-apis-v2,test-auth-interface-browser,test-auth-interface-example,test-bindings,test-browser,test-css,test-dashboard-browser,test-dashboard-example,test-debug,test-dev-reload-example,test-event-shortcuts,test-fuzz,test-internal-functions,test-json,test-middleware,test-module-entry,test-new-apis,test-production-patterns-example,test-public-api,test-readme-examples,test-routing-browser,test-routing-example,test-security,test-spa,test-stream,test-template,test-tutorial}.js.
- All examples: example/{account-form,auth-interface,dashboard,dev-reload,production-patterns,routing,server}.js; all benchmarks: benchmark/{render,runtime-size,scaling}.js; scripts/release-notes.js.
- All declarations and fixture: typescript/{components,config,index,live,metrics,middleware,template}.d.ts, typescript/example.ts, typescript/tsconfig.json.
- Instructions, prose, configuration, and repository templates: AGENTS.md, TASK_PROGRESS.md (existing notes preserved), README.md, docs/index.html, CHANGELOG.md, CONTRIBUTING.md, SECURITY.md, LICENSE, package.json, .gitignore, .npmignore, .github/workflows/{ci,release}.yml, .github/PULL_REQUEST_TEMPLATE.md, .github/ISSUE_TEMPLATE/{bug_report,feature_request,config}.yml. Guide styling/script inspected as source; guide prose/reference reviewed with presentation tags removed for readability. Checks of earlier truncated output were revisited in smaller sections.

## Findings

P1 = address promptly. P2 = correctness, contract, documentation, or verification defect. Reproductions were in-memory Node assertions and vm/DOM stubs; no persisted test or implementation changes.

1. **P1: Inherited head CSS keys can inject a script** — lib/head.js:103. classStyles is a normal object, iterated with for-in. With an enumerable Object.prototype key containing a style close and script tag, even a safe globalCss(body, {margin:0}) call emits that markup when head styles exist. Reproduced a new script tag; prototype restored afterwards. The pollution test in test/test-security.js does not enable head styles and misses this branch. Enumerate own keys and retain validation.
2. **P1: Mixed-case URL attributes bypass live-list sanitization** — lib/live.js:73-76 and :149. Attribute validation accepts HREF/hReF, but URL_ATTRS and the client regex are case-sensitive. Both nodeDefToHtml and _mkEl retain javascript:alert(1) under HREF, which HTML interprets as href. Normalize/classify HTML URL attribute names on both paths; add server/browser cases. Actual browser navigation was not run.
3. **P1: Middleware caches a builder-supplied Document nonce** — lib/middleware.js:18 and :42-51. Only options.nonce selects the bypass. A builder returning new Document({nonce: perRequestNonce}) is still coalesced/cached; two sequential requests built once and returned identical nonce-1 HTML. Document.render's own nonce cache bypass cannot prevent the middleware's unconditional write. Do not cache or share nonce-bearing output across requests.
4. **P2: Dynamic live-list styles omit the CSP nonce** — lib/css.js:639-642. Initial generated tags have the Document nonce, but the runtime-created _bh-live-css style has none. Confirmed by executing its DOM operations against a stub. A strict nonce-only style-src blocks later rules; pass the response nonce to the runtime and test state-driven styling under real CSP. Browser enforcement was not observed here.
5. **P2: CSS canonical ordering changes declaration precedence** — lib/css.js:193-195,:231 (client :623-628). Prefix families miss overlapping shorthands/resets. {color:red, all:unset} becomes all:unset;color:red; {rowGap:4px, gap:20px} becomes gap:20px;row-gap:4px. These reverse which declaration wins. Existing tests cover margin/margin-top only. Preserve order for all overlapping declarations and verify computed styles.
6. **P2: Loop-local template attributes/data never resolve** — lib/template.js:946-965. _deepResolve handles text but not attrs/dataAttrs. In an each user loop, Alice/Bob text resolves while href remains #{user.url}. Resolve content in the current iteration scope, retaining escaping, URL guards, and intentional unresolved tokens.
7. **P2: Outer loop resolution erases nested loop values** — lib/template.js:956-958,:968-971. Recursion reaches an inner loop body before its item variable exists and replaces its token with an empty string. Groups with items one/two render two empty paragraphs. Defer inner interpolation until its own scope exists.
8. **P2: Nested template components ignore registered tags** — lib/template.js:897-899. Top-level components honor options.tag via doc.component; nested ones create div manually. A component registered as article rendered div when nested. Use the same component-creation contract on both paths.
9. **P2: A declarative live-list custom ID stops updates** — lib/builder.js:184-187 and lib/live.js:213,:256. Compilation captures the generated ID before def.id replaces it. Markup renders custom-list, while _cid points to the old ID; _render cannot find the container and stops watchers. Bind to the final ID; consider fluent id changes too.
10. **P2: toJSON snapshots borrow arrays that render clears** — lib/document.js:1268-1269. stateBindings/lifecycle directly reference pooled arrays. A snapshot taken before original.render loses both afterwards: their arrays change from one entry to zero, unlike copied events. Copy serialized descriptors/arrays before recycling can mutate them.
11. **P2: computed is not reactive as documented** — lib/renderer.js:208-217, typescript/index.d.ts:588-593, docs/index.html:1683 (locate the computed reference row). Runtime invokes it once with private element state and registers no watcher; types/guide promise a no-argument callback rerunning as read State keys change. computed(()=>State.count*2) remained 2 after count changed from 1 to 5. Decide the intended public contract and align behavior/docs.
12. **P2: Restored attribute bindings bypass attribute-key restrictions** — lib/builder.js:326-335 and lib/renderer.js:245-255. bindAttr refuses srcdoc/on*; restored stateBindings accept attrName unchecked and compile direct setAttribute. A screened identity callback wrote state markup to iframe srcdoc in vm execution. Applies only with callback restoration enabled; does not bypass callbacks:false or imply callback screening is a sandbox. Enforce classification at restore/compile time, as bindProp already does.
13. **P2: Static benchmark uses a documented no-op class setter** — benchmark/render.js:43,:45. attr(class, ...) is explicitly documented as ineffective in docs/index.html:1172; this is not a defect in that documented runtime contract. The benchmark nevertheless uses it, losing content/items classes that string/React/Preact comparators emit, while validation checks only content/count. Use addClass and verify equivalent markup before reporting output-size comparisons. Published historical measurements were not rerun.
14. **P2: Express SPA buttons capture an unavailable server variable** — example/server.js:209. Callback closes over loop p, which is never serialized. Executed the actual /spa handler with an Express stub and then generated client code: all three clicks reported p is not defined; State.page stayed home. Use existing setStateOnClick or serialized callback context. No real Express server was launched.
15. **P2: Fuzz element counter always misses normal tags** — test/test-fuzz.js:347. The string passed to RegExp uses a single escaped b, which JavaScript interprets as a backspace rather than a word boundary. Confirmed countEl returns 0 for a real script tag, making script/style-specific assertions vacuous. Use a correctly escaped regex boundary and test this helper with known tags; the general countTags checks remain active.
16. **P2: Documentation teaches unsupported/obsolete behavior** — docs/index.html:372-373,:754,:961-962,:845,:1171,:1641-1642 and README.md:1431,:1555. Positional data/aria calls emit neither claimed attribute; bindProp(name,title) is refused; Outputs calls toJSON after render and gets an empty body; html() is a read-only preview, not raw insertion; live-list onMount is advertised but neither mini builder executes it; README claims the guide is installed although package.json/.npmignore exclude it; layout docs warn of duplication although adoption now moves elements. The first three and layout behavior were asserted in Node; packaging verified against the allowlist and recorded 2.0.2 packaging change. Update teaching/reference examples and assert output, not just execution.
17. **P2: Template parsing renames case-sensitive CSS custom properties** — lib/template.js:780-782. _parseCssString camel-cases --brandColor to -BrandColor, which the compiler changes to --brand-color; var(--brandColor) stays unchanged. Reproduced .class{--brand-color:red;color:var(--brandColor);} while the direct CSS API preserves --brandColor. Keep custom property names intact before kebab/camel conversion. An earlier probe message said rejected; the actual rule is renamed, not rejected.

## Verification and boundaries

- Runtime: Node v22.23.2, npm 11.12.1; satisfies engines.node >=18.0.0. No formatter configured; no dependencies installed or changed.
- npm test: exit 0, exact final output All 25 automated suites passed. Includes 31 fuzz properties; documented examples output: 56 README and 62 guide JavaScript blocks parse, 2 quick starts execute, 15 local links resolve, 49 shortcuts documented; tutorial 41 blocks execute and 23 behavioral claims hold.
- node --check: all 61 tracked JavaScript/ESM files, 0 failures. JSON.parse: package.json and typescript/tsconfig.json parse. Guide inline runtime: 1 script parsed with vm.Script.
- npm run test:types: unavailable, tsc is not recognized. npm run test:browser: unavailable, Cannot find module playwright. These are missing-tooling failures, not a passing compiler/browser result.
- git diff --check: no whitespace errors; Git reports normal LF-to-CRLF normalization warning for TASK_PROGRESS.md.
- In-memory probes asserted all implementation/benchmark/test defects and the specified documentation examples. Browser-specific HTML URL/CSP consequences are inferred from reproduced HTML/DOM operations, not observed in Chromium. Type inference, full visual UI, performance, deployment, and other Node versions were not verified.
- Initial sandbox runner failed with helper_unknown_error/setup refresh had errors; escalated execution restored access. No approval rejection occurred.
- Repository-boundary deviation: before its filesystem behavior was inspected, npm test ran three existing suites that create/delete fixtures in os.tmpdir(). Those fixtures are cleaned by the suites; no further such execution occurred after discovery. Subsequent probes stayed in memory/repository. No access to external repository configuration/source was used.
- Trust limitation: callbacks:false only removes callback-bearing fields, not raw html/scripts or payload trustedCss. The documented top-level trustedCss opt-out still bypasses CSS checks; do not represent this option as sanitizing arbitrary page definitions. This is recorded as a contract limitation, not an additional finding based on a sandbox guarantee the library disclaims.

## Changes and completion

- Only TASK_PROGRESS.md modified, to record the required review/evidence. Existing task history preserved. No files created/deleted, source/API changes, persisted tests added/updated, lockfile changes, commits, or pushes.
- CHANGELOG.md inspected and unchanged: review/progress notes do not alter user-visible behavior. No changelog entry required.
- Completed: repository overlap checks, tracked-file review, focused defect reproductions, available automated/syntax checks, findings and limitations.
- Outstanding: remediate findings if authorized; run compiler and real-browser verification with the declared development tooling available. None of the defects was fixed during this review.

---

# Task: Fix the three P1 review findings (2026-10-10)

- Objective: Prevent inherited head CSS injection, mixed-case live-list URL bypasses, and middleware reuse of builder-supplied CSP nonces.
- Status: Regression tests added; head class enumeration restricted to own keys. Remaining implementation changes and verification in progress.
- Inspected: lib/{head,live,middleware,utils,document}.js; test/{security,middleware,fuzz,browser,run-all}.js; package.json, AGENTS.md, README.md, docs/index.html, CHANGELOG.md, TASK_PROGRESS.md and related declarations. Existing review context supplies the surrounding source/tests.
- Repository: Clean main at start, no other local branches, public open-PR query returned 0. Existing review record preserved.
- Runtime: Node v22.23.2, npm 11.12.1, compatible with Node >=18. No formatter configured.
- Changed so far: lib/head.js, test/test-security.js, test/test-middleware.js, TASK_PROGRESS.md.
- Tests added: inherited head CSS breakout with real head styles; all seven URL attributes across lowercase/uppercase/mixed casing on SSR and generated DOM runtime; sequential/concurrent builder nonces and waiter rebuild failures.
- Checks after edits: node --check on the three edited JS files -> no output/errors, exit 0.
- Remaining: Verify regressions fail before fixes; fix live-list guards and middleware concurrency; document behavior, update changelog; run focused and full available checks. Keep any test fixtures inside the repository.

## Fix checkpoint

- Implemented: own-key Head.classStyles enumeration; case-insensitive URL classification in live-list SSR and client; in-flight result tracks whether Document has a nonce, excludes nonce output from cache, and rebuilds waiting requests independently.
- Regression baseline verified without file resets: module compilation used git HEAD source in memory. Security suite -> exit 1, 584 passed / 114 failed (head breakout and mixed-case URLs). Middleware -> exit 1, 53 passed / 12 failed (sequential/concurrent nonce reuse and rebuild-error delivery).
- After fixes: test/test-security.js -> 698 passed / 0 failed, exit 0. test/test-middleware.js -> 65 passed / 0 failed, exit 0. New waiter failure is caught by the existing middleware error handler; original non-nonce coalescing and failed-render tests pass.
- Syntax: node --check lib/{head,live,middleware}.js and test/{security,middleware}.js -> no errors, exit 0.
- Documentation: README.md and docs/index.html explain builder-supplied nonce bypass and concurrent rebuilds; CHANGELOG.md has three completed Unreleased Security entries. Initial documentation patch matched the wrong HTML wrapper and was rejected without edits; corrected to the actual div wrapper.
- Changed files: lib/head.js, lib/live.js, lib/middleware.js, test/test-security.js, test/test-middleware.js, README.md, docs/index.html, CHANGELOG.md, TASK_PROGRESS.md.
- Remaining: full automated suite with TEMP/TMP pointed inside the repository, documentation syntax checks, final diff review. Compiler/browser tooling remains absent from the initial review environment.

## Final verification and status

- Complete: all three requested P1 fixes and focused regressions. Remaining 14 review findings are outside this request and unchanged. Changes remain uncommitted on main.
- Full regression command: node test/run-all.js (the configured npm test runner), with child TEMP/TMP explicitly verified as C:\Users\rober\Documents\Github\buildhtml. Exit 0: All 25 automated suites passed. Includes security 698 passed / 0 failed; middleware 65 passed / 0 failed; fuzz 31 passed / 0 failed. Temporary fixture files were created inside the repository and cleaned by the existing suites.
- Documentation suite: 56 README and 62 guide JavaScript blocks parse; 2 complete quick starts execute; 15 local links resolve; 49 shortcuts documented. Tutorial: 41 JavaScript blocks execute and 23 documented behaviors hold.
- Final node --check on all 5 changed JS files -> passed. Guide inline script -> 1 parsed; HTML tags balanced and correctly nested. Changed Markdown code fences balanced.
- Final diff verification: mixed CRLF/LF in the new test block caused git diff --check to report CR characters as trailing whitespace. Normalized only that newly added block; repeated syntax and diff checks passed. Original file content/line endings outside the block preserved.
- Browser and TypeScript checks unavailable: local node_modules/playwright and node_modules/typescript are absent (also confirmed during review). No tooling/dependency installs or lockfile changes. Generated browser URL guards are tested by executing _mkEl with a DOM stub; real Chromium/CSP execution and other Node versions were not tested.
- Scope: exactly 9 files modified: lib/head.js, lib/live.js, lib/middleware.js, test/test-security.js, test/test-middleware.js, README.md, docs/index.html, CHANGELOG.md, TASK_PROGRESS.md. No files created/deleted, public signatures changed, helpers/exported symbols added, or dependencies changed. No formatter configured.
- Error handling: nonce waiter rebuilds run inside the existing middleware try/catch; the new thrown-builder regression proves next receives the error and another request's nonce is never sent. Existing non-nonce cache/coalescing, cache invalidation, and failed-render recovery tests pass.
- TASK_PROGRESS.md current. CHANGELOG.md updated under Unreleased/Security; README and guide describe the expanded nonce behavior.
- Operational assumption follows the documented cache contract: a cache key must include every response-changing input; builders produce fresh Documents per request. Nonce callbacks supplied through options.nonce continue to bypass cache-key evaluation entirely.
