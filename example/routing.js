'use strict';

const http = require('node:http');
const { page } = require('..');

function buildRoutingDocument(mode) {
  if (mode !== 'hash' && mode !== 'history') throw new TypeError('mode must be "hash" or "history"');

  const doc = page(mode === 'hash' ? 'Hash Routing Example' : 'History Routing Example');
  doc.states({ view: 'home', routeParams: {} });
  doc.bodyCss({ maxWidth: '720px', margin: '0 auto', padding: '32px', fontFamily: 'system-ui, sans-serif' });
  doc.globalCss('.route-nav', { display: 'flex', gap: '16px', margin: '24px 0' });
  doc.globalCss('.route-view', { padding: '20px', border: '1px solid #d0d5dd', borderRadius: '8px' });

  doc.header(header => {
    header.h1(mode === 'hash' ? 'Hash-routed application' : 'History-routed application');
    header.p(mode === 'hash'
      ? 'Hash routes work on static hosting without a server fallback.'
      : 'Clean application URLs are returned by the server fallback after API and static routes.');
    header.nav(nav => {
      nav.addClass('route-nav').aria({ label: 'Application routes' });
      if (mode === 'hash') {
        nav.a('#home', 'Home');
        nav.a('#users/42', 'User 42');
        nav.a('#missing', 'Missing route');
      } else {
        nav.a('/app/', 'Home').attr('data-route', '');
        nav.a('/app/users/42', 'User 42').attr('data-route', '');
        nav.a('/app/missing', 'Missing route').attr('data-route', '');
      }
    });
  });

  doc.main(main => {
    main.section(section => {
      section.id('home-view').addClass('route-view').showWhen('view', 'home');
      section.h2('Home');
      section.p('This is the application home route.');
    });
    main.section(section => {
      section.id('user-view').addClass('route-view').showWhen('view', 'user');
      section.h2('User route');
      section.p().id('user-parameter').bind('routeParams', params => `Loaded user ${params.id || ''}`);
    });
    main.section(section => {
      section.id('not-found-view').addClass('route-view').showWhen('view', 'not-found');
      section.h2('Route not found');
      section.p('The wildcard route handled this URL.');
    });
  });

  const routes = { home: 'home', 'users/:id': 'user', '*': 'not-found' };
  const styles = {
    navSelector: '.route-nav a',
    activeStyle: { color: '#1d4ed8', fontWeight: '700' },
    inactiveStyle: { color: '#475467', fontWeight: '400' },
  };
  if (mode === 'hash') {
    doc.hashRouter({ stateKey: 'view', default: 'home', routes, ...styles });
  } else {
    doc.historyRouter({
      base: '/app', stateKey: 'view', default: '/',
      routes: { '/': 'home', '/users/:id': 'user', '*': 'not-found' },
      ...styles,
    });
  }
  return doc;
}

function renderRoutingPage(mode) {
  const doc = buildRoutingDocument(mode);
  const validation = doc.validate();
  if (!validation.valid) throw new Error(`Routing example validation failed: ${JSON.stringify(validation.errors)}`);
  return doc.render();
}

function createRoutingServer() {
  const hashHtml = renderRoutingPage('hash');
  const historyHtml = renderRoutingPage('history');
  return http.createServer((request, response) => {
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' });
      response.end('Method not allowed');
      return;
    }
    if (request.url === '/api/status') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    if (request.url === '/asset.txt') {
      response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('static asset');
      return;
    }
    if (request.url === '/hash' || request.url === '/hash/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(hashHtml);
      return;
    }
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/app' || pathname.startsWith('/app/')) {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(historyHtml);
      return;
    }
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3002;
  createRoutingServer().listen(port, '127.0.0.1', () => {
    console.log(`Routing examples running at http://127.0.0.1:${port}/hash and http://127.0.0.1:${port}/app/`);
  });
}

module.exports = { buildRoutingDocument, renderRoutingPage, createRoutingServer };
