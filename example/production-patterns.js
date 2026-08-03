'use strict';

const crypto = require('node:crypto');
const http = require('node:http');
const { page, createCachedRenderer } = require('..');

let personalizedBuildCount = 0;

function buildPersonalizedDocument(request) {
  personalizedBuildCount++;
  const { id, name, locale, permissions } = request.user;
  const doc = page(`Dashboard for ${name}`);
  doc.main(main => {
    main.data({ build: personalizedBuildCount, user: id });
    main.h1(`Welcome, ${name}`);
    main.p(`Locale: ${locale}`);
    main.p(`Permissions: ${permissions.join(', ')}`);
  });
  return doc;
}

function personalizedCacheKey(request) {
  const { id, locale, permissions } = request.user;
  return `production-example:user:${id}:locale:${locale}:permissions:${permissions.slice().sort().join(',')}`;
}

function buildNonceDocument() {
  const doc = page('CSP nonce integration');
  doc.states({ status: 'Protected browser behavior loaded' });
  doc.globalStyle('main', { maxWidth: '640px', margin: '40px auto', fontFamily: 'system-ui, sans-serif' });
  doc.main(main => {
    main.h1('CSP nonce integration');
    main.p().bind('status', value => value);
  });
  return doc;
}

function nodeResponse(response, headers = {}) {
  let statusCode = 200;
  return {
    status(code) { statusCode = code; return this; },
    send(body) {
      response.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
      response.end(body);
      return this;
    },
  };
}

function createProductionPatternsServer() {
  const personalized = createCachedRenderer(buildPersonalizedDocument, personalizedCacheKey);
  const noncePage = createCachedRenderer(buildNonceDocument, 'unused-when-nonce-is-enabled', {
    nonce: request => request.cspNonce,
  });

  return http.createServer((request, response) => {
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' });
      response.end('Method not allowed');
      return;
    }
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/personalized') {
      const id = url.searchParams.get('user') === 'bob' ? 'bob' : 'alice';
      const locale = url.searchParams.get('locale') === 'fr' ? 'fr' : 'en';
      request.user = {
        id,
        locale,
        name: id === 'bob' ? 'Bob' : 'Alice',
        permissions: id === 'bob' ? ['reports'] : ['admin', 'reports'],
      };
      personalized(request, nodeResponse(response), error => {
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end(error ? error.message : 'Render failed');
      });
      return;
    }
    if (url.pathname === '/csp') {
      request.cspNonce = crypto.randomBytes(18).toString('base64');
      const policy = `default-src 'self'; script-src 'nonce-${request.cspNonce}'; style-src 'nonce-${request.cspNonce}'`;
      noncePage(request, nodeResponse(response, { 'Content-Security-Policy': policy }), error => {
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end(error ? error.message : 'Render failed');
      });
      return;
    }
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3003;
  createProductionPatternsServer().listen(port, '127.0.0.1', () => {
    console.log(`Production patterns running at http://127.0.0.1:${port}/personalized and http://127.0.0.1:${port}/csp`);
  });
}

module.exports = {
  buildPersonalizedDocument,
  personalizedCacheKey,
  buildNonceDocument,
  createProductionPatternsServer,
};
