'use strict';

const assert = require('node:assert');
const { buildDashboardDocument, renderDashboard } = require('../example/dashboard');

const doc = buildDashboardDocument();
assert.deepStrictEqual(doc.validate(), { valid: true, errors: [], warnings: [] });

const html = renderDashboard();
for (const expected of [
  'Operations Dashboard', 'Overview', 'Activity', 'Account', 'Active users',
  '£48,290', 'activity-filter', 'Refresh activity', 'data-view-nav="overview"',
  'data-view="activity"', 'watchState', 'fetch(\'/api/activity\')',
  'Sort A–Z', 'Sort Z–A', 'No activity matches your filter.',
]) {
  assert(html.includes(expected), `dashboard output should include ${expected}`);
}
assert(html.includes('@media (max-width: 760px)'));
assert(html.includes('aria-label="Dashboard navigation"'));
assert(html.includes('aria-live="polite"'));

console.log('Dashboard example passed: validation, content, responsiveness, state, views, sorting, empty state, fetch, and accessibility.');
