'use strict';

const assert = require('assert/strict');
const http = require('http');
const path = require('path');
const fs = require('node:fs');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { Document } = require('../index');
const { CounterDocument, createCompilationServer } = require('../example/compilation');
const navigationExamples = require('../example/bundle-navigation');

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
    assert.equal(await page.locator('#computed-count').textContent(), '0');
    assert.equal(await page.locator('#portal-source').evaluate(element => element.parentElement.id), 'portal-target');
    assert.equal(await page.locator('#lifecycle-target').getAttribute('data-mounted'), 'true');

    await page.locator('#increment').click();
    assert.equal(await page.locator('#count-output').textContent(), '1');
    assert.equal(await page.locator('#computed-count').textContent(), '2');
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

    const keyedInput = page.locator('#keyed-list [data-key="a"] input');
    await keyedInput.fill('unsaved edit');
    await keyedInput.evaluate(element => {
      window.keyedInputBefore = element;
      window.keyedRowBefore = element.parentNode;
      element.setSelectionRange(2, 7, 'forward');
      window.State.keyedItems = [{ id: 'b', label: 'Two' }, { id: 'a', label: 'Updated' }];
    });
    assert.equal(await page.locator('#keyed-list [data-key]').first().getAttribute('data-key'), 'b');
    assert.deepEqual(await keyedInput.evaluate(element => ({
      sameInput: element === window.keyedInputBefore,
      sameRow: element.parentNode === window.keyedRowBefore,
      focused: document.activeElement === element,
      value: element.value,
      start: element.selectionStart,
      end: element.selectionEnd,
    })), { sameInput: true, sameRow: true, focused: true, value: 'unsaved edit', start: 2, end: 7 });
    assert.equal(await page.locator('#keyed-list [data-key="a"] span').textContent(), 'Updated');
    await page.locator('#keyed-list [data-key="a"] button').click();
    assert.equal(await page.evaluate(() => window.State.keyedSelection), 'Updated');
    await page.evaluate(() => { window.State.keyedItems = []; });
    assert.equal(await page.locator('#keyed-list').textContent(), 'No keyed items');

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

    /* ---- CSS compilation, as the browser's own parser sees it ---- */

    // Nothing a pseudo, media or nth-child argument contained may become an
    // element, and no rule may escape its own selector.
    assert.equal(await page.evaluate(() => window.__cssPwned === true), false,
      'a CSS argument must not execute script');
    assert.equal(
      await page.evaluate(() => [...document.querySelectorAll('script')]
        .filter(s => s.textContent.includes('__cssPwned')).length),
      0, 'no script element was smuggled in through a stylesheet');
    assert.equal(
      await page.evaluate(() => [...document.querySelectorAll('style')]
        .filter(s => s.textContent.includes('__cssPwned')).length),
      0, 'the payload did not survive into a style element either');
    assert.equal(
      await page.locator('#css-canary').evaluate(el => getComputedStyle(el).display), 'block',
      'a crafted nth-child argument must not write a rule that hides another element');

    // Every stylesheet the page loaded must parse into rules; a rule the browser
    // could not parse is a rule that was assembled wrong.
    const styleSheetErrors = await page.evaluate(() => {
      const problems = [];
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) if (!rule.cssText) problems.push('empty rule');
        } catch (error) { problems.push(error.message); }
      }
      return problems;
    });
    assert.deepEqual(styleSheetErrors, [], 'every emitted rule parses');

    // The rejected rules must not have applied, and the legitimate ones must.
    for (const id of ['css-pseudo-attack', 'css-media-attack', 'css-nth-attack']) {
      assert.equal(await page.locator(`#${id}`).evaluate(el => getComputedStyle(el).color),
        'rgb(0, 0, 0)', `${id} got no styling from a rejected rule`);
    }
    assert.equal(await page.locator('#css-nth-ok').evaluate(el => getComputedStyle(el).color),
      'rgb(7, 8, 9)', 'a real :nth-child(odd) rule still applies');
    await page.locator('#css-hover-ok').hover();
    assert.equal(await page.locator('#css-hover-ok').evaluate(el => getComputedStyle(el).color),
      'rgb(4, 5, 6)', 'a real :hover rule still applies');

    // Canonical ordering, observed through the DOM: one class, one rule, both
    // elements styled.
    const orderClasses = await page.evaluate(() => [
      document.getElementById('css-order-a').className,
      document.getElementById('css-order-b').className,
    ]);
    assert.equal(orderClasses[0], orderClasses[1],
      'declarations written in either order share one class');
    assert.equal(await page.evaluate((cls) => {
      let count = 0;
      for (const sheet of document.styleSheets) {
        for (const rule of sheet.cssRules) if (rule.selectorText === '.' + cls) count++;
      }
      return count;
    }, orderClasses[0]), 1, 'the shared rule is in the stylesheet exactly once');

    // liveList: `css` is a class and `style` is inline, before and after a
    // client-side rebuild, and the class carries real computed styles.
    const ssrRow = await page.evaluate(() => {
      const row = document.querySelector('#css-list [data-row="1"]');
      return { className: row.className, inline: row.getAttribute('style'), color: getComputedStyle(row).color };
    });
    assert.match(ssrRow.className, /^c[a-z0-9]+$/, 'a server-rendered row carries a scoped class');
    assert.equal(ssrRow.color, 'rgb(13, 14, 15)', 'the class actually styles the row');
    assert.match(ssrRow.inline, /font-style:\s*italic/, 'style stays inline');
    assert.doesNotMatch(ssrRow.inline, /color/, 'css did not leak into the style attribute');

    await page.locator('#add-css-row').click();
    await page.waitForFunction(() => document.querySelectorAll('#css-list [data-row]').length === 2);
    const rebuiltRows = await page.evaluate(() => (
      [...document.querySelectorAll('#css-list [data-row]')].map(row => ({
        className: row.className,
        inline: row.getAttribute('style'),
        color: getComputedStyle(row).color,
        padding: getComputedStyle(row).paddingLeft,
      }))
    ));
    assert.equal(rebuiltRows.length, 2, 'the list rebuilt');
    assert.equal(rebuiltRows[0].className, ssrRow.className,
      'a rebuilt row lands on the same class the server rendered');
    assert.equal(rebuiltRows[1].className, ssrRow.className,
      'a brand-new row lands on that same class too');
    for (const row of rebuiltRows) {
      assert.equal(row.color, 'rgb(13, 14, 15)', 'the client-minted rule reached the document');
      assert.equal(row.padding, '2px', 'every declaration in the rule applies');
      assert.match(row.inline, /font-style:\s*italic/, 'style is still inline after rebuild');
    }

    /* ---- Unicode survives every stage, as the browser sees it ---- */

    // The reference value is read from the page's own JS state, so the
    // comparison is against what the author wrote, not a second copy in this
    // file that could drift from the fixture.
    const expectedText = await page.evaluate(() => window.State.unicodeText);
    assert.match(expectedText, /\u{1F600}/u, 'the fixture really does carry astral characters');
    assert.match(expectedText, /\u2028/, 'and the separators that end a JS string literal');

    assert.equal(await page.locator('#unicode-ssr').textContent(), expectedText,
      'server-rendered text round-trips through HTML parsing byte for byte');
    assert.equal(await page.locator('#unicode-bound').textContent(), expectedText,
      'a reactive binding reproduces it after hydration');

    // Code points, not UTF-16 units: an emoji that lost a surrogate half would
    // still compare equal by length in a careless check.
    const codePoints = await page.locator('#unicode-ssr').evaluate(el => [...el.textContent].length);
    assert.equal(codePoints, [...expectedText].length, 'no surrogate pair was split');

    // Through the client runtime: a liveList row is rebuilt from the compiled
    // itemFn, so its text passes through a JS string literal in the page source.
    const unicodeSsrRows = await page.evaluate(() =>
      [...document.querySelectorAll('#unicode-list [data-u]')].map(el => el.textContent));
    assert.equal(unicodeSsrRows.length, 3, 'unicode rows rendered on the server');

    await page.locator('#add-unicode-row').click();
    await page.waitForFunction(() => document.querySelectorAll('#unicode-list [data-u]').length === 4);
    const unicodeRebuilt = await page.evaluate(() =>
      [...document.querySelectorAll('#unicode-list [data-u]')].map(el => el.textContent));
    assert.deepEqual(unicodeRebuilt.slice(0, 3), unicodeSsrRows,
      'a client rebuild reproduces every row unchanged');
    assert.match(unicodeRebuilt[3], /\u{1F680}/u, 'the newly added row keeps its astral characters');
    assert.match(unicodeRebuilt[3], /\u05D3\u05D4/, 'and its RTL characters');

    // U+2028/U+2029 inside a row would terminate the string literal they are
    // compiled into if they were not escaped — the page would not parse at all.
    assert.ok(unicodeRebuilt.some(t => t.includes('\u2028') && t.includes('\u2029')),
      'the line separators survived being compiled into client JavaScript');

    // A quoted font-family in a row's css must keep its quotes through the
    // client-minted rule, which is where a hand-copied sanitiser once ate them.
    assert.match(
      await page.locator('#unicode-list [data-u="1"]').evaluate(el => getComputedStyle(el).fontFamily),
      /Fira Code/, 'a quoted font-family survives the client rebuild');

    await page.locator('#remove-lifecycle').click();
    await page.waitForFunction(() =>
      !document.getElementById('lifecycle-target') &&
      document.getElementById('lifecycle-destroyed')?.textContent === 'true'
    );
    assert.equal(await page.locator('#lifecycle-destroyed').textContent(), 'true');
    assert.deepEqual(browserErrors, []);

    await page.goto(`${ORIGIN}/csp`, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#csp-list p').evaluate(el => getComputedStyle(el).color), 'rgb(255, 0, 0)');
    await page.evaluate(() => { window.State.colors[0].color = 'rgb(0, 0, 255)'; });
    assert.equal(await page.locator('#csp-list p').evaluate(el => getComputedStyle(el).color), 'rgb(0, 0, 255)');
    assert.equal(await page.locator('#_bh-live-css').evaluate(el => el.nonce), 'test-csp-nonce');
    assert.deepEqual(browserErrors, [], 'strict CSP accepts initial and later generated list styles');

    await page.goto(`${ORIGIN}/class-host`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
      const { CompiledPage } = await import('/compiled.js');
      window.hostState = { sentinel: true };
      window.State = window.hostState;
      const target = document.getElementById('class-target');
      const existing = target.firstElementChild;
      window.firstPage = new CompiledPage({ nonce: 'test-class-nonce' }).mount(target);
      const first = Array.from(target.children).slice(1);
      window.secondPage = new CompiledPage({ nonce: 'test-class-nonce' }).mount(target);
      const second = Array.from(target.children).slice(1 + first.length);
      window.firstNode = id => first.find(node => node.id === id);
      window.secondNode = id => second.find(node => node.id === id);
      const authoredTags = 'H1 SPAN SPAN BUTTON INPUT TEMPLATE DIV SPAN DIV BUTTON BUTTON SECTION SECTION DIV DIV';
      window.directMount = window.firstPage.root === target && window.secondPage.root === target
        && target.firstElementChild === existing
        && [first, second].every(nodes => nodes.map(node => node.tagName).join(' ') === authoredTags)
        && [...first, ...second].every(node => node.parentNode === target && !node.shadowRoot);
    });
    assert.deepEqual(await page.evaluate(() => ({
      first: window.firstNode('compiled-count').textContent,
      second: window.secondNode('compiled-count').textContent,
      direct: window.directMount,
      ready: window.firstPage.state.ready && window.secondPage.state.ready,
      hostState: window.State === window.hostState,
      title: document.title,
      hostCount: document.querySelector('body > #compiled-count').textContent,
      color: getComputedStyle(window.firstPage.root.querySelector('h1')).color,
    })), { first: '0', second: '0', direct: true, ready: true, hostState: true, title: 'Host title', hostCount: 'Host count', color: 'rgb(0, 128, 0)' });
    assert.deepEqual(await page.evaluate(() => {
      const probe = window.firstNode('compiled-platform');
      return { ...probe.dataset, template: window.firstNode('compiled-template').content.textContent };
    }), { array: 'true', event: 'true', promise: 'true', view: 'true', contains: 'true', method: 'true', tag: 'true', class: 'true', live: 'true', signal: '0', invalidSignal: 'true', template: 'Template content' },
    'scoped browser APIs retain constructor properties, local live lookups and template content');
    assert.equal(await page.evaluate(() => {
      const template = window.firstNode('compiled-template');
      const clone = template.content.cloneNode(true);
      const text = clone.textContent;
      window.firstNode('compiled-platform').appendChild(clone);
      return template.childNodes.length === 0 && text === 'Template content';
    }), true, 'compiled template fragments can be cloned and inserted using native DOM APIs');
    await page.evaluate(() => window.firstNode('compiled-increment').click());
    assert.deepEqual(await page.evaluate(() => [window.firstPage.state.count, window.secondPage.state.count,
      window.firstNode('compiled-double').textContent]), [1, 0, '2']);
    await page.evaluate(() => {
      const input = window.firstNode('compiled-input');
      input.value = 'Typed';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.equal(await page.evaluate(() => window.firstNode('compiled-name').textContent), 'Typed');
    assert.equal(await page.evaluate(() => window.firstNode('compiled-portal-target').firstElementChild.textContent), 'Local portal');
    assert.deepEqual(await page.evaluate(() => {
      window.firstPage.state.activeView = 'details';
      return [window.firstNode('compiled-details').hidden, window.secondNode('compiled-details').hidden];
    }), [false, true], 'view switching stays within the instance');
    await page.evaluate(() => {
      window.firstPage.state.items.push({ id: 2, title: 'Two' });
      window.classRow = window.firstNode('compiled-list').querySelector('button:last-child');
      window.classRow.click();
    });
    assert.equal(await page.evaluate(() => window.firstPage.state.name), 'Two');
    assert.equal(await page.evaluate(() => getComputedStyle(window.classRow).color), 'rgb(0, 0, 255)');
    await page.evaluate(() => {
      const instance = window.firstPage;
      const node = instance.createElement('aside');
      node.textContent = 'Native appended child';
      if (instance.createElement(node) !== node) throw new Error('Existing node was not reused');
      window.firstNode('compiled-platform').appendChild(node);
      window.savedLifecycle = window.firstNode('compiled-lifecycle');
      window.savedButton = window.firstNode('compiled-increment');
      window.savedRoot = instance.root;
      window.savedDetails = window.firstNode('compiled-details');
      window.firstStyles = document.head.querySelectorAll('style').length;
      instance.destroy();
      instance.state.activeView = 'overview';
      window.savedButton.click();
      window.classRow.click();
      window.savedRoot.dispatchEvent(new Event('custom-event'));
      window.savedRoot.dispatchEvent(new Event('caller-signal-event'));
    });
    assert.deepEqual(await page.evaluate(() => ({
      count: window.firstPage.state.count,
      name: window.firstPage.state.name,
      cleaned: window.savedLifecycle.dataset.cleaned,
      destroyed: window.savedLifecycle.dataset.destroyed,
      existing: document.getElementById('class-target').firstElementChild.id,
      remaining: window.secondNode('compiled-count').isConnected,
      removed: !window.savedButton.isConnected && !window.savedLifecycle.isConnected,
      stylesRemoved: window.firstStyles - document.head.querySelectorAll('style').length,
      root: window.firstPage.root,
      detailsHidden: window.savedDetails.hidden,
    })), { count: 1, name: 'Two', cleaned: 'true', destroyed: 'true', existing: 'existing-child', remaining: true, removed: true, stylesRemoved: 2, root: null, detailsHidden: false });
    await page.evaluate(() => window.firstPage.mount(document.getElementById('class-target')));
    assert.equal(await page.evaluate(() => window.firstPage.state.count), 0, 'remount starts with independent initial state');
    assert.equal(await page.evaluate(async () => {
      const { CompiledPage } = await import('/compiled.js');
      const target = document.getElementById('class-target');
      const children = Array.from(target.childNodes);
      const styles = document.head.querySelectorAll('style').length;
      const instance = new CompiledPage({ nonce: 'test-class-nonce' });
      const initialize = instance._initialize;
      instance._initialize = function () {
        initialize.call(this);
        throw new Error('expected initialization failure');
      };
      try { instance.mount(target); } catch (error) {
        return error.message.includes('expected initialization failure') && instance.root === null
          && target.childNodes.length === children.length && children.every((node, index) => target.childNodes[index] === node)
          && document.head.querySelectorAll('style').length === styles;
      }
      return false;
    }), true, 'failed initialization removes only the attempted mount and its styles');
    assert.deepEqual(await page.evaluate(async () => {
      const { CompiledPage } = await import('/compiled.js');
      const instance = new CompiledPage({ nonce: 'test-class-nonce' });
      const target = document.getElementById('class-target');
      const hosts = target.children.length;
      let invalidTarget = false, invalidNode = false, failedBuild = false, duplicateMount = false;
      try { instance.mount(null); } catch (error) { invalidTarget = error.message.includes('Mount target'); }
      const create = instance.createElement;
      instance.createElement = function (tag) {
        if (tag === 'h1') throw new Error('expected DOM build failure');
        return create.call(this, tag);
      };
      try { instance.mount(target); } catch (error) { failedBuild = error.message.includes('expected DOM build failure'); }
      const cleaned = instance.root === null && target.children.length === hosts;
      instance.createElement = create;
      instance.mount(target);
      try { instance.createElement({}); } catch (error) { invalidNode = error.message.includes('Expected a tag name or DOM node'); }
      try { instance.mount(target); } catch (error) { duplicateMount = error.message.includes('already mounted'); }
      instance.destroy();
      instance.destroy();
      return { invalidTarget, invalidNode, failedBuild, cleaned, duplicateMount, hostsRestored: target.children.length === hosts };
    }), { invalidTarget: true, invalidNode: true, failedBuild: true, cleaned: true, duplicateMount: true, hostsRestored: true });
    assert.deepEqual(await page.evaluate(async () => {
      const { StatelessPage } = await import('/compiled-stateless.js');
      const detached = document.createElement('div');
      const shadow = document.createElement('div').attachShadow({ mode: 'open' });
      const counts = [detached, shadow].map(target => {
        const instance = new StatelessPage().mount(target);
        if (instance.root !== target || target.firstElementChild.tagName !== 'BUTTON') throw new Error('Expected a direct child');
        target.firstElementChild.click();
        const count = instance.state.count;
        instance.destroy();
        if (target.hasChildNodes()) throw new Error('Expected an empty target after destroy');
        return count;
      });
      return { counts, hostUntouched: window.State === window.hostState && !('count' in window.hostState) };
    }), { counts: [1, 1], hostUntouched: true });
    assert.equal(await page.evaluate(async () => {
      const { Object: ObjectPage } = await import('/compiled-object.js');
      const target = document.body.appendChild(document.createElement('div'));
      const instance = new ObjectPage({ nonce: 'test-class-nonce' }).mount(target);
      target.querySelector('#compiled-increment').click();
      const valid = instance.state.count === 1 && instance.constructor.name === 'Object';
      instance.destroy();
      target.remove();
      return valid;
    }), true, 'export names that match browser globals do not shadow runtime helpers');
    assert.deepEqual(browserErrors, [], 'compiled modules mount and update without CSP or runtime errors');

    const walkthrough = createCompilationServer();
    await new Promise((resolve, reject) => {
      walkthrough.once('error', reject);
      walkthrough.listen(0, '127.0.0.1', resolve);
    });
    try {
      const origin = `http://127.0.0.1:${walkthrough.address().port}`;
      await page.goto(origin, { waitUntil: 'load' });
      await page.waitForFunction(() => window.examplePage?.root);
      assert.equal(await page.locator('#app #greeting').textContent(), 'Hello, Ada');
      await page.locator('#app #example-name').fill('Grace');
      assert.equal(await page.locator('#app #greeting').textContent(), 'Hello, Grace');
      await page.locator('#app #increment').click();
      assert.equal(await page.locator('#app #count').textContent(), 'Count: 1');
      assert.equal(await page.locator('#app #double').textContent(), 'Double: 2');
      await page.locator('#app #tasks-view').click();
      const task = page.locator('#app [data-task="1"]');
      await task.evaluate(node => { window.exampleTaskBefore = node; });
      await task.locator('button').click();
      assert.equal(await task.locator('button').textContent(), 'Undo');
      assert.equal(await task.evaluate(node => node === window.exampleTaskBefore), true, 'walkthrough task updates retain keyed rows');
      await page.locator('#destroy').click();
      assert.equal(await page.locator('#app').textContent(), '');
      assert.match(await page.locator('#mount-status').textContent(), /^Destroyed/);
      await page.locator('#mount').click();
      assert.equal(await page.locator('#app #count').textContent(), 'Count: 0');
      assert.equal(await page.locator('#app #greeting').textContent(), 'Hello, Ada');

      await page.locator('#destroy').click();
      await page.evaluate(() => {
        window.exampleMount = window.examplePage.mount;
        window.examplePage.mount = function () { throw new Error('expected mount failure'); };
      });
      await page.locator('#mount').click();
      assert.match(await page.locator('#mount-status').textContent(), /Mount failed: expected mount failure/);
      await page.evaluate(() => { window.examplePage.mount = window.exampleMount; });
      await page.locator('#mount').click();
      await page.evaluate(() => {
        window.exampleDestroy = window.examplePage.destroy;
        window.examplePage.destroy = function () { throw new Error('expected destroy failure'); };
      });
      await page.locator('#destroy').click();
      assert.match(await page.locator('#mount-status').textContent(), /Destroy failed: expected destroy failure/);
      await page.evaluate(() => { window.examplePage.destroy = window.exampleDestroy; });
      await page.locator('#destroy').click();

      await page.goto(`${origin}/server`, { waitUntil: 'load' });
      await page.locator('#increment').click();
      assert.equal(await page.locator('#count').textContent(), 'Count: 1');
      assert.equal(await page.locator('#double').textContent(), 'Double: 2');
      await page.locator('#tasks-view').click();
      await page.locator('[data-task="1"] button').click();
      assert.equal(await page.locator('[data-task="1"] button').textContent(), 'Undo');
      assert.deepEqual(browserErrors, [], 'both documented example outputs work without browser errors');
    } finally {
      await new Promise((resolve, reject) => walkthrough.close(error => error ? reject(error) : resolve()));
    }

    const workspace = path.resolve(__dirname, '..');
    fs.mkdirSync(path.join(workspace, '.baseline'), { recursive: true });
    const bundleDir = fs.mkdtempSync(path.join(workspace, '.baseline', 'browser-bundle-'));
    const htmlFile = path.join(bundleDir, 'home #page.html');
    const jsFile = path.join(bundleDir, 'home #page.js');
    let bundleServer;
    try {
      const doc = new CounterDocument();
      doc.charset('windows-1252').title('Compilation café 😀');
      doc.htmlAttr('class', 'bundle-html').bodyClass('bundle-body');
      doc.addLink('./theme.css').favicon('./icon.svg', 'image/svg+xml').addScript('./head.js');
      doc.cssVars({ 'bundle-head-probe': 'ready' }).globalCss('main', { borderTopColor: 'red' });
      doc.globalCss(':root', { colorScheme: 'dark' });
      doc.inlineStyle(':root { --bundle-root-rule: loaded; }');
      doc.inlineStyle('main::after { content: "</STYLE>"; }');
      doc.inlineStyle(String.raw`main::before { content: "\</STYLE> \\</STYLE>"; }`);
      doc.rawHead('<meta name="bundle-fixture" content="present">');
      doc.rawHead('<!-- relative assets use the following base -->');
      doc.rawHead('<base href="/bundle-assets/">');
      doc.rawHead('<style>main { border-top-color: blue; }</style>');
      doc.rawHead('<style>.cascade-probe { color: blue; }</style>');
      doc.rawHead('<script>bundleOrder.push("raw head");</script>');
      doc.p('Cascade probe').id('bundle-cascade').addClass('cascade-probe').css({ color: 'red' });
      doc.states({ reviewItems: ['Before'] });
      doc.build({ id: 'bundle-named-list', liveList: { stateKey: 'reviewItems', itemFn: item => ({ tag: 'p', text: item }) } });
      doc.button('Change named list').id('change-named-list').onClick(function () { State.reviewItems.push('After'); });
      const scripts = doc.div().id('bundle-body-scripts');
      scripts.create('script').id('bundle-body-first')
        .text('bundleOrder.push(document.currentScript.parentNode.id && "body first");')
        .bind('count', () => 'window.bundleBoundSourceRan = true;');
      scripts.create('script').id('bundle-body-external').attr('src', './body.js')
        .onMount(function () { this.dataset.mounted = 'true'; })
        .on('load', function (event) { this.dataset.loaded = 'true'; event.stopImmediatePropagation(); });
      const capture = scripts.div().id('bundle-script-capture').onMount(function () {
        this.addEventListener('load', event => {
          this.dataset.captured = 'true';
          event.stopPropagation();
        }, true);
      });
      capture.create('script').attr('type', 'module').attr('src', './body-module.js');
      scripts.create('script').attr('type', 'module').text('await Promise.resolve(); window.bundleOrder.push("body module");');
      scripts.create('script').attr('type', 'application/json').id('bundle-data').text('{"answer":42}');
      scripts.create('template').create('script').text('throw new Error("template script executed");');
      doc.create('script').text('bundleOrder.push("body last");');
      const svg = doc.create('svg').id('bundle-svg').attr('viewbox', '0 0 20 20');
      svg.create('lineargradient').id('bundle-gradient');
      svg.create('use').id('bundle-svg-link').attrs['XLINK:HREF'] = 'javascript:throw new Error("unsafe SVG URL")';
      svg.create('foreignobject').create('div').id('bundle-foreign-html').text('HTML inside SVG');
      svg.create('text').id('bundle-svg-count').bind('count');
      doc.create('math').id('bundle-math').create('mi').text('x');
      doc.inlineScript('const bundleInitialCount = document.querySelector("#app #count").textContent; bundleOrder.push(bundleInitialCount);');
      doc.inlineScript('throw new Error("expected authored script error");');
      doc.inlineScript('bundleOrder.push(bundleInitialCount + " again"); document.body.dataset.classicScript = String(this === window && !!document.currentScript);');
      const requestedFile = path.join(bundleDir, 'index.html');
      doc.saveBundle(bundleDir, { className: 'CounterPage', filename: 'home #page' });
      assert(!fs.existsSync(requestedFile), 'the directory export uses the requested filename instead of index.html');
      const files = new Map([
        ['/home #page.html', htmlFile], ['/bundle-assets/home #page.js', jsFile],
        ['/bundle-assets/home #page.css', path.join(bundleDir, 'home #page.css')],
        ['/bundle-assets/home #page.buildhtml-elements.css', path.join(bundleDir, 'home #page.buildhtml-elements.css')],
      ]);
      const policy = new Document();
      policy.rawHead('<!-- CSP must keep its position before the base -->');
      policy.rawHead('<meta http-equiv="Content-Security-Policy" content="base-uri \'none\'">');
      policy.rawHead('<base href="/bundle-assets/">');
      policy.p('Policy bundle');
      policy.saveBundle(path.join(bundleDir, 'policy.html'));
      for (const extension of ['html', 'css', 'js']) {
        files.set(`/policy.${extension}`, path.join(bundleDir, `policy.${extension}`));
        files.set(`/bundle-assets/policy.${extension}`, path.join(bundleDir, `policy.${extension}`));
      }
      for (const [name, createNavigation] of Object.entries(navigationExamples)) {
        const destination = path.join(bundleDir, 'navigation', name);
        createNavigation().saveBundle(destination);
        files.set(`/navigation/${name}/index.html`, path.join(destination, 'index.html'));
        files.set(`/navigation/${name}/index.js`, path.join(destination, 'index.js'));
        files.set(`/navigation/${name}/index.css`, path.join(destination, 'index.css'));
      }
      const encodedStyles = new Document();
      encodedStyles.inlineStyle('@charset "windows-1252"; #encoding-probe::after { content: "café 😀"; }');
      encodedStyles.p().id('encoding-probe');
      encodedStyles.saveBundle(path.join(bundleDir, 'encoding.html'));
      for (const extension of ['html', 'css', 'js']) {
        files.set(`/encoding.${extension}`, path.join(bundleDir, `encoding.${extension}`));
      }
      const hash = new Document();
      hash.rawHead('<base href="/bundle-assets/">');
      hash.a('#inbox/hello%20world', 'Open inbox').id('hash-inbox');
      hash.p().id('hash-view').bind('view');
      hash.p().id('hash-param').bind('routeParams', params => params?.name || '');
      hash.hashRouter({ default: 'home', routes: { home: 'Home', 'inbox/:name': 'Inbox', '*': 'Missing' } });
      hash.saveBundle(path.join(bundleDir, 'bundle-hash.html'));
      files.set('/bundle-hash.html', path.join(bundleDir, 'bundle-hash.html'));
      files.set('/bundle-assets/bundle-hash.js', path.join(bundleDir, 'bundle-hash.js'));
      files.set('/bundle-assets/bundle-hash.css', path.join(bundleDir, 'bundle-hash.css'));

      const history = new Document();
      history.rawHead('<base href="/bundle-assets/">');
      history.globalCss(':root', { colorScheme: 'dark' });
      history.a('/bundle-history/item/Ada%20Lovelace', 'Open item').id('history-item').data({ route: 'true' });
      history.a('/bundle-history/unknown', 'Open unknown').id('history-unknown').data({ route: 'true' });
      history.p().id('history-view').bind('view');
      history.p().id('history-param').bind('routeParams', params => params?.name || '');
      history.historyRouter({ base: '/bundle-history', routes: { '/': 'Home', '/item/:name': 'Item', '*': 'Missing' } });
      history.inlineScript('document.body.dataset.initialRoute = document.querySelector("#history-view").textContent;');
      const historyHtml = path.join(bundleDir, 'bundle-history.html');
      history.saveBundle(historyHtml);
      files.set('/bundle-assets/bundle-history.js', path.join(bundleDir, 'bundle-history.js'));
      files.set('/bundle-assets/bundle-history.css', path.join(bundleDir, 'bundle-history.css'));
      const resources = new Map([
        ['/bundle-assets/theme.css', ['text/css', 'main { background-color: rgb(11, 22, 33); }']],
        ['/bundle-assets/head.js', ['text/javascript', 'var bundleOrder = ["external head"]; window.bundleHeadProbe = getComputedStyle(document.documentElement).getPropertyValue("--bundle-head-probe").trim();']],
        ['/bundle-assets/body.js', ['text/javascript', 'bundleOrder.push("body external");']],
        ['/bundle-assets/body-module.js', ['text/javascript', 'import { CounterPage } from "./home%20%23page.js"; window.bundleOrder.push(CounterPage.name);']],
        ['/bundle-assets/icon.svg', ['image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"/>']],
      ]);
      bundleServer = http.createServer((request, response) => {
        try {
          const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
          const resource = resources.get(pathname);
          if (resource) {
            response.writeHead(200, { 'Content-Type': resource[0] });
            response.end(resource[1]);
            return;
          }
          const file = files.get(pathname) || (pathname.startsWith('/bundle-history/') ? historyHtml : null);
          if (!file) { response.writeHead(404); response.end('Not found'); return; }
          const body = fs.readFileSync(file);
          const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html';
          response.writeHead(200, { 'Content-Type': type });
          response.end(body);
        } catch (error) { response.writeHead(500); response.end('Unable to read generated test file'); }
      });
      await new Promise((resolve, reject) => {
        bundleServer.once('error', reject);
        bundleServer.listen(0, '127.0.0.1', resolve);
      });
      const origin = `http://127.0.0.1:${bundleServer.address().port}`;
      await page.goto(`${origin}/home%20%23page.html`, { waitUntil: 'load' });
      assert.equal(await page.title(), 'Compilation café 😀', 'UTF-8 bundle metadata survives a legacy source charset');
      assert.equal(await page.locator('body > script[type="module"][src]').evaluate(script => script.src), `${origin}/bundle-assets/home%20%23page.js`);
      assert.equal(await page.locator('html.bundle-html > body.bundle-body > #app > main').count(), 1);
      assert.equal(await page.locator('head meta[name="bundle-fixture"]').getAttribute('content'), 'present');
      assert.equal(await page.locator('head link[rel="icon"]').getAttribute('href'), './icon.svg');
      assert.equal(await page.locator('#app main').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(11, 22, 33)');
      assert.equal(await page.evaluate(() => window.bundleHeadProbe), 'ready', 'authored CSS is present when external head scripts run');
      assert.equal(await page.locator('#app main').evaluate(node => getComputedStyle(node).borderTopColor), 'rgb(0, 0, 255)', 'raw-head styles retain precedence over earlier authored CSS');
      assert.equal(await page.locator('#bundle-cascade').evaluate(node => getComputedStyle(node).color), 'rgb(255, 0, 0)', 'element CSS comes after equally specific raw-head rules');
      assert.equal(await page.locator('#app main').evaluate(node => getComputedStyle(node, '::after').content), '"</STYLE>"', 'CSS text survives a literal style end tag');
      assert.equal(await page.locator('#app main').evaluate(node => JSON.parse(getComputedStyle(node, '::before').content)), '</STYLE> \\</STYLE>', 'CSS escapes and literal backslashes survive style end tags');
      await page.waitForFunction(() => document.body.dataset.classicScript === 'true');
      await page.waitForFunction(() => window.bundleOrder.includes('body module'));
      const bundleOrder = await page.evaluate(() => window.bundleOrder);
      assert.equal(bundleOrder.filter(item => item === 'body module').length, 1);
      assert.deepEqual(bundleOrder.filter(item => item !== 'body module'), ['external head', 'raw head', 'body first', 'body external', 'CounterPage', 'body last', 'Count: 0', 'Count: 0 again']);
      assert.equal(await page.locator('body').getAttribute('data-classic-script'), 'true');
      assert.equal(await page.locator('#bundle-body-scripts > #bundle-body-first').count(), 1);
      assert.equal(await page.locator('#bundle-body-external').getAttribute('data-loaded'), 'true', 'body script load callbacks survive activation');
      assert.equal(await page.locator('#bundle-body-external').getAttribute('data-mounted'), 'true');
      assert.equal(await page.locator('#bundle-script-capture').getAttribute('data-captured'), 'true');
      assert.equal(await page.locator('#bundle-data').textContent(), '{"answer":42}');
      assert.deepEqual(await page.evaluate(() => ({
        colorScheme: getComputedStyle(document.documentElement).colorScheme,
        authoredRule: getComputedStyle(document.documentElement).getPropertyValue('--bundle-root-rule').trim(),
        svg: document.getElementById('bundle-svg').namespaceURI,
        viewBox: document.getElementById('bundle-svg').getAttribute('viewBox'),
        gradient: document.getElementById('bundle-gradient').localName,
        svgHref: document.getElementById('bundle-svg-link').getAttributeNS('http://www.w3.org/1999/xlink', 'href'),
        foreignHtml: document.getElementById('bundle-foreign-html').namespaceURI,
        math: document.querySelector('#bundle-math mi').namespaceURI,
      })), {
        colorScheme: 'dark', authoredRule: 'loaded', svg: 'http://www.w3.org/2000/svg',
        viewBox: '0 0 20 20', gradient: 'linearGradient', svgHref: '#', foreignHtml: 'http://www.w3.org/1999/xhtml',
        math: 'http://www.w3.org/1998/Math/MathML',
      });
      assert.equal(await page.locator('#app #count').textContent(), 'Count: 0');
      await page.locator('#app #increment').click();
      assert.equal(await page.locator('#app #count').textContent(), 'Count: 1');
      assert.equal(await page.locator('#app #double').textContent(), 'Double: 2');
      assert.equal(await page.locator('#bundle-svg-count').textContent(), '1');
      await page.locator('#change-named-list').click();
      assert.deepEqual(await page.locator('#bundle-named-list p').allTextContents(), ['Before', 'After']);
      assert.equal(await page.evaluate(() => window.bundleBoundSourceRan), undefined, 'reactive text is not executable script source');
      await page.locator('#app #tasks-view').click();
      await page.locator('#app [data-task="1"] button').click();
      assert.equal(await page.locator('#app [data-task="1"] button').textContent(), 'Undo');
      assert.deepEqual(browserErrors, ['expected authored script error'], 'a failing classic script reports its error and subsequent scripts still run');
      browserErrors.length = 0;

      await page.goto(`${origin}/bundle-hash.html`, { waitUntil: 'load' });
      assert.equal(await page.locator('#hash-view').textContent(), 'Home');
      await page.locator('#hash-inbox').click();
      await page.waitForFunction(() => document.querySelector('#hash-param').textContent === 'hello world');
      assert.equal(await page.locator('#hash-view').textContent(), 'Inbox');
      assert.equal(new URL(page.url()).pathname, '/bundle-hash.html', 'hash links stay on the document even under an asset base');
      await page.reload({ waitUntil: 'load' });
      assert.equal(await page.locator('#hash-param').textContent(), 'hello world');

      await page.goto(`${origin}/bundle-history/`, { waitUntil: 'load' });
      assert.equal(await page.locator('#history-view').textContent(), 'Home');
      const historyItemUrl = `${origin}/bundle-history/item/Ada%20Lovelace`;
      await page.evaluate(() => { window.keptOnNavigation = true; });
      await page.locator('#history-item').click();
      assert.equal(page.url(), historyItemUrl);
      assert.equal(await page.locator('#history-param').textContent(), 'Ada Lovelace');
      assert.equal(await page.evaluate(() => window.keptOnNavigation), true, 'History links navigate without reloading');
      await page.goBack();
      await page.waitForFunction(() => document.querySelector('#history-view').textContent === 'Home');
      await page.goForward();
      await page.waitForFunction(() => document.querySelector('#history-param').textContent === 'Ada Lovelace');
      await page.reload({ waitUntil: 'load' });
      assert.equal(await page.locator('#history-param').textContent(), 'Ada Lovelace');
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'dark', 'the linked stylesheet loads on a nested History route');
      assert.equal(await page.locator('body').getAttribute('data-initial-route'), 'Item', 'authored scripts observe the initialized route');
      await page.locator('#history-unknown').click();
      assert.equal(await page.locator('#history-view').textContent(), 'Missing');
      assert.deepEqual(browserErrors, [], 'exported routers run without browser errors');

      await page.goto(`${origin}/navigation/basic/index.html#about`, { waitUntil: 'load' });
      assert.equal(await page.locator('main h1').textContent(), 'About');
      await page.getByRole('link', { name: 'Contact' }).click();
      await page.waitForFunction(() => document.querySelector('main h1').textContent === 'Contact');

      await page.goto(`${origin}/navigation/panels/index.html#projects`, { waitUntil: 'load' });
      assert.equal(await page.getByRole('link', { name: 'Projects', exact: true }).evaluate(link => getComputedStyle(link).fontWeight), '700');
      await page.getByRole('link', { name: 'Open project 42' }).click();
      await page.getByRole('heading', { name: 'Project 42' }).waitFor();
      await page.goBack();
      await page.getByRole('heading', { name: 'Projects', exact: true }).waitFor();

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${origin}/navigation/dashboard/index.html#projects`, { waitUntil: 'load' });
      assert.equal(await page.locator('head link[rel="stylesheet"]').evaluate(link => link.sheet?.href), `${origin}/navigation/dashboard/index.css`);
      assert.equal(await page.locator('.cards > a').count(), 3);
      assert.equal(await page.locator('.sidebar nav').evaluate(nav => getComputedStyle(nav).display), 'flex');
      await page.getByRole('link', { name: /Atlas/ }).click();
      await page.getByRole('heading', { name: 'Atlas', exact: true }).waitFor();
      await page.reload({ waitUntil: 'load' });
      assert.equal(await page.locator('.detail .status').textContent(), 'In progress');
      await page.goto(`${origin}/navigation/dashboard/index.html#projects/unknown`);
      await page.getByRole('heading', { name: 'Project not found' }).waitFor();
      await page.goto(`${origin}/navigation/dashboard/index.html#unknown`);
      await page.getByRole('heading', { name: 'Page not found' }).waitFor();
      assert.deepEqual(browserErrors, [], 'all three navigation examples run from exported files');
      await page.goto(`${origin}/policy.html`, { waitUntil: 'load' });
      assert.equal(await page.evaluate(() => document.baseURI), `${origin}/policy.html`, 'CSP is applied before the base tag');
      assert.equal(await page.locator('#app p').textContent(), 'Policy bundle');

      await page.goto(`${origin}/encoding.html`, { waitUntil: 'load' });
      assert.equal(await page.locator('#encoding-probe').evaluate(node => getComputedStyle(node, '::after').content), '"café 😀"');

      fs.unlinkSync(jsFile);
      const missingModule = await page.request.get(`${origin}/bundle-assets/home%20%23page.js`);
      assert.equal(missingModule.status(), 500, 'test file-serving errors are caught');
    } finally {
      if (bundleServer?.listening) await new Promise((resolve, reject) => bundleServer.close(error => error ? reject(error) : resolve()));
      const relative = path.relative(fs.realpathSync(workspace), fs.realpathSync(bundleDir));
      assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'bundle fixture cleanup stays in the repository');
      fs.rmSync(bundleDir, { recursive: true, force: true });
    }

    console.log('Browser integration passed: bindings, lists, routing, lifecycle, CSP, compiled modules, signals, walkthrough, and automatic file bundles.');
  } finally {
    if (browser) await browser.close();
    await stopFixture(fixture);
  }
}

run().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
