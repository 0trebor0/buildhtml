'use strict';

const { metrics } = require('./metrics');

class LRUCache {
  constructor(limit) {
    this.limit = limit;
    this.cache = new Map();
  }
  get(key) {
    if (!this.cache.has(key)) { metrics.increment('cache.miss'); return null; }
    metrics.increment('cache.hit');
    const v = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, v);
    return v;
  }
  set(key, value) {
    if (this.cache.has(key)) this.cache.delete(key);
    else if (this.cache.size >= this.limit) {
      this.cache.delete(this.cache.keys().next().value);
      metrics.increment('cache.eviction');
    }
    this.cache.set(key, value);
    metrics.increment('cache.set');
  }
  clear() { this.cache.clear(); }
  delete(key) { return this.cache.delete(key); }
  has(key) { return this.cache.has(key); }
  get size() { return this.cache.size; }
}

module.exports = { LRUCache };
