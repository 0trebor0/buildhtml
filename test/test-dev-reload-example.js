'use strict';

/**
 * The dev auto-reload recipe in example/dev-reload.js.
 *
 * The example is a recipe rather than library API, but it is still shipped code
 * that people will copy, and its two failure modes are both silent: a page that
 * never reloads, and an endpoint left open when it should be off. Both are
 * asserted here.
 */

const assert = require('node:assert/strict');
const http = require('node:http');

function get(port, path) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port, path }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ statusCode: response.statusCode, headers: response.headers, body }));
    });
    request.on('error', reject);
  });
}

/** Read the first SSE frame, then hang up — the stream never ends on its own. */
function readFirstEvent(port, path) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port, path }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
        if (body.includes('\n\n')) {
          request.destroy();
          resolve({ statusCode: response.statusCode, headers: response.headers, body });
        }
      });
    });
    request.on('error', error => {
      // destroy() above surfaces here once the response is already resolved.
      if (error.code !== 'ECONNRESET') reject(error);
    });
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function run() {
  /* ---- reload OFF: the default, and what production would look like ---- */

  delete process.env.BUILDHTML_DEV_RELOAD;
  delete require.cache[require.resolve('../example/dev-reload')];
  const off = require('../example/dev-reload');

  assert.equal(off.devReloadEnabled(), false, 'disabled without the opt-in');
  assert.deepEqual(off.buildDevReloadDocument().validate(), { valid: true, errors: [], warnings: [] });

  const offHtml = off.renderDevReloadPage();
  assert.doesNotMatch(offHtml, /EventSource/, 'no client script when disabled');
  assert.doesNotMatch(offHtml, /__bhReloadAt/, 'no throttle code when disabled');

  const offServer = off.createDevReloadServer();
  const offPort = await listen(offServer);
  const refused = await get(offPort, off.DEV_RELOAD_PATH);
  assert.equal(refused.statusCode, 404, 'the endpoint is refused, not merely ignored, when disabled');
  const offPage = await get(offPort, '/');
  assert.equal(offPage.statusCode, 200, 'the page still serves normally');
  offServer.close();

  /* ---- reload ON ---- */

  process.env.BUILDHTML_DEV_RELOAD = '1';
  delete require.cache[require.resolve('../example/dev-reload')];
  const on = require('../example/dev-reload');

  assert.equal(on.devReloadEnabled(), true, 'enabled by the opt-in');

  const onHtml = on.renderDevReloadPage();
  assert.match(onHtml, /EventSource/, 'the client script is injected');
  assert.match(onHtml, new RegExp(on.BOOT_ID), 'this process id is the embedded baseline');
  assert.match(onHtml, /__bhReloadAt/, 'the reload throttle is present');
  assert.match(onHtml, /<script[^>]*>[^<]*EventSource/, 'it is emitted as a script element');

  const onServer = on.createDevReloadServer();
  const onPort = await listen(onServer);

  const stream = await readFirstEvent(onPort, on.DEV_RELOAD_PATH);
  assert.equal(stream.statusCode, 200);
  assert.match(stream.headers['content-type'], /text\/event-stream/, 'served as an event stream');
  assert.match(stream.headers['cache-control'], /no-cache/, 'never cached');
  assert.match(stream.body, new RegExp(`data: ${on.BOOT_ID}`), 'the first frame carries this process id');
  assert.match(stream.body, /retry: \d+/, 'the client is told how soon to reconnect');

  // A query string must not defeat the path match: proxies and cache-busters
  // append one, and the failure would be a silently dead reload.
  const withQuery = await readFirstEvent(onPort, `${on.DEV_RELOAD_PATH}?t=123`);
  assert.equal(withQuery.statusCode, 200, 'the path still matches with a query string');

  // Anything else falls through to the page rather than being swallowed.
  const other = await get(onPort, '/somewhere-else');
  assert.equal(other.statusCode, 200);
  assert.match(other.body, /Dev auto-reload/, 'unmatched requests reach the normal handler');

  onServer.close();
  await new Promise(resolve => onServer.once('close', resolve));

  /* ---- the baseline differs between processes, which is the whole mechanism ---- */

  delete require.cache[require.resolve('../example/dev-reload')];
  const restarted = require('../example/dev-reload');
  assert.notEqual(restarted.BOOT_ID, on.BOOT_ID,
    'a fresh load mints a new id — this is what tells the browser to reload');

  delete process.env.BUILDHTML_DEV_RELOAD;
  console.log('Dev auto-reload example passed: opt-in gate, refused endpoint, event stream, '
    + 'embedded baseline, query-string matching, and a changing id across restarts.');
}

run().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
