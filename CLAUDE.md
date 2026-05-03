# buildhtml — Claude Context

## What this project is

Zero-dependency Node.js **server-side HTML compiler**. Developers write server-side API calls; the library compiles them into a complete HTML page including a compiled `<script>` that wires up all reactivity on the client. No raw client JS is ever written manually.

**Critical design rule**: Every interactive behavior (events, reactive state, routing) must be expressible through the server API and compiled automatically. If a developer has to write `inlineScript()` to make something work, that is a missing feature.

---

## Current version: 1.1.0

**Has NOT been published to npm yet.** Run `npm publish --access public` when ready.

---

## Architecture

```
Developer server-side code
        ↓
  Document / Element API  (lib/document.js, lib/element.js)
        ↓
  renderNode() collects events, bindings, state  (lib/renderer.js)
        ↓
  compileClient() emits one <script> IIFE  (lib/renderer.js)
        ↓
  Browser: window.State Proxy + watchState() + addEventListener
```

### Script execution order (end of `<body>`)
1. **Script 1** — `compileClient()` output: State Proxy, `watchState`, `initBindings`, `initEvents`, `initStates`, `initComputed`, `initOncreate`
2. **Script 2+** — `_inlineScripts` (in order added): `_mkEl` runtime, `liveList` reactive loop, `hashRouter`

All scripts run synchronously at end of body (`readyState === 'interactive'`), so Script 2+ can safely call `watchState` defined in Script 1.

---

## Key files

| File | Purpose |
|------|---------|
| `lib/document.js` | `Document` class — root of every page |
| `lib/element.js` | `Element` class — all DOM building, CSS, events, bindings |
| `lib/renderer.js` | `renderNode()` + `compileClient()` — the core compiler |
| `lib/live.js` | `compileLiveList`, `compileHashRouter`, `_mkEl` client runtime |
| `lib/builder.js` | Declarative object-tree builder (`doc.build({...})`) |
| `lib/head.js` | `Head` class — manages `<head>` content |
| `lib/pools.js` | Object pool for Elements and Arrays — reset in `resetElement()` |
| `lib/utils.js` | `escapeHtml`, `sanitizeCssValue`, `sanitizeUrl`, `isValidAttrKey`, `sanitizeFunctionSource`, `escapeJsString` |
| `lib/template.js` | `.bhtml` indentation-based template language |
| `lib/components.js` | Global component registry singleton |

---

## Things to fix next

### HIGH — Fix immediately

**1. `oncreate()` has the same `fn.toString()` vulnerability as `on()` did**
- File: `lib/document.js` line ~232, `lib/renderer.js` line ~157
- Problem: `oncreate(fn)` stores the function reference. In `renderer.js`, `sanitizeFunctionSource(fn, ...)` is called at **render time**, so an overridden `fn.toString` after registration works.
- Fix: In `document.js oncreate()`, call `sanitizeFunctionSource(fn)` immediately and store the **source string**, not the function. In `renderer.js initOncreate`, use the stored string directly without re-sanitizing.
- Pattern: Same fix already applied to `on()` and `computed()` — store source at validation time.

**2. `builder.js` missing new bind methods**
- File: `lib/builder.js` line 125
- Problem: `def.bind` only supports `{ key, fn }` which maps to `el.bind()` (text content only). The declarative builder has no support for `bindShow`, `bindClass`, `bindAttr`, `bindStyle`, `bindProp`.
- Fix: Extend the `def.bind` node to support a `type` field:
  ```js
  // Current
  { bind: { key: 'count', fn: val => String(val) } }
  // Needed
  { bind: { key: 'open', type: 'show' } }
  { bind: { key: 'theme', type: 'class', fn: val => val + '-mode' } }
  { bind: { key: 'active', type: 'attr', attr: 'disabled', fn: val => val ? null : 'disabled' } }
  { bind: { key: 'progress', type: 'style', fn: val => ({ width: val + '%' }) } }
  { bind: { key: 'val', type: 'prop', prop: 'value' } }
  ```
  Or support an array: `bind: [{ key: 'open', type: 'show' }, { key: 'theme', type: 'class', fn: ... }]`
- Also update TypeScript `BuilderNode` type in `typescript/index.d.ts`.

**3. `builder.js` missing `liveList` support**
- File: `lib/builder.js`
- Problem: No way to declare a `liveList` in the declarative builder.
- Fix: Add a `liveList` key to node defs:
  ```js
  { liveList: { stateKey: 'tasks', itemFn: (task) => ({ tag: 'div', text: task.title }), filter: ..., filterKeys: [...] } }
  ```

