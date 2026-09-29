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
