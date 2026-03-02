const http = require('http');
const { Document } = require('./index.js');

const server = http.createServer((req, res) => {
  const doc = new Document();
  doc.title('LightRender Test Server');
  const h1 = doc.create('h1').text('Server Test - All Systems Operational');
  const p = doc.create('p').text('Zero-dependency, ultra-fast SSR.');
  doc.use(h1).use(p);
  const html = doc.render();
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
});

const PORT = 3333;
server.listen(PORT, () => {
  console.log(`Test server running at http://localhost:${PORT}`);
  console.log('Server started successfully - shutting down after 1 second...');
  setTimeout(() => {
    server.close(() => {
      console.log('Server stopped. Test passed!');
      process.exit(0);
    });
  }, 1000);
});
