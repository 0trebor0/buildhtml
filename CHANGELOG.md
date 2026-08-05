# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases from 1.2.5 onward are tagged `v<version>` and published to npm with
[provenance](https://docs.npmjs.com/generating-provenance-statements) from the
`release` workflow. Versions before 1.2.5 were published without tags or release
notes; entries for them are reconstructed from git history and are summaries
rather than complete records.

## [Unreleased]

## [1.2.5] - 2026-08-05

> **Read the breaking changes below before upgrading.** This is numbered as a
> patch, so `^1.2.4` and `~1.2.4` will pick it up automatically, but the
> supported Node range narrowed and two call patterns that used to work now
> fail. Pin to `1.2.4` if you are on Node 16, or if you import from `lib/`
> directly.

### Breaking changes

- **Node.js 17 is now the minimum** (was 16). Node 16 reached end-of-life in
  September 2023. The shipped code uses no API newer than Node 17, and CI runs
  18, 20, 22, and 24.
- **Deep imports into `lib/` no longer resolve.** The new `exports` map limits
  the package to its root and six documented subpaths, so
  `require('@trebor/buildhtml/lib/pools')` now throws
  `ERR_PACKAGE_PATH_NOT_EXPORTED`. Use the root export or
  `@trebor/buildhtml/{template,middleware,components,live,config,metrics}`.
  These paths were never documented, but anyone reaching into `lib/` must move.
- **`find()`, `findAll()`, and `closest()` throw on an invalid tag** instead of
  returning `null`/`[]`. `find('SPAN')` could never match anything — tags are
  stored kebab-cased and `create('SPAN')` already threw — so the silent empty
  result hid the mistake. Both now fail the same way.
- **`Metrics.enabled` is read-only.** It derives from `CONFIG.enableMetrics`
  rather than snapshotting it, so assigning to it throws in strict mode. Use
  `configure({ enableMetrics })`.

### Added

- ESM entry point (`index.mjs`) exposing every named export. Node's static
  analysis of CommonJS fails on this package — the `get responseCache()` accessor
  makes the lexer emit a bogus `get` binding and drop everything declared after
  it, so `import { metrics } from '@trebor/buildhtml'` did not work before.
- Subpath exports for `./template`, `./middleware`, `./components`, `./live`,
  `./config`, and `./metrics`, each with its own type declarations, so callers can
  import one area instead of the whole surface.
- `exports` map, `module` field, and `type: "commonjs"` in `package.json`.
- Property-based fuzz tests (`npm test` includes `test-fuzz.js`) covering HTML
  escaping, attribute rendering, URL and CSS sanitisation, JS string embedding,
  JSON embedding, attribute-key and tag-name validation, and the minifier. The
  generator is a seeded PRNG; replay a failure with `BUILDHTML_FUZZ_SEED=<n>`.
- `npm run benchmark:size` reports the client JavaScript each reactive facility
  compiles into a page. Results are published in the README.
- Published benchmark results in the README, with the measurement environment.
- `CONTRIBUTING.md`, `SECURITY.md`, issue and pull request templates.
- Release workflow publishing tagged GitHub Releases and npm packages with
  provenance.

### Changed

- **`renderStream()` now streams.** It previously rendered the entire document
  synchronously into the stream's buffer before returning, so the whole page was
  built before the caller could pipe it and the documented "sends `<head>`
  immediately" behaviour never happened. Rendering is now driven by `_read()`, so
  work happens on demand and a slow consumer applies backpressure instead of
  forcing the whole page into memory.
- CSS values keep quotes. `content: "x"` and `font-family: "Fira Code"` were
  silently corrupted into invalid CSS. Quotes cannot escape a `<style>` block
  (`<` is still stripped) or a style attribute (escaped at render).
- `configure()` rejects a `mode` other than `"dev"` or `"prod"`, and rejects
  numeric options that are not finite and `>= 0`.
- A `LRUCache` limit of `0` now caches nothing instead of one entry.
- Prod minification collapses whitespace between tags to a single space instead
  of deleting it.
- `toJSON()` emits the unescaped title.

### Fixed

- **Pool aliasing corrupted later renders.** An element reachable from two
  parents was recycled once per path, so one object entered the element pool
  twice and was later handed to two live call sites, silently serving wrong
  content on a subsequent request.
- **`NaN`/`Infinity` in numeric config uncapped memory.** Both are `typeof
  "number"`, and every size guard is a `>=` comparison that is false against
  `NaN`, so the element pool and response cache grew without bound.
- `clone()` kept the source element's id on events and bindings, leaving clones
  inert and stacking duplicate listeners on the original.
- `toJSON()` → `fromJSON()` escaped the title again on every round trip.
- `clear()` reset the CSS-variable rule index but left the rule in the head, so a
  second render appended a duplicate `:root` block.
- `metrics.enabled` snapshotted `CONFIG.enableMetrics` at require time, so
  `configure({ enableMetrics: true })` could never turn metrics on.
- `attr('onClick', …)` was rewritten to `on-click` and slipped past the inline
  event-handler guard.
- `renderStream()` did not record `output()`, so `save()` after streaming wrote a
  nearly empty page.
- **A failed cached render was briefly reusable.** `createCachedRenderer` removed
  the in-flight entry from a deferred `.finally()`, so a request arriving between
  the rejection and that microtask awaited the same rejected promise: the builder
  did not re-run and no HTML was served. The entry is now evicted before the
  failing request returns.
- **`toJSON()` and `fromJSON()` were asymmetric.** Nine of thirteen document
  fields were lost on a round trip — `lang`, `charset`, every meta tag, inline
  styles, global styles, shared classes, body classes, body attributes, and
  `oncreate` callbacks. `toJSON()` emitted `metas`, `globalStyles` and
  `classStyles` in shapes `fromJSON()` did not read, and never emitted the
  `<html>`/`<body>` attributes at all. Both sides now agree, and callback sources
  restored from JSON are re-validated rather than trusted.

### Diagnostics

Input that was previously ignored in silence now reports itself in development:

- Malformed `.bhtml` templates: unclosed `(`, invalid `?each`, unknown `?`
  directive, and `:global`/`:class` without braces.
- `validate()` called after `render()` reports `W_VALIDATE_AFTER_RENDER` rather
  than inspecting an empty body and passing.
- `renderFragment()` warns that events, state, and lifecycle hooks are not
  included in the returned fragment.
- `renderStream()` warns when a `cacheKey` is set, which streaming cannot honour.

## [1.2.4] - earlier

Documentation updates.

## [1.2.3] - earlier

Validation, developer experience, documentation, and example improvements.

## [1.2.0] - [1.2.2] - earlier

Library-wide function audit and follow-up fixes.

## [1.1.0] - [1.1.2] - earlier

Client runtime security fixes and the fetch example.

## [1.0.0] - [1.0.7] - earlier

Initial public releases.

[Unreleased]: https://github.com/0trebor0/buildhtml/compare/v1.2.5...HEAD
[1.2.5]: https://github.com/0trebor0/buildhtml/releases/tag/v1.2.5
