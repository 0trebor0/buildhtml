'use strict';

const defaults = {
  mode: process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
  poolSize: 150,
  cacheLimit: 2000,
  maxComputedFnSize: 10000,
  maxEventFnSize: 5000,
  debug: false,
  enableMetrics: process.env.ENABLE_METRICS === 'true'
};

const CONFIG = { ...defaults };

const VALID_MODES = new Set(['dev', 'prod']);

const configTypes = {
  mode: 'string',
  poolSize: 'number',
  cacheLimit: 'number',
  maxComputedFnSize: 'number',
  maxEventFnSize: 'number',
  debug: 'boolean',
  enableMetrics: 'boolean',
};

/**
 * Override one or more config values.
 *   configure({ poolSize: 300, mode: 'prod' })
 */
function configure(overrides) {
  if (overrides && typeof overrides === 'object') {
    for (const k in overrides) {
      if (!(k in defaults)) continue;
      const expected = configTypes[k];
      if (expected && typeof overrides[k] !== expected) {
        console.warn(`[configure] "${k}" must be ${expected}, got ${typeof overrides[k]} — ignored`);
        continue;
      }
      // NaN and Infinity are typeof "number", and every size guard is a `>=`
      // comparison — NaN makes them all false, so the pool and response cache
      // would grow without bound instead of being capped.
      if (expected === 'number' && (!Number.isFinite(overrides[k]) || overrides[k] < 0)) {
        console.warn(`[configure] "${k}" must be a finite number >= 0, got ${overrides[k]} — ignored`);
        continue;
      }
      // An unrecognised mode disables prod minification and dev diagnostics at the
      // same time, so reject it rather than leaving the library in neither state.
      if (k === 'mode' && !VALID_MODES.has(overrides[k])) {
        console.warn(`[configure] "mode" must be "dev" or "prod", got "${overrides[k]}" — ignored`);
        continue;
      }
      CONFIG[k] = overrides[k];
    }
  }
  return CONFIG;
}

module.exports = { CONFIG, configure };
