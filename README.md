````markdown
# BuildHTML

**Zero-dependency, ultra-fast server-side rendering (SSR) compiler.**  
*“Compile your HTML at lightning speed, without the bloat.”*

---

## Overview

BuildHTML is a lightweight SSR compiler for Node.js. It allows you to build HTML on the server with minimal memory usage and blazing-fast performance—without relying on heavy frameworks. Perfect for custom Node servers, static site generators, or optimized Express apps.

- **Zero dependencies** – Only Node.js required.  
- **Ultra-fast** – Optimized rendering and memory reuse.  
- **SSR-ready** – Easily manage state, computed values, and client-side hydration.  
- **Customizable** – Create elements, set styles, attach events, and more.  

---

## Installation

```bash
npm install buildhtml
````

or via GitHub:

```bash
npm install github:0trebor0/buildhtml
```

---

## Quick Start

```javascript
const { Document } = require('buildhtml');

// Create a new document
const doc = new Document();

// Add elements (use __STATE_ID__ + bindState so the handler works on the client)
const counter = doc.create('div').text('0').state(0);
const button = doc.create('button').text('Increment');
button.bindState(counter, 'click', function() {
  const id = '__STATE_ID__';
  const el = document.getElementById(id);
  const val = parseInt(window.state[id] || 0, 10) + 1;
  window.state[id] = val;
  el.textContent = val;
});

// Add to document
doc.use(counter).use(button);

