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

### Added

- **A 21-section tutorial in the guide.** A step-by-step walkthrough of the whole
  API — elements and tag shortcuts, attributes, scoped CSS, layout, forms,
  tables, the head, tree operations, state and every binding kind, events,
  lifecycle, reactive lists, views and routing, components, serving, validation,
  security, and the mistakes that catch people out. It sits in
  `docs/index.html` alongside the reference, so it shares the site's navigation
  and search. Every code block in it is executed by the test suite, and the
  behavioural claims in the prose are asserted, so the documentation cannot
  drift from the library.

## [2.0.1] - 2026-08-17

> **Security release.** A `javascript:` URL could bypass URL sanitization when
> its scheme was split by a tab, newline, or carriage return. Upgrade if you
> render URLs from untrusted input. No API changed; 2.0.0 code runs unmodified.

### Security

- **`javascript:` URLs could bypass `sanitizeUrl()` when the scheme was split by
  a tab, newline, or carriage return.** The sanitizer stripped control characters
  before checking the protocol, but its strip range excluded `\x09`, `\x0A` and
  `\x0D` — exactly the three characters the URL parser removes from an attribute
  value. `href="java<TAB>script:alert(1)"` therefore passed the check and was
  reassembled by the browser into a working `javascript:` URL. The strip now
  covers the whole C0 range, so the protocol check sees what the browser will
  see. Affected `href`, `src`, `action`, `formaction`, `cite`, `poster` and
  `xlink:href` on all releases up to and including 2.0.0; `vbscript:` and
  `data:text/html` could be split the same way. A literal space is still
  preserved. **Upgrade if you render URLs from untrusted input.**

### Fixed

- **`wrap()` did nothing on a top-level element**, returning it unwrapped. It now
  wraps in place, keeping the element's position among its siblings, and returns
  a wrapper that accepts further configuration and children as it always did for
  nested elements. With this, every tree operation — `wrap()`, `before()`,
  `after()`, `remove()` — behaves the same whether the element sits at the top
  level or inside another element.
- **`before()` and `after()` did nothing on a top-level element**, for the same
  reason as `remove()` below: they resolved siblings only through a parent
  element, which a document-level element does not have. Both now fall back to
  the document body, insert at the correct position, and still escape a string
  sibling. Nested elements were never affected.
- **`remove()` did nothing on a top-level element.** Elements created directly on
  the document (`doc.div()`, `doc.create('div')`) are appended to the document
  body without a parent element, so `remove()` hit its no-parent guard and
  returned silently — no removal, no error, no way for the caller to tell. It now
  falls back to removing the element from the document body. Elements nested
  inside another element were never affected. Calling `remove()` twice remains
  harmless, and it still returns the element for chaining.
- **Documentation: the `toggleClass` and `classIf` argument order was listed
  backwards** in the guide's quick-reference table. Both take the condition
  first — `toggleClass(true, 'active')` — and following the documented order
  applied no class at all. The implementation and TypeScript declarations were
  always correct; only the guide was wrong.
- **`dataTable()` mishandled a non-array `headers` value.** Only truthiness was
  checked, so the value reached the row loop intact: a number, object, or
  boolean threw `TypeError: keys is not iterable`, and — worse — a string spread
  into one column per character, emitting a silently wrong table rather than
  failing. Only an array names columns now; anything else is ignored, and
  `autoHeaders` still applies.

- **TypeScript: `dataTable()` rejected object rows.** `rows` was declared
  `any[][]`, so the object-row form — the one the README documents with
  `autoHeaders` — failed to compile with "Object literal may only specify known
  properties", despite working at runtime since the helper was added. It now
  takes `Array<any[] | Record<string, any>>`, covering both documented shapes.
  Runtime behaviour is unchanged; this is a declaration-only fix.

### Changed

- Benchmarks re-measured against 2.0.0 and the methodology recorded (version,
  command, Node build, hardware, sampling, comparison library versions). The
  published figures previously came from 1.2.5 on different hardware.
- Documentation now states that 2.0.0 was published without a provenance
  attestation, rather than claiming provenance for every release from 1.2.5 on.

