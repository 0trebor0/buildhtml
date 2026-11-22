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

---

# Task: Learn project and summarize features (2026-11-22)

- Objective/status: Complete orientation of architecture, supported feature groups, development commands, and recorded limitations. No implementation changes requested.
- Inspected: AGENTS.md; package.json; README.md (overview, feature headings, API index); CONTRIBUTING.md; SECURITY.md; CHANGELOG.md (Unreleased); existing TASK_PROGRESS.md; index.js; index.mjs; lib/index.js; lib/document.js (construction/render path and method locations); lib/renderer.js (renderNode and compileClient); lib/element.js (construction and method index); lib/shortcuts.js (method index); lib/builder.js (restored-callback boundary); lib/template.js (public helpers); lib/middleware.js; lib/config.js; example/account-form.js (opening implementation); test/run-all.js; fixture handling in test/test-template.js, test/test-module-entry.js, and test/test-readme-examples.js; typescript/tsconfig.json; .github/workflows/ci.yml and release.yml.
- Architecture: CommonJS implementation with explicit ESM exports and bundled TypeScript declarations. Document/Element trees compile to HTML, deduplicated CSS, and optional per-page browser code. Additional modules cover templates, JSON builders, components, lists/routers, caching, pools, and metrics.
- Repository: clean main tracking origin/main at start; only main and origin/main visible. gh unavailable; public GitHub pulls API inaccessible through web tool, so current open PRs could not be verified. No commits or pushes performed.
- Validation: Node v20.20.2 satisfies declared >=18; npm 10.8.2. node test/run-all.js -> exit 0, 'All 25 automated suites passed.' TEMP/TMP set to the verified repository root for test fixtures. node --check on all 61 tracked .js/.mjs files -> exit 0, 'Syntax checks passed: 61 JavaScript files'.
- Files changed: TASK_PROGRESS.md only. No files created/deleted, tests added/updated, dependencies installed, or runtime behavior changed. CHANGELOG.md unchanged because this is orientation/internal progress only. No formatter configured.
- Limitations: node_modules absent; TypeScript and Playwright browser checks not run. No manual browser verification or benchmarks. Earlier review findings remain recorded above and were not re-audited or fixed in this task. Callback closures are not serialized; state is public browser data; successful render consumes the document tree.
- Remaining: none for orientation; remediation of historical findings requires a separate requested task.

---

# Task: Class-based Document pages (2026-11-22)

- Objective/status: Document and verify the requested HomePage extends Document pattern. Implementation already supports it; no runtime API changes needed. Focused checks passed; full regression pending.
- Inspected: existing AGENTS.md, package.json, lib/document.js constructor/render/shortcut setup, lib/index.js, index.mjs, typescript/index.d.ts Document declaration, test/test-module-entry.js, test/test-public-api.js opening tests, test/test-readme-examples.js parsing/execution setup, test/run-all.js, README.md creation and TypeScript sections, CHANGELOG.md Unreleased, TASK_PROGRESS.md, CONTRIBUTING.md and CI configuration from orientation.
- Repository: main tracks origin/main; only existing orientation notes were dirty at start and are preserved. No other local/remote-tracking branches visible. Open PR status remains unverified: gh unavailable and public API web access failed during this session. No commit/push.
- Changed: README.md adds an ESM class example, CommonJS alternative, super(options) guidance and consumed-tree lifecycle; test/test-module-entry.js adds package-name ESM import/subclass rendering, escaping, zero-script output, independent-instance and consumed-tree assertions; CHANGELOG.md adds an Unreleased/Added documentation entry; TASK_PROGRESS.md records this work. No created/deleted files or dependencies.
- Checks: Node v20.20.2 meets package >=18. node --check test/test-module-entry.js -> exit 0; node test/test-module-entry.js -> 10 passed, 0 failed; git diff --check -> exit 0 (existing progress-file LF-to-CRLF advisory only).
- Tests added: one focused package-entry regression; its async callback runs inside existing testAsync try/catch. HomePage constructor only builds an in-memory tree with literal values.
- Remaining: full automated runner, Markdown/example verification and final diff review. No formatter configured. TypeScript/Playwright tooling absent; no runtime behavior changed.
- Final verification/status: complete. node test/run-all.js -> exit 0, All 25 automated suites passed (TEMP/TMP contained in repository). Documentation suite: 57 README and 62 guide JavaScript blocks parse, 2 quick starts execute, 15 local links resolve, 49 shortcuts documented. New package-entry suite: 10 passed, 0 failed. node --check test/test-module-entry.js passed. Final diff reviewed; no runtime changes or public signatures changed. README, CHANGELOG and progress Markdown fences checked; git diff --check passed. Browser/TypeScript checks not run because tooling is absent; no additional implementation work remains for the requested subclass example. TASK_PROGRESS.md and CHANGELOG.md are up to date.

---

# Task: Interactive lists and computed values (2026-11-22)

