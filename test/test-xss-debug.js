const { Document } = require('./index.js');

const doc = new Document();
const el = doc.create('div').text('<script>alert("xss")</script>');
el.attrs.title = '<img src=x onerror=alert(1)>';
doc.use(el);
const html = doc.render();

console.log('Generated HTML:');
console.log(html);
console.log('\n--- Checks ---');
console.log('Contains <script>alert:', html.includes('<script>alert'));
console.log('Contains onerror=:', html.includes('onerror='));
console.log('Contains &lt;script&gt;:', html.includes('&lt;script&gt;'));
console.log('Contains &lt;img:', html.includes('&lt;img'));
console.log('Contains &quot;:', html.includes('&quot;'));
