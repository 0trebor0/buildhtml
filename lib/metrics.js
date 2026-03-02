'use strict';

const { CONFIG } = require('./config');

class Metrics {
  constructor() {
    this.enabled = CONFIG.enableMetrics;
    this.counters = new Map();
    this.timings = new Map();
  }
  increment(key, value = 1) {
    if (!this.enabled) return;
    this.counters.set(key, (this.counters.get(key) || 0) + value);
  }
  timing(key, duration) {
    if (!this.enabled) return;
    if (!this.timings.has(key)) this.timings.set(key, []);
    this.timings.get(key).push(duration);
  }
  getStats() {
    const stats = { counters: {}, timings: {} };
    for (const [key, value] of this.counters) stats.counters[key] = value;
    for (const [key, values] of this.timings) {
      const sorted = values.slice().sort((a, b) => a - b);
      const len = sorted.length;
      stats.timings[key] = {
        count: len,
        avg: values.reduce((a, b) => a + b, 0) / len,
        p50: sorted[Math.floor(len * 0.5)],
        p95: sorted[Math.floor(len * 0.95)],
        p99: sorted[Math.floor(len * 0.99)]
      };
    }
    return stats;
  }
  reset() { this.counters.clear(); this.timings.clear(); }
}

const metrics = new Metrics();
module.exports = { Metrics, metrics };
