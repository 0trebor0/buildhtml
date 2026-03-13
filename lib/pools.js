'use strict';

const { CONFIG } = require('./config');
const { metrics } = require('./metrics');
const { Element } = require('./element');
const { toKebab } = require('./utils');

const pools = { elements: [], arrays: [], objects: [] };

function getPooled(type, ...args) {
  const pool = pools[type];
  if (pool && pool.length > 0) {
    const item = pool.pop();
    metrics.increment('pool.reuse.' + type);
    if (type === 'elements') resetElement(item, ...args);
    else if (type === 'arrays') item.length = 0;
    return item;
  }
  metrics.increment('pool.new.' + type);
  switch (type) {
    case 'elements': {
      const [tag, ridGen, stateStore, document] = args;
      const el = new Element(tag, ridGen, stateStore);
      el._document = document;
      return el;
    }
    case 'arrays': return [];
    case 'objects': return {};
    default: return null;
  }
}

function recycle(type, item) {
  const pool = pools[type];
  if (!pool || pool.length >= CONFIG.poolSize) return;
  if (type === 'elements' && item instanceof Element) {
    for (const child of item.children) {
      if (child instanceof Element) recycle('elements', child);
    }
    item.children.length = 0;
    item.events.length = 0;
    item._stateBindings.length = 0;
    item._classes.length = 0;
    if (item._classSet) item._classSet.clear();
    item.cssText = '';
    item._state = null;
    item._computed = null;
    item._parent = null;
    item._slots = null;
    item._portalTarget = null;
    item._inlineStyles = null;
    for (const key in item.attrs) delete item.attrs[key];
    pool.push(item);
  } else if (type === 'arrays' && Array.isArray(item)) {
    item.length = 0;
    pool.push(item);
  }
}

function resetElement(el, tag, ridGen, stateStore, document) {
  el.tag = toKebab(tag);
  el._ridGen = ridGen;
  el._stateStore = stateStore;
  el._document = document;
  if (!el.attrs) el.attrs = {};
  if (!el.children) el.children = [];
  if (!el.events) el.events = [];
  if (!el._stateBindings) el._stateBindings = [];
  if (!el._classes) el._classes = [];
  if (!el._classSet) el._classSet = new Set();
  else el._classSet.clear();
  el.cssText = '';
  el._state = null;
  el.hydrate = false;
  el._computed = null;
}

function resetPools() {
  pools.elements.length = 0;
  pools.arrays.length = 0;
  pools.objects.length = 0;
}

module.exports = { pools, getPooled, recycle, resetPools };