- Objective/status: Implement the first suggested milestone: optional keyed liveList updates and reactive computed text, preserving existing non-keyed lists and computed callback arguments. Work in progress; other suggestions (component-local state, batching, async helpers, browser modules) deferred.
- Inspected: lib/live.js (SSR/mini DOM builder/list compiler), lib/renderer.js (state proxies/computed/init/cleanup), lib/element.js computed registration, lib/document.js liveList delegation, lib/builder.js declarative liveList, typescript/index.d.ts computed/list contracts, typescript/live.d.ts, typescript/example.ts opening typed examples, README.md reactive/list sections, docs/index.html computed/list sections, test/test-bindings.js harness/reactivity/lifecycle/list cases, test/test-browser.js, test/browser-fixture.js, related test locations in test/test.js, test/test-css.js, test/test-internal-functions.js. Existing instructions/package/test setup reviewed earlier in this session.
- Repository: main tracks origin/main; prior documentation/test/progress changes preserved. No other branches visible. Current PR status unverified (gh unavailable; API inaccessible earlier). Node v20.20.2 satisfies >=18. No formatter configured; TypeScript and Playwright not installed.
- Completed: regression cases for computed multi-root/nested/dynamic dependencies, deletion, error recovery, legacy state argument and removal cleanup. Before implementation: 167 passed, 7 failed (regression exit 1). Corrected test IDs to snapshot before render recycles elements. Renderer now collects State reads, maintains current dependency watchers and disposes them on removal; existing error reporter handles calculation failures and dependencies remain recoverable.
- Checks so far: node --check lib/renderer.js and test/test-bindings.js -> exit 0; binding suite -> 174 passed, 0 failed (exit 0).
- Modified this task so far: lib/renderer.js, test/test-bindings.js, TASK_PROGRESS.md. No new files/dependencies or commits.
- Remaining: keyed list implementation/regressions; documentation/declarations/changelog; scoped and full verification. Browser/TypeScript tooling availability remains a verification limitation.
- Debugging follow-up: user requested bug investigation of the current working tree before completion. Baseline full runner passed all 25 suites, but browser review found a multi-match locator in the new browser test and an uncovered comment-node patch path. Corrected the locator; added a comment-bearing row to reproduce the patch failure in Chromium before fixing it. TypeScript check now runs and passes after installing declared development tools locally (8 packages, no package/lockfile changes). Initial sandbox npm access failed with EACCES; approved retry succeeded. Chromium download initially failed with EACCES; approved retry is in progress under .baseline/pw-browsers. All generated caches remain inside the repository.
- Keyed unit regressions: binding suite 196 passed / 0 failed. Replaying the new tests against the original live.js in memory produced 177 passed / 9 failed (exit 1), proving they detect row-replacement and key-validation defects. Runtime patches preserve non-keyed list behavior. Current task also modifies lib/live.js, lib/builder.js, typescript/index.d.ts, typescript/example.ts, README.md, docs/index.html, CHANGELOG.md, test/browser-fixture.js and test/test-browser.js. Existing test/test-module-entry.js changes belong to the preceding class documentation task and are preserved.
- Debugging results: Chromium reproduced keyed comment-node failure (input locator timed out because the row was discarded). Fixed patching to handle all matching non-element nodes, not only text. Re-run test/test-browser.js -> exit 0, browser integration passed including row/input identity, focus, selection, current handlers and comments. Corrected the new browser test's multi-match locator using first().
- Also reproduced and fixed two pre-existing defects: toJSON borrowed pooled binding/lifecycle arrays and descriptors (regression with empty pools: 52 passed / 8 failed before fix, 60 passed / 0 failed after copying descriptors); fuzz countEl used a backspace instead of a regex word boundary (new known-tag assertions failed with actual 0 / expected 1; after correcting escaping, all 31 properties passed). Added tests in test/test-json.js and test/test-fuzz.js; modified lib/document.js, README.md and CHANGELOG.md accordingly. No unrelated historical findings were changed.
- Additional checks: binding suite now 199 passed / 0 failed, covering listener removal, mixed-case URL guards on keyed patches, and declarative key forwarding. Added TypeScript positive key fixture and negative unknown-field fixture. Tooling is now available locally; earlier missing-tool limitation is resolved. No package.json or lockfile changes. A documentation/type-fixture patch matched an incorrect existing label and was rejected for that file; corrected to its actual Unknown label before verification.
- Remaining for current work: all four Chromium suites, full unit regression, final type/syntax/documentation/diff checks, and final summary. Historical findings outside these changes remain in the earlier review; this debugging pass is focused rather than a renewed line-by-line audit.

## Final interactivity/debug verification (2026-11-22)

- Status: complete for the two-feature milestone and focused debugging follow-up. Optional keyed lists and reactive computed text are implemented, documented and tested. Fixed the keyed comment-node failure, JSON snapshot aliasing, and vacuous fuzz element counter; corrected the browser regression selector. Component-local state, batching, async helpers and browser modules remain deferred.
- Final runtime verification: node test/run-all.js -> exit 0, All 25 automated suites passed (bindings 199/0, JSON 60/0, fuzz 31/0). After adding only the final patch-error test, focused node test/test-bindings.js -> 201 passed / 0 failed. Patch-error regression verifies caught DOM failure reporting and recovery on a later state update.
- Browser verification: npm run test:browser -> exit 0, all four Chromium suites passed: core bindings/deep state/lists/portals/routing/security/lifecycle; dashboard views/filter/sort/fetch; routing/back/direct refresh; authentication keyboard/focus/accessibility. New coverage proves keyed SSR adoption, preserved row/input identity, edited value, focus/selection across reorder, updated closures, empty state, comments, and reactive computed text.
- Types: npm run test:types -> exit 0, tsc --project typescript/tsconfig.json --noEmit. Includes valid key and rejected unknown item-key fixtures. Syntax: node --check on all 61 tracked JS/MJS files -> exit 0. Documentation: 58 README and 62 guide JavaScript blocks parse, two quick starts execute, 15 links resolve, 49 shortcuts documented; guide inline script parses. Markdown fences balanced. git diff --check passes (progress file line-ending advisory only). No configured formatter.
- Changed this interactivity/debug work: lib/{builder,document,live,renderer}.js; test/{browser-fixture,test-bindings,test-browser,test-fuzz,test-json}.js; typescript/{index.d.ts,example.ts}; README.md; docs/index.html; CHANGELOG.md; TASK_PROGRESS.md. Prior test/test-module-entry.js/class documentation edits preserved. No tracked files created/deleted, dependencies declared, lockfiles edited, or commits/pushes performed. Installed only declared development tooling; browser/cache/profile files stayed in the repository and transient browser profiles cleaned up.
- Remaining limitations: keyed descendants match by position/tag, not their own keys; removed/filtered rows are discarded. Synchronous in-place array reorder can temporarily expose duplicate keys: documented use of a copied reordered array or list sort option. Computed callbacks must be pure and synchronous and track root State reads. Tested Node 20.20.2 and Chromium only; other supported Node versions and browsers not exercised. Earlier unrelated review findings remain recorded and unresolved; this was not a new exhaustive audit. Open PR status remains unverified.
- TASK_PROGRESS.md and CHANGELOG.md are current. Existing authentication, escaping, URL guards, and callback screening retained; keyed patch URL guards, callback errors, listener cleanup, computed cleanup, and non-keyed regressions pass.

---

# Task: Second current-tree debugging pass (2026-11-22)

