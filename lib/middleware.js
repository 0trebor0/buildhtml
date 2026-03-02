'use strict';

const { Document, responseCache } = require('./document');
const { CONFIG } = require('./config');
const { metrics } = require('./metrics');
const { pools } = require('./pools');

const inFlightCache = new Map();

function createCachedRenderer(builderFn, cacheKeyOrFn, options = {}) {
  if (typeof builderFn !== 'function') throw new TypeError('Builder function is required');

  return async (req, res, next) => {
    try {
      const key = typeof cacheKeyOrFn === 'function' ? cacheKeyOrFn(req) : cacheKeyOrFn;
      if (key == null || key === '') {
        const doc = await Promise.resolve(builderFn(req));
        if (!doc || !(doc instanceof Document)) return res.status(500).send('Internal Server Error');
        return res.send(doc.render());
      }

      const cached = responseCache.get(key);
      if (cached) { metrics.increment('middleware.cache.hit'); return res.send(cached); }
      metrics.increment('middleware.cache.miss');

      let promise = inFlightCache.get(key);
      if (!promise) {
        promise = Promise.resolve()
          .then(() => builderFn(req))
          .then((doc) => {
            if (!doc || !(doc instanceof Document)) {
              const err = new Error('Builder must return a Document'); err.status = 500; throw err;
            }
            doc._useResponseCache = true;
            doc._cacheKey = key;
            if (options.nonce && typeof options.nonce === 'function') doc._nonce = options.nonce(req);
            return doc.render();
          });
        inFlightCache.set(key, promise);
        promise.then(h => { responseCache.set(key, h); }).catch(() => {}).finally(() => inFlightCache.delete(key));
      }

      res.send(await promise);
    } catch (err) {
      if (err.status === 500) res.status(500).send('Internal Server Error');
      else next(err);
    }
  };
}

function clearCache(pattern) {
  if (!pattern) { responseCache.clear(); inFlightCache.clear(); return; }
  for (const [key] of responseCache.cache) {
    if (key.includes(pattern)) { responseCache.delete(key); inFlightCache.delete(key); }
  }
}

function getCacheStats() {
  return {
    cache: { size: responseCache.size, limit: CONFIG.cacheLimit },
    inFlight: { size: inFlightCache.size },
    pools: { elements: pools.elements.length, arrays: pools.arrays.length },
    metrics: CONFIG.enableMetrics ? metrics.getStats() : null
  };
}

function healthCheck() {
  return { status: 'ok', timestamp: Date.now(), config: { mode: CONFIG.mode, poolSize: CONFIG.poolSize, cacheLimit: CONFIG.cacheLimit }, stats: getCacheStats() };
}

module.exports = { createCachedRenderer, clearCache, getCacheStats, healthCheck, inFlightCache };
