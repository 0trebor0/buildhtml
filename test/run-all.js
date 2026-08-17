'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const suites = [
  'test.js',
  'test-bindings.js',
  'test-stream.js',
  'test-json.js',
  'test-middleware.js',
  'test-spa.js',
  'test-template.js',
  'test-new-apis.js',
  'test-apis-v2.js',
  'test-debug.js',
  'test-public-api.js',
  'test-module-entry.js',
  'test-internal-functions.js',
  'test-fuzz.js',
  'test-readme-examples.js',
  'test-tutorial.js',
  'test-dashboard-example.js',
  'test-account-form-example.js',
  'test-routing-example.js',
  'test-production-patterns-example.js',
  'test-auth-interface-example.js',
];

for (const suite of suites) {
  console.log(`\n=== ${suite} ===`);
  const result = spawnSync(process.execPath, [path.join(__dirname, suite)], {
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`\nAll ${suites.length} automated suites passed.`);