- Objective/status: Investigate further bugs in the current working tree while preserving previous uncommitted changes. Two security/CSP defects reproduced and fixed; final regression/doc checks pending.
- Inspected: lib/live.js list compilation; lib/renderer.js state/computed/attribute binding paths; lib/builder.js restored descriptors; lib/element.js bindAttr; lib/utils.js isValidAttrKey; lib/css.js runtime/style applier; test/test-bindings.js runtime harness/attribute cases; test/test-css.js runtime harness; test/browser-fixture.js and test/test-browser.js; README.md and docs/index.html security/CSP references; TASK_PROGRESS.md; test/test-security.js harness; package/test/runtime configuration already reviewed in this session.
- Repository/runtime: main tracks origin/main, no other local or remote-tracking branches visible. Existing 16 modified files preserved. Open PR status remains unverified (gh unavailable; API access failed earlier). Node 20.20.2 satisfies >=18; no formatter configured. No commits or pushes.
- Defect 1: restored attribute descriptors bypassed bindAttr restrictions and URL classification was case-sensitive. Regression before fix: bindings 202 passed / 14 failed. Builder now validates names with existing isValidAttrKey, normalizes accepted names to lowercase and reports refusals through existing registration-error handling. Compiler independently refuses unsafe attribute names and classifies URLs without case sensitivity. After fix: 216 passed / 0 failed. Tests cover srcdoc/SRCDOC/onclick/on-Click, validation reporting, safe URL updates, hostile HREF, and compiler defense when descriptors bypass restoration.
- Defect 2: browser-created list styles had no response nonce. CSS regression before fix: 142 passed / 1 failed. Runtime now captures currentScript.nonce while its script executes and applies it before inserting dynamic styles. After fix: CSS 143 passed / 0 failed. Browser fixture adds a nonce-only CSP response; Chromium test verifies initial red style, a later blue style, correct nonce and zero browser/CSP errors. test/test-browser.js -> exit 0, core integration including nonce-only CSP passed.
- Changed in this pass so far: lib/builder.js, lib/renderer.js, lib/css.js, test/test-bindings.js, test/test-css.js, test/browser-fixture.js, test/test-browser.js, TASK_PROGRESS.md. New tracked paths among earlier changes: lib/css.js and test/test-css.js. No new files or dependencies.
- Syntax after edits: node --check on all edited JS in this pass -> exit 0. Remaining: docs/changelog, focused browser checks for other confirmed defects as needed, full tests/types/syntax/diff verification. Prior unresolved findings are not assumed fixed.
- Documentation updated: README.md and docs/index.html explain restored attribute guards/validation and deferred CSP styles while retaining the callback-denylist caveat. CHANGELOG.md has two new Unreleased/Security entries. Documentation examples -> 58 README / 62 guide blocks parse, two quick starts execute, 15 links resolve and 49 shortcuts documented. git diff --check passes (existing progress line-ending advisory only). No public APIs added or signatures changed; no dependencies/lockfiles touched in this pass.

## Second-pass final status

- Complete: both reproduced attribute-restoration and dynamic-CSP-style defects fixed. All new failure cases pass, including rejected descriptor reporting and nonce retention after currentScript becomes null. No new functions, exported symbols, public signatures, dependencies or configuration options added.
- Full regression: node test/run-all.js -> exit 0, All 25 automated suites passed; bindings 216/0, CSS 143/0, fuzz 31/0, security 698/0. npm run test:browser -> exit 0, all four Chromium suites passed; core includes real nonce-only CSP enforcement and later CSS changes. npm run test:types -> exit 0. node --check on all 61 tracked JS/MJS files -> exit 0. Markdown fences and guide inline script parsed; documentation examples and git diff --check passed. New runtime strings/delimiters reviewed; no formatter configured.
- Final files modified in this pass: lib/builder.js, lib/renderer.js, lib/css.js, test/test-bindings.js, test/test-css.js, test/browser-fixture.js, test/test-browser.js, README.md, docs/index.html, CHANGELOG.md, TASK_PROGRESS.md. Other current modifications belong to earlier work in this chat and remain intact. No files created/deleted; temporary Chromium profiles cleaned by Playwright. No commits/pushes.
- Limitations: this is a focused debugging pass, not a full re-audit or remediation of the historical review. Remaining template/CSS-ordering/custom-list-ID and other previously recorded findings are unchanged. Callback screening remains a denylist; untrusted definitions must use callbacks:false. Node 20.20.2/Chromium tested; other Node versions and browsers not run. Current open PRs could not be verified. No verification remains pending for these two fixes.
- TASK_PROGRESS.md and CHANGELOG.md are up to date.

---

# Task: HTML and standalone browser-class compilation (2026-11-22)

