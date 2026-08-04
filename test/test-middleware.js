'use strict';

const { Document, responseCache } = require('../index');
const { createCachedRenderer, clearCache, getCacheStats, inFlightCache } = require('../lib/middleware');

let passed = 0;
let failed = 0;
let testQueue = Promise.resolve();

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

function test(name, fn) {
  console.log(`\n▸ ${name}`);
  testQueue = testQueue.then(fn).catch((e) => {
    failed++;
    console.error(`  ✗ THREW: ${e.message}`);
  });
  return testQueue;
}

function mockRes() {
  const res = {
    _sent: null,
    _status: 200,
    send(html) { this._sent = html; return this; },
    status(code) { this._status = code; return this; },
  };
  return res;
}

function mockReq(url = '/') {
  return { url, method: 'GET', headers: {} };
}

/* ---- clear cache before each group ---- */
function resetCache() {
  clearCache();
  inFlightCache.clear();
}

/* ---- basic render without cache key ---- */
const p1 = test('no cache key — calls builderFn and sends result', async () => {
  resetCache();
  let called = 0;
  const middleware = createCachedRenderer(async (req) => {
    called++;
    const doc = new Document();
    doc.title('No Cache');
    doc.h1().text('Hello');
    return doc;
  }, null);

  const req = mockReq();
  const res = mockRes();
  await middleware(req, res, (err) => { throw err || new Error('next called unexpectedly'); });
  assert(called === 1, 'builderFn called once');
  assert(typeof res._sent === 'string', 'response sent');
  assert(res._sent.includes('<h1>Hello</h1>'), 'rendered HTML in response');
});

/* ---- cache miss → builderFn called ---- */
const p2 = test('cache miss — calls builderFn and caches result', async () => {
  resetCache();
  let called = 0;
  const middleware = createCachedRenderer(async (req) => {
    called++;
    const doc = new Document();
    doc.title('Cached Page');
    doc.p('content');
    return doc;
  }, 'page-miss-test');

  const req = mockReq();
  const res = mockRes();
  await middleware(req, res, (err) => { throw err || new Error('next called'); });
  assert(called === 1, 'builderFn called on miss');
  assert(res._sent.includes('Cached Page'), 'HTML returned on miss');
});

/* ---- cache hit — builderFn not called again ---- */
const p3 = test('cache hit — returns cached HTML without calling builderFn again', async () => {
  resetCache();
  let called = 0;
  const middleware = createCachedRenderer(async (req) => {
    called++;
    const doc = new Document();
    doc.title('Hit Test');
    doc.p('cached');
    return doc;
  }, 'page-hit-test');

  const req = mockReq();
  const res1 = mockRes();
  await middleware(req, res1, (err) => { throw err; });
  assert(called === 1, 'first request calls builderFn');

  const res2 = mockRes();
  await middleware(req, res2, (err) => { throw err; });
  assert(called === 1, 'second request does NOT call builderFn again');
  assert(res2._sent === res1._sent, 'cached HTML returned on second request');
});

/* ---- concurrent requests coalesce ---- */
const p4 = test('concurrent requests for same key coalesce into one builderFn call', async () => {
  resetCache();
  let called = 0;
  let resolve;
  const pending = new Promise((r) => { resolve = r; });

  const middleware = createCachedRenderer(async (req) => {
    called++;
    await pending;
    const doc = new Document();
    doc.title('Coalesce');
    doc.p('once');
    return doc;
  }, 'page-coalesce-test');

  const req = mockReq();
  const res1 = mockRes();
  const res2 = mockRes();
  const res3 = mockRes();

  // Fire 3 concurrent requests before the first one resolves
  const all = Promise.all([
    middleware(req, res1, (e) => { if (e) throw e; }),
    middleware(req, res2, (e) => { if (e) throw e; }),
    middleware(req, res3, (e) => { if (e) throw e; }),
  ]);

  resolve(); // unblock builderFn
  await all;

  assert(called === 1, 'builderFn called exactly once for 3 concurrent requests');
  assert(res1._sent === res2._sent, 'all responses got identical HTML');
  assert(res2._sent === res3._sent, 'third response also identical');
});

/* ---- error in builderFn propagates to next(err) ---- */
const p5 = test('error in builderFn calls next(err)', async () => {
  resetCache();
  const middleware = createCachedRenderer(async (req) => {
    throw new Error('builder error');
  }, 'page-error-test');

  const req = mockReq();
  const res = mockRes();
  let nextErr = null;
  await middleware(req, res, (err) => { nextErr = err; });
  assert(nextErr instanceof Error, 'error passed to next()');
  assert(nextErr.message === 'builder error', 'correct error message');
});

/* ---- builderFn returning non-Document → 500 ---- */
const p6 = test('builderFn returning non-Document results in 500', async () => {
  resetCache();
  const middleware = createCachedRenderer(async (req) => {
    return 'not a document';
  }, 'page-bad-return-test');

  const req = mockReq();
  const res = mockRes();
  let nextCalled = false;
  await middleware(req, res, (err) => { nextCalled = true; });
  assert(res._status === 500 || nextCalled, 'non-Document triggers 500 or next(err)');
});