---

### MEDIUM — Fix soon

**4. Add test coverage for new bind methods**
- File: `test/test.js` or new `test/test-bindings.js`
- Problem: `bindShow`, `bindClass`, `bindAttr`, `bindStyle`, `bindProp` have no automated tests. Manual checks were done but not committed as tests.
- Fix: Add test cases for each bind type that verify the compiled output contains the correct update expression.

**5. `liveList` dev-mode warning for missing stateKey**
- File: `lib/live.js` line ~128
- Problem: If `stateKey` is not in `doc._globalState`, liveList silently renders nothing and emits a `watchState` subscription for a key that will never fire. Hard to debug.
- Fix: Add a dev-mode warning:
  ```js
  if (CONFIG.mode === 'dev' && !(stateKey in doc._globalState)) {
    console.warn(`[liveList] stateKey "${stateKey}" not found in doc.states(). Did you forget to call doc.states({ ${stateKey}: [] })?`);
  }
  ```

**6. `configure()` input validation**
- File: `lib/config.js`
- Problem: `configure({ mode: 123 })` silently sets `mode` to a number which could break string comparisons downstream.
- Fix: Validate known keys have the right type before applying.

**7. `renderStream()` error propagation**
- File: `lib/document.js` line ~538
- Problem: If `renderNode()` throws during stream generation, the error is uncaught and the stream is left in an incomplete state (no `null` push, no cleanup).
- Fix: Wrap the body render loop in try/catch, push an error or destroy the stream, and ensure cleanup still runs.

---

### LOW — Nice to have

**8. Two-way input binding shorthand**
- Currently requires two separate calls:
  ```js
  input.onChange(function() { State.val = this.value; });
  input.bindProp('val', 'value');
  ```
- A `bindInput(stateKey)` shorthand could compile both at once.

**9. `each` / `when` in `liveList` itemFn**
- `itemFn` returns a NodeDef plain object. Complex item structures with conditionals require manual `if/else` in the function. A `when` or `if` key in NodeDef children inside `itemFn` would help.

**10. CSS hash collision detection in dev mode**
- FNV-1a 32-bit has a small but non-zero collision probability with large CSS rule sets.
- In dev mode, log a warning if two different CSS strings hash to the same class name.

**11. TypeScript `BuilderNode` — add new fields**
- `typescript/index.d.ts` `BuilderNode` interface is missing: `bind` type variants, `liveList`, `bindShow`, `bindClass` etc. once builder.js is updated.

---

## Security model (already implemented)

- `escapeHtml()` — applied to all text content and attribute values
- `sanitizeCssValue()` — strips `;`, `<`, `>`, `"`, `'`, `{}`, `expression()`, `url(javascript:)`, `url(vbscript:)`, `url(data:)`
- `isValidAttrKey()` — blocks `on*` inline event attributes (`onclick`, `onmouseover`, etc.)
- `sanitizeUrl()` — applied to `href`, `src`, `action`, `formaction`, `cite`, `poster` — blocks `javascript:`, `vbscript:`, `data:` URLs
- `sanitizeFunctionSource()` — validates function source at registration time, stores source string (not function reference)
- `escapeJsString()` — used when embedding string values into compiled JS

## Design rules to follow

- **Never write new `inlineScript()` calls** in user-facing examples or tests — everything must be expressible via API
- **No new global mutable state** — the component registry is already a necessary singleton; don't add more
- **Store function source at validation time** — never call `fn.toString()` at render time; always store the string returned by `sanitizeFunctionSource()`
- **All event methods follow the same pattern**: sanitize → store source string → push to events/bindings array
- **CSS via `.css()`** generates scoped classes (hashed). Use `.style()` for inline styles. Never mix them for the same element.
- **`nodeDefToHtml`** is for liveList SSR only — it outputs inline styles matching `_mkEl`, keeping SSR and client renders identical
- **Pool reset happens at dequeue time** (`resetElement()` in `getPooled()`), not at enqueue time (`recycle()`)

## Running tests

```bash
node test/test.js          # 61 core tests
node test/test-spa.js      # SPA compilation smoke test
node test/test-template.js # .bhtml template tests
node test/test-new-apis.js # API v1 tests
node test/test-apis-v2.js  # API v2 tests
```