- Objective/status: Implement approved compile({output:'html'|'class',className?}) plan. Both targets and Chromium integration implemented; declarations/docs/final checks pending. Existing render behavior and previous uncommitted work preserved.
- Inspected: AGENTS.md and supplied rules; package.json scripts/engines; lib/{document,renderer,element,head,live,config,index}.js; existing serialization, attribute guards and CSS runtime; typescript/index.d.ts rendering declarations; test/run-all.js; existing test/browser-fixture.js and test/test-browser.js integration harness; TASK_PROGRESS.md. Existing related checks and conventions reviewed earlier in this chat. Only main/origin/main visible; current PR status remains unverified as previously recorded. Node 20.20.2 meets >=18; no formatter configured.
- Architecture: compiler generates a standalone ES module using native DOM APIs; no browser package import, eval or runtime compilation. Each mounted instance owns a shadow tree containing local html/head/body, a scoped document/window facade and independent State/watchers. Existing compiled runtime reused with scoped event/cleanup hooks. CSS and metadata stay in the shadow tree; title does not change host title. cssVars uses :host. Generated class accepts a per-host CSP nonce at construction.
- Implementation: new lib/compiler.js (called by Document.compile); HTML assembly extracted into Document._renderHtml and reused by render/compile, with pooled-context cleanup and no cache access/body consumption in compile. Live-list/views script classification added for class support; routers/authored inline scripts/head scripts/links/rawHead and native SVG/MathML trees are explicitly refused. Raw body markup retains explicit-unsafe template parsing and rejects script elements on mount.
- Generated API: named class export, mount(target), createElement(tagNameOrNode), destroy(), root and state. mount builds ordinary elements/text with appendChild; existing nodes are reused. Scoped AbortController removes generated listeners, runtime cleanups dispose watchers/lifecycle callbacks, and destroy removes owned DOM/styles. Repeated mount requires destroy first; failure rolls back; remount initializes fresh state.
- Tests added: test/test-compile.js registered in test/run-all.js. Covers both outputs, preserved source/output state, DOM source syntax/text/attrs/classes/CSS, sanitized URLs, invalid class names/options, unsupported features, generated list/view scripts and pooled cleanup after failure. Chromium test imports a served module under CSP and verifies two independent instances, host globals/title untouched, inputs/computed/list updates, CSS vars/dynamic styles, native-node reuse, lifecycle cleanup, detached events disabled, remount and invalid/failing mount cleanup.
- Checks: node --check on all files edited so far -> exit 0. New compiler suite passes. Existing 25 suites passed after initial runtime changes. Core Chromium integration (including compiled modules/isolation/destroy/remount/CSP/error paths) -> exit 0. No dependencies, lockfiles or commits changed.
- Files touched this task so far: new lib/compiler.js and test/test-compile.js; modified lib/document.js, lib/renderer.js, lib/live.js, test/run-all.js, test/browser-fixture.js, test/test-browser.js, TASK_PROGRESS.md. Remaining: TypeScript declarations/fixtures, README/guide/changelog, final tests and review. Earlier unrelated review findings remain out of scope.
- Additional edge-case verification: class instances with no declared state still receive a local State object rather than falling back to host globals. Export aliases keep names such as Object, undefined and State from shadowing runtime globals; exported constructor.name still matches className. Scoped document facades retain their original root across remounts. Browser regressions cover stateless instance isolation and an Object-named module.
- Built-in views now register their unsubscribe with class cleanup; Chromium verifies view switching and portals stay local and detached views stop updating after destroy. Native listener abort and DOM patch transfers retain correct handlers without duplicate registration. HTML compilation explicitly tested against a stale response-cache entry and leaves it untouched.
- Declarations: CompileOptions union and Document.compile(options) added; TypeScript positive/negative fixtures pass. README and guide document both targets, browser mounting/node reuse, source preservation, state/shadow isolation, cleanup/remount, modern-browser/CSP requirements, callback trust boundaries and explicitly unsupported class features. Guide navigation/API table and README suite count updated to 26. CHANGELOG.md updated under Unreleased/Added.
- Latest focused checks: compiler suite and core Chromium integration -> exit 0; npm run test:types -> exit 0. Documentation: 60 README and 64 guide JavaScript blocks parse; two quick starts execute; 15 links resolve; 49 shortcuts documented. git diff --check passes. No formatter configured. Remaining: final full unit/browser/type/syntax/package checks and final review.

## Final compilation status

- Complete: approved HTML/browser-class compiler implemented with source preservation, native DOM output, instance-scoped state/DOM/styles, existing interactivity, explicit unsupported-feature errors, mounting/destruction/remounting, modern-browser/CSP documentation and declarations. Existing render() continues to consume its tree; compile() does not alter output() or response caching.
- Final tests: node test/run-all.js -> exit 0, All 26 automated suites passed. New compiler suite includes contextual attribute-coercion failure handling/source preservation and pooled cleanup, in addition to normal output/validation/cache tests. npm run test:browser -> exit 0, all four Chromium suites passed, including actual ES module imports, independent instances, stateless classes, browser-global export names, native node reuse, inputs/computed/lists/views/portals, cleanup/aborted listeners, failure rollback, remount and strict CSP. npm run test:types -> exit 0. node --check on 63 JS/MJS files (including both new files) -> exit 0. Guide HTML nesting, inline script parsing, Markdown fences, new-file whitespace, and git diff --check passed. Documentation: 60 README / 64 guide blocks parse, two quick starts execute, 15 links resolve, 49 shortcuts documented. npm pack --dry-run -> exit 0, new lib/compiler.js included. No formatter configured.
- Created: lib/compiler.js, test/test-compile.js. Modified for this task: lib/document.js, lib/renderer.js, lib/live.js, test/run-all.js, test/browser-fixture.js, test/test-browser.js, typescript/index.d.ts, typescript/example.ts, README.md, docs/index.html, CHANGELOG.md, TASK_PROGRESS.md. Other working-tree changes predate this task and are preserved. No deletions, dependency/lockfile changes, commits or pushes. No generated modules or temporary browser profiles left untracked.
- Limits: class output uses modern-browser Shadow DOM/Proxy/abortable listeners and was verified in Chromium on Node 20.20.2; other browsers/Node versions not run. Head metadata is local/inert. URL routers, authored inline scripts, external head links/resources, raw head markup, native SVG/MathML trees, and arbitrary :root selectors in head CSS are explicitly rejected. cssVars is supported. Raw body markup uses the existing unsafe path; callback screening remains a denylist and callbacks cannot capture server scope. Timers/manual resources still require mount cleanup. Earlier unrelated review findings and keyed in-place reorder limitation remain unchanged. Current open PRs remain unverified.
- No remaining implementation/checks for the agreed first version. TASK_PROGRESS.md and CHANGELOG.md are current; source syntax, strings and delimiters reviewed.

---

# Task: Debug the current compiler/browser-class implementation (2026-11-22)

