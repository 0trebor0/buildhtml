'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { buildRoutingDocument, renderRoutingPage, createRoutingServer } = require('../example/routing');

function request(port, method, path) {
  return new Promise((resolve, reject) => {
    const outgoing = http.request({ host: '127.0.0.1', port, method, path }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ statusCode: response.statusCode, headers: response.headers, body }));
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

async function run() {
  assert.deepEqual(buildRoutingDocument('hash').validate(), { valid: true, errors: [], warnings: [] });
  const historyValidation = buildRoutingDocument('history').validate();
  assert.equal(historyValidation.valid, true);
  assert.deepEqual(historyValidation.errors, []);
  assert.deepEqual(historyValidation.warnings.map(issue => issue.code), ['W_HISTORY_FALLBACK']);
  assert.throws(() => buildRoutingDocument('invalid'), /mode must be/);

  const hashHtml = renderRoutingPage('hash');
  assert.match(hashHtml, /Hash-routed application/);
  assert.match(hashHtml, /#users\/42/);
  assert.match(hashHtml, /hashchange/);
  const historyHtml = renderRoutingPage('history');
  assert.match(historyHtml, /History-routed application/);
  assert.match(historyHtml, /href="\/app\/users\/42"/);
  assert.match(historyHtml, /pushState/);

  const server = createRoutingServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  try {
    const api = await request(port, 'GET', '/api/status');
    assert.equal(api.statusCode, 200);
    assert.match(api.headers['content-type'], /^application\/json/);
    assert.deepEqual(JSON.parse(api.body), { ok: true });
    const asset = await request(port, 'GET', '/asset.txt');
    assert.equal(asset.statusCode, 200);
    assert.equal(asset.body, 'static asset');

    const directRoute = await request(port, 'GET', '/app/users/42');
    assert.equal(directRoute.statusCode, 200);
    assert.match(directRoute.headers['content-type'], /^text\/html/);
    assert.match(directRoute.body, /History-routed application/);
    assert.equal((await request(port, 'GET', '/app/missing')).statusCode, 200);
    assert.equal((await request(port, 'GET', '/hash')).statusCode, 200);
    assert.equal((await request(port, 'GET', '/outside')).statusCode, 404);
    const method = await request(port, 'POST', '/app/');
    assert.equal(method.statusCode, 405);
    assert.equal(method.headers.allow, 'GET');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  console.log('Routing example passed: rendering, route validation, API/static precedence, direct fallback, and HTTP failures.');
}

run().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
