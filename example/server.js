const express = require('express');
const { Document, createCachedRenderer, getCacheStats } = require('./Sculptor');

const app = express();
const PORT = 3000;

// ==============================================
// EXAMPLE 1: Basic Route (No Caching)
// ==============================================
app.get('/', (req, res) => {
  const doc = new Document();
  doc.title('Home Page');
  
  doc.create('h1').text('Welcome to Sculptor.js');
  doc.create('p').text('Server-rendered page created on each request');
  
  const html = doc.render();
  res.send(html);
});

// ==============================================
// EXAMPLE 2: Dynamic Content (User-specific)
// ==============================================
app.get('/user/:name', (req, res) => {
  const doc = new Document();
  doc.title(`Profile - ${req.params.name}`);
  doc.state('userName', req.params.name);
  
  const header = doc.create('header');
  header.create('h1').bind('userName', (name) => `Welcome, ${name}!`);
  
  const content = doc.create('div');
  content.create('p').text(`This page was generated for: ${req.params.name}`);
  content.create('p').text(`Time: ${new Date().toISOString()}`);
  
  const html = doc.render();
  res.send(html);
});

// ==============================================
// EXAMPLE 3: Cached Static Pages
// ==============================================
app.get('/about', createCachedRenderer(
  async (req) => {
    const doc = new Document();
    doc.title('About Us');
    
    doc.create('h1').text('About Sculptor.js');
    doc.create('p').text('High-performance SSR framework for Node.js');
    doc.create('p').text('This page is cached for better performance');
    
    return doc;
  },
  'about-page' // Cache key
));

// ==============================================
// EXAMPLE 4: Counter App (With State)
// ==============================================
app.get('/counter', (req, res) => {
  const doc = new Document();
  doc.title('Counter App');
  doc.state('count', 0);
  
  const app = doc.create('div');
  app.css({ 
    maxWidth: '400px', 
    margin: '50px auto',
    textAlign: 'center',
    fontFamily: 'Arial'
  });
  
  app.create('h1').text('Counter Demo');
  
  const display = app.create('div');
  display.css({ fontSize: '48px', margin: '20px' });
  display.bind('count', (val) => `Count: ${val}`);
  
  const buttons = app.create('div');
  
  buttons.create('button')
    .text('- Decrement')
    .css({ padding: '10px 20px', margin: '5px', cursor: 'pointer' })
    .on('click', () => { State.count--; });
  
  buttons.create('button')
    .text('Reset')
    .css({ padding: '10px 20px', margin: '5px', cursor: 'pointer' })
    .on('click', () => { State.count = 0; });
  
  buttons.create('button')
    .text('+ Increment')
    .css({ padding: '10px 20px', margin: '5px', cursor: 'pointer' })
    .on('click', () => { State.count++; });
  
  const html = doc.render();
  res.send(html);
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
    
    const doc = new Document();
    doc.title(`Products - ${category}`);
    
    doc.create('h1').text(`${category} Products`);
    
    const list = doc.create('ul');
    items.forEach(item => {
      const li = list.create('li');
      li.text(`${item.name} - $${item.price}`);
    });
    
    return doc;
  },
  (req) => `products-${req.params.category}` // Dynamic cache key
));

// ==============================================
// EXAMPLE 6: API Data (Server-Side Fetch)
// ==============================================
app.get('/api-demo', async (req, res) => {
  const doc = new Document();
  doc.title('API Demo');
  
  // Simulate API call
  const apiData = await new Promise(resolve => {
    setTimeout(() => {
      resolve({ users: 150, posts: 1234, comments: 5678 });
    }, 50);
  });
  
  doc.state('stats', apiData);
  
  const app = doc.create('div');
  app.create('h1').text('API Statistics');
  
  const stats = doc.create('div');
  stats.text(`Users: ${apiData.users}, Posts: ${apiData.posts}, Comments: ${apiData.comments}`);
  
  const html = doc.render();
  res.send(html);
});

// ==============================================
// EXAMPLE 7: With JSON Embedded (for hydration)
// ==============================================
app.get('/spa', (req, res) => {
  const doc = new Document();
  doc.title('SPA Demo');
  doc.state('page', 'home');
  
  const app = doc.create('div');
  app.create('h1').text('Single Page App Demo');
  app.create('p').bind('page', (p) => `Current page: ${p}`);
  
  const nav = app.create('nav');
  ['home', 'about', 'contact'].forEach(page => {
    nav.create('button')
      .text(page)
      .css({ margin: '5px', padding: '10px' })
      .on('click', () => { State.page = page; });
  });
  
  // Render with JSON for client-side reactivity
  const html = doc.renderJSON({ encrypt: true });
  res.send(html);
});

// ==============================================
// PERFORMANCE MONITORING
// ==============================================
app.get('/stats', (req, res) => {
  const stats = getCacheStats();
  res.json(stats);
});

// ==============================================
// BENCHMARK ROUTE
// ==============================================
app.get('/benchmark', async (req, res) => {
  const results = {
    simple: {},
    complex: {},
    cached: {},
    encrypted: {}
  };
  
  // Test 1: Simple page
  const start1 = Date.now();
  for (let i = 0; i < 100; i++) {
    const doc = new Document();
    doc.create('div').text('Hello World');
    doc.render();
  }
  results.simple = {
    iterations: 100,
    time: Date.now() - start1,
    avgPerRequest: ((Date.now() - start1) / 100).toFixed(2) + 'ms'
  };
  
  // Test 2: Complex page
  const start2 = Date.now();
  for (let i = 0; i < 100; i++) {
    const doc = new Document();
    doc.state('count', 0);
    for (let j = 0; j < 50; j++) {
      const div = doc.create('div');
      div.css({ color: 'red' });
      div.create('button').on('click', () => { State.count++; });
    }
    doc.render();
  }
  results.complex = {
    iterations: 100,
    elements: 100, // 50 divs + 50 buttons
    time: Date.now() - start2,
    avgPerRequest: ((Date.now() - start2) / 100).toFixed(2) + 'ms'
  };
  
  // Test 3: With encryption
  const start3 = Date.now();
  for (let i = 0; i < 100; i++) {
    const doc = new Document();
    doc.state('data', { test: 'value' });
    doc.renderJSON({ encrypt: true });
  }
  results.encrypted = {
    iterations: 100,
    time: Date.now() - start3,
    avgPerRequest: ((Date.now() - start3) / 100).toFixed(2) + 'ms'
  };
  
  // Memory usage
  results.memory = {
    heapUsed: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + 'MB',
    heapTotal: (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2) + 'MB'
  };
  
  res.json(results);
});

// ==============================================
// START SERVER
// ==============================================
app.listen(PORT, () => {
  console.log('==============================================');
  console.log('Sculptor.js Express Example');
  console.log('==============================================\n');
  console.log(`Server running at http://localhost:${PORT}\n`);
  console.log('Routes:');
  console.log(`  GET /              - Basic home page`);
  console.log(`  GET /user/:name    - Dynamic user page`);
  console.log(`  GET /about         - Cached static page`);
  console.log(`  GET /counter       - Interactive counter`);
  console.log(`  GET /products/:cat - Cached product list`);
  console.log(`  GET /api-demo      - API data integration`);
  console.log(`  GET /spa           - SPA with JSON`);
  console.log(`  GET /stats         - Cache statistics`);
  console.log(`  GET /benchmark     - Performance test\n`);
  console.log('Try:');
  console.log(`  curl http://localhost:${PORT}/benchmark`);
  console.log(`  curl http://localhost:${PORT}/stats\n`);
});

module.exports = app;
