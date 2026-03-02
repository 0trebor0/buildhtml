const { Document, Element, Head, CONFIG, createCachedRenderer, clearCache, enableCompression, responseCache, warmupCache, getCacheStats } = require('./index.js');

console.log('=== LightRender Debug Test Suite ===\n');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  Error: ${err.message}`);
    console.error(`  Stack: ${err.stack}`);
    testsFailed++;
  }
}

// Test 1: Basic Document creation and rendering
test('Basic Document creation and rendering', () => {
  const doc = new Document();
  doc.title('Test Page');
  const h1 = doc.create('h1').text('Hello World');
  doc.use(h1);
  const html = doc.render();
  if (!html.includes('<h1>Hello World</h1>')) throw new Error('Missing h1 element');
  if (!html.includes('<title>Test Page</title>')) throw new Error('Missing title');
  if (!html.includes('<!DOCTYPE html>')) throw new Error('Missing DOCTYPE');
});

// Test 2: Element chaining
test('Element method chaining', () => {
  const doc = new Document();
  const div = doc.create('div').id('test').text('Content');
  if (div.attrs.id !== 'test') throw new Error('ID not set');
  if (div.children.length !== 1) throw new Error('Text not added');
});

// Test 3: CSS scoping
test('CSS scoping with hash classes', () => {
  const doc = new Document();
  const el = doc.create('div').css({ marginTop: '10px', padding: '5px' });
  if (!el.attrs.class) throw new Error('Class not added');
  if (!el.cssText.includes('margin-top:10px')) throw new Error('CSS not kebab-cased');
  if (!el.cssText.includes('padding:5px')) throw new Error('CSS missing padding');
});

// Test 4: State management
test('State management and hydration', () => {
  const doc = new Document();
  const counter = doc.create('div').state(42);
  if (!counter.attrs.id) throw new Error('State element missing auto-generated ID');
  if (counter._state !== 42) throw new Error('State value not stored');
  doc.use(counter);
  const html = doc.render();
  if (!html.includes('window.state')) throw new Error('State hydration script missing');
  if (!html.includes('42')) throw new Error('State value not in HTML');
});

// Test 5: Computed values (CRITICAL - tests the bug fix)
test('Computed values method (bug fix verification)', () => {
  const doc = new Document();
  const el = doc.create('div').computed((state) => 'computed value');
  if (typeof el.computed !== 'function') throw new Error('computed method shadowed by property!');
  if (!el._computed) throw new Error('_computed internal property not set');
  if (!el.attrs.id) throw new Error('Computed element missing auto-generated ID');
  doc.use(el);
  const html = doc.render();
  if (!html.includes('computed value')) throw new Error('Computed function not serialized');
});

// Test 6: Event binding
test('Event binding with .on()', () => {
  const doc = new Document();
  const btn = doc.create('button').text('Click').on('click', function() { console.log('clicked'); });
  if (!btn.attrs.id) throw new Error('Event element missing ID');
  if (btn.events.length !== 1) throw new Error('Event not registered');
  doc.use(btn);
  const html = doc.render();
  if (!html.includes('addEventListener')) throw new Error('Event listener not in HTML');
});

// Test 7: bindState with __STATE_ID__ replacement
test('bindState with __STATE_ID__ replacement', () => {
  const doc = new Document();
  const target = doc.create('div').state(0);
  const btn = doc.create('button').text('+');
  btn.bindState(target, 'click', function() {
    const id = '__STATE_ID__';
    window.state[id] = parseInt(window.state[id]) + 1;
  });
  doc.use(target).use(btn);
  const html = doc.render();
  if (html.includes('__STATE_ID__')) throw new Error('__STATE_ID__ not replaced');
  if (!html.includes(target.attrs.id)) throw new Error('Target ID not in event handler');
});

// Test 8: XSS escaping
test('XSS escaping in text and attributes', () => {
  const doc = new Document();
  const el = doc.create('div').text('<script>alert("xss")</script>');
  el.attrs.title = '<img src=x onerror=alert(1)>';
  doc.use(el);
  const html = doc.render();
  if (html.includes('<script>alert')) throw new Error('Script tag not escaped in text');
  if (html.includes('onerror=alert(1)>')) throw new Error('Attribute not escaped (raw onerror found)');
  if (!html.includes('&lt;script&gt;')) throw new Error('< not escaped to &lt;');
  if (!html.includes('&lt;img')) throw new Error('< in attribute not escaped');
  if (!html.includes('&quot;')) throw new Error('Quotes not escaped');
});

// Test 9: Void elements (no closing tag)
test('Void elements rendering', () => {
  const doc = new Document();
  const input = doc.create('input');
  input.attrs.type = 'text';
  doc.use(input);
  const html = doc.render();
  if (html.includes('</input>')) throw new Error('Void element has closing tag');
  if (!html.includes('<input')) throw new Error('Input element missing');
});

// Test 10: Nested elements
test('Nested element rendering', () => {
  const doc = new Document();
  const parent = doc.create('div');
  const child1 = doc.create('span').text('Child 1');
  const child2 = doc.create('span').text('Child 2');
  parent.append(child1).append(child2);
  doc.use(parent);
  const html = doc.render();
  if (!html.includes('<div><span>Child 1</span><span>Child 2</span></div>')) throw new Error('Nested structure incorrect');
});

// Test 11: useFragment composition
test('useFragment composition', () => {
  const doc = new Document();
  const layout = (doc) => {
    const header = doc.create('header').text('Header');
    const main = doc.create('main').text('Main');
    return [header, main];
  };
  doc.useFragment(layout);
  const html = doc.render();
  if (!html.includes('<header>Header</header>')) throw new Error('Header missing from fragment');
  if (!html.includes('<main>Main</main>')) throw new Error('Main missing from fragment');
});

// Test 12: Head methods
test('Head meta, link, script methods', () => {
  const doc = new Document();
  doc.addMeta({ name: 'description', content: 'Test' });
  doc.addLink('https://example.com/style.css');
  doc.addScript('https://example.com/script.js');
  const html = doc.render();
  if (!html.includes('<meta name="description" content="Test"')) throw new Error('Meta tag missing');
  if (!html.includes('<link rel="stylesheet" href="https://example.com/style.css">')) throw new Error('Link tag missing');
  if (!html.includes('<script src="https://example.com/script.js">')) throw new Error('Script tag missing');
});

// Test 13: LRU Cache basic operations
test('LRU Cache get/set/delete', () => {
  responseCache.clear();
  responseCache.set('key1', 'value1');
  responseCache.set('key2', 'value2');
  if (responseCache.get('key1') !== 'value1') throw new Error('Cache get failed');
  responseCache.delete('key1');
  if (responseCache.get('key1') !== null) throw new Error('Cache delete failed');
  responseCache.clear();
  if (responseCache.get('key2') !== null) throw new Error('Cache clear failed');
});

// Test 14: clearCache pattern matching
test('clearCache with pattern', () => {
  responseCache.clear();
  responseCache.set('user-alice', 'html1');
  responseCache.set('user-bob', 'html2');
  responseCache.set('page-home', 'html3');
  clearCache('user-');
  if (responseCache.get('user-alice') !== null) throw new Error('Pattern delete failed for alice');
  if (responseCache.get('user-bob') !== null) throw new Error('Pattern delete failed for bob');
  if (responseCache.get('page-home') !== 'html3') throw new Error('Non-matching key was deleted');
  responseCache.clear();
});

// Test 15: warmupCache
test('warmupCache pre-rendering', () => {
  responseCache.clear();
  const routes = [
    {
      key: 'home',
      builder: () => {
        const doc = new Document({ cache: true, cacheKey: 'home' });
        doc.title('Home');
        doc.use(doc.create('h1').text('Welcome'));
        return doc;
      }
    }
  ];
  const results = warmupCache(routes);
  if (results.length !== 1) throw new Error('Wrong number of results');
  if (!results[0].success) throw new Error('Warmup failed');
  if (!responseCache.get('home')) throw new Error('Cache not populated');
  responseCache.clear();
});

// Test 16: getCacheStats
test('getCacheStats returns correct structure', () => {
  responseCache.clear();
  responseCache.set('test', 'value');
  const stats = getCacheStats();
  if (typeof stats.size !== 'number') throw new Error('Missing size');
  if (typeof stats.limit !== 'number') throw new Error('Missing limit');
  if (typeof stats.usage !== 'string') throw new Error('Missing usage');
  if (!Array.isArray(stats.keys)) throw new Error('Missing keys array');
  if (!stats.poolStats) throw new Error('Missing poolStats');
  responseCache.clear();
});

// Test 17: Kebab-case conversion
test('Kebab-case conversion for CSS and tags', () => {
  const doc = new Document();
  const el = doc.create('myCustomElement');
  if (el.tag !== 'my-custom-element') throw new Error('Tag not kebab-cased');
  const el2 = doc.create('div').css({ backgroundColor: 'red' });
  if (!el2.cssText.includes('background-color')) throw new Error('CSS property not kebab-cased');
});

// Test 18: Element pooling and recycling
test('Element pooling and recycling', () => {
  const doc = new Document();
  const el1 = doc.create('div').text('Test');
  doc.use(el1);
  doc.render(); // This should recycle el1
  const el2 = doc.create('span'); // Should reuse pooled element
  if (el2.tag !== 'span') throw new Error('Recycled element not reset properly');
  if (el2.children.length !== 0) throw new Error('Recycled element has leftover children');
});

// Test 19: Production mode minification
test('Production mode HTML minification', () => {
  const originalMode = CONFIG.mode;
  CONFIG.mode = 'prod';
  const doc = new Document();
  doc.use(doc.create('div').text('Test'));
  const html = doc.render();
  if (html.includes('  ')) throw new Error('HTML not minified (contains double spaces)');
  CONFIG.mode = originalMode;
});

// Test 20: Multiple state elements
test('Multiple state elements in one document', () => {
  const doc = new Document();
  const el1 = doc.create('div').state('value1');
  const el2 = doc.create('input').state('value2');
  doc.use(el1).use(el2);
  const html = doc.render();
  if (!html.includes('value1')) throw new Error('First state missing');
  if (!html.includes('value2')) throw new Error('Second state missing');
  const textContentCount = (html.match(/textContent/g) || []).length;
  const valueCount = (html.match(/\.value=/g) || []).length;
  if (textContentCount < 1) throw new Error('textContent not used for div');
  if (valueCount < 1) throw new Error('.value not used for input');
});

console.log('\n=== Test Results ===');
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log(`Total: ${testsPassed + testsFailed}`);

if (testsFailed > 0) {
  console.log('\n⚠️  Some tests failed. Review errors above.');
  process.exit(1);
} else {
  console.log('\n✓ All tests passed!');
  process.exit(0);
}