// Render HTML
const html = doc.render();
console.log(html);
```

---

## Features

* **Element creation**: `doc.create('div')` or `doc.createElement('div')`, `text()`, `append()`, `css()`.
* **Composition**: `doc.useFragment(fn)` – `fn(doc)` returns one or more elements to reuse layouts/headers/footers.
* **State management**: `.state(value)` for server-generated state (hydrates `textContent` on normal elements, `value` on `<input>`/`<textarea>`).
* **Computed values**: `.computed(fn)` for dynamic content.
* **Event binding**: `.on(event, fn)` and `.bindState(target, event, fn)`.
* **Optimized rendering**: Object pools, LRU caching, in-flight deduplication for cached routes, minified output in production.
* **Client-side hydration**: Automatically generates JS to update states and events in the browser.

---

## API Guide

### Exports

```javascript
const {
  Document,
  Element,
  Head,
  CONFIG,
  createCachedRenderer,
  clearCache,
  enableCompression,
  responseCache,
  warmupCache,
  getCacheStats
} = require('buildhtml');
```

---

### Document

Root HTML builder. Create with `new Document(options)`.

| Method | Description |
|--------|-------------|
| `title(t)` | Set page title (escaped). Returns `this`. |
| `addMeta(m)` | Add meta tag; `m` is an object, e.g. `{ name: 'description', content: '...' }`. |
| `addLink(href)` | Add `<link rel="stylesheet" href="...">` (deduplicated). |
| `addStyle(css)` | Add inline CSS string to `<head>`. |
| `addScript(src)` | Add `<script src="...">` to `<head>`. |
| `use(el)` | Append one element to the body. Returns `this`. |
| `useFragment(fn)` | Append multiple elements; `fn(doc)` returns a single `Element` or an array of `Element`s. Ignores `null`/non-Element. Returns `this`. |
| `create(tag)` | Create a pooled element (e.g. `'div'`, `'input'`). Tag is normalized to kebab-case. Shorthand for `createElement(tag)`. |
| `createElement(tag)` | Same as `create(tag)`. |
| `clear()` | Clear body and state store; recycle elements. |
| `render()` | Return full HTML string. If cache options are set, may return cached result or populate cache. Clears the document after render. |

**Constructor options**

| Option | Type | Description |
|--------|------|-------------|
| `cache` | `boolean` | If `true`, use response cache when `cacheKey` is set (e.g. by `createCachedRenderer`). |
| `cacheKey` | `string` | Key for response cache. |

**Example**

```javascript
const doc = new Document({ cache: true, cacheKey: 'home' });
doc.title('Home').addMeta({ charset: 'UTF-8' });
doc.use(doc.create('main').append(doc.create('p').text('Hello')));
const html = doc.render();
```

---

### Element

Created with `doc.create(tag)` or `doc.createElement(tag)`. All mutating methods return `this` for chaining.

| Method | Description |
|--------|-------------|
| `id(v?)` | Set `id` attribute. If `v` is omitted, assigns a unique id (required for state/events/computed). |
| `text(c)` | Append escaped text as a child. |
| `append(c)` | Append child: `Element` (rendered as subtree) or string (escaped). |
| `css(styles)` | Add scoped inline styles; `styles` is an object, e.g. `{ marginTop: '10px' }`. Keys are kebab-cased. Adds a hashed class and injects a `<style>` block. |
| `state(v)` | Set initial state for hydration. Element gets an id if missing. Hydration sets `textContent` (or `value` for `input`/`textarea`). |
| `computed(fn)` | Hydrate with `fn(window.state)`; `fn` is serialized and run in the browser. Element gets an id if missing. |
| `on(ev, fn)` | Attach client-side event; `ev` is event name (e.g. `'click'`). `fn` is serialized and run in the browser. Element gets an id if missing. |
| `bindState(target, ev, fn)` | Like `on(ev, fn)` but for updating another element’s state. In `fn`, use the literal string `'__STATE_ID__'` where you need the target’s id; it is replaced at compile time with `target`’s id. |

**Read-only**

- `el.attrs` – Object of attributes (e.g. `el.attrs.id`, `el.attrs.class`).
- `el.tag` – Normalized tag name (kebab-case).

**Example**

```javascript
const div = doc.create('div').id('root').css({ padding: '1rem' }).text('Hello');
const btn = doc.create('button').text('Click').on('click', function() { console.log('ok'); });
div.append(btn);
```

---

### Head

Accessed as `doc.head`. Usually configured via `Document` methods (`title`, `addMeta`, etc.). Advanced usage:

| Method | Description |
|--------|-------------|
| `setTitle(t)` | Set title (escaped). |
| `addMeta(m)` | Add one meta object. |
| `addLink(href)` | Add stylesheet link (no duplicates). |
| `addStyle(css)` | Add raw CSS string. |
| `addScript(src)` | Add script tag src. |
| `globalCss(selector, rules)` | Add a rule like `selector { ... }`; `rules` is an object (keys kebab-cased). |
| `addClass(name, rules)` | Define a class `.name` with `rules` object. |

---

### CONFIG

Global config object (read/write). Used by the compiler and caches.

| Property | Default | Description |
|----------|---------|-------------|
| `mode` | `'prod'` if `NODE_ENV=== 'production'`, else `'dev'` | `'prod'` minifies HTML. |
| `poolSize` | `150` | Max pooled items per type (elements, arrays, objects). |
| `cacheLimit` | `2000` | Max entries in response LRU cache. |
| `maxCssCache` | `1000` | Reserved. |
| `maxKebabCache` | `500` | Max kebab-case conversions cached. |
| `compression` | `true` | Used by `enableCompression` middleware. |

---

### createCachedRenderer(builderFn, cacheKeyOrFn)

Returns a middleware function `(req, res, next) => ...`.

- **builderFn**: `(req) => Document`. Must return a `Document` instance. The middleware sets cache options on it and calls `doc.render()`.
- **cacheKeyOrFn**: `string` or `(req) => string`. Cache key for the response. If it is `null`/`undefined`/`''`, caching is skipped and the document is built and sent once per request.
- Concurrent requests with the same key share one render (in-flight deduplication); the result is cached and sent to all waiters.

---

### clearCache(pattern?)

- **No argument**: Clears entire response cache and all in-flight keys.
- **`pattern` (string)**: Deletes every cache key that includes `pattern` (response cache and in-flight).

---

### enableCompression()

Returns a middleware that, when `Accept-Encoding` includes `gzip`, patches `res.send` to gzip string bodies longer than 1024 bytes. Call `next()` so the route still runs.

---

### responseCache

LRU cache instance used for full HTML responses. Methods: `get(key)`, `set(key, value)`, `has(key)`, `delete(key)`, `clear()`. Property `responseCache.cache` is the underlying `Map` (for iteration).

---

### warmupCache(routes)

Pre-renders routes to fill the response cache.

- **routes**: `Array<{ key: string, builder: () => Document }>`. `builder()` is called with no arguments and must return a `Document`.
- **Returns**: `Array<{ key, success: boolean, size?: number, error?: string }>`.

---

### getCacheStats()

Returns an object: `{ size, limit, usage, keys, poolStats }` for the response cache and pool counts.

---

## Quick BuildHTML Examples

Here’s how to use **BuildHTML** in an Express server for fast SSR.

```javascript
const express = require('express');
const { Document, createCachedRenderer, clearCache, enableCompression } = require('buildhtml');

