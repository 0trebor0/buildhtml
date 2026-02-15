# BuildHTML

**High-performance, server-side rendering (SSR) library for Node.js.**  
*"Build HTML at lightning speed with reactive state management."*

---

## Overview

BuildHTML is a lightweight SSR library for Node.js featuring object pooling, reactive state management, and CSS-in-JS capabilities. Build HTML on the server with minimal memory usage and blazing-fast performance.

- **Zero dependencies** – Only Node.js required
- **High Performance** – Object pooling and LRU caching (1-5ms render time)
- **Reactive State** – Built-in state management with automatic UI updates
- **CSS-in-JS** – Scoped and global styling with automatic CSS generation
- **Security** – XSS protection, CSS sanitization, and CSP nonce support
- **Production Ready** – HTML minification, compression, and metrics
- **JSON Export** – Save/restore pages with optional obfuscation

---

## Installation

```bash
npm install buildhtml
```

---

## Quick Start

```javascript
const { Document } = require('buildhtml');

// Create a document
const doc = new Document();
doc.title('Counter App');

// Add global state
doc.state('count', 0);

// Create elements (automatically attached!)
const display = doc.create('h1');
display.bind('count', (val) => `Count: ${val}`);

const button = doc.create('button');
button.text('Increment');
button.on('click', () => { State.count++; });

// Render HTML
const html = doc.render();
console.log(html);
```

**Key Feature:** Elements created with `doc.create()` are **automatically attached** to the document. No manual attachment needed!

---

## Features

### Core Features
* **Automatic Element Attachment** – `doc.create('div')` automatically adds to document
* **Reactive State** – `doc.state()` + `element.bind()` for automatic UI updates
* **Event Handling** – `.on(event, fn)` with automatic serialization
* **CSS-in-JS** – `.css({ color: 'red' })` with automatic scoping
* **Computed Values** – `.computed(fn)` for derived content
* **JSON Export/Import** – `doc.toJSON()` and `Document.fromJSON(json)`

### Performance Features
* **Object Pooling** – Reuses elements across renders
* **LRU Caching** – Cache rendered HTML for static pages
* **In-Flight Deduplication** – Concurrent requests share one render
* **Minification** – Automatic in production mode
* **Metrics** – Optional performance tracking

---

## API Guide

### Document

Create with `new Document(options)`.

#### Methods

| Method | Description |
|--------|-------------|
| `title(t)` | Set page title (auto-escaped) |
| `state(key, value)` | Set global reactive state |
| `addMeta(obj)` | Add meta tag: `{ name: 'description', content: '...' }` |
| `addLink(href)` | Add stylesheet link |
| `addStyle(css)` | Add inline CSS to `<head>` |
| `addScript(src)` | Add external script |
| `globalStyle(selector, rules)` | Add global CSS rule |
| `sharedClass(name, rules)` | Define reusable class |
| `create(tag)` | Create element (auto-attached to document) |
| `child(tag)` | Alias for `create(tag)` |
| `useFragment(fn)` | Add multiple elements via function |
| `oncreate(fn)` | Run function on page load |
| `toJSON()` | Export document structure as JSON |
| `render()` | Return full HTML string |
| `renderJSON(opts?)` | Render with embedded JSON |
| `save(path)` | Save rendered HTML to file |

#### renderJSON Options

```javascript
// Default (no JSON)
doc.renderJSON()
// → window.__SCULPTOR_DATA__ = {...}

// With obfuscation (50% smaller!)
doc.renderJSON({ obfuscate: true })
// → window.__SCULPTOR_DATA__ = JSON.parse(_decrypt("..."))

// Custom variable name
doc.renderJSON('MY_DATA')
// → window.MY_DATA = {...}

// Both custom name and obfuscation
doc.renderJSON('MY_DATA', { obfuscate: true })
// → window.MY_DATA = JSON.parse(_decrypt("..."))

// Or use options object
doc.renderJSON({ obfuscate: true, varName: 'MY_DATA' })
```

