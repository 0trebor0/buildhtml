'use strict';

const { CONFIG } = require('./config');

const MAX_TIMING_SAMPLES = 1000;

class Metrics {
  constructor() {
    this.counters = new Map();
    this.timings = new Map();
  }
  // Read through to CONFIG rather than snapshotting it: the shared `metrics`
  // singleton is constructed when this module is first required, which is always
  // before a caller can reach configure({ enableMetrics: true }).
  get enabled() { return CONFIG.enableMetrics; }
  increment(key, value = 1) {
    if (!this.enabled) return;
    this.counters.set(key, (this.counters.get(key) || 0) + value);
  }
  timing(key, duration) {
    if (!this.enabled) return;
    if (!this.timings.has(key)) this.timings.set(key, []);
    const arr = this.timings.get(key);
    if (arr.length >= MAX_TIMING_SAMPLES) arr.shift();
    arr.push(duration);
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