- Objective/status: Investigate implemented behavior only; the proposed Router API remains unimplemented. Three compiler compatibility defects reproduced in Chromium and fixed; full regression checks pending.
- Inspected: current lib/compiler.js and test/test-compile.js in full; relevant compiled-page fixtures/probes and mount/destroy checks in test/browser-fixture.js and test/test-browser.js; current README.md/guide compiler contracts; CHANGELOG.md; TASK_PROGRESS.md. Prior instructions and test/runtime setup remain applicable. main tracks origin/main; no other branches visible. Existing changes (including untracked compiler/suite from the earlier task) preserved. Open PR status remains unverified; Node 20.20.2 satisfies >=18; no formatter configured.
- Defect 1: window facade bound constructors as methods, losing static APIs and prototypes (window.Array.isArray, Promise.resolve, Event.prototype) and native identity. Facades now bind callable methods that have no own prototype, preserving constructors.
- Defect 2: getElementsByTagName/getElementsByClassName searched the host document; collections were unrelated to the class's nodes. These and getElementsByTagNameNS now search the local HTML subtree with native live collections. contains checks the local root; defaultView returns the scoped window. Other document APIs remain host-backed: the facade is explicitly documented as incomplete, not a sandbox/full virtual Document.
- Defect 3: native template children were appended to the template element instead of its content fragment. The compiler now emits children into .content; browser regression verifies cloneNode and native fragment insertion.
- Before fixes: core Chromium regression exited 1 with array/event/promise/view/tag/class/live probes all false and template content empty. After fixes: core Chromium integration and compiler suite -> exit 0. Additional assertions preserve native method binding via getComputedStyle, scoped contains, constructor identity, live collection updates and cloneable template content. node --check on all four edited JS files -> exit 0.
- Changed this pass: lib/compiler.js, test/test-compile.js, test/browser-fixture.js, test/test-browser.js, README.md, docs/index.html, CHANGELOG.md, TASK_PROGRESS.md. No files created/deleted, new public APIs, dependencies, lockfiles, branches, commits or pushes. README/guide now list supported scoped lookups and remaining facade boundary; changelog records completed fixes.
- Remaining: full 26-suite runner, all four browser suites, types/syntax/docs/package checks and final diff review. Other historical findings and documented class-output restrictions remain outside this focused pass.

## Current-compiler debug final status

- Complete for the three reproduced compatibility defects. No Router implementation added. Constructor identity/static/prototype preservation, scoped tag/class/namespace lookups and contains/defaultView, and native template content emission now have focused regression coverage.
- Final verification: node test/run-all.js -> exit 0, All 26 automated suites passed. npm run test:browser -> exit 0, all four Chromium suites passed; new probes confirm constructors, bound native methods, scoped/live collections, local contains/defaultView and cloned template fragments while earlier isolation/cleanup/CSP tests still pass. npm run test:types -> exit 0. node --check across all 63 JS/MJS files (including earlier untracked compiler/suite) -> exit 0. Documentation suite -> 60 README / 64 guide blocks parse, two quick starts execute, 15 links resolve and 49 shortcuts documented. Markdown fences, guide inline script, guide HTML nesting, npm pack --dry-run (compiler included), and git diff --check passed. No formatter configured.
- Final files changed this pass: lib/compiler.js; test/test-compile.js; test/browser-fixture.js; test/test-browser.js; README.md; docs/index.html; CHANGELOG.md; TASK_PROGRESS.md. No new/deleted files, dependencies, lockfile modifications, public API signatures, commits or pushes in this pass. Earlier working-tree changes remain preserved; no transient browser profiles left.
- Limitations: the facade scopes only its documented lookup APIs; other document APIs can still access the host. It remains trusted JavaScript, not a sandbox or full virtual Document. Class-output restrictions and the earlier unresolved review findings are unchanged. Node 20.20.2 and Chromium tested; other runtimes/browsers not run. Open PR status remains unverified. The proposed Router API remains a proposal.
- TASK_PROGRESS.md and CHANGELOG.md are current. No checks or implementation remain pending for this debugging pass.

---

# Task: Debug current features and provide runnable usage instructions (2026-11-22)

- Objective/status: Debug the implemented features and add practical instructions/example for HTML compilation, generated classes, state/computed text, keyed lists, views and cleanup. The proposed Router API is not being implemented. Work in progress.
- Repository: clean main tracking origin/main at d083316 at start; only main/origin/main visible. Previous chat changes were committed externally before this request. gh remains unavailable; current open PR status unverified. Node 20.20.2 satisfies package >=18; local Playwright/Chromium and TypeScript available. No formatter configured.
- Inspected: lib/compiler.js and test/test-compile.js in full; README.md compilation/state/list sections; example/production-patterns.js, test/test-production-patterns-example.js, example/account-form.js server conventions; relevant compiler browser fixtures/tests; test/run-all.js; package.json; CONTRIBUTING.md; AGENTS.md; .gitignore; TASK_PROGRESS.md. Existing API/runtime sources already reviewed earlier in the session.
- Reproduced bug: scoped event registration overwrote supplied AbortSignal, so caller cancellation failed and invalid signals bypassed native validation. Chromium probe before fix reported signal calls=1 (expected 0) and invalidSignal=false (expected true). Updated compiler to preserve supplied signals and register instance cleanup separately; omitted signals still use the instance AbortController. Browser regression now passes, including destroy removal of listeners whose caller never aborts. Existing compiler suite passes. node --check on all changed JS -> exit 0.
- Changed so far: lib/compiler.js, test/browser-fixture.js, test/test-browser.js, TASK_PROGRESS.md. Remaining: runnable compilation walkthrough, automated HTTP/browser coverage, README/guide/changelog instructions, final regression checks. No dependencies, lockfiles, branches, commits or pushes changed.
- Added runnable example/compilation.js: CounterDocument extends Document on Node, compiles one definition into HTML and a CounterPage module, serves a browser host at /, HTML at /server and module at /counter-page.js (default loopback port 3006). Demonstrates name binding, counter/computed text, keyed task updates, views, native mounting and destroy/remount controls. Client errors become visible status messages; server creation/URL/request failures have contextual handling.
- Added test/test-compilation-example.js to the configured runner: both outputs/source preservation, module syntax/MIME, HTTP 404/405, caught URL errors and mocked server-creation failure pass. New core Chromium coverage runs the actual example for both output modes, task identity, reset/cleanup and caught mount/destroy UI failures.
- The first browser run of the new walkthrough exposed a second compiler defect: list then view inline IIFEs were joined only with a newline, causing initialization to call an IIFE result as a function. The host showed Mount failed / intermediate value is not a function; the browser wait timed out. Fixed by inserting semicolon boundaries between generated script fragments. This source-order regression is now exercised by the actual walkthrough. Repeated core Chromium integration -> exit 0, including signals and runnable walkthrough; example HTTP suite -> exit 0. Relevant node --check commands passed after each edit.
- Additional created files: example/compilation.js, test/test-compilation-example.js. Additional modified file: test/run-all.js. No dependencies or lockfiles changed. Remaining: README/guide instructions and changelog, final full checks.
- Usage instructions added to README.md and docs/index.html: exact checkout command/URLs, feature-by-feature interactions, Node CounterDocument versus emitted CounterPage, API table, native createElement/appendChild, state/root console access, cleanup, module MIME/HTTP/shadow-DOM troubleshooting, version/publication distinction, caller-signal semantics and routing boundaries. The proposed Router is explicitly not shipped; existing HTML URL routers and local class views are distinguished. README suite count updated to 27 and guide navigation/search updated. CHANGELOG.md records both confirmed fixes and the completed walkthrough.
- Focused checks after the second fix: example HTTP suite and core Chromium integration pass; documented UI includes success and caught mount/destroy failures. README/guide JavaScript checks: 61 README / 64 guide blocks parse, two quick starts execute, 16 local links resolve and 49 shortcuts documented. Syntax checked after each JS edit; git diff --check passes (line-ending advisories only). Remaining: full 27-suite runner, all browser suites, type/syntax/HTML/package verification and final review.

