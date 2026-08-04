// ESM entry point.
//
// Node infers named exports from CommonJS by static analysis, and that analysis
// fails on this package: the `get responseCache()` accessor in lib/index.js makes
// the lexer emit a bogus `get` binding and drop everything declared after it
// (metrics, Metrics, getCacheStats, healthCheck, resetPools and the compile*
// helpers). Re-exporting explicitly is what makes `import { metrics }` work.
//
// `responseCache` is intentionally absent below. It is a live accessor that
// returns a new cache whenever configure({ cacheLimit }) changes the limit, and a
// static ESM binding would freeze the value captured at import time. Reach it
// through the default export instead: `buildhtml.responseCache`.

import buildhtml from './index.js';

export const {
  // Core
  Document,
  page,
  renderFromJSON,
  renderJSON,
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
  getCacheStats,
  resetPools,
  healthCheck,

  // Metrics
  Metrics,
  metrics,

  // SPA compilation
  compileLiveList,
  compileHashRouter,
  compileHistoryRouter,
  compileViews,
} = buildhtml;

export default buildhtml;
