const http = require('http');
const { Document } = require('../index.js');

const server = http.createServer((req, res) => {
  const doc = new Document();
  doc.title('BuildHTML Example');
  const h1 = doc.create('h1').text('Welcome to BuildHTML');
  const p = doc.create('p').text('Zero-dependency, ultra-fast SSR.');
  doc.use(h1).use(p);
  const html = doc.render();
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