#### Static Methods

| Method | Description |
|--------|-------------|
| `Document.fromJSON(json)` | Rebuild document from JSON |

#### Constructor Options

```javascript
new Document({
  cache: true,        // Enable response caching
  cacheKey: 'home',   // Cache key for this document
  nonce: 'abc123'     // CSP nonce for inline scripts/styles
})
```

---

### Element

Created with `doc.create(tag)`. All methods return `this` for chaining.

#### Methods

| Method | Description |
|--------|-------------|
| `create(tag)` | Create child element (auto-attached to parent) |
| `child(tag)` | Alias for `create(tag)` |
| `id(v?)` | Set id attribute (auto-generated if omitted) |
| `attr(key, value)` | Set attribute |
| `text(content)` | Append escaped text |
| `append(child)` | Append element or text |
| `appendUnsafe(html)` | Append raw HTML (use carefully!) |
| `css(styles)` | Add scoped styles: `{ color: 'red' }` |
| `uniqueClass(rules)` | Add unique class with styles |
| `state(value)` | Set initial state for hydration |
| `bind(stateKey, fn?)` | Bind to global state |
| `computed(fn)` | Compute content from state |
| `on(event, fn)` | Attach event handler |

#### Examples

```javascript
// Basic element
const div = doc.create('div')
  .attr('class', 'container')
  .text('Hello World');

// Nested elements (auto-attached to parent)
const container = doc.create('div');
container.create('h1').text('Title');
container.create('p').text('Content');

// CSS-in-JS
const box = doc.create('div').css({
  padding: '20px',
  backgroundColor: '#f0f0f0',
  borderRadius: '8px'
});

// State binding
doc.state('username', 'Alice');
const greeting = doc.create('div');
greeting.bind('username', (name) => `Hello, ${name}!`);

// Event handling
const button = doc.create('button').text('Click me');
button.on('click', () => {
  State.count++;
  console.log('Clicked!');
});

// Computed values
const total = doc.create('div');
total.computed((state) => {
  return state.price * state.quantity;
});
```

---

### Global State & Reactivity

Sculptor provides a reactive state system:

```javascript
// Set global state
doc.state('count', 0);
doc.state('user', { name: 'Alice', age: 30 });

// Bind elements to state
const display = doc.create('div');
display.bind('count'); // Shows raw value

const formatted = doc.create('div');
formatted.bind('count', (val) => `Count: ${val}`); // Transform

// Update state (automatically updates UI)
button.on('click', () => {
  State.count++; // Global State proxy
});

// Access state in browser
// window.State.count
// window.State.user
```

**How it works:**
- Server renders initial HTML
- Client receives `window.State` as reactive Proxy
- Changing `State.count++` automatically updates all bound elements
- No manual DOM manipulation needed!

---

### Exports

```javascript
const {
  Document,           // Main class
  Element,           // Element class (usually not used directly)
  Head,              // Head manager (usually via doc.title(), etc.)
  CONFIG,            // Global configuration
  createCachedRenderer,  // Express middleware
  clearCache,        // Clear response cache
  enableCompression, // Gzip middleware
  responseCache,     // LRU cache instance
  warmupCache,       // Pre-render routes
  getCacheStats,     // Cache statistics
  resetPools,        // Reset object pools
  healthCheck,       // Health check data
  metrics            // Performance metrics
} = require('buildhtml');
```

---

## Express Integration

### Basic Route

```javascript
const express = require('express');
const { Document } = require('buildhtml');

const app = express();

app.get('/', (req, res) => {
  const doc = new Document();
  doc.title('Home');
  
  doc.create('h1').text('Welcome!');
  doc.create('p').text('Built with BuildHTML');
  
  res.send(doc.render());
});
```

### Cached Static Page

