'use strict';

const assert = require('assert/strict');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const PORT = Number(process.env.BUILDHTML_BROWSER_PORT) || 3417;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const fixturePath = path.join(__dirname, 'browser-fixture.js');

function waitForFixture(child, stderr) {
  const deadline = Date.now() + 10000;
  return new Promise((resolve, reject) => {
    function attempt() {
      if (child.exitCode !== null) {
        reject(new Error(`Browser fixture exited early with code ${child.exitCode}: ${stderr.join('')}`));
        return;
      }

      const request = http.get(ORIGIN, response => {
        response.resume();
        if (response.statusCode === 200) {
          resolve();
        } else {
          retry();
        }
      });
      request.on('error', retry);
    }

    function retry() {
      if (Date.now() >= deadline) {
        reject(new Error(`Timed out waiting for browser fixture: ${stderr.join('')}`));
        return;
      }
      setTimeout(attempt, 100);
    }

    attempt();
  });
}

function stopFixture(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 3000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

async function run() {
  const stderr = [];
  const fixture = spawn(process.execPath, [fixturePath], {
    env: { ...process.env, BUILDHTML_BROWSER_PORT: String(PORT) },
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
  });
  fixture.stderr.on('data', chunk => stderr.push(chunk.toString()));

  let browser;
  try {
    await waitForFixture(fixture, stderr);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const browserErrors = [];
    page.on('pageerror', error => browserErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push(message.text());
    });

    await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });

    assert.equal(await page.locator('#count-output').textContent(), '0');
    assert.equal(await page.locator('#portal-source').evaluate(element => element.parentElement.id), 'portal-target');
    assert.equal(await page.locator('#lifecycle-target').getAttribute('data-mounted'), 'true');

    await page.locator('#increment').click();
    assert.equal(await page.locator('#count-output').textContent(), '1');
    assert.equal(await page.locator('#lifecycle-target').getAttribute('data-last-count'), '1');

    await page.locator('#use-context').click();
    assert.equal(await page.locator('#context-result').textContent(), 'result=use-context:projects');
    const eventNotCancelled = await page.locator('#event-contract').evaluate(element => (
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    ));
    assert.equal(eventNotCancelled, true);
    assert.equal(await page.locator('#event-contract-result').textContent(), 'true:true:true');
    await page.locator('#async-event-contract').click();
    await page.waitForFunction(() => document.getElementById('async-event-contract-result')?.textContent !== '');
    assert.equal(await page.locator('#async-event-contract-result').textContent(), 'true:true');

    // Event options: `once` must stop firing, a plain listener must not, and
    // `preventDefault` must actually cancel the event.
    await page.locator('#once-button').click();
    await page.locator('#once-button').click();
    await page.locator('#once-button').click();
    assert.equal(await page.locator('#once-count').textContent(), '1');

    await page.locator('#repeat-button').click();
    await page.locator('#repeat-button').click();
    assert.equal(await page.locator('#repeat-count').textContent(), '2');

    const preventedCancelled = await page.locator('#prevented-button').evaluate(element => (
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    ));
    assert.equal(preventedCancelled, false);
    assert.equal(await page.locator('#prevented-count').textContent(), '1');

    await page.locator('#name-input').fill('Grace Hopper');
    assert.equal(await page.locator('#name-output').textContent(), 'Grace Hopper');

    await page.locator('#toggle-visibility').click();
    assert.equal(await page.locator('#visibility').isHidden(), true);

    await page.locator('#toggle-theme').click();
    assert.equal(await page.locator('#class-output').getAttribute('class'), 'theme-dark');

    assert.equal(await page.locator('#overview-section').isVisible(), true);
    assert.equal(await page.locator('#done-section').isHidden(), true);
    assert.equal(await page.locator('#overview-view').getAttribute('class'), 'nav-item active');
    await page.locator('#done-view').click();
    assert.equal(await page.locator('#overview-section').isHidden(), true);
    assert.equal(await page.locator('#done-section').isVisible(), true);
    assert.equal(await page.locator('#overview-view').getAttribute('class'), 'nav-item');
    assert.equal(await page.locator('#done-view').getAttribute('class'), 'nav-item active');

    assert.equal(await page.locator('#summary-panel').isVisible(), true);
    assert.equal(await page.locator('#activity-panel').isHidden(), true);
    assert.equal(await page.locator('#summary-panel-button').getAttribute('class'), 'selected');
    assert.equal(await page.locator('#summary-panel-button').getAttribute('aria-current'), 'page');
    await page.locator('#activity-panel-button').click();
    assert.equal(await page.locator('#summary-panel').isHidden(), true);
    assert.equal(await page.locator('#activity-panel').isVisible(), true);
    assert.equal(await page.locator('#summary-panel-button').getAttribute('aria-current'), null);
    assert.equal(await page.locator('#activity-panel-button').getAttribute('class'), 'selected');

    await page.locator('#unsafe-link').click();
    assert.equal(await page.locator('#link-output').getAttribute('href'), '#');

    // Reactive URL sanitisation, checked against the DOM the browser actually
    // built rather than against the generated source. A scheme split by tab, LF
    // or CR reads as inert text in the page source, but the URL parser removes
    // those characters and reassembles a working javascript: URL — which is why
    // `element.href` (the RESOLVED value) is asserted alongside the attribute.
    const hostileUrls = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      'java\rscript:alert(1)',
      'java\t\n\rscript:alert(1)',
      'v\tbscript:alert(1)',
      'da\nta:text/html,<script>alert(1)</script>',
    ];
    for (const url of hostileUrls) {
      await page.evaluate((value) => { window.State.link = value; }, url);
      assert.equal(
        await page.locator('#link-output').getAttribute('href'), '#',
        `bindAttr neutralised ${JSON.stringify(url)}`
      );
      const resolved = await page.locator('#link-output').evaluate(el => el.href);
      assert.ok(
        !/^\s*(?:javascript|vbscript|data):/i.test(resolved),
        `resolved href is not executable for ${JSON.stringify(url)} (got ${resolved})`
      );
    }

    const safeUrls = ['/relative/path', 'https://example.test/a?b=c', '#fragment', 'mailto:a@b.test'];
    for (const url of safeUrls) {
      await page.evaluate((value) => { window.State.link = value; }, url);
      assert.equal(
        await page.locator('#link-output').getAttribute('href'), url,
        `bindAttr preserved ${JSON.stringify(url)}`
      );
    }

    // The same payloads through the liveList client rebuild (_mkEl), which had
    // its own hand-copied copy of the URL check.
    for (const url of hostileUrls) {
      await page.evaluate((value) => { window.State.linkItems = [{ id: 1, url: value }]; }, url);
      assert.equal(
        await page.locator('#link-list [data-link]').getAttribute('href'), '#',
        `liveList neutralised ${JSON.stringify(url)}`
      );
      const resolved = await page.locator('#link-list [data-link]').evaluate(el => el.href);
      assert.ok(
        !/^\s*(?:javascript|vbscript|data):/i.test(resolved),
        `resolved liveList href is not executable for ${JSON.stringify(url)} (got ${resolved})`
      );
    }
    for (const url of safeUrls) {
      await page.evaluate((value) => { window.State.linkItems = [{ id: 1, url: value }]; }, url);
      assert.equal(
        await page.locator('#link-list [data-link]').getAttribute('href'), url,
        `liveList preserved ${JSON.stringify(url)}`
      );
    }
    await page.evaluate(() => { window.State.link = '/safe'; });

    await page.locator('#add-item').click();
    assert.deepEqual(await page.locator('#list [data-item]').allTextContents(), ['One', 'Two']);

    await page.locator('#mutate-profile').click();
    assert.equal(await page.locator('#profile-output').textContent(), 'Grace:first,second');

    await page.locator('#done-route').click();
    await page.waitForURL(`${ORIGIN}/#done`);
    await page.waitForFunction(() => document.getElementById('view-output')?.textContent === 'done');
    assert.equal(await page.locator('#view-output').textContent(), 'done');

    await page.locator('#user-route').click();
    await page.waitForURL(`${ORIGIN}/app/users/alice%20smith`);
    await page.waitForFunction(() =>
      document.getElementById('page-output')?.textContent === 'user' &&
      document.getElementById('params-output')?.textContent === 'alice smith'
    );
    assert.equal(await page.locator('#page-output').textContent(), 'user');
    assert.equal(await page.locator('#params-output').textContent(), 'alice smith');

    await page.goBack();
    await page.waitForURL(`${ORIGIN}/#done`);
    await page.waitForFunction(() =>
      document.getElementById('page-output')?.textContent === 'home' &&
      document.getElementById('view-output')?.textContent === 'done'
    );
    assert.equal(await page.locator('#page-output').textContent(), 'home');
    assert.equal(await page.locator('#view-output').textContent(), 'done');

    await page.locator('#remove-lifecycle').click();
    await page.waitForFunction(() =>
      !document.getElementById('lifecycle-target') &&
      document.getElementById('lifecycle-destroyed')?.textContent === 'true'
    );
    assert.equal(await page.locator('#lifecycle-destroyed').textContent(), 'true');
    assert.deepEqual(browserErrors, []);

    console.log('Browser integration passed: bindings, deep state, lists, portals, routing, sanitization, and lifecycle.');
  } finally {
    if (browser) await browser.close();
    await stopFixture(fixture);
  }
}

run().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
