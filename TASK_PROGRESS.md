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
