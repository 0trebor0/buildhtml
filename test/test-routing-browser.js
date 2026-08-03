'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const PORT = Number(process.env.BUILDHTML_ROUTING_PORT) || 3419;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const examplePath = path.join(__dirname, '..', 'example', 'routing.js');

function waitForServer(child, stderr) {
  const deadline = Date.now() + 10000;
  return new Promise((resolve, reject) => {
    function attempt() {
      if (child.exitCode !== null) return reject(new Error(`Routing example exited early: ${stderr.join('')}`));
      const request = http.get(`${ORIGIN}/hash`, response => {
        response.resume();
        if (response.statusCode === 200) resolve();
        else retry();
      });
      request.on('error', retry);
    }
    function retry() {
      if (Date.now() >= deadline) return reject(new Error(`Timed out waiting for routing example: ${stderr.join('')}`));
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

    await page.goto(`${ORIGIN}/hash#users/42`, { waitUntil: 'domcontentloaded' });
    await page.locator('#user-view').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#user-parameter').textContent(), 'Loaded user 42');
    await page.getByRole('link', { name: 'Missing route' }).click();
    assert.equal(new URL(page.url()).hash, '#missing');
    await page.locator('#not-found-view').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#not-found-view').isVisible(), true);
    await page.getByRole('link', { name: 'Home' }).click();
    await page.locator('#home-view').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#home-view').isVisible(), true);

    await page.goto(`${ORIGIN}/app/users/42`, { waitUntil: 'domcontentloaded' });
    await page.locator('#user-view').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#user-parameter').textContent(), 'Loaded user 42');
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#user-view').isVisible(), true);
    await page.getByRole('link', { name: 'Missing route' }).click();
    assert.equal(new URL(page.url()).pathname, '/app/missing');
    await page.locator('#not-found-view').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#not-found-view').isVisible(), true);
    await page.goBack();
    assert.equal(new URL(page.url()).pathname, '/app/users/42');
    await page.locator('#user-view').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#user-view').isVisible(), true);
    assert.deepEqual(errors, []);
    console.log('Routing browser example passed: hash changes, parameters, History navigation, direct refresh, wildcard, and back navigation.');
  } finally {
    if (browser) await browser.close();
    await stopServer(server);
  }
}

run().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
