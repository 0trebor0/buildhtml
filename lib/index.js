'use strict';

const { Document, responseCache } = require('./document');
const { Element } = require('./element');
const { Head } = require('./head');
const { CONFIG } = require('./config');
const { Metrics, metrics } = require('./metrics');
const { components } = require('./components');
const { resetPools } = require('./pools');
const { createCachedRenderer, clearCache, getCacheStats, healthCheck } = require('./middleware');
const {
  TemplateParser, parseTemplate, renderTemplate, compileTemplate,
  renderFile, compileFile, templateEngine
} = require('./template');

module.exports = {
  // Core
  Document,
  Element,
  Head,
  CONFIG,

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
  responseCache,
  getCacheStats,
  resetPools,
  healthCheck,

  // Metrics
  Metrics,
  metrics
};
