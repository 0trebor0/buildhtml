'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { clearCache } = require('..');
const {
  buildPersonalizedDocument,
  personalizedCacheKey,
  buildNonceDocument,
  createProductionPatternsServer,
} = require('../example/production-patterns');

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
  const aliceRequest = { user: { id: 'alice', name: 'Alice', locale: 'en', permissions: ['reports', 'admin'] } };
  const reversedPermissions = { user: { ...aliceRequest.user, permissions: ['admin', 'reports'] } };
  assert.equal(personalizedCacheKey(aliceRequest), personalizedCacheKey(reversedPermissions));
  assert.match(personalizedCacheKey(aliceRequest), /user:alice:locale:en:permissions:admin,reports/);
  assert.deepEqual(buildPersonalizedDocument(aliceRequest).validate(), { valid: true, errors: [], warnings: [] });
  assert.deepEqual(buildNonceDocument().validate(), { valid: true, errors: [], warnings: [] });

  clearCache('production-example:');
  const server = createProductionPatternsServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  try {
    const aliceFirst = await request(port, 'GET', '/personalized?user=alice&locale=en');
    const aliceSecond = await request(port, 'GET', '/personalized?user=alice&locale=en');
    assert.equal(aliceFirst.statusCode, 200);
    assert.equal(aliceSecond.body, aliceFirst.body, 'same identity and response inputs reuse cached HTML');
    assert.match(aliceFirst.body, /Welcome, Alice/);
    assert.match(aliceFirst.body, /Permissions: admin, reports/);

    const aliceFrench = await request(port, 'GET', '/personalized?user=alice&locale=fr');
    assert.match(aliceFrench.body, /Locale: fr/);
    assert.notEqual(aliceFrench.body, aliceFirst.body, 'locale is isolated in the cache key');
    const bob = await request(port, 'GET', '/personalized?user=bob&locale=en');
    assert.match(bob.body, /Welcome, Bob/);
    assert.doesNotMatch(bob.body, /Welcome, Alice/);
    assert.notEqual(bob.body, aliceFirst.body, 'identity and permissions are isolated in the cache key');

    const cspFirst = await request(port, 'GET', '/csp');
    const cspSecond = await request(port, 'GET', '/csp');
    const firstPolicy = cspFirst.headers['content-security-policy'];
    const secondPolicy = cspSecond.headers['content-security-policy'];
    const firstNonce = /script-src 'nonce-([^']+)'/.exec(firstPolicy)?.[1];
    const secondNonce = /script-src 'nonce-([^']+)'/.exec(secondPolicy)?.[1];
    assert(firstNonce && secondNonce, 'both CSP headers contain nonces');
    assert.notEqual(firstNonce, secondNonce, 'each response receives a fresh nonce');
    assert.match(firstPolicy, new RegExp(`style-src 'nonce-${firstNonce.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
    assert(cspFirst.body.includes(`nonce="${firstNonce}"`), 'first HTML uses its response nonce');
    assert(cspSecond.body.includes(`nonce="${secondNonce}"`), 'second HTML uses its response nonce');
    assert(!cspSecond.body.includes(firstNonce), 'a cached nonce is never reused in later HTML');

    assert.equal((await request(port, 'GET', '/missing')).statusCode, 404);
    const method = await request(port, 'POST', '/personalized');
    assert.equal(method.statusCode, 405);
    assert.equal(method.headers.allow, 'GET');
  } finally {
    await new Promise(resolve => server.close(resolve));
    clearCache('production-example:');
  }

  console.log('Production patterns example passed: personalized cache isolation, fresh CSP nonces, headers, validation, and HTTP failures.');
}

run().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
