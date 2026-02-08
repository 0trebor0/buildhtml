Here’s a polished `README.md` for **LightRender** that matches your project, tagline, and usage style:

````markdown
# LightRender

**Zero-dependency, ultra-fast server-side rendering (SSR) compiler.**  
*“Compile your HTML at lightning speed, without the bloat.”*

---

## Overview

LightRender is a lightweight SSR compiler for Node.js. It allows you to build HTML on the server with minimal memory usage and blazing-fast performance—without relying on heavy frameworks. Perfect for custom Node servers, static site generators, or optimized Express apps.

- **Zero dependencies** – Only Node.js required.  
- **Ultra-fast** – Optimized rendering and memory reuse.  
- **SSR-ready** – Easily manage state, computed values, and client-side hydration.  
- **Customizable** – Create elements, set styles, attach events, and more.  

---

## Installation

```bash
npm install lightrender
````

or via GitHub:

```bash
npm install github:0trebor0/lightrender
```

---

## Quick Start

```javascript
const { Document } = require('lightrender');

// Create a new document
const doc = new Document();

// Add elements
const counter = doc.createElement('div').text('0').state(0);
const button = doc.createElement('button').text('Increment');

button.on('click', () => {
  const id = counter.attrs.id;
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

* **Element creation**: `doc.createElement('div')`, `text()`, `append()`, `css()`.
* **State management**: `.state(value)` for server-generated state.
* **Computed values**: `.computed(fn)` for dynamic content.
* **Event binding**: `.on(event, fn)` and `.bindState(target, event, fn)`.
* **Optimized rendering**: Object pools, LRU caching, and minified output in production.
* **Client-side hydration**: Automatically generates JS to update states and events in the browser.

---
## Quick Express Examples

Here’s how to use **LightRender** in an Express server for fast SSR.

```javascript
const express = require('express');
const { Document, createCachedRenderer, clearCache, enableCompression } = require('lightrender');

const app = express();

// -----------------------------------------------------------------------------
// 1️⃣ Basic Route (No Cache)
// -----------------------------------------------------------------------------
app.get('/', (req, res) => {
  const doc = new Document();
  doc.title('Home Page');

  const heading = doc.createElement('h1').text('Welcome to LightRender!');
  const subtitle = doc.createElement('p').text('Ultra-fast server-side rendering');

  doc.use(heading).use(subtitle);
  res.send(doc.render());
});

// -----------------------------------------------------------------------------
// 2️⃣ Cached Static Route
// -----------------------------------------------------------------------------
app.get('/about', createCachedRenderer(() => {
  const doc = new Document({ cache: true, cacheKey: 'about' });
  doc.title('About Us');

  const content = doc.createElement('p').text('This page is cached for performance.');
  doc.use(content);
  return doc;
}, 'about'));

// -----------------------------------------------------------------------------
// 3️⃣ Dynamic Route with Params (Cached per User)
// -----------------------------------------------------------------------------
app.get('/user/:name', createCachedRenderer((req) => {
  const doc = new Document({ cache: true, cacheKey: `user-${req.params.name}` });
  doc.title(`Profile - ${req.params.name}`);

  const greeting = doc.createElement('h1').text(`Hello, ${req.params.name}!`);
  doc.use(greeting);

  return doc;
}, (req) => `user-${req.params.name}`));

// -----------------------------------------------------------------------------
// 4️⃣ Interactive Counter (No Cache, With State)
// -----------------------------------------------------------------------------
app.get('/counter', (req, res) => {
  const doc = new Document();
  doc.title('Counter App');

  const counter = doc.createElement('div').state(0);
  const incBtn = doc.createElement('button').text('+').on('click', function() {
    const id = '__STATE_ID__';
    window.state[id] = parseInt(window.state[id]) + 1;
    document.getElementById(id).textContent = window.state[id];
  });

  incBtn.bindState(counter, 'click', incBtn.events[0].fn);
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
---

## License

**[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)** – You are free to use and modify LightRender **for non-commercial projects**, as long as you give credit to the original author (0trebor0).

---