## [2.0.0] - 2026-08-17

> **The form and layout helpers no longer add anything you did not pass.**
> If you style `.form-group` or rely on the built-in `gap`, container width, or
> divider colour, your pages will lose that styling on upgrade. See the
> migration notes below. Pin to `1.2.5` if you are not ready to move.

### Breaking changes

- **Form helpers no longer inject class names.** `formGroup()`, `field()`,
  `checkbox()`, and `radio()` added `form-group`, `form-check`,
  `form-radio-group`, and `form-radio` to their wrappers. A rendering library
  should not put selectors in the output the caller never asked for — they
  collide with existing stylesheets and are invisible at the call site. Pass
  `groupClass` to `field()`, or call `addClass()` on the returned element.
- **Layout helpers no longer inject design values.** `grid()`, `flex()`,
  `stack()`, `row()`, and `columns()` no longer default `gap` to `16px`;
  `flex()` no longer emits `flex-direction: row`; `container()` no longer
  defaults to `max-width: 1200px` with `padding: 0 20px`, and no longer centres
  itself with `margin: 0 auto`; `spacer()` no longer defaults to
  `height: 16px`; `divider()` no longer emits a `#e0e0e0` border with `16px 0`
  margin, so a divider given only a `margin` now shows the browser's default
  `<hr>` border. Each helper still emits the display mode it is named for
  (`display: grid`, `display: flex`, `center`'s centring), because that is what
  you asked for by calling it, plus whatever you pass. Supply spacing, sizing,
  and colour yourself with `css()`.
- **`type="text"` is no longer emitted when no type is given.** Applies to
  `input()`, `formGroup()`, and `field()`. A bare `<input>` is already text by
  browser default, so the rendered result is unchanged; only the markup differs.
- **`img()` no longer emits `alt=""` when no alt is given.** An empty `alt` means
  "decorative", which is a claim about the image the caller never made. Pass
  `alt` explicitly — including `''` when the image really is decorative.

Generated IDs are unaffected: `formGroup()`, `field()`, `checkbox()`, and
`radio()` still generate the ID that pairs each `<label for>` with its input,
because the markup cannot express that association without one. The atomic class
names produced by `css()` are also unaffected — they carry styles you requested.

### Fixed

- `select()`, `radio()`, and `dataTable()` no longer throw on a `null` entry
  *inside* the collection they are given. 1.2.5 guarded the collection itself,
  but `typeof null === 'object'`, so a null option or row still reached the
  property reads and threw "Cannot read properties of null". Nullish options are
  now skipped, and a null row renders an empty `<tr>` — which is what an
  `undefined` row already did. `grid()`, `flex()`, and `list()` were already
  tolerant and are unchanged.

### Migration

- Add `groupClass: 'form-group'` to `field()` calls whose wrappers you style, or
  switch those rules to your own class via `addClass()` on the returned `group`.
- Pass the spacing you were relying on: `grid(2, items, '16px')`,
  `spacer('16px')`, `divider({ color: '#e0e0e0', margin: '16px 0' })`. For a
  centred container, `container(fn, '1200px').css({ margin: '0 auto', padding: '0 20px' })`.
- `formGroup()` and `checkbox()` return the wrapper element, and `field()`
  returns `{ group, label, input }`, so any of these can be styled at the call
  site without a class.

## [1.2.5] - 2026-08-05

> **Read the breaking changes below before upgrading.** This is numbered as a
> patch, so `^1.2.4` and `~1.2.4` will pick it up automatically, but the
> supported Node range narrowed and two call patterns that used to work now
> fail. Pin to `1.2.4` if you are on Node 16 or 17, or if you import from
> `lib/` directly.

### Breaking changes

- **Node.js 18 is now the minimum** (was 16). Node 16 reached end-of-life in
  September 2023. CI runs 18, 20, 22, and 24, so the declared floor is the
  lowest version actually tested.
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

[Unreleased]: https://github.com/0trebor0/buildhtml/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/0trebor0/buildhtml/compare/v1.2.5...v2.0.0
[1.2.5]: https://github.com/0trebor0/buildhtml/releases/tag/v1.2.5