const app = express();

// -----------------------------------------------------------------------------
// 1️⃣ Basic Route (No Cache)
// -----------------------------------------------------------------------------
app.get('/', (req, res) => {
  const doc = new Document();
  doc.title('Home Page');

  const heading = doc.create('h1').text('Welcome to BuildHTML!');
  const subtitle = doc.create('p').text('Ultra-fast server-side rendering');

  doc.use(heading).use(subtitle);
  res.send(doc.render());
});

// -----------------------------------------------------------------------------
// 2️⃣ Cached Static Route
// -----------------------------------------------------------------------------
app.get('/about', createCachedRenderer(() => {
  const doc = new Document({ cache: true, cacheKey: 'about' });
  doc.title('About Us');

  const content = doc.create('p').text('This page is cached for performance.');
  doc.use(content);
  return doc;
}, 'about'));

// -----------------------------------------------------------------------------
// 3️⃣ Dynamic Route with Params (Cached per User)
// -----------------------------------------------------------------------------
app.get('/user/:name', createCachedRenderer((req) => {
  const doc = new Document({ cache: true, cacheKey: `user-${req.params.name}` });
  doc.title(`Profile - ${req.params.name}`);

  const greeting = doc.create('h1').text(`Hello, ${req.params.name}!`);
  doc.use(greeting);

  return doc;
}, (req) => `user-${req.params.name}`));

// -----------------------------------------------------------------------------
// 4️⃣ Interactive Counter (No Cache, With State)
// -----------------------------------------------------------------------------
app.get('/counter', (req, res) => {
  const doc = new Document();
  doc.title('Counter App');

  const counter = doc.create('div').state(0);
  const incBtn = doc.create('button').text('+');
  incBtn.bindState(counter, 'click', function() {
    const id = '__STATE_ID__';
    window.state[id] = parseInt(window.state[id]) + 1;
    document.getElementById(id).textContent = window.state[id];
  });
  doc.use(counter).use(incBtn);

  res.send(doc.render());
});

// Start server
app.listen(3000, () => console.log('Server running on http://localhost:3000'));
````

### Key Points

* **`Document`** – Core HTML builder.
* **`createCachedRenderer`** – Cache static or dynamic pages for ultra-fast responses.
* **Stateful elements** – `.state()` allows dynamic, interactive content.
* **Express-friendly** – Integrates with your server routes seamlessly.
* **`clearCache()`** – Manually clear cached pages when content changes.

### Limitations

* **Hydration** – Event and computed handlers are serialized with `.toString()` and run in the browser. Don’t rely on closures over server-side variables; use `__STATE_ID__` with `bindState()` for target elements.
* **State display** – `.state()` hydrates `textContent` on normal elements and `value` on `<input>`/`<textarea>`. For form inputs, use `.value` in your event handler when updating from user input.
* **Caching** – Concurrent requests for the same key share one render (in-flight deduplication); `clearCache()` also clears in-flight entries.

---

## License

**[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)** – You are free to use and modify BuildHTML **for non-commercial projects**, as long as you give credit to the original author (0trebor0).

---