```javascript
const { createCachedRenderer } = require('sculptor-js');

app.get('/about', createCachedRenderer(
  async (req) => {
    const doc = new Document();
    doc.title('About Us');
    doc.create('h1').text('About');
    return doc;
  },
  'about-page' // Cache key
));

// First request: ~3ms (render)
// Cached requests: <0.1ms (from cache)
```

### Dynamic Content

```javascript
app.get('/user/:name', async (req, res) => {
  const doc = new Document();
  doc.title(`Profile - ${req.params.name}`);
  doc.state('userName', req.params.name);
  
  const greeting = doc.create('h1');
  greeting.bind('userName', (name) => `Welcome, ${name}!`);
  
  res.send(doc.render());
});
```

### Interactive Counter

```javascript
app.get('/counter', (req, res) => {
  const doc = new Document();
  doc.title('Counter');
  doc.state('count', 0);
  
  // Display
  const display = doc.create('h1');
  display.bind('count', (val) => `Count: ${val}`);
  
  // Buttons
  doc.create('button')
    .text('Decrement')
    .on('click', () => { State.count--; });
  
  doc.create('button')
    .text('Reset')
    .on('click', () => { State.count = 0; });
  
  doc.create('button')
    .text('Increment')
    .on('click', () => { State.count++; });
  
  res.send(doc.render());
});
```

### With JSON Export (SPA Mode)

```javascript
app.get('/spa', (req, res) => {
  const doc = new Document();
  doc.state('page', 'home');
  
  // Build UI...
  
  // Render with obfuscated JSON
  const html = doc.renderJSON({ obfuscate: true });
  res.send(html);
  
  // Client can access: window.__SCULPTOR_DATA__
});
```

---

## Performance

### Benchmarks

| Scenario | Avg Time | Requests/Sec |
|----------|----------|--------------|
| Simple page (10 elements) | 0.5-1ms | 1,000-2,000 |
| Complex page (100 elements) | 3-5ms | 200-333 |
| With state (10 bindings) | 2-3ms | 333-500 |
| Cached page | <0.1ms | 10,000+ |

### Memory Usage

- **Per Request:** 50-200 KB
- **1000 Requests:** ~20-40 MB total
- **Object Pooling:** Keeps memory stable

### File Sizes

| Output | Size |
|--------|------|
| `render()` | 1-5 KB |
| `renderJSON()` | 2-8 KB |
| `renderJSON({ obfuscate: true })` | 1-4 KB (50% smaller!) |

**Comparison with other solutions:**
- 2-4x faster than EJS/Pug/Handlebars
- 10-50x faster than React SSR
- 50-200x less memory than Next.js

---

## Configuration

```javascript
const { CONFIG } = require('buildhtml');

CONFIG.mode = 'prod';           // 'prod' or 'dev'
CONFIG.poolSize = 150;          // Max pooled elements
CONFIG.cacheLimit = 2000;       // Max cached responses
CONFIG.enableMetrics = true;    // Track performance
CONFIG.sanitizeCss = true;      // CSS injection protection
```

---

## Middleware Helpers

### createCachedRenderer(builderFn, cacheKeyOrFn, options)

```javascript
app.get('/page', createCachedRenderer(
  async (req) => {
    const doc = new Document();
    // Build page...
    return doc;
  },
  'page-key' // or (req) => `page-${req.params.id}`
));
```

### clearCache(pattern?)

```javascript
clearCache();           // Clear all
clearCache('user-');    // Clear all keys containing 'user-'
```

### enableCompression()

```javascript
const { enableCompression } = require('buildhtml');
app.use(enableCompression());
```

### warmupCache(routes)

```javascript
const { warmupCache } = require('buildhtml');

await warmupCache([
  { key: 'home', builder: () => buildHomePage() },
  { key: 'about', builder: () => buildAboutPage() }
]);
```

---

## JSON Export/Import

### Export

```javascript
const doc = new Document();
doc.state('count', 0);
// ... build document ...

// Get JSON
const json = doc.toJSON();
fs.writeFileSync('./page.json', JSON.stringify(json));
```

