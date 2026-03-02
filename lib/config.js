'use strict';

const CONFIG = Object.freeze({
  mode: process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
  poolSize: 150,
  cacheLimit: 2000,
  maxComputedFnSize: 10000,
  maxEventFnSize: 5000,
  enableMetrics: process.env.ENABLE_METRICS === 'true'
});

module.exports = { CONFIG };