## Final debug/instructions status

- Complete: fixed caller AbortSignal/native validation handling and generated-script semicolon boundaries. Added a runnable, documented walkthrough of the implemented new features; no proposed Router APIs were added. The walkthrough itself reproduces the former list-before-view mount failure and now passes in both output modes.
- Final checks: node test/run-all.js -> exit 0, All 27 automated suites passed. npm run test:browser -> exit 0, all four Chromium suites passed, including cancellation/invalid signals, cleanup of caller-signaled listeners, live walkthrough UI, keyed identity, computed/name updates, view switching, destroy/remount and caught UI error paths in both class/HTML modes. npm run test:types -> exit 0. node --check on all 65 JS/MJS files -> exit 0. Documentation examples -> 61 README / 64 guide JS blocks parse, two quick starts execute, 16 local links resolve, 49 shortcuts documented. Markdown fences, guide inline script and HTML nesting passed. npm pack --dry-run -> exit 0, compiler included. git diff --check passed (existing LF-to-CRLF advisories only). No formatter configured.
- Created: example/compilation.js and test/test-compilation-example.js. Modified: lib/compiler.js, test/browser-fixture.js, test/test-browser.js, test/run-all.js, README.md, docs/index.html, CHANGELOG.md, TASK_PROGRESS.md. No deletions, dependency/lockfile changes, commits/pushes or release publication. No transient Chromium profiles or generated output modules left in the working tree.
- Usage: from the repository root run node example/compilation.js, then open http://127.0.0.1:3006/ (class), /server (HTML), or /counter-page.js (source). PORT can override the example port. The host exposes window.examplePage for state/root inspection. Documentation includes the checkout/package distinction, supported methods, scoped event signals, HTTP/MIME/shadow DOM troubleshooting and routing restrictions.
- Limits: tested Node 20.20.2 and Chromium; other runtime/browser versions not run. Generated-class restrictions and incomplete scoped-document facade remain documented. The Router API is still a proposal, historical unrelated review findings remain unresolved, and current open PR status was not verified. No implementation/checks remain pending for this request.
- TASK_PROGRESS.md and CHANGELOG.md are up to date.

---

# Task: Automatically write HTML and JavaScript files (2026-11-22)

- Objective/status: Implement saveBundle(htmlPath, {className?}) to create an HTML host and matching auto-mounting browser module together. Implementation, focused tests and documentation complete; final full verification pending. Previous uncommitted debugging/walkthrough changes preserved.
- Inspected: current lib/document.js compile/save/render conventions; lib/compiler.js generation and exports; typescript/index.d.ts rendering methods and typescript/example.ts fixtures; test/test-compile.js, test/test-browser.js and compilation walkthrough; example/compilation.js; README/guide/changelog; AGENTS.md/package/runtime setup and current git branches/status. main tracks origin/main, only main/origin/main visible; gh/current PR access remains unavailable/unverified. Node 20.20.2 satisfies >=18; no formatter configured.
- Implementation: saveBundle creates parent directories, writes same-stem .js first and .html second, and adds an external module tag plus JS auto-mount code. Both contents compile before I/O, source/output/cache behavior is preserved, and errors retain failed path/code/cause. Host copies escaped title/meta/lang/dir; source IDs/classes remain in the isolated page to avoid bootstrap conflicts. Module URLs encode special filenames. Existing save() behavior is unchanged. Static response nonces are refused rather than reused. Write pairs are not transactional; partial output on filesystem failure is documented.
- Added public method/type declaration only; internal writer is called by that method. Added example CLI --build public/index.html, which writes both files then exits. README and guide include a complete usage snippet, file layout, CLI command, HTTP/MIME requirements, overwrite/preservation/error behavior and static-CSP restrictions. CHANGELOG.md updated under Unreleased/Added.
- Tests updated: test/test-compile.js checks directory creation, both files, module syntax/bootstrap, encoded names, metadata, overwrites, return/source/output behavior, invalid paths/options/class names, unsupported class features, response nonce refusal, mocked JS/HTML EACCES errors and actual CLI success/failure. All test artifacts are in verified repository .baseline fixtures and cleaned afterwards. Chromium loads actual generated files over HTTP, automatically mounts without handwritten bootstrap, exercises counter/computed text/keyed tasks and a filename containing space/#; generated-file handler failure is also tested.
- Focused results: compiler suite -> exit 0; core Chromium integration including automatic file bundles -> exit 0; npm run test:types -> exit 0. JS syntax checks passed after each edit. Documentation checks: 62 README and 65 guide blocks parse, two quick starts execute, 16 links resolve, 49 shortcuts documented; git diff --check passes (line-ending advisories only).
- Files changed this request: lib/compiler.js, lib/document.js, test/test-compile.js, test/test-browser.js, example/compilation.js, typescript/index.d.ts, typescript/example.ts, README.md, docs/index.html, CHANGELOG.md, TASK_PROGRESS.md. No additional files, dependencies, lockfiles, branches, commits or pushes created. Remaining: full suite/browser/types/syntax/package and final review; earlier unrelated limitations remain.