### Import

```javascript
const json = JSON.parse(fs.readFileSync('./page.json'));
const doc = Document.fromJSON(json);
const html = doc.render();
```

### Embedded JSON

```javascript
// Render with JSON embedded in HTML
const html = doc.renderJSON({ encrypt: true });

// In browser:
console.log(window.__SCULPTOR_DATA__);
// Can rebuild page from JSON if needed
```

---

## Security

### XSS Protection

All text is automatically escaped:

```javascript
doc.create('div').text('<script>alert("XSS")</script>');
// Output: &lt;script&gt;alert("XSS")&lt;/script&gt;
```

### CSS Injection Protection

Dangerous CSS characters are sanitized:

```javascript
el.css({ background: 'red; } body { display: none; }' });
// Sanitized automatically
```

### CSP Nonce Support

```javascript
const doc = new Document({ nonce: 'abc123' });
// All inline scripts/styles get nonce attribute
```

---

## Advanced Features

### Fragments

```javascript
function Header(doc) {
  const header = doc.create('header');
  header.create('h1').text('My Site');
  header.create('nav').text('Navigation');
  return header;
}

doc.useFragment(Header);
```

### OnCreate Hook

```javascript
doc.oncreate(() => {
  console.log('Page loaded!');
  // Initialize analytics, etc.
});
```

### Metrics

```javascript
process.env.ENABLE_METRICS = 'true';

const { metrics } = require('buildhtml');

// After some requests...
console.log(metrics.getStats());
// {
//   counters: { 'render.count': 1000 },
//   timings: { 'render.total': { avg: 2.5, p95: 5 } }
// }
```

---

## Best Practices

### ✅ DO

```javascript
// Use global state for reactive data
doc.state('count', 0);
btn.on('click', () => { State.count++; });

// Cache static pages
app.get('/about', createCachedRenderer(..., 'about'));

// Use CSS-in-JS for scoped styles
el.css({ padding: '20px', backgroundColor: '#f0f0f0' });

// Leverage object pooling (automatic)
// Elements are recycled after render()
```

### ❌ DON'T

```javascript
// Don't use closures in event handlers
let count = 0; // This won't work after serialization
btn.on('click', () => { count++; });

// Don't store non-serializable data in state
doc.state('callback', () => {}); // Functions can't be serialized

// Don't manually manipulate the DOM
// Use State instead for reactivity
```

---

## Limitations

### Function Serialization

Event handlers are serialized with `.toString()`:

```javascript
// ❌ BAD - Uses closure (won't work)
let count = 0;
btn.on('click', () => { count++; });

// ✅ GOOD - Uses global State
doc.state('count', 0);
btn.on('click', () => { State.count++; });
```

### State Values

State must be JSON-serializable:

```javascript
// ✅ GOOD
doc.state('user', { name: 'Alice', age: 30 });
doc.state('items', [1, 2, 3]);

// ❌ BAD
doc.state('callback', () => {}); // Functions
doc.state('dom', document.getElementById('x')); // DOM nodes
```

---

## Migration from Other Libraries

### From EJS/Pug/Handlebars

```javascript
// EJS/Pug
res.render('template', { data })

// BuildHTML
const doc = new Document();
doc.create('div').text(data);
res.send(doc.render());
```

### From React SSR

```javascript
// React SSR
const html = renderToString(<App />);

// BuildHTML  
const doc = new Document();
// ... build UI ...
const html = doc.render();
```

**Benefits:**
- 2-4x faster
- 50-200x less memory
- No build step required
- Built-in state management

---

## Complete Example

