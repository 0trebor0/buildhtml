const express = require('express');
const { page, createCachedRenderer, getCacheStats } = require('../');

const app = express();
const PORT = 3000;

// ==============================================
// EXAMPLE 1: Basic Route (No Caching)
// ==============================================
app.get('/', (_req, res) => {
  const doc = page('Home Page');

  doc.h1().text('Welcome to buildhtml');
  doc.p().text('Server-rendered page created on each request');

  res.send(doc.render());
});

// ==============================================
// EXAMPLE 2: Dynamic Content (User-specific)
// ==============================================
app.get('/user/:name', (req, res) => {
  const doc = page(`Profile - ${req.params.name}`);
  doc.state('userName', req.params.name);

  const header = doc.create('header');
  header.h1().bind('userName', (name) => `Welcome, ${name}!`);

  const content = doc.div();
  content.p().text(`This page was generated for: ${req.params.name}`);
  content.p().text(`Time: ${new Date().toISOString()}`);

  res.send(doc.render());
});

// ==============================================
// EXAMPLE 3: Cached Static Pages
// ==============================================
app.get('/about', createCachedRenderer(
  async (_req) => {
    const doc = page('About Us');

    doc.h1().text('About buildhtml');
    doc.p().text('High-performance SSR framework for Node.js');
    doc.p().text('This page is cached for better performance');

    return doc;
  },
  'about-page'
));

// ==============================================
// EXAMPLE 4: Counter App (With State)
// ==============================================
app.get('/counter', (_req, res) => {
  const doc = page('Counter App');
  doc.state('count', 0);

  const container = doc.div().css({
    maxWidth: '400px',
    margin: '50px auto',
    textAlign: 'center',
    fontFamily: 'Arial'
  });

  container.h1().text('Counter Demo');

  container.div()
    .css({ fontSize: '48px', margin: '20px' })
    .bind('count', (val) => `Count: ${val}`);

  const buttons = container.div();

  buttons.button()
    .text('- Decrement')
    .css({ padding: '10px 20px', margin: '5px', cursor: 'pointer' })
    .on('click', () => { State.count--; });

  buttons.button()
    .text('Reset')
    .css({ padding: '10px 20px', margin: '5px', cursor: 'pointer' })
    .on('click', () => { State.count = 0; });

  buttons.button()
    .text('+ Increment')
    .css({ padding: '10px 20px', margin: '5px', cursor: 'pointer' })
    .on('click', () => { State.count++; });

  res.send(doc.render());
});

// ==============================================
// EXAMPLE 5: Product List (Cached by Category)
// ==============================================
const products = {
  electronics: [
    { id: 1, name: 'Laptop', price: 999 },
    { id: 2, name: 'Phone', price: 699 },
    { id: 3, name: 'Tablet', price: 399 }
  ],
  books: [
    { id: 4, name: 'JavaScript Guide', price: 49 },
    { id: 5, name: 'Node.js Handbook', price: 59 },
    { id: 6, name: 'Web Design 101', price: 39 }
  ]
};

app.get('/products/:category', createCachedRenderer(
  async (req) => {
    const category = req.params.category;
    const items = products[category] || [];

    const doc = page(`Products - ${category}`);
    doc.h1().text(`${category} Products`);

    const list = doc.create('ul');
    items.forEach(item => {
      list.create('li').text(`${item.name} - $${item.price}`);
    });

    return doc;
  },
  (req) => `products-${req.params.category}`
));

// ==============================================
// EXAMPLE 6: API Data (Server-Side Fetch)
// ==============================================
app.get('/api-demo', async (_req, res) => {
  const doc = page('API Demo');

  // Simulate API call
  const apiData = await new Promise(resolve => {
    setTimeout(() => resolve({ users: 150, posts: 1234, comments: 5678 }), 50);
  });

  doc.state('stats', apiData);
  doc.h1().text('API Statistics');
  doc.div().text(`Users: ${apiData.users}, Posts: ${apiData.posts}, Comments: ${apiData.comments}`);

  res.send(doc.render());
});

// ==============================================
// EXAMPLE 7: SPA with client-side state
// ==============================================
app.get('/spa', (_req, res) => {
  const doc = page('SPA Demo');
  doc.state('page', 'home');

  const container = doc.div();
  container.h1().text('Single Page App Demo');
  container.p().bind('page', (p) => `Current page: ${p}`);

  const nav = container.create('nav');
  ['home', 'about', 'contact'].forEach(p => {
    nav.button()
      .text(p)
      .css({ margin: '5px', padding: '10px' })
      .on('click', () => { State.page = p; });
  });

  res.send(doc.render());
});

// ==============================================
// PERFORMANCE MONITORING
// ==============================================
app.get('/stats', (_req, res) => {
  res.json(getCacheStats());
});

// ==============================================
// BENCHMARK ROUTE
// ==============================================
app.get('/benchmark', async (_req, res) => {
  const { Document } = require('../');
  const results = {};

  // Test 1: Simple page
  let t = Date.now();
  for (let i = 0; i < 100; i++) {
    const doc = new Document();
    doc.div().text('Hello World');
    doc.render();
  }
  const simple = Date.now() - t;
  results.simple = { iterations: 100, totalMs: simple, avgMs: (simple / 100).toFixed(2) };

  // Test 2: Complex page
  t = Date.now();
  for (let i = 0; i < 100; i++) {
    const doc = new Document();
    doc.state('count', 0);
    for (let j = 0; j < 50; j++) {
      doc.div().css({ color: 'red' }).button().on('click', () => { State.count++; });
    }
    doc.render();
  }
  const complex = Date.now() - t;
  results.complex = { iterations: 100, elements: 100, totalMs: complex, avgMs: (complex / 100).toFixed(2) };

  results.memory = {
    heapUsedMB: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
    heapTotalMB: (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)
  };

  res.json(results);
});

// ==============================================
// START SERVER
// ==============================================
app.listen(PORT, () => {
  console.log('buildhtml Express Example');
  console.log(`\nServer running at http://localhost:${PORT}\n`);
  console.log('Routes:');
  console.log(`  GET /              - Basic home page`);
  console.log(`  GET /user/:name    - Dynamic user page`);
  console.log(`  GET /about         - Cached static page`);
  console.log(`  GET /counter       - Interactive counter`);
  console.log(`  GET /products/:cat - Cached product list`);
  console.log(`  GET /api-demo      - API data integration`);
  console.log(`  GET /spa           - SPA with client-side state`);
  console.log(`  GET /stats         - Cache statistics`);
  console.log(`  GET /benchmark     - Performance test\n`);
});

module.exports = app;
