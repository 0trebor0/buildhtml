'use strict';

/**
 * Development auto-reload — a recipe, not a library feature.
 *
 * buildhtml renders HTML; it does not run your server, so browser refresh on
 * save is not something it can do for you. Everything here is ordinary code
 * built on the public API and the Node standard library, and it is meant to be
 * copied into your own dev server and adjusted.
 *
 * HOW IT WORKS
 *
 * There is no file watcher. The page carries the id of the process that
 * rendered it, and an EventSource holds a connection to this server. When you
 * save a file, whatever restarts your process — `node --watch`, nodemon, a
 * container restart — drops that connection. The browser reconnects on its own,
 * receives a different id, and reloads.
 *
 *     node --watch example/dev-reload.js
 *
 * The restart is the signal, so nothing here reads the filesystem and nothing
 * needs to know which files matter to you.
 *
 * WHAT IT DOES NOT HANDLE
 *
 *   - More than one process serving the same page. Each would mint its own id,
 *     so every reload could land on a different one. The throttle below turns
 *     that into a single console warning instead of a reload loop, but reload
 *     will not work correctly behind a cluster or a load balancer.
 *   - Many open tabs. Each holds one connection, and HTTP/1.1 browsers allow
 *     about six per origin, after which page loads queue behind them.
 *   - A Content-Security-Policy that restricts `connect-src`, which blocks the
 *     EventSource silently. Allow this path in your dev policy if you use one.
 *
 * NEVER SERVE THIS IN PRODUCTION. `devReloadEnabled()` below is the gate, and it
 * is deliberately opt-in rather than keyed off NODE_ENV alone.
 */

const http = require('node:http');
const { page } = require('..');

/**
 * A change token, not a secret: the browser only ever compares it for
 * inequality, so the id needs to be distinct per process, not unguessable.
 */
const BOOT_ID = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

const DEV_RELOAD_PATH = '/__buildhtml_dev';

/** Proxies drop an idle event stream after roughly 30-60 seconds. */
const KEEPALIVE_MS = 20000;

/** A reload may not trigger another within this window. See devReloadScript(). */
const RELOAD_THROTTLE_MS = 3000;

/**
 * The single switch. Keyed off an explicit flag rather than NODE_ENV alone,
 * because NODE_ENV is unset far more often than it is set to "production" — a
 * deploy that simply forgot it would otherwise expose this endpoint.
 */
function devReloadEnabled() {
  return process.env.BUILDHTML_DEV_RELOAD === '1';
}

/**
 * The client half, injected into the page as an ordinary inline script.
 *
 * The baseline id is embedded here rather than learned from the first message
 * that arrives. If the server restarts between rendering this page and the
 * EventSource connecting, a learned baseline would record the NEW id and never
 * reload — leaving a stale page and no clue why.
 *
 * Embedding it introduces the opposite failure: behind several processes, every
 * reload lands on a different id and reloads again. The sessionStorage throttle
 * bounds that, and any other cause, to one reload per window.
 *
 * The whole body is wrapped in try/catch on purpose: a browser without
 * EventSource, or with storage disabled, must lose the convenience rather than
 * the page.
 */
function devReloadScript() {
  return 'try{(function(){'
    + 'var mine=' + JSON.stringify(BOOT_ID) + ';'
    + 'var source=new EventSource(' + JSON.stringify(DEV_RELOAD_PATH) + ');'
    + 'source.onmessage=function(event){'
    + 'if(event.data===mine)return;'
    + 'var last=0;try{last=+sessionStorage.getItem("__bhReloadAt")||0;}catch(_){}'
    + 'if(Date.now()-last<' + RELOAD_THROTTLE_MS + '){'
    + 'source.close();'
    + 'if(window.console&&console.warn)console.warn('
    + '"[dev-reload] suppressed: the server id keeps changing. Is more than one process serving this page?");'
    + 'return;}'
    + 'try{sessionStorage.setItem("__bhReloadAt",String(Date.now()));}catch(_){}'
    + 'location.reload();};'
    + '})();}catch(e){}';
}

/**
 * The server half. Returns true when it has handled the request, so it drops in
 * ahead of your own routing:
 *
 *     if (handleDevReload(request, response)) return;
 *
 * @returns {boolean}
 */
function handleDevReload(request, response) {
  if (!request || typeof request.url !== 'string') return false;

  // Compare the path alone. A query string appended by a proxy or a
  // cache-buster must not stop this matching.
  const path = request.url.split('?')[0];
  if (path !== DEV_RELOAD_PATH) return false;

  // Refused when disabled rather than ignored, so a stray request cannot open a
  // connection this process will hold forever.
  if (!devReloadEnabled()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return true;
  }

  try {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    response.write(`retry: 1000\ndata: ${BOOT_ID}\n\n`);
  } catch (error) {
    // The client can disconnect between the request arriving and the first
    // write. Nothing is recoverable here and nothing is owed to the caller, but
    // it is reported rather than hidden.
    console.warn('[dev-reload] could not open the event stream:', error.message);
    return true;
  }

  // `close` and `error` are what actually stop this. A write to a destroyed
  // socket reports through an error event rather than throwing, so wrapping the
  // write in try/catch would not catch a dead connection.
  const keepalive = setInterval(() => response.write(': keepalive\n\n'), KEEPALIVE_MS);
  if (typeof keepalive.unref === 'function') keepalive.unref();

  const stop = () => clearInterval(keepalive);
  response.on('close', stop);
  response.on('error', stop);
  return true;
}

/** A page that shows whether reload is wired up, and which process served it. */
function buildDevReloadDocument() {
  const doc = page('Dev auto-reload example');
  doc.bodyCss({ maxWidth: '640px', margin: '0 auto', padding: '32px', fontFamily: 'system-ui, sans-serif' });

  doc.h1('Dev auto-reload');
  doc.p('Edit this file and save it. With `node --watch`, the page reloads itself.');

  doc.p(p => {
    p.text('Served by process ');
    p.strong(BOOT_ID);
    p.text(devReloadEnabled() ? ' — reload is active.' : ' — reload is OFF.');
  });

  if (!devReloadEnabled()) {
    doc.p('Set BUILDHTML_DEV_RELOAD=1 to switch it on.')
      .css({ padding: '12px', border: '1px solid #d0d5dd', borderRadius: '8px' });
  }

  // The injection point. In your own server this is the only line you need
  // beside mounting the handler.
  if (devReloadEnabled()) doc.inlineScript(devReloadScript());

  return doc;
}

function renderDevReloadPage() {
  return buildDevReloadDocument().render();
}

function createDevReloadServer() {
  return http.createServer((request, response) => {
    if (handleDevReload(request, response)) return;

    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(renderDevReloadPage());
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3005;
  createDevReloadServer().listen(port, '127.0.0.1', () => {
    console.log(`Dev auto-reload example running at http://127.0.0.1:${port}/`);
    console.log(devReloadEnabled()
      ? 'Reload is active. Save this file to see the page refresh.'
      : 'Reload is off. Restart with BUILDHTML_DEV_RELOAD=1 to enable it.');
  });
}

module.exports = {
  BOOT_ID,
  DEV_RELOAD_PATH,
  devReloadEnabled,
  devReloadScript,
  handleDevReload,
  buildDevReloadDocument,
  renderDevReloadPage,
  createDevReloadServer,
};
