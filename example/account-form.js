'use strict';

const http = require('node:http');
const { page } = require('..');

const MAX_FORM_BYTES = 16 * 1024;

function validateAccount(values) {
  const errors = {};
  if (!values.displayName || values.displayName.trim().length < 2) {
    errors.displayName = 'Enter a display name with at least two characters.';
  }
  if (!values.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    errors.email = 'Enter a valid email address.';
  }
  if (!values.password || values.password.length < 8) {
    errors.password = 'Use at least eight characters.';
  }
  return errors;
}

function buildAccountDocument({ values = {}, errors = {}, saved = false } = {}) {
  const doc = page('Account settings');
  doc.bodyCss({
    margin: '0', background: '#f4f7fb', color: '#172033',
    fontFamily: 'system-ui, sans-serif',
  });
  doc.globalCss('.account-shell', { maxWidth: '620px', margin: '48px auto', padding: '0 20px' });
  doc.globalCss('.account-card', { padding: '28px', border: '1px solid #dce2eb', borderRadius: '14px', background: '#fff' });
  doc.globalCss('.form-group', { display: 'grid', gap: '6px', marginTop: '18px' });
  doc.globalCss('.form-group input', { padding: '10px 12px', border: '1px solid #aeb8c7', borderRadius: '7px', font: 'inherit' });
  doc.globalCss('.field-error', { margin: '0', color: '#b42318', fontSize: '14px' });
  doc.globalCss('.success', { padding: '12px', borderRadius: '7px', background: '#e8f7ef', color: '#176b45' });
  doc.globalCss('button', { marginTop: '22px', padding: '11px 16px', border: '0', borderRadius: '7px', background: '#315efb', color: '#fff', font: 'inherit', cursor: 'pointer' });

  doc.main((main) => {
    main.addClass('account-shell');
    main.h1('Account settings');
    main.p('This form is rendered and validated on the server.');
    main.section((card) => {
      card.addClass('account-card').aria({ label: 'Account details' });
      if (saved) card.div('Account settings saved.').addClass('success').role('status');

      card.form((form) => {
        form.attr('method', 'post').attr('action', '/account');

        const displayName = form.field('Display name', {
          id: 'display-name', name: 'displayName', groupClass: 'form-group',
          attrs: {
            value: values.displayName || '', autocomplete: 'name', required: true,
            'aria-invalid': errors.displayName ? 'true' : null,
            'aria-describedby': errors.displayName ? 'display-name-error' : null,
          },
        });
        if (errors.displayName) {
          displayName.group.p(errors.displayName).id('display-name-error').addClass('field-error').role('alert');
        }

        const email = form.field('Email address', {
          type: 'email', id: 'email', name: 'email', groupClass: 'form-group',
          attrs: {
            value: values.email || '', autocomplete: 'email', required: true,
            'aria-invalid': errors.email ? 'true' : null,
            'aria-describedby': errors.email ? 'email-error' : null,
          },
        });
        if (errors.email) {
          email.group.p(errors.email).id('email-error').addClass('field-error').role('alert');
        }

        const password = form.field('New password', {
          type: 'password', id: 'password', name: 'password', groupClass: 'form-group',
          attrs: {
            autocomplete: 'new-password', minlength: 8, required: true,
            'aria-invalid': errors.password ? 'true' : null,
            'aria-describedby': errors.password ? 'password-error' : null,
          },
        });
        if (errors.password) {
          password.group.p(errors.password).id('password-error').addClass('field-error').role('alert');
        }

        form.button('Save account').type('submit');
      });
    });
  });
  return doc;
}

function renderAccountPage(options) {
  const doc = buildAccountDocument(options);
  const validation = doc.validate();
  if (!validation.valid) throw new Error('Account example validation failed: ' + JSON.stringify(validation.errors));
  return doc.render();
}

function readForm(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    let tooLarge = false;
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > MAX_FORM_BYTES) {
        tooLarge = true;
        body = '';
      }
    });
    request.on('end', () => {
      if (tooLarge) {
        const error = new Error('Form body exceeds the configured limit.');
        error.statusCode = 413;
        reject(error);
        return;
      }
      resolve(Object.fromEntries(new URLSearchParams(body)));
    });
    request.on('error', reject);
  });
}

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
  });
  response.end(html);
}

function createAccountServer() {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname !== '/account') {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    if (request.method === 'GET') {
      sendHtml(response, 200, renderAccountPage());
      return;
    }
    if (request.method !== 'POST') {
      response.writeHead(405, { Allow: 'GET, POST' });
      response.end();
      return;
    }
    if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/x-www-form-urlencoded')) {
      response.writeHead(415, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Expected form-urlencoded data');
      return;
    }

    try {
      const values = await readForm(request);
      const errors = validateAccount(values);
      const statusCode = Object.keys(errors).length > 0 ? 422 : 200;
      sendHtml(response, statusCode, renderAccountPage({ values, errors, saved: statusCode === 200 }));
    } catch (error) {
      response.writeHead(error.statusCode || 400, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(error.message);
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3001;
  createAccountServer().listen(port, '127.0.0.1', () => {
    console.log(`Account form running at http://127.0.0.1:${port}/account`);
  });
}

module.exports = {
  MAX_FORM_BYTES,
  validateAccount,
  buildAccountDocument,
  renderAccountPage,
  createAccountServer,
};
