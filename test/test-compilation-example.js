'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { Script } = require('node:vm');
const { CounterDocument, createCompilationServer } = require('../example/compilation');

function request(port, method, path) {
  return new Promise((resolve, reject) => {
    try {
      const outgoing = http.request({ host: '127.0.0.1', port, method, path }, response => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', chunk => { body += chunk; });
        response.on('error', reject);
        response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
      });
      outgoing.on('error', reject);
      outgoing.end();
    } catch (error) { reject(error); }
  });
}

async function run() {
  const doc = new CounterDocument();
  assert.deepEqual(doc.validate(), { valid: true, errors: [], warnings: [] });
  const html = doc.compile();
  const source = doc.compile({ output: 'class', className: 'CounterPage' });
  assert.match(html, /Build once, choose the output/);
  assert.match(html, /id="greeting"/);
  assert.match(source, /export \{ __buildhtmlPage as CounterPage \}/);
  new Script(source.replace(/export \{[^}]+\};\s*$/, ''));
  assert.equal(doc.body.length, 1, 'both compilations preserve the source main element');

  const originalCreateServer = http.createServer;
  try {
    http.createServer = () => { throw new Error('server unavailable'); };
    assert.throws(createCompilationServer, /Unable to create compilation example server: server unavailable/);
  } finally { http.createServer = originalCreateServer; }

  const server = createCompilationServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const port = server.address().port;
    const host = await request(port, 'GET', '/');
    assert.equal(host.status, 200);
    assert.match(host.body, /type="module"/);
    assert.match(host.body, /import \{ CounterPage \} from '\/counter-page.js'/);
    const module = await request(port, 'GET', '/counter-page.js?v=1');
    assert.equal(module.status, 200);
    assert.match(module.headers['content-type'], /^text\/javascript/);
    new Script(module.body.replace(/export \{[^}]+\};\s*$/, ''));
    assert.match((await request(port, 'GET', '/server')).body, /id="count"/);
    assert.equal((await request(port, 'GET', '/missing')).status, 404);
    const method = await request(port, 'POST', '/');
    assert.equal(method.status, 405);
    assert.equal(method.headers.allow, 'GET');
    const invalid = {};
    server.emit('request', { method: 'GET', url: 'http://[' }, {
      writeHead(status) { invalid.status = status; },
      end(body) { invalid.body = body; },
    });
    assert.deepEqual(invalid, { status: 400, body: 'Invalid URL' }, 'URL parse failures are caught and reported');
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  console.log('Compilation example passed: both outputs, module delivery, preserved source, HTTP errors, and caught server/URL failures.');
}

run().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
