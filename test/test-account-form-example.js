'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const {
  MAX_FORM_BYTES,
  validateAccount,
  buildAccountDocument,
  renderAccountPage,
  createAccountServer,
} = require('../example/account-form');

function request(port, method, path, body = '', headers = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = http.request({
      host: '127.0.0.1', port, method, path,
      headers: { ...headers, ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}) },
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { responseBody += chunk; });
      response.on('end', () => resolve({ statusCode: response.statusCode, headers: response.headers, body: responseBody }));
    });
    outgoing.on('error', reject);
    if (body) outgoing.write(body);
    outgoing.end();
  });
}

async function run() {
  assert.deepStrictEqual(validateAccount({ displayName: 'Ada', email: 'ada@example.com', password: 'secure-pass' }), {});
  assert.deepStrictEqual(Object.keys(validateAccount({ displayName: '', email: 'bad', password: 'short' })).sort(), ['displayName', 'email', 'password']);

  const invalidOptions = {
    values: { displayName: '<script>alert(1)</script>', email: 'bad', password: '' },
    errors: validateAccount({ displayName: '<script>alert(1)</script>', email: 'bad', password: '' }),
  };
  assert.deepStrictEqual(buildAccountDocument(invalidOptions).validate(), { valid: true, errors: [], warnings: [] });
  const invalidHtml = renderAccountPage(invalidOptions);
  assert(invalidHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert(!invalidHtml.includes('<script>alert(1)</script>'));
  assert(invalidHtml.includes('aria-invalid="true"'));
  assert(invalidHtml.includes('aria-describedby="email-error"'));
  assert(invalidHtml.includes('role="alert"'));

  const server = createAccountServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  try {
    const get = await request(port, 'GET', '/account');
    assert.equal(get.statusCode, 200);
    assert.match(get.headers['content-type'], /^text\/html/);
    assert.match(get.body, /<h1>Account settings<\/h1>/);
    assert.match(get.body, /for="display-name"/);

    const invalidBody = new URLSearchParams({ displayName: 'A', email: 'invalid', password: 'short' }).toString();
    const invalid = await request(port, 'POST', '/account', invalidBody, {
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    assert.equal(invalid.statusCode, 422);
    assert.match(invalid.body, /Enter a valid email address/);
    assert.match(invalid.body, /Use at least eight characters/);

    const validBody = new URLSearchParams({ displayName: 'Grace Hopper', email: 'grace@example.com', password: 'compiler123' }).toString();
    const valid = await request(port, 'POST', '/account', validBody, {
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    assert.equal(valid.statusCode, 200);
    assert.match(valid.body, /Account settings saved/);
    assert.match(valid.body, /value="Grace Hopper"/);
    assert(!valid.body.includes('value="compiler123"'));

    const unsupported = await request(port, 'POST', '/account', '{}', { 'Content-Type': 'application/json' });
    assert.equal(unsupported.statusCode, 415);
    const oversized = await request(port, 'POST', '/account', 'x'.repeat(MAX_FORM_BYTES + 1), {
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    assert.equal(oversized.statusCode, 413);
    assert.equal((await request(port, 'GET', '/missing')).statusCode, 404);
    assert.equal((await request(port, 'PUT', '/account')).statusCode, 405);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  console.log('Account form example passed: rendering, escaping, accessibility, validation, and HTTP failure paths.');
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
