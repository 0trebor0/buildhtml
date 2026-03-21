'use strict';

const defaults = {
  mode: process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
  poolSize: 150,
  cacheLimit: 2000,
  maxComputedFnSize: 10000,
  maxEventFnSize: 5000,
  enableMetrics: process.env.ENABLE_METRICS === 'true'
};

const CONFIG = { ...defaults };

/**
 * Override one or more config values.
 *   configure({ poolSize: 300, mode: 'prod' })
 */
function configure(overrides) {
  if (overrides && typeof overrides === 'object') {
    for (const k in overrides) {
      if (k in defaults) CONFIG[k] = overrides[k];
    }
  }
  return CONFIG;
}

module.exports = { CONFIG, configure };
