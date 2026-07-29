# @trebor/buildhtml

**Build secure, reactive HTML entirely in Node.js—without a frontend framework, bundler, or hydration step.**

`@trebor/buildhtml` is a zero-dependency server-side HTML compiler. Describe pages with JavaScript, render complete HTML on the server, and opt into browser behavior with declarative state, bindings, events, reactive lists, and routing.

[Complete guide and API reference](https://github.com/0trebor0/buildhtml/blob/main/docs/index.html) · [Examples](https://github.com/0trebor0/buildhtml/tree/main/example) · [Report an issue](https://github.com/0trebor0/buildhtml/issues)

```bash
npm install @trebor/buildhtml
```

```javascript
const { page } = require('@trebor/buildhtml');

const doc = page('Hello');
doc.h1('Hello world');
doc.p('Rendered safely on the server. No build step required.');

console.log(doc.render());
```

## Why buildhtml?

Use one JavaScript API for the page, styles, state, and browser interactions:

- **Server-rendered by default** — send complete HTML immediately or generate static files at startup.
- **Reactive when needed** — compile state bindings and events only for pages that use them.
- **No client framework** — no React, virtual DOM, hydration protocol, or application bundle.
- **Secure defaults** — escaped text and attributes, sanitized URLs, blocked inline `on*` attributes, and CSP nonce support.
- **Zero runtime dependencies** — a small supply chain and straightforward deployment.
- **Flexible output** — strings, streams, static files, Express responses, JSON-driven pages, or `.bhtml` templates.
- **SPA-capable** — reactive lists plus hash or History API routing for focused applications.

```text
Node.js API  →  complete HTML  →  optional compiled browser runtime
```

The browser receives only the behavior the page uses. A static page stays static. Adding `.states()`, `.bind()`, or `.onClick()` automatically adds the required client runtime.

## A reactive page without client framework code

```javascript
const { page } = require('@trebor/buildhtml');

const doc = page('Counter');
doc.states({ count: 0 });

doc.h1().bind('count', (count) => `Count: ${count}`);

doc.button('+1').onClick(function () {
  State.count++;
});

doc.button('Reset').onClick(function () {
  State.count = 0;
});

const html = doc.render();
```

The callbacks are written in the server file but compiled to browser JavaScript. Mutating `State.count` updates every binding watching `count`.

## Quick navigation

- [Create pages and elements](#create-pages-and-elements)
- [Serve HTML with Express](#serve-html-with-express)
- [Generate static files](#generate-static-files)
- [Reactive state and events](#reactive-state-and-events)
- [Client-side fetch](#client-side-fetch)
- [Components](#components)
- [Declarative builder and JSON](#declarative-builder-and-json)
- [Templates](#bhtml-templates)
- [Reactive lists](#reactive-lists)
- [SPA routing](#spa-routing)
- [Streaming and caching](#streaming-and-caching)
- [Security](#security)
- [API overview](#api-overview)
- [Full documentation](#full-documentation)

## Create pages and elements

Use `page()` for sensible defaults:

```javascript
const { page } = require('@trebor/buildhtml');

const doc = page('Dashboard', {
  lang: 'en',
  nonce: 'request-csp-nonce'
});

doc.header((header) => {
  header.h1('Dashboard');
  header.nav()
    .a('/', 'Home')
    .a('/reports', 'Reports');
});

doc.main((main) => {
  main.h2('Today');
  main.p('Everything here is escaped automatically.');
});

const html = doc.render();
```

Use `new Document()` when you want to configure the document manually:

```javascript
const { Document } = require('@trebor/buildhtml');

const doc = new Document();
doc.title('Custom setup').viewport().resetCss().lang('en');
```

### Document options

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `lang` | string | `'en'` | Root HTML language when using `page()` |
| `viewport` | boolean | `true` | Set false to omit the viewport meta added by `page()` |
| `resetCss` | boolean | `true` | Set false to omit the reset added by `page()` |
| `nonce` | string | none | CSP nonce for generated inline scripts and styles |
| `cache` | boolean | `false` | Enables document render caching |
| `cacheKey` | string | none | Required stable key when document caching is enabled |

### Familiar element API

```javascript
const card = doc.section()
  .id('welcome')
  .addClass('card', 'featured')
  .data('user-id', 42)
  .aria('label', 'Welcome card')
  .css({
    padding: '20px',
    borderRadius: '12px',
    backgroundColor: '#0f172a',
    color: '#f8fafc'
  });

card.h2('Welcome');
card.p('Compose elements using normal JavaScript.');
card.a('/start', 'Get started').addClass('button');
```

Shortcuts include semantic tags, headings, forms, tables, lists, media, and layout helpers. Most methods are chainable.

## Serve HTML with Express

```javascript
const express = require('express');
const { page } = require('@trebor/buildhtml');

const app = express();

app.get('/', (req, res) => {
  const doc = page('Home');
  doc.h1('Welcome');
  doc.p('Built for this request.');

  res.type('html').send(doc.render());
});

app.listen(3000);
```

You can also use Node's native HTTP server, Fastify, Hono, Bun, or any server that can send an HTML string.

## Generate static files

Build pages once during startup and serve them as normal static assets:

```javascript
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { page } = require('@trebor/buildhtml');

const publicDir = path.join(__dirname, 'public');
const doc = page('Home');

doc.h1('Generated at server startup');
doc.p('This file can be served without rendering it again.');

fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(path.join(publicDir, 'index.html'), doc.render());

const app = express();
app.use(express.static(publicDir));
app.listen(3000);
```

Generate once when every visitor receives the same page. Render per request when the result depends on authentication, locale, request data, or permissions.

## Reactive state and events

Define JSON-serializable state on the document:

```javascript
doc.states({
  name: '',
  open: false,
  progress: 25,
  user: { profile: { name: 'Grace' } },
  tasks: []
});
```

Bind elements to that state:

```javascript
doc.input('text').bindInput('name');
doc.p().bind('name', (name) => `Hello ${name || 'stranger'}`);

doc.button('Toggle').onClick(function () {
  State.open = !State.open;
});

doc.section('Visible panel').bindShow('open');
doc.div().bindStyle('progress', (value) => ({
  width: value + '%'
}));
```

Nested objects and arrays are reactive:

```javascript
doc.button('Update profile').onClick(function () {
  State.user.profile.name = 'Ada';
});

doc.button('Add task').onClick(function () {
  State.tasks.push({ title: 'Ship it', done: false });
});
```

### Binding parameters

| Method | Parameters | Result |
|--------|------------|--------|
| `bind(key, fn?)` | `(value, State)` callback | Updates text content |
| `bindShow(key, fn?)` | `(value, State)` callback | Shows or hides the element |
| `bindClass(key, fn)` | `(value, State)` callback | Sets a computed class |
| `bindAttr(key, name, fn)` | `(value, State)` callback | Sets or removes an attribute |
| `bindStyle(key, fn)` | `(value, State)` callback | Applies returned CSS rules |
| `bindProp(key, name, fn?)` | `(value, State)` callback | Assigns a DOM property |
| `bindInput(key)` | state key | Two-way input value binding |
| `on(event, fn)` | browser event callback | Adds an event listener |

Event shortcuts include `.onClick()`, `.onInput()`, `.onChange()`, `.onSubmit()`, `.onKeydown()`, and more.

### Element lifecycle

```javascript
doc.div('Tracked')
  .onMount(function (state) {
    const timer = setInterval(() => console.log(state.count), 1000);

    return function () {
      clearInterval(timer);
    };
  })
  .onUpdate('count', function (value, state) {
    console.log('Count changed:', value);
  })
  .onDestroy(function (state) {
    console.log('Element removed');
  });
```

- `onMount(fn)` runs when the rendered element is available and may return cleanup.
- `onUpdate(key, fn)` runs after the state key changes, not for its initial value.
- `onDestroy(fn)` runs when the element is removed.
- Mount cleanup functions run before destroy hooks.

## Client-side fetch

Use the browser's native `fetch()` inside an event handler:

```javascript
doc.states({
  loading: false,
  message: 'Ready',
  error: ''
});

doc.p('Loading…').bindShow('loading');
doc.p().bind('message');
doc.p().bind('error');

doc.button('Load data').onClick(async function () {
  State.loading = true;
  State.error = '';

  try {
    const response = await fetch('/api/data');
    if (!response.ok) throw new Error('HTTP ' + response.status);

    const data = await response.json();
    State.message = data.message;
  } catch (error) {
    State.error = error.message;
  } finally {
    State.loading = false;
  }
});
```

Fetch automatically when the page loads:

```javascript
doc.oncreate(async function () {
  const response = await fetch('/api/data');
  if (!response.ok) throw new Error('HTTP ' + response.status);

  State.message = (await response.json()).message;
});
```

Serialized browser callbacks cannot capture server variables. Use literal values, `State`, browser APIs, or `data-*` attributes for browser-time configuration.

## Components

Register reusable server-side components:

```javascript
const { components } = require('@trebor/buildhtml');

components.register('Card', (el, props) => {
  el.addClass('card');
  el.h2(props.title);
  el.p(props.body);
}, {
  tag: 'article'
});

doc.component('Card', {
  title: 'Reusable UI',
  body: 'Components produce ordinary server-rendered elements.'
});
```

Use an inline component when global registration is unnecessary:

```javascript
function Badge(el, props) {
  el.addClass('badge').text(props.label);
}

doc.use(Badge, { label: 'New' });
```

Components can be nested and extended. They run on the server and do not create a client component runtime.

## Declarative builder and JSON

Build pages from plain objects:

```javascript
doc.build({
  tag: 'main',
  class: 'container',
  children: [
    { tag: 'h1', text: 'Object-driven UI' },
    {
      tag: 'section',
      css: { padding: '16px', border: '1px solid #ddd' },
      children: [
        { tag: 'p', text: 'Useful for configuration and generated pages.' }
      ]
    }
  ]
});
```

Conditional and repeated nodes are supported:

```javascript
doc.build({
  tag: 'ul',
  children: [
    { tag: 'li', text: 'Admin', if: user.isAdmin },
    {
      each: users,
      itemTemplate: (user) => ({ tag: 'li', text: user.name })
    }
  ]
});
```

Render a complete JSON page directly:

```javascript
const { renderJSON } = require('@trebor/buildhtml');

const html = renderJSON({
  title: 'Report',
  resetCss: true,
  cssVars: { primary: '#2563eb' },
  body: {
    tag: 'h1',
    text: 'Generated from JSON'
  }
});
```

Use `doc.toJSON()` and `doc.fromJSON()` for document serialization and restoration.

## `.bhtml` templates

For teams that prefer an indentation-based template syntax:

```text
---
title "Dashboard"
viewport
---

:reset
div#app.container
  h1 "Welcome #{user.name}"

  ?if user.isAdmin
    button "Admin"

  ul
    ?each item in items
      li "#{item}"
```

```javascript
const {
  renderTemplate,
  compileTemplate,
  renderFile,
  compileFile,
  templateEngine
} = require('@trebor/buildhtml');

const html = renderTemplate(source, {
  user: { name: 'Alice', isAdmin: true },
  items: ['A', 'B', 'C']
});
```

| Function | Returns |
|----------|---------|
| `compileTemplate(source, variables?)` | `Document` |
| `renderTemplate(source, variables?)` | HTML string |
| `compileFile(path, variables?)` | `Document` |
| `renderFile(path, variables?)` | HTML string |
| `templateEngine(path, options, callback)` | Express view-engine result |

The direct file helpers are synchronous.

## Reactive lists

`liveList()` server-renders an array and updates it in the browser when watched state changes:

```javascript
doc.states({
  tasks: [
    { id: 1, title: 'Build page', done: false }
  ],
  view: 'all'
});

const list = doc.liveList('tasks', function (task) {
  return {
    tag: 'li',
    children: [
      { tag: 'span', text: task.title },
      { tag: 'em', text: 'done', if: task.done }
    ]
  };
}, {
  filter: function (task, state) {
    if (state.view === 'active') return !task.done;
    if (state.view === 'done') return task.done;
    return true;
  },
  filterKeys: ['view']
});

list.addClass('task-list');
```

### `liveList()` parameters

| Parameter | Type | Purpose |
|-----------|------|---------|
| `stateKey` | string | State array to render and watch |
| `itemFn` | `(item, index) => NodeDef` | Produces each item on the server and browser |
| `options.filter` | `(item, State) => boolean` | Optional browser-side filter |
| `options.filterKeys` | string[] | Extra state keys that trigger rendering |

The method returns the list container `Element`.

## SPA routing

### Hash routing

Hash routing works on static hosting without server fallback configuration:

```javascript
doc.states({ view: 'home', routeParams: {} });

doc.hashRouter({
  stateKey: 'view',
  default: 'home',
  routes: {
    home: 'home',
    'users/:id': 'user',
    '*': 'not-found'
  },
  navSelector: 'nav a',
  activeStyle: { color: '#2563eb', fontWeight: '700' },
  inactiveStyle: { color: '#64748b' }
});
```

`#users/42` sets:

```javascript
State.view = 'user';
State.routeParams = { id: '42' };
```

### History routing

Use clean URLs and opt links into client navigation with `data-route`:

```javascript
doc.nav()
  .a('/app/', 'Home').attr('data-route', '')
  .a('/app/users/42', 'User').attr('data-route', '');

doc.historyRouter({
  base: '/app',
  stateKey: 'view',
  routes: {
    '/': 'home',
    '/users/:id': 'user',
    '*': 'not-found'
  }
});
```

The History router handles same-origin opted-in links, `pushState()`, route parameters, and back/forward navigation.

Clean URLs require the server to return the same application HTML for direct application-route requests:

```javascript
app.use(express.static('public'));
app.use('/api', apiRouter);

app.use('/app', (req, res, next) => {
  if (req.method !== 'GET' || !req.accepts('html')) return next();
  res.type('html').send(appHtml);
});
```

Register the fallback after static files and API routes.

### Router options

| Option | Hash default | History default | Purpose |
|--------|--------------|-----------------|---------|
| `stateKey` | `'view'` | `'view'` | Receives the matched route value |
| `default` | `'all'` | `'/'` | Used when the hash/path is empty |
| `routes` | none | none | Pattern-to-state map with `:params` and `*` |
| `paramsKey` | `'routeParams'` | `'routeParams'` | Receives decoded parameters |
| `notFound` | `'not-found'` | `'not-found'` | Used when no route matches |
| `navSelector` | none | none | Links receiving active/inactive styles |
| `activeStyle` | none | none | CSS rules for active navigation |
| `inactiveStyle` | none | none | CSS rules for inactive navigation |
| `base` | n/a | `'/'` | Prefix removed before route matching |
| `linkSelector` | n/a | `'a[data-route]'` | Links opted into History navigation |

## Streaming and caching

### Stream a document

`renderStream()` flushes the head before the body and produces the same final markup as `render()`:

```javascript
app.get('/', (req, res) => {
  const doc = buildPage();
  res.type('html');
  doc.renderStream().pipe(res);
});
```

### Cache Express responses

```javascript
const { createCachedRenderer } = require('@trebor/buildhtml');

app.get('/about', createCachedRenderer(
  async (req) => {
    const doc = page('About');
    doc.p('This rendered response is cached.');
    return doc;
  },
  'about-page'
));
```

Use a function for personalized cache keys:

```javascript
app.get('/dashboard', createCachedRenderer(
  (req) => buildDashboard(req.user),
  (req) => `dashboard:${req.user.id}`
));
```

| Parameter | Type | Purpose |
|-----------|------|---------|
| `builderFn` | `(req) => Document \| Promise<Document>` | Builds on a cache miss |
| `cacheKeyOrFn` | string or `(req) => string` | Selects the cache entry; empty skips caching |
| `options.nonce` | `(req) => string` | Supplies a per-build CSP nonce |

Concurrent misses for the same key share one build. Include every value that changes the response in the cache key—especially identity, permissions, and locale.

Cache helpers include `clearCache(pattern?)`, `getCacheStats()`, `healthCheck()`, and `resetPools()`.

## Styling

Use scoped element styles:

```javascript
doc.button('Save')
  .css({
    padding: '10px 16px',
    border: '0',
    borderRadius: '8px',
    backgroundColor: '#2563eb',
    color: '#fff'
  })
  .hover({ backgroundColor: '#1d4ed8' })
  .focusCss({ outline: '2px solid #93c5fd' });
```

Or document-level CSS helpers:

```javascript
doc.cssVars({
  primary: '#2563eb',
  radius: '8px'
});

doc.globalStyle('body', {
  fontFamily: 'system-ui',
  lineHeight: '1.6'
});

doc.sharedClass('card', {
  padding: '16px',
  borderRadius: 'var(--radius)'
});

doc.mediaQuery('(max-width: 768px)', {
  '.sidebar': { display: 'none' }
});

doc.darkMode({
  body: { backgroundColor: '#0f172a', color: '#f8fafc' }
});
```

Other helpers include keyframes, print rules, pseudo-elements, transitions, transforms, and element media queries.

## Security

buildhtml is secure by default:

- Text and attribute values are escaped.
- URL helpers sanitize executable protocols.
- Inline `on*` attributes are blocked.
- Event APIs compile to `addEventListener`.
- CSP nonces apply to generated inline scripts and styles.
- State is safely serialized into the document.
- `new Function()` and `eval` are rejected in serialized callbacks.
- Unsafe or malformed element tag names are rejected or normalized.

Raw APIs intentionally bypass normal escaping:

```javascript
doc.raw('<strong>Trusted server HTML only</strong>');
doc.rawHead('<meta name="custom" content="trusted">');
doc.inlineScript('console.log("trusted code")');
doc.inlineStyle('body { color: rebeccapurple; }');
```

Never pass untrusted user input to raw HTML, script, or style APIs.

## Important browser callback rule

Callbacks used by events, bindings, lifecycle hooks, `oncreate()`, and `liveList()` are serialized. Server-side closures do not exist in the browser:

```javascript
// Works: State exists in the browser
doc.states({ count: 0 });
doc.button('+1').onClick(function () {
  State.count++;
});

// Does not work: secret is only a server variable
const secret = 'server only';
doc.button('Bad example').onClick(function () {
  console.log(secret);
});
```

Pass browser-time data through `State`, literal values in the function, or `data-*` attributes.

## When to use it

buildhtml is a strong fit for:

- Dashboards and internal tools
- Reports and data-driven pages
- Admin panels
- Server-rendered forms
- Small reactive applications
- Static HTML generation
- Express applications that do not need a full frontend framework
- Teams that want one JavaScript language across server rendering and browser behavior

Consider a dedicated client framework when the product needs a large client-side component ecosystem, complex independent component state, advanced transitions, offline-first synchronization, or virtual-DOM diffing.

## API overview

### Document

Head and metadata:

```text
title · meta · viewport · charset · favicon · canonical
ogTags · twitterCard · jsonLd · noindex
preload · prefetch · preconnect
addLink · addScript · addStyle
```

Document and body:

```text
lang · htmlAttr · bodyId · bodyClass · bodyAttr · bodyCss
render · renderStream · clear
```

CSS:

```text
resetCss · globalStyle · sharedClass · defineClass
cssVar · cssVars · keyframes · mediaQuery · darkMode · print
```

Data and behavior:

```text
state · states · oncreate · build · fromJSON · toJSON
liveList · hashRouter · historyRouter
```

### Elements

Content and attributes:

```text
text · html · id · attr · setAttrs · data · aria
addClass · removeClass · toggleClass · classIf · classMap
```

Style:

```text
css · style · hover · focusCss · active · pseudo · media
transition · transform · animate · opacity · zIndex
display · position · size · overflow · cursor
```

Tree operations:

```text
child · prependChild · insertAt · before · after
remove · replaceWith · wrap · empty · clone
find · findAll · findById · closest
parent · siblings · nextSibling · prevSibling
```

Browser behavior:

```text
on · onClick · onInput · onChange · onSubmit
bind · bindShow · bindClass · bindAttr · bindStyle
bindProp · bindInput · bindState
onMount · onUpdate · onDestroy
```

### Creation helpers

Standard HTML shortcuts include:

```text
div · span · section · header · footer · main · nav
article · aside · form · table · ul · ol · h1–h6
p · a · button · img · input · select · textarea
label · details · dialog · pre · code · hr · br
```

Higher-level helpers include:

```text
formGroup · checkbox · radio · fieldset · hiddenInput
grid · flex · stack · row · center · container
spacer · divider · columns · list · dataTable
```

## TypeScript

Type declarations are included:

```typescript
import {
  Document,
  page,
  components,
  type NodeDef,
  type CSSRules
} from '@trebor/buildhtml';

const doc: Document = page('Typed page');
const rules: CSSRules = { color: '#2563eb' };

doc.h1('TypeScript ready').css(rules);
```

## Configuration

```javascript
const { configure } = require('@trebor/buildhtml');

configure({
  mode: 'prod',
  poolSize: 1000,
  cacheLimit: 200,
  maxComputedFnSize: 10000,
  maxEventFnSize: 20000,
  enableMetrics: true
});
```

| Option | Purpose |
|--------|---------|
| `mode` | Development or production behavior |
| `poolSize` | Maximum reusable object pool size |
| `cacheLimit` | LRU response-cache entry limit |
| `maxComputedFnSize` | Maximum serialized computed callback size |
| `maxEventFnSize` | Maximum serialized event callback size |
| `enableMetrics` | Enables runtime counters and timings |

## Full documentation

The complete searchable guide contains detailed parameters, examples, and the compact API reference:

**[Open the complete HTML guide](https://github.com/0trebor0/buildhtml/blob/main/docs/index.html)**

The guide is also shipped with the npm package:

```text
node_modules/@trebor/buildhtml/docs/index.html
```

Open that file directly in a browser. It is responsive, searchable, and has no external dependencies.

## Tests

```bash
npm test
```

Optional browser and TypeScript checks:

```bash
npm install --no-save --package-lock=false playwright@1 typescript@5
npx playwright install chromium

npm run test:browser
npm run test:types
```

The test suite covers HTML output, escaping and sanitization, state and deep reactivity, bindings, events, lifecycle cleanup, components, templates, JSON round-trips, streaming, caching, reactive lists, fetch compilation, and both routers.

## Benchmarks

```bash
npm run benchmark
```

The benchmark validates renderer output before measuring throughput, latency, HTML size, gzip size, and compiled client-runtime size. Treat raw strings as a lower-bound baseline rather than a feature-equivalent renderer.

## Requirements

- Node.js 16 or newer
- CommonJS
- No runtime dependencies

## License

MIT
