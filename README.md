# @trebor/buildhtml

**Build secure, reactive HTML entirely in Node.js with a focused server-side API.**

`@trebor/buildhtml` is a zero-dependency server-side HTML compiler. Describe pages with JavaScript, render complete HTML on the server, and opt into browser behavior with declarative state, bindings, events, reactive lists, and routing.

[Complete guide and API reference](https://0trebor0.github.io/buildhtml/docs/) · [Examples](https://github.com/0trebor0/buildhtml/tree/main/example) · [Report an issue](https://github.com/0trebor0/buildhtml/issues)

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
- **Focused browser runtime** — generated pages include only the state and event behavior they use.
- **Secure defaults** — escaped text and attributes, sanitized URLs, blocked inline `on*` attributes, and CSP nonce support.
- **Zero runtime dependencies** — a small supply chain and straightforward deployment.
- **Flexible output** — strings, streams, static files, Express responses, JSON-driven pages, or `.bhtml` templates.
- **SPA-capable** — reactive lists plus hash or History API routing for focused applications.

```text
Node.js API  →  complete HTML  →  optional compiled browser runtime
```

The browser receives only the behavior the page uses. A static page stays static. Adding `.states()`, `.bind()`, or `.onClick()` automatically adds the required client runtime.

## A reactive page from one Node.js file

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
- [Accessible form fields](#accessible-form-fields)
- [Reactive state and events](#reactive-state-and-events)
- [Client-side fetch](#client-side-fetch)
- [Components](#components)
- [Declarative builder and JSON](#declarative-builder-and-json)
- [Templates](#bhtml-templates)
- [Reactive lists](#reactive-lists)
- [SPA routing](#spa-routing)
- [Complete dashboard example](#complete-dashboard-example)
- [Server-validated account form](#server-validated-account-form)
- [Streaming and caching](#streaming-and-caching)
- [Security](#security)
- [Common mistakes](#common-mistakes)
- [API overview](#api-overview)
- [Higher-level helpers](#higher-level-helpers)
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

### Document and Element capabilities

Both objects expose tag shortcuts, but they have different jobs:

| Capability | `Document` | `Element` | Notes |
|------------|:----------:|:---------:|-------|
| Tag shortcuts | Yes | Yes | Creates a body element or a nested child |
| `create(tag)` | Yes | Yes | Creates a body element or a nested child and returns it |
| `build(definition)` | Yes | Yes | Builds into the document body or the element's children |
| `child(tag)` | Yes | Yes | Alias for body creation on a document and nested creation on an element |
| Metadata and global CSS | Yes | No | Head and page-wide configuration |
| `states(initialValues)` | Yes | No | Declares browser state for the page |
| Element attributes and bindings | No | Yes | Configures the returned element |

### Create any HTML element

`create(tag)` accepts a tag name and returns an `Element`. On a `Document`, the new element is added to the body. On an existing `Element`, it becomes a nested child:

```javascript
const { Document } = require('@trebor/buildhtml');

const doc = new Document();
const card = doc.create('section')
  .id('account-card')
  .addClass('card')
  .css({ padding: '20px' });

card.create('h2').text('Account');
card.create('custom-status')
  .attr('role', 'status')
  .text('Ready');

const html = doc.render();
```

Creation aliases:

| Call | Where content is added | Returns |
|------|------------------------|---------|
| `doc.create(tag)` | Document body | `Element` |
| `doc.createElement(tag)` | Document body | `Element` |
| `doc.child(tag)` | Document body | `Element` |
| `element.create(tag)` | Inside that element | `Element` |
| `element.child(tag)` | Inside that element | `Element` |

`create()` itself does not contain a separate set of methods. It returns the same chainable `Element` used by shortcuts such as `div()` and `h1()`. Common methods on that returned element include:

| Purpose | Methods |
|---------|---------|
| Content | `text`, `html`, `append`, `appendUnsafe`, `empty` |
| Identity and attributes | `id`, `attr`, `setAttrs`, `data`, `aria` |
| Classes | `addClass`, `removeClass`, `toggleClass`, `classIf`, `classMap` |
| Styling | `css`, `style`, `hover`, `focusCss`, `media`, `transition`, `animate` |
| Nested content | `create`, `child`, `build`, tag shortcuts, form and layout helpers |
| Events | `on`, `onClick`, `onInput`, `onChange`, `onSubmit` and other event shortcuts |
| Reactive state | `bind`, `bindShow`, `bindClass`, `bindAttr`, `bindStyle`, `bindInput` |
| Lifecycle | `onMount`, `onUpdate`, `onDestroy` |
| Tree operations | `before`, `after`, `wrap`, `remove`, `replaceWith`, `clone`, `find`, `findAll` |

Use a tag shortcut when its name is known, such as `doc.h1('Title')`. Use `create(tag)` for dynamic tags, custom elements, or tags without a shortcut. Ordinary text should use `text()` because it escapes content; only pass trusted HTML to `html()` or `appendUnsafe()`.

### Familiar element API

```javascript
const card = doc.section()
  .id('welcome')
  .addClass('card', 'featured')
  .data({ userId: 42 })
  .aria({ label: 'Welcome card' })
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

For a larger server, keep HTTP responsibilities separate from page construction:

```text
project/
|-- server.js          # HTTP routes, headers, authentication, responses
|-- ui/
|   |-- dashboard.js   # Page construction
|   |-- components.js  # Reusable server components
|   `-- styles.js      # Theme and shared styles
|-- routes/
|   `-- api.js         # JSON endpoints
|-- public/            # Static assets
`-- tests/             # Render, HTTP, and browser tests
```

BuildHTML constructs UI output; authentication, authorization, request validation, headers, persistence, and API routing remain server responsibilities.

## Accessible form fields

`field(label, options?)` creates a labelled input with a unique ID and returns every useful element:

```javascript
doc.states({ email: '' });

const { group, label, input } = doc.field('Email', {
  type: 'email',
  name: 'email',
  bind: 'email',
  attrs: { autocomplete: 'email', required: true }
});

group.addClass('account-field');
label.addClass('field-label');
input.placeholder('you@example.com');
```

| Option | Type | Purpose |
|--------|------|---------|
| `type` | string | Input type; omitted from the markup when not given |
| `id` | string | Explicit input and label target ID; otherwise generated uniquely |
| `name` | string | Submitted form name |
| `bind` | state key | Adds two-way state binding |
| `groupClass` | string | Wrapper class; no class is added when not given |
| `attrs` | object | Additional input attributes |

Multiple fields may bind to the same state key without sharing an HTML ID. Run `doc.validate()` before rendering to catch any explicitly duplicated IDs.

The form and layout helpers build structure only. They add no class, style, or attribute you did not pass — no `form-group` wrapper class, no default `gap`, container width, or divider colour — so nothing collides with your stylesheet. The one exception is the generated ID pairing each `<label for>` with its input, which the markup cannot express without it. Style the elements these helpers return with `addClass()` or `css()`.

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

For common navigation comparisons, use declarative helpers so no server closure is required:

```javascript
doc.states({ activePage: 'overview' });

doc.button('Projects')
  .addClass('nav-item')
  .classWhen('activePage', 'projects', 'active')
  .setStateOnClick('activePage', 'projects');

doc.section('Project content')
  .showWhen('activePage', 'projects');
```

`showWhen(key, value)` controls visibility, `classWhen(key, value, className)` toggles one class without replacing existing classes, and `setStateOnClick(key, value)` safely embeds JSON-serializable values.

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

Build into an existing element with the same definition format:

```javascript
const card = doc.section().addClass('card');

card.build([
  { tag: 'h2', text: 'Nested definition' },
  { tag: 'p', text: 'Added inside the card.' }
]);
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

The parser recovers from a malformed line rather than throwing, so a mistake still produces output. In development it reports what it dropped as `W_TEMPLATE_SYNTAX` — an unclosed `(`, an invalid `?each`, an unrecognised `?` directive, or a `:global`/`:class` rule without braces. Production stays quiet.

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
| `options.filter` | `(item, State) => boolean` | Optional filter used during SSR and browser updates |
| `options.filterKeys` | string[] | Extra state keys that change filtering |
| `options.sort` | `(a, b, State) => number` | Optional comparator used during SSR and browser updates |
| `options.sortKeys` | string[] | Extra state keys that change ordering |
| `options.empty` | `NodeDef` or string | Declarative content shown when no items remain |

The method returns the list container `Element`.

## SPA routing

### Dashboard views without URL routing

Use `doc.views()` when dashboard panels should switch without changing the URL:

```javascript
doc.button('Overview').data({ viewNav: 'overview' });
doc.button('Projects').data({ viewNav: 'projects' });

doc.section('Overview content').data({ view: 'overview' });
doc.section('Project content').data({ view: 'projects' });

doc.views({
  stateKey: 'activePage',
  default: 'overview',
  activeClass: 'active'
});
```

The helper initializes the state key only when it has not already been declared, hides inactive views, toggles the active navigation class, sets `aria-current="page"`, and responds to state changes from any source. Defaults are `[data-view-nav]` for navigation and `[data-view]` for panels; use `navigation` and `viewSelector` to supply custom selectors.

## Complete dashboard example

The runnable [dashboard example](example/dashboard.js) combines responsive layout, reusable server composition, `doc.views()`, reactive filtering and sorting, an accessible empty state, `liveList()`, client `fetch()`, accessible forms, `doc.validate()`, and a zero-dependency Node HTTP server.

Its browser test exercises keyboard navigation and audits duplicate IDs, control names, image alternatives, heading order, and visible focus so the example cannot silently lose its accessibility basics.

```bash
node example/dashboard.js
```

Open `http://127.0.0.1:3000`. The page HTML is generated once when the server starts and then served as a static string; `/api/activity` demonstrates a JSON endpoint consumed from a compiled async click handler.

The automated suite renders and validates this exact file, while the browser test switches views, filters activity, fetches fresh rows, and checks for client errors.

## Server-validated account form

The runnable [account form example](example/account-form.js) shows a separate production pattern: render per request, parse URL-encoded POST bodies with a size limit, return accessible validation errors, escape submitted values, and never place a submitted password back into HTML.

```bash
node example/account-form.js
```

Open `http://127.0.0.1:3001/account`. The automated suite exercises its initial GET, invalid and valid POSTs, escaping, validation status codes, content-type rejection, oversized bodies, missing routes, and unsupported methods. Authentication, authorization, CSRF protection, persistence, and password hashing belong in the surrounding server application.

### Complete authentication interface

```bash
node example/auth-interface.js
```

Open `http://127.0.0.1:3004/auth`. The complete [authentication interface example](example/auth-interface.js) combines sign-in, registration, and account-settings forms with keyboard-accessible view switching, responsive layout, unique labelled fields, appropriate autocomplete values, and visible focus. Its placeholder POST routes deliberately return `501`; connect them to your authenticated server workflows, CSRF protection, rate limiting, validation, persistence, and password hashing.

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

### Complete routing examples

Run the packaged zero-dependency server:

```bash
node example/routing.js
```

Then open:

- `http://127.0.0.1:3002/hash#users/42` for hash routing.
- `http://127.0.0.1:3002/app/users/42` for History routing and direct-URL fallback.

The complete [routing example](example/routing.js) serves API and static routes before its `/app/*` HTML fallback. Its automated HTTP and browser tests cover route parameters, wildcard routes, hash changes, opted-in History links, direct refreshes, and back navigation.

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

`renderStream()` renders on demand: each read produces only as much as the consumer has room for, so the head reaches the socket before the body is built and a slow client applies backpressure instead of forcing the whole page into memory.

```javascript
app.get('/', (req, res) => {
  const doc = buildPage();
  res.type('html');
  doc.renderStream().pipe(res);
});
```

Streaming differs from `render()` in three ways, all consequences of sending the head first:

| | `render()` | `renderStream()` |
|---|---|---|
| Scoped `<style>` | in `<head>` | after the body |
| Production minification | applied | not applied |
| Response cache | used | not used — a `cacheKey` is ignored, and warns in development |

The markup is otherwise identical. Use `render()` when you want a cached or minified response, and `renderStream()` when time-to-first-byte matters more.

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
| `options.nonce` | `(req) => string` | Supplies a fresh per-response CSP nonce and bypasses rendered HTML caching |

Concurrent misses for the same key share one build. Include every value that changes the response in the cache key—especially identity, permissions, and locale.

Nonce-enabled responses are deliberately rendered for every request. Reusing cached HTML would reuse its nonce and break the per-response CSP guarantee.

Cache helpers include `clearCache(pattern?)`, `getCacheStats()`, `healthCheck()`, and `resetPools()`.

### Complete caching and CSP example

```bash
node example/production-patterns.js
```

Open `http://127.0.0.1:3003/personalized?user=alice&locale=en` for identity-, permission-, and locale-aware caching, or `http://127.0.0.1:3003/csp` for a fresh nonce shared by the CSP header and generated HTML. The complete [production patterns example](example/production-patterns.js) is exercised by HTTP tests that prove cache isolation and prevent nonce reuse.

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

For per-element server values, pass a JSON-serializable callback context instead of capturing a closure:

```javascript
for (const pageName of ['overview', 'projects', 'account']) {
  doc.button(pageName).onClick(
    function (event, state, element, context) {
      state.activePage = context.page;
    },
    { page: pageName }
  );

  doc.section(pageName).bindShow(
    'activePage',
    function (value, state, context) {
      return value === context.page;
    },
    { page: pageName }
  );
}
```

Binding callbacks receive `(value, State, context)`. Event callbacks receive `(event, State, element, context)`. Context values are safely encoded into the generated page and must be JSON-serializable; never put secrets in them.

`doc.validate()` analyzes serialized event, binding, computed, lifecycle, `liveList()`, and `oncreate` callbacks. A likely server closure produces `W_CALLBACK_CAPTURE` with the callback type and unavailable variable names:

```javascript
const pageName = 'projects';
doc.section('Projects').bindShow('activePage', value => value === pageName);

const result = doc.validate();
// W_CALLBACK_CAPTURE: pageName is unavailable in the browser
```

The analysis is intentionally conservative and reports warnings rather than rejecting the page. Use callback context, `State`, `data-*` attributes, literals, or browser globals to resolve a warning.

Event handlers receive `(event, State, element)`, and `this` is the same browser element:

```javascript
doc.button('Projects')
  .data({ page: 'projects' })
  .onClick(function (event, state, element) {
    state.activePage = element.dataset.page;
  });
```

The optional fourth argument is serialized callback context. While the listener runs synchronously, `event.currentTarget`, `element`, and `this` all refer to its element. The arguments and `this` value are preserved across `await`; because `currentTarget` is owned by the browser's event-dispatch lifecycle, use the explicit `element` argument after awaiting instead of relying on it. `State` is both passed explicitly and available as the browser global for compatibility. Returning `false` has no special meaning; call `event.preventDefault()` and/or `event.stopPropagation()` explicitly when required.

In development mode, synchronous errors and rejected promises from events, bindings, computed values, lifecycle hooks, `liveList()`, and `oncreate()` are reported in the browser console. Set `window.BuildHTML.reportClientError` to forward errors to your own monitoring code; it receives `(error, context)` with the callback type, element ID, tag, and state key when relevant.

## Validate before rendering

`doc.validate()` performs a read-only check of the current tree:

```javascript
const result = doc.validate();
if (!result.valid) console.error(result.errors);
for (const warning of result.warnings) console.warn(warning);
```

It detects duplicate IDs and reports warnings for callback captures, empty or skipped headings, unnamed buttons and form controls, images without `alt`, broken label and `aria-labelledby` targets, unsafe URLs, nested interactive elements, bindings using undeclared state keys, caching enabled without a key, and History routing that requires a server fallback. Each diagnostic has a stable `code` and actionable `message`.

`W_VALIDATE_AFTER_RENDER` means `validate()` ran after `render()` had already cleared the body, so it inspected an empty document — call it before rendering. `W_HISTORY_FALLBACK` is a deployment reminder rather than proof that the fallback is missing: a document cannot inspect the HTTP server around it. `W_CACHE_KEY` is emitted only when document caching is enabled but no key was supplied. BuildHTML cannot determine whether a supplied shared key is safe for personalized output, so identity and authorization inputs remain the application’s responsibility.

Callbacks rejected while being registered are retained as `E_CALLBACK_REGISTRATION` errors instead of disappearing after a console message. This includes oversized sources, blocked `eval`/`new Function` patterns, invalid function source, and non-serializable callback context. The diagnostic identifies the callback family, element tag and ID when available, original reason, and the corrective action:

```javascript
doc.button('Unsafe').onClick(function () {
  eval('alert(1)');
});

const result = doc.validate();
// result.valid === false
// result.errors[0].code === 'E_CALLBACK_REGISTRATION'
```

## Common mistakes

- **Building at the wrong level:** `doc.build(definition)` adds nodes to the document body; `element.build(definition)` adds nodes inside that element.
- **Capturing a server variable in a browser callback:** callbacks execute later in the browser. Pass JSON-safe callback context, use `State`, or use declarative helpers such as `showWhen()` and `setStateOnClick()`.
- **Reusing an HTML ID:** state keys may be shared, but IDs must be unique. Run `doc.validate()` and fix every `E_DUPLICATE_ID` before rendering.
- **Using raw content for ordinary text:** use `.text()` or shortcut text arguments. Reserve `appendUnsafe()`, `rawHead()`, and inline scripts for trusted content.
- **Using History routing without a server fallback:** configure the server to return the application HTML for direct application URLs such as `/app/reports`; otherwise refresh and shared links can return 404.
- **Caching personalized output under a shared key:** include identity, permissions, locale, and every response-changing value in the cache key. Authentication and authorization remain server responsibilities.
- **Serializing secrets as callback context:** callback context is embedded in browser-visible HTML. Never include credentials, tokens, or server-only values.

## When to use it

buildhtml is a strong fit for:

- Dashboards and internal tools
- Reports and data-driven pages
- Admin panels
- Server-rendered forms
- Small reactive applications
- Static HTML generation
- Express applications with server-defined pages and browser behavior
- Teams that want one JavaScript language across server rendering and browser behavior

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
render · renderStream · validate · clear
```

CSS:

```text
resetCss · globalStyle · sharedClass · defineClass
cssVar · cssVars · keyframes · mediaQuery · darkMode · print
```

Data and behavior:

```text
state · states · oncreate · build · fromJSON · toJSON
liveList · views · hashRouter · historyRouter
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
child · build · prependChild · insertAt · before · after
remove · replaceWith · wrap · empty · clone
find · findAll · findById · closest
parent · siblings · nextSibling · prevSibling
```

`find()`, `findAll()`, and `closest()` take a tag name and reject an invalid one with the same `TypeError` as `create()`. `find('SPAN')` could never match — tags are stored kebab-cased — so it raises the mistake instead of returning an empty result.

Browser behavior:

```text
on · onClick · onInput · onChange · onSubmit
bind · bindShow · showWhen · bindClass · classWhen · bindAttr · bindStyle
bindProp · bindInput · bindState
setStateOnClick
onMount · onUpdate · onDestroy
```

### Creation helpers

Container and text shortcuts accept either content or a setup callback. Text is escaped, and the returned element remains chainable:

```javascript
doc.h1('Dashboard');
doc.div('82%').addClass('metric');
doc.section((section) => {
  section.h2('Projects');
  section.p('Four projects are active.');
});
```

Standard HTML shortcuts include:

```text
div · span · section · header · footer · main · nav
article · aside · form · table · thead · tbody · tfoot
tr · th · td · ul · ol · li · h1–h6 · p · a
strong · small · label · caption · legend · em · b · i
button · img · input · select · textarea · details
dialog · pre · code · blockquote · hr · br
```

The complete signature reference, including the `summary()` shortcut:

| Methods | Signature | Returns | Void | Setup callback | Example |
|---------|-----------|---------|:----:|:--------------:|---------|
| `div`, `span`, `section`, `header`, `footer`, `main`, `nav`, `article`, `aside`, `form`, `ul`, `ol`, `table`, `thead`, `tbody`, `tfoot`, `tr`, `details`, `summary`, `dialog`, `pre`, `code`, `blockquote`, `h1`, `h2`, `h3`, `h4`, `h5`, `h6`, `li`, `th`, `td`, `p`, `strong`, `small`, `label`, `caption`, `legend`, `em`, `b`, `i` | `(textOrSetup?)` | `Element` | No | Yes | `doc.h1('Title')` |
| `a` | `(href, text?)` | `Element` | No | No | `doc.a('/help', 'Help')` |
| `button` | `(text?)` | `Element` | No | No | `doc.button('Save')` |
| `img` | `(src, alt?)` | `Element` | Yes | No | `doc.img('/logo.svg', 'Logo')` |
| `input` | `(type?, attrs = {})` | `Element` | Yes | No | `doc.input('email', { required: true })` |
| `textarea` | `(attrs = {})` | `Element` | No | No | `doc.textarea({ name: 'notes' })` |
| `select` | `(options = [], attrs = {})` | `Element` | No | No | `doc.select([{ value: 'en', text: 'English' }])` |
| `hr` | `()` | `Element` | Yes | No | `doc.hr()` |
| `br` | `()` | Parent object | Yes | No | `doc.p('Line one').br().text('Line two')` |

All listed shortcuts are available on both `Document` and `Element`. Except for `br()`, each returns the created child element. Omitted optional arguments are omitted from the markup: `doc.input()` renders `<input>` rather than `<input type="text">`, and `doc.img('/logo.svg')` renders no `alt`. Pass `alt` explicitly on every image — `''` for decorative ones, meaningful text for informative ones.

In development mode, an extra positional argument produces `W_SHORTCUT_ARGUMENT` instead of being silently ignored. Production output remains quiet, and TypeScript rejects the unsupported call before runtime.

### Higher-level helpers

These compose the tag shortcuts into common structures. Like the shortcuts, they exist on both `Document` and `Element`, and they add no class, style, or attribute you did not pass — see [Styling what a helper returns](#styling-what-a-helper-returns).

#### Form helpers

| Method | Signature | Returns | Produces |
|--------|-----------|---------|----------|
| `field` | `(label, options = {})` | `{ group, label, input }` | `<div><label for><input id></div>`, with the label wired to the input |
| `formGroup` | `(label, type?, attrs = {})` | Wrapper `Element` | Same structure as `field`, but only the wrapper is returned |
| `checkbox` | `(name, label, checked = false)` | Wrapper `Element` | `<div><input type="checkbox" name id><label for></div>` |
| `radio` | `(name, options = [])` | Wrapper `Element` | One `<div><input type="radio"><label></div>` per option, inside a wrapper |
| `fieldset` | `(legend?, setupFn?)` | `<fieldset>` `Element` | `<fieldset>` with a `<legend>` when one is given; `setupFn` receives the fieldset |
| `hiddenInput` | `(name, value)` | `Element` | `<input type="hidden">` |

`field()` is the one to reach for: its [options table](#accessible-form-fields) covers `type`, `id`, `name`, `bind`, `groupClass`, and `attrs`, and it hands back all three elements. `radio()` options are `{ value, label, checked }`, falling back to `text` then `value` for the visible label.

Each of these generates the ID pairing `<label for>` with its input unless you supply one — `field({ id })`, or `attrs.id` on `formGroup()`.

#### Layout helpers

| Method | Signature | Returns | Produces |
|--------|-----------|---------|----------|
| `grid` | `(columns?, items?, gap?)` | `Element` | `display: grid`; a number becomes `repeat(n, 1fr)`, a string is used as-is |
| `flex` | `(items?, options = {})` | `Element` | `display: flex`; options are `direction`, `gap`, `align`, `justify`, `wrap` |
| `stack` | `(items?, gap?)` | `Element` | `flex` with `flex-direction: column` |
| `row` | `(items?, gap?)` | `Element` | `flex` with `flex-direction: row` |
| `center` | `(setupFn?)` | `Element` | `flex` centred on both axes; `setupFn` receives the element |
| `container` | `(setupFn?, maxWidth?)` | `Element` | `margin: 0 auto`, plus `max-width` when given |
| `spacer` | `(height?)` | `Element` | Empty `<div>`, with `height` when given |
| `divider` | `(options = {})` | `<hr>` `Element` | Bare `<hr>`; `color` adds a top border and `margin` sets spacing |
| `columns` | `(count, columnFns = [], gap?)` | `Element` | A grid with one column `<div>` per function |

`grid()`, `flex()`, `stack()`, and `row()` take the same `items` array, and each entry is handled by type: a function is called with a fresh child `<div>`, an `Element` is appended as-is, and anything else is stringified into a `<div>`.

```javascript
doc.grid(3, [
  (cell) => cell.h3('Revenue'),
  (cell) => cell.p('Up 12% this quarter'),
  'Plain text',
], '16px');
```

Prefer the callback form. An element made with `create()` is already attached to the element that created it, so passing one as an item appends it a second time rather than moving it.

Every spacing, sizing, and colour argument above is optional and emits nothing when omitted. `grid(2, items)` produces `display: grid; grid-template-columns: repeat(2, 1fr)` and no `gap`.

#### Data helpers

| Method | Signature | Returns | Produces |
|--------|-----------|---------|----------|
| `list` | `(items, renderer?, tag = 'ul')` | The list `Element` | One `<li>` per item; `renderer(li, item, index)` fills it, otherwise the item is stringified |
| `dataTable` | `(headers?, rows = [], options = {})` | `<table>` `Element` | `<thead>` when headers exist, then a `<tbody>` row per entry |
| `each` | `(items, fn)` | The same element, for chaining | Nothing on its own; `fn(this, item, index)` builds each iteration |
| `when` | `(condition, fn)` | The same element, for chaining | Nothing unless `condition` is truthy, then `fn(this)` runs |

`dataTable()` accepts array rows or object rows. With object rows, `headers` selects and orders the keys; omit `headers` and pass `{ autoHeaders: true }` to take them from the first row. `{ class }` adds a class to the table.

```javascript
doc.dataTable(null, [
  { name: 'Ada', role: 'Engineer' },
  { name: 'Grace', role: 'Admiral' },
], { autoHeaders: true, class: 'data-table' });
```

#### Styling what a helper returns

Helpers return real elements, so style them at the call site with `addClass()`, `css()`, or any other element method. `field()` returns the group, label, and input separately, so each part is reachable:

```javascript
const jobCode = form.field('Job Code', {
  groupClass: 'form-group',
  attrs: { autocomplete: 'off' },
});
jobCode.label.addClass('field-label');
jobCode.input.addClass('field-input').css({ width: '100%' });
```

`formGroup()`, `checkbox()`, and `radio()` return only their wrapper; use `field()` when you need the label and input references, or reach into the wrapper with `find('label')` and `find('input')`.

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

Pass your application state to `page<State>()` for key and value inference across elements, bindings, events, lifecycle hooks, lists, routers, and views:

```typescript
type AppState = {
  activePage: 'overview' | 'projects' | 'account';
  sidebarOpen: boolean;
  count: number;
};

const doc = page<AppState>('Dashboard');
doc.states({ activePage: 'overview', sidebarOpen: false, count: 0 });

doc.span().bind('count', (count, state) => `${count} on ${state.activePage}`);
doc.button('Projects').setStateOnClick('activePage', 'projects');
doc.button('Open menu').onClick(function (_event, state) {
  state.sidebarOpen = true;
});
```

Without a generic argument, state remains intentionally permissive for backward compatibility and JavaScript-style gradual typing.

## Configuration

```javascript
const { configure } = require('@trebor/buildhtml');

configure({
  mode: 'prod',
  debug: false,
  poolSize: 1000,
  cacheLimit: 200,
  maxComputedFnSize: 10000,
  maxEventFnSize: 20000,
  enableMetrics: true
});
```

| Option | Purpose |
|--------|---------|
| `mode` | Development or production behavior — `'dev'` or `'prod'`; any other value is warned about and ignored |
| `debug` | Exposes `window.BuildHTMLDebug.inspect()` in development pages |
| `poolSize` | Maximum reusable object pool size |
| `cacheLimit` | LRU response-cache entry limit |
| `maxComputedFnSize` | Maximum serialized computed callback size |
| `maxEventFnSize` | Maximum serialized event callback size |
| `enableMetrics` | Enables runtime counters and timings |

For browser-side diagnostics during local development:

```javascript
configure({ mode: 'dev', debug: true });
```

After hydration, run `BuildHTMLDebug.inspect()` in the browser console. It returns a defensive snapshot containing registered state keys, element bindings, event listeners, callback counts, serialized callback sources, rejected registration diagnostics, and hydration time. A page containing only a rejected callback still receives the inspector, making missing behavior visible even if `validate()` was skipped. Production pages and pages without `debug: true` do not expose it. Callback source is already present in development HTML, but may contain application logic, so do not enable debug output in production.

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

The test suite covers HTML output, escaping and sanitization, state and deep reactivity, bindings, events, lifecycle cleanup, components, templates, JSON round-trips, streaming and backpressure, caching and cache failure recovery, reactive lists, fetch compilation, both routers, and the CommonJS and ESM entry points with every subpath export. Property-based tests generate inputs for the sanitization boundary — HTML escaping, attribute rendering, URL and CSS sanitization, JavaScript and JSON embedding, attribute keys, tag names, the minifier — and for `toJSON()`/`fromJSON()` round trips, from a seeded generator so a failure replays exactly with `BUILDHTML_FUZZ_SEED`. It also parses every JavaScript block in this README and executes the two complete quick-start programs against the package entry point, asserting meaningful rendered output.

## Module formats and entry points

The package ships both module systems. ESM gets an explicit wrapper, so every named export is importable:

```javascript
import { page, Document, metrics } from '@trebor/buildhtml';

const doc = page('Hello');
doc.h1('Hello from ESM');
console.log(doc.render());
```

`responseCache` is deliberately not a named ESM export. It is a live accessor that returns a new cache whenever `configure({ cacheLimit })` changes the limit, and a static ESM binding would freeze the value captured at import time. Reach it through the default export:

```javascript
import buildhtml from '@trebor/buildhtml';

console.log(buildhtml.responseCache.size);
```

Import a single area when you do not need the whole surface:

```javascript
const { renderTemplate } = require('@trebor/buildhtml/template');
const { createCachedRenderer } = require('@trebor/buildhtml/middleware');
const { components } = require('@trebor/buildhtml/components');
const { compileLiveList } = require('@trebor/buildhtml/live');
const { configure } = require('@trebor/buildhtml/config');
const { metrics } = require('@trebor/buildhtml/metrics');
```

These subpaths and the package root are the supported entry points. Reaching into `lib/` directly is not supported and may change without a major release.

## Benchmarks

```bash
npm run benchmark
```

The benchmark validates renderer output before measuring throughput, latency, HTML size, gzip size, and compiled client-runtime size. Treat raw strings as a lower-bound baseline rather than a feature-equivalent renderer.

### Published results

Measured on Node v22.23.1, Intel Core i7-11800H @ 2.30GHz, Windows 11, 68 GB RAM. 50 rows, 7 samples, ~250 ms per sample. Absolute numbers depend on CPU, Node version, power state, and background load — the ratios are the portable part, and they were stable across repeated runs while absolute throughput moved by a third.

| Renderer | median ops/s | median ms | p95 ms | HTML bytes | gzip |
|---|---:|---:|---:|---:|---:|
| Raw string baseline | 52,890 | 0.0189 | 0.0193 | 3,927 | 557 |
| Preact 10.29.8 (string) | 38,495 | 0.0260 | 0.0277 | 3,927 | 557 |
| buildhtml 1.2.5 | 4,812 | 0.2078 | 0.2101 | 3,929 | 565 |
| React 19.2.8 (static) | 1,996 | 0.5010 | 0.7013 | 3,927 | 557 |

All four produce the same page within two bytes. Install `react react-dom preact preact-render-to-string` to reproduce the comparison rows; the benchmark skips them when absent.

Reactive compilation, which has no static-renderer equivalent to compare against:

| Renderer | median ops/s | median ms | p95 ms | HTML bytes | gzip |
|---|---:|---:|---:|---:|---:|
| buildhtml 1.2.5 reactive | 7,153 | 0.1398 | 0.1519 | 16,872 | 4,147 |

Read it this way:

- **About 2.4x faster than React** server rendering, for byte-identical output.
- **About 8x slower than Preact's string renderer**, which is a specialist at exactly this and does not build a mutable element tree, validate attribute keys, sanitize URLs, or collect scoped CSS.
- **About 11x slower than raw string concatenation.** That baseline escapes text but is otherwise a hardcoded template with no API — a lower bound on what JavaScript can do, not something you would ship.

At ~0.21 ms per page a single core renders roughly 4,800 pages per second, so for most applications rendering sits well below database and network time. If you are serving a very high volume of static pages and nothing else, Preact's string renderer or hand-written concatenation will beat it.

### Client runtime size by feature

```bash
npm run benchmark:size
```

buildhtml ships no runtime library — every byte of browser JavaScript is generated per page from the features you actually use, so a page pays only for what it touches. There is no shared bundle to cache across pages. Measured in `prod` mode; "vs core" is the delta over a page that declares state but no bindings.

| Feature | bytes | gzip | vs core | gzip Δ |
|---|---:|---:|---:|---:|
| Static page (no reactivity) | 0 | 0 | — | — |
| Core runtime (state only) | 2,847 | 1,062 | — | — |
| + text binding | 3,662 | 1,269 | +815 | +207 |
| + event handler | 3,520 | 1,241 | +673 | +180 |
| + two-way input | 4,276 | 1,379 | +1,429 | +318 |
| + show/hide binding | 3,625 | 1,270 | +778 | +209 |
| + class binding | 3,676 | 1,285 | +829 | +224 |
| + attribute binding | 4,033 | 1,411 | +1,186 | +350 |
| + style binding | 3,742 | 1,302 | +895 | +241 |
| + element state | 3,071 | 1,127 | +224 | +66 |
| + computed | 3,149 | 1,186 | +302 | +125 |
| + lifecycle hooks | 4,140 | 1,395 | +1,293 | +334 |
| + portal | 3,006 | 1,118 | +159 | +57 |
| + oncreate | 3,204 | 1,158 | +357 | +97 |
| + liveList | 5,893 | 2,279 | +3,046 | +1,218 |
| + hash router | 2,988 | 1,123 | +141 | +62 |
| + history router | 4,443 | 1,757 | +1,596 | +696 |
| + views | 3,759 | 1,377 | +912 | +316 |

A fully static page ships **zero** JavaScript. The first reactive feature costs ~1 KB gzipped for the state proxy and cleanup observer; each additional facility is a few hundred bytes. `liveList` is the most expensive because it emits the `_mkEl` DOM builder.

`debug: true` in development adds the inspector and serialized callback sources — a text-binding page grows from 3,825 to 5,081 bytes (1,339 → 1,619 gzip). Production pages never include it.

## Requirements

- Node.js 18 or newer (CI runs 18, 20, 22, and 24)
- CommonJS and ESM
- No runtime dependencies

## Project

- [Changelog](CHANGELOG.md) — release notes, tagged `v<version>` from 1.2.5 onward
- [Contributing](CONTRIBUTING.md) — running the checks, engineering rules, release process
- [Security policy](SECURITY.md) — how to report a vulnerability privately, and what is in scope
- [Report a bug](https://github.com/0trebor0/buildhtml/issues/new/choose)

Releases from 1.2.5 are published with npm provenance. Verify with `npm audit signatures`.

## License

MIT