/* ---- nonce option — injected into document ---- */
const p7 = test('nonce option injects a fresh nonce and bypasses rendered HTML caching', async () => {
  resetCache();
  let builds = 0;
  let nonces = 0;
  let cacheKeyCalls = 0;
  const middleware = createCachedRenderer(
    async (req) => {
      builds++;
      const doc = new Document();
      doc.title('Nonce Test');
      doc.globalStyle('body', { color: 'red' });
      doc.states({ x: 1 });
      doc.div().bind('x');
      return doc;
    },
    () => { cacheKeyCalls++; return 'page-nonce-test'; },
    { nonce: () => `testnonce${++nonces}` }
  );

  const req = mockReq();
  const res = mockRes();
  await middleware(req, res, (err) => { throw err; });
  assert(res._sent.includes('nonce="testnonce1"'), 'nonce injected into compiled script');
  assert(res._sent.includes('<style nonce="testnonce1">'), 'nonce injected into head styles');
  const second = mockRes();
  await middleware(req, second, (err) => { throw err; });
  assert(second._sent.includes('nonce="testnonce2"'), 'second response receives a fresh nonce');
  assert(!second._sent.includes('testnonce1'), 'cached nonce is not reused');
  assert(builds === 2, 'nonce-enabled responses bypass rendered HTML caching');
  assert(cacheKeyCalls === 0, 'nonce-enabled responses do not evaluate an unused cache key');
  assert(!responseCache.has('page-nonce-test'), 'nonce-enabled HTML is not placed in the response cache');
});

/* ---- clearCache removes entries ---- */
const p8 = test('clearCache() removes all cached entries', async () => {
  resetCache();
  let called = 0;
  const middleware = createCachedRenderer(async (req) => {
    called++;
    const doc = new Document();
    doc.title('Clear Test');
    return doc;
  }, 'page-clear-test');

  const req = mockReq();
  const res1 = mockRes();
  await middleware(req, res1, (e) => { if (e) throw e; });
  assert(called === 1, 'first call hits builderFn');

  clearCache();

  const res2 = mockRes();
  await middleware(req, res2, (e) => { if (e) throw e; });
  assert(called === 2, 'after clearCache(), builderFn called again');
});

/* ---- getCacheStats ---- */
const p9 = test('getCacheStats() returns expected shape', async () => {
  const stats = getCacheStats();
  assert(typeof stats === 'object', 'getCacheStats returns object');
  assert('cache' in stats, 'stats has cache key');
  assert('inFlight' in stats, 'stats has inFlight key');
  assert('pools' in stats, 'stats has pools key');
  assert(typeof stats.cache.size === 'number', 'cache.size is a number');
  assert(typeof stats.cache.limit === 'number', 'cache.limit is a number');
});

/* ---- a failed render must not poison the key ---- */
const p10 = test('a rejected render is not cached and the next request rebuilds', async () => {
  resetCache();
  const key = 'page-recovers-after-failure';
  let attempt = 0;

  const middleware = createCachedRenderer(async () => {
    attempt++;
    if (attempt === 1) throw new Error('transient builder failure');
    const doc = new Document();
    doc.title('Recovered');
    doc.h1('Recovered');
    return doc;
  }, key);

  // First request fails and is handed to next(err).
  let forwarded = null;
  const first = mockRes();
  await middleware(mockReq(), first, (err) => { forwarded = err; });
  assert(forwarded instanceof Error, 'failure forwarded to next()');
  assert(forwarded.message === 'transient builder failure', 'original error preserved');
  assert(first._sent === null, 'nothing sent on failure');
  assert(!responseCache.has(key), 'failed render is not cached');
  assert(!inFlightCache.has(key), 'failed render is not left in flight');

  // Second request must rebuild rather than inherit the failure.
  const second = mockRes();
  await middleware(mockReq(), second, (err) => { if (err) throw err; });
  assert(attempt === 2, 'builder ran again after the failure');
  assert(typeof second._sent === 'string' && second._sent.includes('<h1>Recovered</h1>'), 'second request served fresh HTML');
  assert(responseCache.has(key), 'successful render is cached');

  // Third request is served from cache without rebuilding.
  const third = mockRes();
  await middleware(mockReq(), third, (err) => { if (err) throw err; });
  assert(attempt === 2, 'cached response avoids a rebuild');
  assert(third._sent === second._sent, 'cached bytes identical');
});

/* ---- concurrent requests that all fail ---- */
const p11 = test('concurrent requests sharing a failing render all receive the error', async () => {
  resetCache();
  const key = 'page-concurrent-failure';
  let builds = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });

  const middleware = createCachedRenderer(async () => {
    builds++;
    await pending;
    throw new Error('shared failure');
  }, key);

  const errors = [];
  const a = middleware(mockReq(), mockRes(), (err) => errors.push(err));
  const b = middleware(mockReq(), mockRes(), (err) => errors.push(err));
  release();
  await Promise.all([a, b]);

  assert(builds === 1, 'the failing render is de-duplicated like a successful one');
  assert(errors.length === 2, 'both callers are told it failed');
  assert(errors.every((e) => e instanceof Error && e.message === 'shared failure'), 'both receive the real error');
  assert(!responseCache.has(key), 'nothing cached');
  assert(!inFlightCache.has(key), 'in-flight entry cleaned up');
});

Promise.all([p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11]).then(() => test(
  'clearCache(pattern) invalidates a matching in-flight render',
  async () => {
    resetCache();
    let release;
    let started;
    const startedPromise = new Promise((resolve) => { started = resolve; });
    const pending = new Promise((resolve) => { release = resolve; });
    const key = 'page-stale-in-flight-test';
    const middleware = createCachedRenderer(async () => {
      started();
      await pending;
      const doc = new Document();
      doc.title('Stale');
      return doc;
    }, key);

    const request = middleware(mockReq(), mockRes(), (err) => { if (err) throw err; });
    await startedPromise;
    assert(inFlightCache.has(key), 'render is tracked while in flight');
    clearCache('stale-in-flight');
    assert(!inFlightCache.has(key), 'pattern clear removes matching in-flight key');
    release();
    await request;
    await Promise.resolve();
    assert(!responseCache.has(key), 'cleared in-flight render does not repopulate cache');
  }
)).then(() => {
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(40));
  process.exit(failed > 0 ? 1 : 0);
});