## Automatic file export final status

- Complete: Document.saveBundle(htmlPath, {className?}) writes a matching HTML host and auto-mounting JS module in one call, creates directories, preserves source/output behavior and reports filesystem errors. The walkthrough supports --build public/index.html and exits after exporting. Existing save() and compile() behavior retained.
- Final verification: node test/run-all.js -> exit 0, All 27 automated suites passed, including real file/CLI generation and mocked write failures. npm run test:browser -> exit 0, all four Chromium suites passed; actual generated files loaded automatically and counter/computed/views/keyed tasks worked over HTTP with encoded filenames. npm run test:types -> exit 0. node --check across all 65 JS/MJS files -> exit 0. Documentation: 62 README / 65 guide blocks parse, two quick starts execute, 16 links resolve and 49 shortcuts documented. Markdown fences, guide script/HTML nesting, npm pack --dry-run (compiler included), and git diff --check passed. New host attribute projection also has an inherited-dir/prototype regression. No formatter configured.
- Changed for this request: lib/compiler.js, lib/document.js, example/compilation.js, test/test-compile.js, test/test-browser.js, typescript/index.d.ts, typescript/example.ts, README.md, docs/index.html, CHANGELOG.md, TASK_PROGRESS.md. Earlier uncommitted debugging/example files preserved. No additional files, dependencies, lockfiles, commits, pushes or package publication. Temporary output fixtures/profile folders cleaned within verified repository paths.
- Limits: exports overwrite their named outputs and are not a two-file transaction; a write failure can leave partial output and is reported with path/code/cause. Exported HTML is a client-rendered host and needs HTTP/module MIME serving; class-output restrictions apply. Static document/head response nonces are explicitly refused. Other browsers/Node versions beyond Chromium/Node 20.20.2 were not tested. Proposed Router and earlier unrelated findings remain unchanged; current PR status unverified.
- TASK_PROGRESS.md and CHANGELOG.md are current. No remaining implementation or verification for this request.

---

# Task: Debug current automatic file export (2026-11-22)

- Objective/status: Debug current file generation and browser output, preserving all previous uncommitted changes. One encoding defect reproduced and fixed; final full checks pending.
- Inspected: lib/compiler.js saveBundle and generation contract; lib/head.js charset emission; test/test-compile.js file/overwrite/failure cases; test/test-browser.js actual bundle delivery; README.md/guide bundle instructions; typescript/index.d.ts bundle declaration; CHANGELOG.md; TASK_PROGRESS.md; current branch/status. Existing instructions and test/runtime setup apply. main tracks origin/main; no other branches visible; PR status remains unverified. Node 20.20.2 meets >=18; no formatter configured.
- Reproduction: saveBundle always writes UTF-8 but copied source charset to host meta. With windows-1252 and title Compilation café + emoji, browser displayed cafÃ© and mojibake emoji. New compiler test and Chromium test both exited 1 before the fix. Host now explicitly declares UTF-8; source doc.head.charset remains unchanged. No encoding behavior changed for render/compile or legacy save().
- Focused results: node test/test-compile.js and core Chromium integration -> exit 0 after fix, including real Unicode decoding without an HTTP charset override. node --check on edited JS passed. README, guide, declaration comment and Unreleased changelog now describe UTF-8 export behavior and server header requirements. An initial malformed patch was rejected before edits; corrected patch stayed within the repository.
- Files modified this pass: lib/compiler.js, test/test-compile.js, test/test-browser.js, README.md, docs/index.html, typescript/index.d.ts, CHANGELOG.md, TASK_PROGRESS.md. No new/deleted files, public signatures, dependencies, lockfiles, commits or pushes. Prior uncommitted changes preserved. Remaining: full 27-suite runner, four browser suites, types/syntax/docs/package checks and final review. Known non-transactional write behavior and historical findings remain documented.

## Bundle encoding debug final status

- Complete for the reproduced encoding defect: exported host charset is UTF-8, matching the written bytes; legacy source charset remains unchanged. No unrelated render/save behavior or public signatures changed.
- Final checks: node test/run-all.js -> exit 0, All 27 automated suites passed. npm run test:browser -> exit 0, all four Chromium suites passed; real generated HTML preserves café and emoji with a windows-1252 source setting and no HTTP charset override. npm run test:types -> exit 0. node --check on all 65 JS/MJS files -> exit 0. Documentation -> 62 README / 65 guide blocks parse, two quick starts execute, 16 links resolve and 49 shortcuts documented. Markdown fences, guide inline script and HTML nesting, npm pack --dry-run (compiler included), and git diff --check passed. No formatter configured.
- Files changed this pass: lib/compiler.js, test/test-compile.js, test/test-browser.js, README.md, docs/index.html, typescript/index.d.ts, CHANGELOG.md, TASK_PROGRESS.md. No new/deleted files, dependencies, lockfiles, commits, pushes or publication. Previous uncommitted changes preserved; test artifacts and browser profiles cleaned within the repository.
- Limits: focused bundle-output debugging, not a complete re-audit; historical findings and non-transactional two-file writes remain unchanged. Hosting servers must not override the exported UTF-8 encoding with a conflicting charset header. Other Node versions/browsers beyond Node 20.20.2/Chromium not run; PR status remains unverified. Proposed Router remains unimplemented.
- TASK_PROGRESS.md and CHANGELOG.md are up to date; no checks or implementation remain pending for this pass.

---

# Task: Custom bundle filename (2026-11-22)

