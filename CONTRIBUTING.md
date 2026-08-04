# Contributing

Thanks for helping improve buildhtml. This document covers how to run the
project locally and what a change needs before it can be merged.

For security problems, do **not** open an issue — see [SECURITY.md](SECURITY.md).

## Requirements

- Node.js 20 or newer (CI runs 20, 22, and 24)
- No runtime dependencies, and the project intends to keep it that way

```bash
git clone https://github.com/0trebor0/buildhtml.git
cd buildhtml
npm test
```

There is nothing to install for the unit tests — they use only the Node standard
library.

## Running the checks

| Command | What it covers |
| --- | --- |
| `npm test` | All unit suites, including property-based fuzz tests |
| `npm run test:types` | Type declarations (needs `npm i --no-save typescript@5`) |
| `npm run test:browser` | Real Chromium (needs `npm i --no-save playwright@1 && npx playwright install chromium`) |
| `npm run benchmark` | Render throughput and output size |
| `npm run benchmark:size` | Client JavaScript compiled per feature |

CI runs all three test commands plus `npm pack --dry-run`. Run at least
`npm test` before opening a pull request.

### Reproducing a fuzz failure

`test/test-fuzz.js` generates inputs from a seeded PRNG and prints the seed when a
property fails. Replay it exactly:

```bash
BUILDHTML_FUZZ_SEED=1304699241 node test/test-fuzz.js
BUILDHTML_FUZZ_ITERATIONS=20000 node test/test-fuzz.js
```

## Engineering rules

[AGENTS.md](AGENTS.md) is the authority and applies to human and automated
contributions alike. The short version:

- Read the surrounding code before changing it. Match existing style, naming, and
  patterns.
- Make the smallest change that fully solves the problem. Do not refactor,
  rename, or reorganise unrelated code.
- Every change needs a task-specific reason. No speculative abstractions, no
  defensive code without an identified failure case.
- Comments explain *why*, not *what*.
- Do not add dependencies, and do not weaken existing validation, sanitisation, or
  authorisation checks.

## Tests are required

- Add or update a test whenever behaviour changes or a bug is fixed. A bug fix
  needs a test that fails without the fix.
- Test the specific behaviour, including edge cases and failure paths.
- Do not weaken, skip, or delete a failing test to get a green run. If a test
  fails, work out whether the test or the implementation is wrong before changing
  either — a test can encode a bug.
- If you could not run something, say so explicitly in the pull request.

Tests live in `test/` and are plain Node scripts with hand-rolled assertions —
no framework. Add new suites to the list in `test/run-all.js`.

## Changes that touch the security boundary

`lib/utils.js` holds the escaping and sanitisation functions. If you change any
of them:

1. Explain in the pull request why the new behaviour cannot escape its output
   context (HTML text, quoted attribute, `<style>` block, or compiled script).
2. Add a property to `test/test-fuzz.js` covering the invariant.
3. Expect close review. "It looks fine" is not sufficient for this file.

## Documentation

`test/test-readme-examples.js` parses every JavaScript block in `README.md` and
`docs/index.html`, executes the two quick-start programs, and checks that local
links resolve. If you add an example, it has to actually run.

Note that the test selects the two executable quick-start blocks **by position**,
so inserting a new `javascript` block before them will break it. Add examples
after those blocks, or update the test.

## Pull requests

- One logical change per pull request.
- Describe what changed and why, list what you tested, and call out anything you
  did not test.
- Note any behaviour change a user could notice, however small.
- Do not bump the version or edit `CHANGELOG.md` under a released heading;
  maintainers handle releases. Add notes under `## [Unreleased]` if you like.

## Releasing (maintainers)

1. Move `## [Unreleased]` notes into a new version heading in `CHANGELOG.md`.
2. Bump `version` in `package.json`.
3. Commit, then tag: `git tag v1.3.0 && git push origin main --tags`.
4. The `release` workflow runs the full suite, publishes to npm with provenance,
   and creates the GitHub Release from the changelog section.

The workflow needs an `NPM_TOKEN` repository secret with publish rights.
