'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const PORT = Number(process.env.BUILDHTML_DASHBOARD_PORT) || 3418;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const examplePath = path.join(__dirname, '..', 'example', 'dashboard.js');

function waitForServer(child, stderr) {
  const deadline = Date.now() + 10000;
  return new Promise((resolve, reject) => {
    function attempt() {
      if (child.exitCode !== null) return reject(new Error(`Dashboard exited early: ${stderr.join('')}`));
      const request = http.get(ORIGIN, (response) => {
        response.resume();
        if (response.statusCode === 200) resolve();
        else retry();
      });
      request.on('error', retry);
    }
    function retry() {
      if (Date.now() >= deadline) return reject(new Error(`Timed out waiting for dashboard: ${stderr.join('')}`));
      setTimeout(attempt, 100);
    }
    attempt();
  });
}

function stopServer(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000);
    child.once('exit', () => { clearTimeout(timeout); resolve(); });
    child.kill('SIGTERM');
  });
}

async function run() {
  const stderr = [];
  const server = spawn(process.execPath, [examplePath], {
    env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true,
  });
  server.stderr.on('data', (chunk) => stderr.push(chunk.toString()));
  let browser;
  try {
    await waitForServer(server, stderr);
    browser = await chromium.launch({ headless: true });
    const browserPage = await browser.newPage();
    const browserErrors = [];
    browserPage.on('pageerror', (error) => browserErrors.push(error.message));
    browserPage.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
    await browserPage.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
    const accessibilityIssues = await browserPage.evaluate(() => {
      const issues = [];
      const ids = new Map();
      for (const element of document.querySelectorAll('[id]')) {
        ids.set(element.id, (ids.get(element.id) || 0) + 1);
      }
      for (const [id, count] of ids) {
        if (count > 1) issues.push(`Duplicate id: ${id}`);
      }
      for (const image of document.querySelectorAll('img')) {
        if (!image.hasAttribute('alt')) issues.push(`Image without alt: ${image.id || image.src}`);
      }
      for (const control of document.querySelectorAll('button,input,select,textarea')) {
        const label = control.id ? document.querySelector(`label[for="${CSS.escape(control.id)}"]`) : null;
        const named = Boolean(control.getAttribute('aria-label') || control.getAttribute('aria-labelledby') || label || control.textContent.trim());
        if (!named && control.type !== 'hidden') issues.push(`Unnamed control: ${control.tagName.toLowerCase()}#${control.id}`);
      }
      let previousHeading = 0;
      for (const heading of document.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
        const level = Number(heading.tagName.slice(1));
        if (previousHeading && level > previousHeading + 1) issues.push(`Skipped heading level: ${heading.tagName}`);
        previousHeading = level;
      }
      return issues;
    });
    assert.deepEqual(accessibilityIssues, []);
    const hookResult = await browserPage.evaluate(() => {
      window.__reported = [];
      window.BuildHTML.reportClientError = function (error, context) {
        window.__reported.push({ message: error.message, type: context.type });
      };
      window.BuildHTML._reportClientError({ type: 'test-hook', elementId: 'document', tag: 'document' }, new Error('hook works'));
      return window.__reported;
    });
    assert.deepEqual(hookResult, [{ message: 'hook works', type: 'test-hook' }]);

    assert.equal(await browserPage.locator('[data-view="overview"]').isVisible(), true);
    assert.equal(await browserPage.locator('[data-view="activity"]').isHidden(), true);
    await browserPage.locator('[data-view-nav="activity"]').focus();
    await browserPage.keyboard.press('Enter');
    assert.equal(await browserPage.locator('[data-view="activity"]').isVisible(), true);
    assert.equal(await browserPage.locator('[data-view-nav="activity"]').getAttribute('aria-current'), 'page');
    await browserPage.locator('#activity-filter').fill('finance');
    assert.deepEqual(await browserPage.locator('#activity-list .activity-row').allTextContents(), ['Quarterly report exportedFinance']);
    await browserPage.locator('#activity-filter').fill('no matching activity');
    assert.equal(await browserPage.locator('#activity-list .activity-empty').textContent(), 'No activity matches your filter.');
    await browserPage.locator('#activity-filter').fill('');
    await browserPage.locator('#sort-descending').focus();
    const focusStyle = await browserPage.locator('#sort-descending').evaluate((element) => {
      const style = getComputedStyle(element);
      return { outline: style.outlineStyle, shadow: style.boxShadow };
    });
    assert(focusStyle.outline !== 'none' || focusStyle.shadow !== 'none', 'keyboard focus should remain visible');
    await browserPage.keyboard.press('Enter');
    assert.deepEqual(await browserPage.locator('#activity-list .activity-row').allTextContents(), [
      'Quarterly report exportedFinance', 'New account createdSupport', 'Deployment completedPlatform',
    ]);
    await browserPage.locator('#refresh-activity').click();
    await browserPage.waitForFunction(() => document.getElementById('activity-status')?.textContent === 'Updated');
    await browserPage.locator('#activity-filter').fill('');
    assert.deepEqual(await browserPage.locator('#activity-list .activity-row').allTextContents(), ['Live API activity loadedOperations', 'Dashboard refreshedPlatform']);
    assert.deepEqual(browserErrors, []);
    console.log('Dashboard browser example passed: views, filtering, sorting, empty state, fetch, state, and accessibility.');
  } finally {
    if (browser) await browser.close();
    await stopServer(server);
  }
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
