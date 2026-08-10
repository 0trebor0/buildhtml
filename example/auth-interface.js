'use strict';

const http = require('node:http');
const { page } = require('..');

function buildAuthInterfaceDocument() {
  const doc = page('Authentication Interface Example');
  doc.states({ activeAuthView: 'login' });
  doc.cssVars({ primary: '#1d4ed8', border: '#d0d5dd', muted: '#667085', surface: '#ffffff' });
  doc.bodyCss({ margin: '0', padding: '32px 16px', background: '#f2f4f7', color: '#101828', fontFamily: 'system-ui, sans-serif' });
  doc.globalStyle('.auth-shell', { maxWidth: '560px', margin: '0 auto', padding: '28px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--surface)' });
  doc.globalStyle('.auth-tabs', { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', margin: '24px 0' });
  doc.globalStyle('.auth-tabs button', { padding: '10px', border: '1px solid var(--border)', borderRadius: '8px', background: '#fff', cursor: 'pointer' });
  doc.globalStyle('.auth-tabs button.active', { borderColor: 'var(--primary)', background: '#eff6ff', color: 'var(--primary)', fontWeight: '700' });
  doc.globalStyle('.auth-form', { display: 'grid', gap: '16px' });
  doc.globalStyle('.form-group', { display: 'grid', gap: '6px' });
  doc.globalStyle('.form-group input', { boxSizing: 'border-box', width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '8px' });
  doc.globalStyle('.auth-form button[type="submit"]', { padding: '11px 16px', border: '0', borderRadius: '8px', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: '700' });
  doc.globalStyle('button:focus-visible, input:focus-visible', { outline: '3px solid #93c5fd', outlineOffset: '2px' });
  doc.mediaQuery('(max-width: 520px)', { '.auth-tabs': { gridTemplateColumns: '1fr' }, '.auth-shell': { padding: '20px' } });

  doc.main(main => {
    main.addClass('auth-shell');
    main.h1('Account access');
    main.p('A complete accessible interface for common account flows.').css({ color: 'var(--muted)' });
    main.nav(nav => {
      nav.addClass('auth-tabs').aria({ label: 'Account forms' });
      nav.button('Sign in').attr('type', 'button').data({ viewNav: 'login' });
      nav.button('Register').attr('type', 'button').data({ viewNav: 'register' });
      nav.button('Account settings').attr('type', 'button').data({ viewNav: 'account' });
    });

    main.section(section => {
      section.data({ view: 'login' });
      section.h2('Sign in');
      section.form(form => {
        form.addClass('auth-form').attr('method', 'post').attr('action', '/session');
        form.field('Email address', { groupClass: 'form-group', type: 'email', name: 'email', attrs: { autocomplete: 'username', required: true } });
        form.field('Password', { groupClass: 'form-group', type: 'password', name: 'password', attrs: { autocomplete: 'current-password', required: true } });
        form.checkbox('remember', 'Keep me signed in', false);
        form.button('Sign in').attr('type', 'submit');
      });
    });

    main.section(section => {
      section.data({ view: 'register' });
      section.h2('Create account');
      section.form(form => {
        form.addClass('auth-form').attr('method', 'post').attr('action', '/users');
        form.field('Full name', { groupClass: 'form-group', name: 'name', attrs: { autocomplete: 'name', required: true } });
        form.field('Email address', { groupClass: 'form-group', type: 'email', name: 'email', attrs: { autocomplete: 'email', required: true } });
        form.field('Create password', { groupClass: 'form-group', type: 'password', name: 'password', attrs: { autocomplete: 'new-password', minlength: 8, required: true } });
        form.field('Confirm password', { groupClass: 'form-group', type: 'password', name: 'passwordConfirmation', attrs: { autocomplete: 'new-password', minlength: 8, required: true } });
        form.button('Create account').attr('type', 'submit');
      });
    });

    main.section(section => {
      section.data({ view: 'account' });
      section.h2('Account settings');
      section.form(form => {
        form.addClass('auth-form').attr('method', 'post').attr('action', '/account');
        form.field('Display name', { groupClass: 'form-group', name: 'displayName', attrs: { autocomplete: 'name', required: true } });
        form.field('Email address', { groupClass: 'form-group', type: 'email', name: 'email', attrs: { autocomplete: 'email', required: true } });
        form.field('New password', { groupClass: 'form-group', type: 'password', name: 'newPassword', attrs: { autocomplete: 'new-password', minlength: 8 } });
        form.button('Save settings').attr('type', 'submit');
      });
    });
  });

  doc.views({ stateKey: 'activeAuthView', default: 'login', activeClass: 'active' });
  return doc;
}

function renderAuthInterface() {
  const doc = buildAuthInterfaceDocument();
  const validation = doc.validate();
  if (!validation.valid || validation.warnings.length) {
    throw new Error(`Authentication interface validation failed: ${JSON.stringify(validation)}`);
  }
  return doc.render();
}

function createAuthInterfaceServer() {
  const html = renderAuthInterface();
  return http.createServer((request, response) => {
    if (request.method === 'GET' && (request.url === '/auth' || request.url === '/auth/')) {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(html);
      return;
    }
    if (request.method === 'POST' && ['/session', '/users', '/account'].includes(request.url)) {
      response.writeHead(501, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'Connect this form to your authenticated server workflow.' }));
      return;
    }
    if (!['GET', 'POST'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, POST' });
      response.end('Method not allowed');
      return;
    }
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3004;
  createAuthInterfaceServer().listen(port, '127.0.0.1', () => {
    console.log(`Authentication interface running at http://127.0.0.1:${port}/auth`);
  });
}

module.exports = { buildAuthInterfaceDocument, renderAuthInterface, createAuthInterfaceServer };
