'use strict';

/**
 * Verifies the package entry points: the CommonJS main, the ESM wrapper, and the
 * subpath exports. Node infers named CJS exports by static analysis and that
 * analysis silently drops bindings declared after an accessor, so the ESM surface
 * is asserted name by name rather than assumed.
 */

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(error.stack || error);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(error.stack || error);
  }
}

console.log('\n▸ Package entry points');

const ROOT = path.join(__dirname, '..');
const cjs = require('..');
const pkg = require('../package.json');

const EXPECTED_NAMED = [
  'Document', 'page', 'renderFromJSON', 'renderJSON', 'Element', 'Head', 'CONFIG', 'configure',
  'components', 'TemplateParser', 'parseTemplate', 'renderTemplate', 'compileTemplate',
  'renderFile', 'compileFile', 'templateEngine', 'createCachedRenderer', 'clearCache',
  'getCacheStats', 'resetPools', 'healthCheck', 'Metrics', 'metrics',
  'compileLiveList', 'compileHashRouter', 'compileHistoryRouter', 'compileViews',
];

test('package.json declares the entry points it ships', () => {
  assert.strictEqual(pkg.main, 'index.js');
  assert.strictEqual(pkg.module, 'index.mjs');
  assert.strictEqual(pkg.type, 'commonjs');
  assert(pkg.exports, 'exports map present');
  assert.strictEqual(pkg.exports['.'].require, './index.js');
  assert.strictEqual(pkg.exports['.'].import, './index.mjs');
  assert.strictEqual(pkg.exports['./package.json'], './package.json');
  // Type declarations ship, but the TypeScript dev fixtures (example.ts,
  // tsconfig.json) deliberately do not.
  for (const entry of ['index.js', 'index.mjs', 'lib/', 'typescript/*.d.ts']) {
    assert(pkg.files.includes(entry), `files[] ships ${entry}`);
  }
  assert(!pkg.files.includes('typescript/'), 'the whole typescript/ directory is not shipped');
});

test('every subpath in the exports map resolves to a real module', () => {
  for (const [subpath, target] of Object.entries(pkg.exports)) {
    if (subpath === '.' || subpath === './package.json') continue;
    const file = typeof target === 'string' ? target : target.default;
    const resolved = path.join(ROOT, file);
    assert(require('fs').existsSync(resolved), `${subpath} -> ${file} exists`);
    assert(require(resolved), `${subpath} loads`);
    if (typeof target === 'object' && target.types) {
      assert(require('fs').existsSync(path.join(ROOT, target.types)), `${subpath} types exist`);
    }
  }
});

test('subpaths expose the members callers import them for', () => {
  assert.strictEqual(typeof require('../lib/template').renderTemplate, 'function');
  assert.strictEqual(typeof require('../lib/middleware').createCachedRenderer, 'function');
  assert.strictEqual(typeof require('../lib/components').components.register, 'function');
  assert.strictEqual(typeof require('../lib/live').compileLiveList, 'function');
  assert.strictEqual(typeof require('../lib/config').configure, 'function');
  assert.strictEqual(typeof require('../lib/metrics').metrics.getStats, 'function');
});

test('CommonJS entry exposes the documented surface', () => {
  for (const name of EXPECTED_NAMED) {
    assert(cjs[name] !== undefined, `require() exposes ${name}`);
  }
  assert(cjs.responseCache !== undefined, 'require() exposes responseCache');
});

const asyncTests = (async () => {
  const esmUrl = pathToFileURL(path.join(ROOT, 'index.mjs')).href;
  const ns = await import(esmUrl);

  await testAsync('ESM entry exposes every named export', async () => {
    for (const name of EXPECTED_NAMED) {
      assert(ns[name] !== undefined, `import { ${name} } works`);
    }
  });

  await testAsync('ESM named exports are the same objects as CommonJS', async () => {
    for (const name of EXPECTED_NAMED) {
      assert.strictEqual(ns[name], cjs[name], `${name} identical across entry points`);
    }
  });

  await testAsync('ESM default export carries the live responseCache accessor', async () => {
    assert.strictEqual(ns.default, cjs, 'default export is the CommonJS namespace');
    assert(ns.default.responseCache !== undefined, 'responseCache reachable via default export');
  });

  await testAsync('ESM entry actually renders a document', async () => {
    const doc = new ns.Document();
    doc.title('ESM');
    doc.h1('Hello from ESM');
    const out = doc.render();
    assert(out.startsWith('<!DOCTYPE html>'));
    assert(out.includes('<h1>Hello from ESM</h1>'));

    const viaFactory = ns.page('Factory page').render();
    assert(viaFactory.includes('<title>Factory page</title>'));
  });

  await testAsync('subpath modules are importable as ESM with named exports', async () => {
    const template = await import(pathToFileURL(path.join(ROOT, 'lib/template.js')).href);
    assert.strictEqual(typeof template.renderTemplate, 'function');
    const live = await import(pathToFileURL(path.join(ROOT, 'lib/live.js')).href);
    assert.strictEqual(typeof live.compileLiveList, 'function');
  });
})();

asyncTests.then(() => {
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
});