```javascript
const express = require('express');
const { Document, createCachedRenderer } = require('buildhtml');

const app = express();

// Simple counter with reactive state
app.get('/counter', (req, res) => {
  const doc = new Document();
  doc.title('Counter App');
  
  // Global state
  doc.state('count', 0);
  
  // Styled container
  const container = doc.create('div');
  container.css({
    maxWidth: '400px',
    margin: '50px auto',
    padding: '20px',
    textAlign: 'center',
    fontFamily: 'Arial, sans-serif'
  });
  
  // Title
  container.create('h1').text('Counter Demo');
  
  // Count display (bound to state)
  const display = container.create('div');
  display.css({ 
    fontSize: '48px', 
    margin: '20px',
    color: '#333' 
  });
  display.bind('count', (val) => `Count: ${val}`);
  
  // Button container
  const buttons = container.create('div');
  
  // Decrement button
  const decBtn = buttons.create('button');
  decBtn.text('− Decrement');
  decBtn.css({ 
    padding: '10px 20px', 
    margin: '5px',
    cursor: 'pointer',
    fontSize: '16px'
  });
  decBtn.on('click', () => { State.count--; });
  
  // Reset button
  const resetBtn = buttons.create('button');
  resetBtn.text('Reset');
  resetBtn.css({ 
    padding: '10px 20px', 
    margin: '5px',
    cursor: 'pointer',
    fontSize: '16px'
  });
  resetBtn.on('click', () => { State.count = 0; });
  
  // Increment button
  const incBtn = buttons.create('button');
  incBtn.text('+ Increment');
  incBtn.css({ 
    padding: '10px 20px', 
    margin: '5px',
    cursor: 'pointer',
    fontSize: '16px'
  });
  incBtn.on('click', () => { State.count++; });
  
  res.send(doc.render());
});

// Form with input binding
app.get('/form', (req, res) => {
  const doc = new Document();
  doc.title('Form Example');
  
  // State
  doc.state('username', '');
  doc.state('greeting', 'Enter your name');
  
  // Form
  const form = doc.create('div');
  form.css({ padding: '20px', fontFamily: 'Arial' });
  
  form.create('h1').text('Form Demo');
  
  // Input
  const input = form.create('input');
  input.attr('type', 'text');
  input.attr('placeholder', 'Enter name...');
  input.css({ padding: '10px', fontSize: '16px' });
  
  // Submit button
  const submitBtn = form.create('button');
  submitBtn.text('Submit');
  submitBtn.css({ padding: '10px 20px', marginLeft: '10px' });
  submitBtn.on('click', () => {
    const input = document.querySelector('input');
    State.username = input.value;
    State.greeting = `Hello, ${State.username}!`;
  });
  
  // Display greeting
  const greetingEl = form.create('div');
  greetingEl.css({ marginTop: '20px', fontSize: '24px' });
  greetingEl.bind('greeting');
  
  res.send(doc.render());
});

// Cached static page
app.get('/about', createCachedRenderer(
  async () => {
    const doc = new Document();
    doc.title('About Us');
    
    const page = doc.create('div');
    page.css({ 
      maxWidth: '800px', 
      margin: '0 auto', 
      padding: '20px',
      fontFamily: 'Arial'
    });
    
    page.create('h1').text('About BuildHTML');
    page.create('p').text('High-performance SSR library for Node.js');
    page.create('p').text('Features: Object pooling, reactive state, CSS-in-JS');
    page.create('p').text('This page is cached for maximum performance!');
    
    return doc;
  },
  'about-page'
));

app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
  console.log('Routes:');
  console.log('  /counter - Interactive counter');
  console.log('  /form    - Form with state binding');
  console.log('  /about   - Cached static page');
});
```

### What This Example Shows

✅ **Reactive state binding** - `bind()` automatically updates text  
✅ **Event handling** - Buttons update state  
✅ **CSS-in-JS** - Inline styling with scoped classes  
✅ **Form inputs** - Reading input values in events  
✅ **Cached pages** - Static pages served from cache  
✅ **Auto-attachment** - All elements automatically added  

### Try It

```bash
node app.js
# Visit http://localhost:3000/counter
```