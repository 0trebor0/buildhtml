'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { buildAuthInterfaceDocument, renderAuthInterface, createAuthInterfaceServer } = require('../example/auth-interface');

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
  assert.deepEqual(buildAuthInterfaceDocument().validate(), { valid: true, errors: [], warnings: [] });
  const html = renderAuthInterface();
  for (const text of ['Sign in', 'Create account', 'Account settings', 'Keep me signed in', 'Save settings']) {
    assert(html.includes(text), `rendered interface includes ${text}`);
  }
  assert.match(html, /@media \(max-width: 520px\)/);
  assert.match(html, /autocomplete="current-password"/);
  assert.match(html, /autocomplete="new-password"/);
  assert.doesNotMatch(html, /type="password"[^>]*value=/);
  const ids = [...html.matchAll(/<input[^>]* id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, 10);
  assert.equal(new Set(ids).size, ids.length, 'every input has a unique ID across all three forms');
  for (const id of ids) assert(html.includes(`for="${id}"`), `input ${id} has an associated label`);

  const server = createAuthInterfaceServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  try {
    const page = await request(port, 'GET', '/auth');
    assert.equal(page.statusCode, 200);
    assert.match(page.headers['content-type'], /^text\/html/);
    assert.match(page.body, /Account access/);
    for (const action of ['/session', '/users', '/account']) {
      const response = await request(port, 'POST', action);
      assert.equal(response.statusCode, 501);
      assert.deepEqual(JSON.parse(response.body), { error: 'Connect this form to your authenticated server workflow.' });
    }
    assert.equal((await request(port, 'GET', '/missing')).statusCode, 404);
    const method = await request(port, 'PUT', '/auth');
    assert.equal(method.statusCode, 405);
    assert.equal(method.headers.allow, 'GET, POST');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  console.log('Authentication interface example passed: three forms, unique labels, responsive output, validation, and HTTP boundaries.');
}

run().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
