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

## What to work on next

### Step 1 — Publish 1.1.0

Run `npm publish --access public`. All bugs are fixed, all items complete.

---

### Step 2 — Fill test coverage gaps ✅ COMPLETE

All coverage gaps have been filled:

- **`test/test-stream.js`** (16 tests) — renderStream matches render(), head content, nonce, scoped CSS, liveList, clear() called after stream
- **`test/test-json.js`** (38 tests) — full toJSON/fromJSON round-trip: text nodes, nested elements, classes, scoped CSS, events, state bindings, attrs, multi-root, structure, idempotent double round-trip. Also fixed `toJSON()` to serialize `_classes`; fixed `buildNode()` to handle `classes`, `cssText`, pre-serialized `events`, `stateBindings`, and `computed` from toJSON format; fixed `fromJSON()` to handle `globalState` key.
- **`slot()`/`fillSlot()`/`portal()`** added to `test/test.js` — data-slot attribute, slot content injection, unknown slot no-op, default slot, portal _portalTarget, portal server-side render in place
- **`bindState()` tests** added to `test/test-bindings.js` — `__STATE_ID__` replacement, auto-generated ids, correct event type, target id in compiled output
- **`test/test-middleware.js`** (23 tests) — no-cache-key path, cache miss/hit, concurrent coalescing, error propagation to next(err), non-Document 500, nonce injection, clearCache(), getCacheStats()

---

### Step 3 — Known edge cases to watch

These are not confirmed bugs but are worth verifying manually or with tests:

**F. `addScript()` only accepts a src string — TypeScript types say `ScriptAttrs`**
- `head.addScript(s)` stores only a plain string (the src URL)
- `typescript/index.d.ts` declares it as `addScript(attrs: ScriptAttrs): Document`
- Scripts with `defer`, `async`, or `type="module"` cannot be added via this API
- Fix: either update the TypeScript type to `string`, or update `head.addScript` to accept an attrs object

**G. `clear()` does not reset head content**
- `clear()` resets body, stateStore, inlineScripts, oncreateCallbacks, mkElDefined, cssVarsRuleIdx
- It does NOT reset `head.globalStyles`, `head.styles`, `head.metas`, `head.links`, etc.
- This is intentional (head is shared/static), but if a document is truly reused for different pages this could leak head content
- Decision: document this explicitly or add a `clearAll()` that resets head too

---

## Security model (already implemented)

- `escapeHtml()` — applied to all text content and attribute values
- `sanitizeCssValue()` — strips `;`, `<`, `>`, `"`, `'`, `{}`, `expression()`, `url(javascript:)`, `url(vbscript:)`, `url(data:)`
- `isValidAttrKey()` — blocks `on*` inline event attributes (`onclick`, `onmouseover`, etc.)
- `sanitizeUrl()` — applied to `href`, `src`, `action`, `formaction`, `cite`, `poster` — blocks `javascript:`, `vbscript:`, `data:` URLs
- `sanitizeFunctionSource()` — validates function source at registration time, stores source string (not function reference)
- `escapeJsString()` — used when embedding string values into compiled JS
- `setAttrs()` — blocks `__proto__`, `constructor`, `prototype` keys (prototype pollution prevention)
- nonce — applied to inline `<script>` and `<style>` tags only; never to external `<script src>` tags

## Design rules to follow

- **Never write new `inlineScript()` calls** in user-facing examples or tests — everything must be expressible via API
- **No new global mutable state** — the component registry is already a necessary singleton; don't add more
- **Store function source at validation time** — never call `fn.toString()` at render time; always store the string returned by `sanitizeFunctionSource()`
- **All event methods follow the same pattern**: sanitize → store source string → push to events/bindings array
- **CSS via `.css()`** generates scoped classes (hashed). Use `.style()` for inline styles. Never mix them for the same element.
- **`nodeDefToHtml`** is for liveList SSR only — it outputs inline styles matching `_mkEl`, keeping SSR and client renders identical
- **Pool reset happens at dequeue time** (`resetElement()` in `getPooled()`), not at enqueue time (`recycle()`)
- **`clear()` is per-render** — resets body, scripts, state. Head is NOT cleared (intentional). Use a new Document for a completely fresh page.

## Running tests

```bash
node test/test.js          # 99 core + regression + slot/portal + security tests
node test/test-bindings.js # 58 bind method + liveList + bindState tests
node test/test-stream.js   # 16 renderStream tests
node test/test-json.js     # 38 toJSON/fromJSON round-trip tests
node test/test-middleware.js # 23 middleware/cache tests
node test/test-spa.js      # SPA compilation smoke test
node test/test-template.js # .bhtml template tests
node test/test-new-apis.js # API v1 tests
node test/test-apis-v2.js  # API v2 tests
```

**Total: 579 tests, 0 failing**

---

## Complete bug fix history

| Bug | Fix |
|-----|-----|
| `oncreate()` fn.toString() override at render time | Store source string at registration time |
| `on()`, `computed()`, `bindState()` same issue | Same fix — all store source strings now |
| `clone()` lost `events`, `_stateBindings`, `_computed` | `clone()` now shallow-copies all three |
| `setAttrs()` prototype pollution via `__proto__` | Skip `__proto__`/`constructor`/`prototype` keys |
| `toJSON()` double-called `.toString()` on strings | Removed redundant `.toString()` calls |
| `clear()` left stale `_cssVarsRuleIdx` | Reset to `undefined` in `clear()` |
| `clear()` left stale `_inlineScripts`, `_mkElDefined`, `_oncreateCallbacks` | All zeroed/reset in `clear()` |
| `toJSON/fromJSON` silently dropped text nodes | `buildNode()` now handles `{ type: 'text', content }` |
| nonce on external `<script src>` tags | Nonce removed from external scripts in `head.js` |
| `renderStream()` head render outside try/catch | Moved inside try block |
| `_mkEl` TypeError on string children | Added `typeof d==="string"` → `createTextNode(d)` guard |
| `_mkEl` silently dropped `html` key | Added `if(d.html!=null)e.innerHTML=d.html` |
| `builder.js` missing `bindShow/Class/Attr/Style/Prop` dispatch | Added `type` field + array support to `def.bind` |
| `builder.js` missing `liveList` node | Added `if (def.liveList)` handler |
| liveList `if` key not supported in SSR | `nodeDefToHtml` now checks `'if' in def` |
| CSS hash collision not detected in dev mode | `_cssRegistry` Map on Document, checked in `element.css()` |
| `configure()` accepted wrong types silently | Type validation added |
| `renderStream()` no error handling | try/catch/finally added |
| `toJSON()` didn't serialize `_classes` | Added `classes: el._classes` to serialized node |
| `buildNode()` ignored `cssText`, `events`, `stateBindings`, `computed` from toJSON | All handled — enables full round-trip |
| `fromJSON()` ignored `globalState` key from toJSON format | Added `def.globalState` handler alongside `def.state` |
| `sanitizeUrl` returned original `value` with control chars instead of cleaned `s` | Return `s` (stripped) not `value` (original) |
| `hashRouter` used `'State.' + stateKey` string concat — JS injection if stateKey has dots/semicolons | Changed to `State[JSON.stringify(stateKey)]` |
| `nodeDefToHtml` didn't call `isValidAttrKey` — allowed `onclick` in liveList SSR output | Added `isValidAttrKey` guard in attrs loop |
| `nodeDefToHtml` and `_mkEl` missing `aria` key | Added aria handling to both SSR and client |
| `live.js` called `itemFn.toString()` twice — once in sanitizeFunctionSource, once in script emit | Stored sanitized source string; use it in script emit |
