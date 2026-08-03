'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const PORT = Number(process.env.BUILDHTML_AUTH_PORT) || 3420;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const examplePath = path.join(__dirname, '..', 'example', 'auth-interface.js');

function waitForServer(child, stderr) {
  const deadline = Date.now() + 10000;
  return new Promise((resolve, reject) => {
    function attempt() {
      if (child.exitCode !== null) return reject(new Error(`Authentication example exited early: ${stderr.join('')}`));
      const request = http.get(`${ORIGIN}/auth`, response => {
        response.resume();
        if (response.statusCode === 200) resolve();
        else retry();
      });
      request.on('error', retry);
    }
    function retry() {
      if (Date.now() >= deadline) return reject(new Error(`Timed out waiting for authentication example: ${stderr.join('')}`));
      setTimeout(attempt, 100);
    }
    attempt();
  });
}

function stopServer(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise(resolve => {
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
  server.stderr.on('data', chunk => stderr.push(chunk.toString()));
  let browser;
  try {
    await waitForServer(server, stderr);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${ORIGIN}/auth`, { waitUntil: 'domcontentloaded' });

    const login = page.locator('[data-view="login"]');
    const registration = page.locator('[data-view="register"]');
    const account = page.locator('[data-view="account"]');
    assert.equal(await login.isVisible(), true);
    assert.equal(await registration.isHidden(), true);
    assert.equal(await account.isHidden(), true);

    const registerTab = page.getByRole('button', { name: 'Register' });
    await registerTab.focus();
    const focusStyle = await registerTab.evaluate(element => {
      const style = getComputedStyle(element);
      return { outline: style.outlineStyle, width: style.outlineWidth };
    });
    assert(focusStyle.outline !== 'none' && focusStyle.width !== '0px', 'keyboard focus is visible');
    await page.keyboard.press('Enter');
    await registration.waitFor({ state: 'visible' });
    assert.equal(await registerTab.getAttribute('aria-current'), 'page');
    assert.equal(await page.getByLabel('Confirm password').getAttribute('autocomplete'), 'new-password');

    const accountTab = page.getByRole('button', { name: 'Account settings' });
    await accountTab.focus();
    await page.keyboard.press('Enter');
    await account.waitFor({ state: 'visible' });
    assert.equal(await accountTab.getAttribute('aria-current'), 'page');
    assert.equal(await page.getByLabel('New password').getAttribute('autocomplete'), 'new-password');
    assert.equal(await page.locator('input').count(), 10);
    assert.deepEqual(errors, []);
    console.log('Authentication browser example passed: keyboard views, focus visibility, labels, autocomplete, and client errors.');
  } finally {
    if (browser) await browser.close();
    await stopServer(server);
  }
}

run().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