- Objective/status: Complete. User confirmed filename: 'name' must rename both outputs to name.html/name.js in htmlPath's directory. Implementation, documentation and regression checks complete.
- Inspected: lib/compiler.js saveBundle; test/test-compile.js bundle cases; test/test-browser.js real bundle HTTP integration; typescript/index.d.ts and typescript/example.ts; README.md, docs/index.html, CHANGELOG.md, TASK_PROGRESS.md, package.json and git status/branches. Clean main at a80f393 initially tracks origin/main; no overlapping local branches visible. Current open PR status remains unverified (gh unavailable). Node 20.20.2 satisfies declared >=18; no formatter configured.
- Changed: lib/compiler.js adds the requested filename option, preserves default path-derived names and rejects invalid stems before I/O. No directory override or overwrite-policy change. typescript/index.d.ts and typescript/example.ts declare/exercise the option and reject a numeric value. test/test-compile.js covers both renamed files, encoded module URL, class export, source preservation and invalid stems without output. test/test-browser.js loads a renamed bundle and exercises its interactions. README.md/docs/index.html explain naming, validation and defaults; CHANGELOG.md records the API addition. TASK_PROGRESS.md tracks this task. No other files created/deleted or dependencies changed.
- Checks so far: new filename success test failed before implementation with AssertionError: filename overrides both output stems (exit 1), then node test/test-compile.js passed (exit 0). node --check lib/compiler.js and test/test-browser.js passed. npm run test:types passed (exit 0), including positive option and expected numeric-option rejection.
- Final checks: node test/run-all.js -> exit 0, All 27 automated suites passed. npm run test:browser -> exit 0, all four Chromium suites passed including interactive renamed bundles. npm run test:types -> exit 0. node --check on all 65 tracked JS/MJS files -> exit 0. Documentation suite: 63 README / 66 guide JavaScript blocks parse, 2 quick starts execute, 16 links resolve and 49 shortcuts documented. git diff --check -> exit 0 (line-ending advisories only). No formatter configured.
- Verification issue/resolution: first standalone docs check used the default system TEMP and failed with EPERM resolving C:\Users\robert. Assessed the test's temporary-file location and reran with TEMP/TMP set to the repository; docs and full runner passed. Subsequent checks used repository-contained fixtures.
- Limits: existing files at selected names are still overwritten; writes remain nontransactional. Only Node 20.20.2 and Chromium tested; current open PR status unverified. No remaining task work, dependencies/lockfile changes, commits or pushes. TASK_PROGRESS.md and CHANGELOG.md are current.

---

# Task: Plan full-feature saveBundle support (2026-11-22)

- Objective/status: Planning only, as requested. Identify current feature gaps and propose compatible bundle support; no implementation changes made.
- Inspected: lib/compiler.js class runtime/restrictions and bundle writer; lib/document.js head/script APIs, routing registration and HTML assembly; lib/head.js resource ordering; lib/renderer.js client compilation and portals; lib/live.js router hooks; test/test-compile.js current contracts; README.md, package.json and current progress/changelog. Git is clean main at 0dd9ecb tracking origin/main before this planning update, with no other local branches visible. Remote open PR status unverified.
- Findings: saveBundle always compiles the isolated shadow-root class. It explicitly refuses head resources/rawHead, routers/authored inline scripts, script nodes, native SVG/MathML and arbitrary :root CSS. Server-only request handling/cache/stream APIs cannot execute in static browser files. Arbitrary trusted scripts require native document/global semantics that the scoped class facade cannot promise.
- Proposed plan: retain existing class behavior and add an explicit full-page bundle mode using existing HTML/client render data. Preserve real head/body markup, styles, resources and script ordering; emit generated browser behavior to the paired JS file without parsing rendered HTML to extract it. Keep authored script tags/data blocks and their execution semantics. Verify all existing browser features through actual file exports, including routers, head resources, raw markup, namespaces, CSS, state/bindings/lists/views/fetch/lifecycle/portals. Preserve filename/className defaults and existing validation/security checks; document static hosting, History fallback and CSP boundaries.
- Changed files: TASK_PROGRESS.md only. No tests added/run because application code is unchanged; planning file reviewed and git diff --check passed (exit 0, line-ending advisory only). CHANGELOG.md requires no entry for planning-only work. Remaining: user review of plan, then implementation and focused regression/browser/type/docs checks. No commits/pushes performed.

## Revised next-fix plan: mount only authored elements

- Confirmed requirement: generated classes append authored elements directly into the supplied mount target. No generated html/head/body elements, extra host div or Shadow DOM. saveBundle keeps one outer HTML document with a real head/body and #app; its module mounts the authored elements into #app. This supersedes the earlier proposal to introduce a page mode; no new mode option is needed for this fix.
- Inspection/status: re-read lib/compiler.js mount/destroy, style creation, DOM/head generation and scoped document initialization. main remains 0dd9ecb tracking origin/main, with only this planning file modified. Implementation has not started; remote open PR status remains unverified.
- Step 1: replace the synthetic document/shadow host with direct insertion, retaining ownership references for every inserted top-level node. Keep public mount/createElement/destroy and saveBundle filenames/return contracts; root becomes the supplied target. This changes the existing DOM/isolation contract and requires documentation and test updates.
- Step 2: target real ownerDocument.head for generated styles/resources and bundle metadata, with explicit ownership for cleanup. In standalone class mounts, avoid inserting synthetic document metadata or silently changing host metadata. Decide/document mapping for existing html/body attributes when mounting into a host; preserve true html/body attributes in the exported outer file.
- Step 3: adapt internal selectors, bindings, lists, views, portals and lifecycle tracking to the mounted elements. destroy must remove only instance-owned nodes/styles/listeners, preserve pre-existing target children and support remount. Handle failed mounts through the existing cleanup/error path. Keep per-instance state; cover collisions and document/listener semantics explicitly because Shadow DOM isolation is removed.
- Step 4: add focused compiler and Chromium tests for exact direct-child structure, absence of synthetic wrappers/shadow roots, existing target content, multiple mounts, cleanup/remount/failure cleanup and current interactive features. Keep filename/encoding/type/export regressions. Full feature parity remains the broader follow-up: routing, head resources/authored scripts, namespaces and global CSS need individual compatibility checks rather than merely removing refusal checks.
- Step 5: update README.md, docs/index.html, relevant TypeScript comments and CHANGELOG.md with the new DOM contract and style-isolation limitations. Run focused tests, all 27 automated suites, four browser suites, TypeScript and changed-JS syntax checks, then update this progress file with actual results.
- This session: TASK_PROGRESS.md only changed; no application code/tests/dependencies changed. No tests run for this planning-only revision; git diff --check passed with a line-ending advisory only. CHANGELOG.md unchanged because no behavior has shipped. Plan recorded; implementation intentionally deferred to the next fix. No commits/pushes performed.
