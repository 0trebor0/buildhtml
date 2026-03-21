'use strict';

const { Document, getResponseCache } = require('./document');
const { Element } = require('./element');
const { Head } = require('./head');
const { CONFIG, configure } = require('./config');
const { Metrics, metrics } = require('./metrics');
const { components } = require('./components');
const { resetPools } = require('./pools');
const { createCachedRenderer, clearCache, getCacheStats, healthCheck } = require('./middleware');
const {
  TemplateParser, parseTemplate, renderTemplate, compileTemplate,
  renderFile, compileFile, templateEngine
} = require('./template');

/** Convenience factory: creates a Document with title, viewport, resetCss, and lang pre-applied. */
function page(title, options = {}) {
  const doc = new Document(options);
  if (title) doc.title(title);
  doc.viewport().resetCss().lang(options.lang || 'en');
  return doc;
}

/**
 * Build and render a full page from a plain JSON/object definition.
 * Returns an HTML string.
 *
 *   renderFromJSON({ title: 'Home', body: [{ tag: 'h1', text: 'Hello' }] })
 */
function renderFromJSON(def, setup, options = {}) {
  if (typeof setup === 'object' && setup !== null && !Array.isArray(setup)) {
    options = setup;
    setup = null;
  }
  const doc = new Document(options);
  doc.fromJSON(def);
  if (typeof setup === 'function') setup(doc);
  return doc.render();
}

module.exports = {
  // Core
  Document,
  page,
  renderFromJSON,
  renderJSON: renderFromJSON, // backwards-compatible alias
  Element,
  Head,
  CONFIG,
  configure,

  // Components
  components,

  // Templates
  TemplateParser,
  parseTemplate,
  renderTemplate,
  compileTemplate,
  renderFile,
  compileFile,
  templateEngine,

  // Middleware
  createCachedRenderer,
  clearCache,
  get responseCache() { return getResponseCache(); },
  getCacheStats,
  resetPools,
  healthCheck,

  // Metrics
  Metrics,
  metrics
};
