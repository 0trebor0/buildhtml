'use strict';

const http = require('node:http');
const { page } = require('..');

function buildDashboardDocument() {
  const doc = page('Operations Dashboard');
  doc.states({
    activePage: 'overview',
    query: '',
    sortDirection: 'asc',
    loading: false,
    status: 'Ready',
    activity: [
      { id: 1, label: 'Deployment completed', team: 'Platform' },
      { id: 2, label: 'New account created', team: 'Support' },
      { id: 3, label: 'Quarterly report exported', team: 'Finance' },
    ],
  });

  doc.cssVars({
    background: '#f4f7fb', surface: '#ffffff', ink: '#162033', muted: '#667085',
    primary: '#315efb', border: '#dfe4ec', success: '#16805c',
  });
  doc.bodyCss({ background: 'var(--background)', color: 'var(--ink)', fontFamily: 'system-ui, sans-serif' });
  doc.globalStyle('.dashboard-shell', { minHeight: '100vh', display: 'grid', gridTemplateColumns: '240px 1fr' });
  doc.globalStyle('.dashboard-nav', { padding: '24px', background: '#101828', color: '#fff' });
  doc.globalStyle('.dashboard-nav button', { width: '100%', padding: '10px 12px', marginTop: '8px', border: '0', borderRadius: '8px', textAlign: 'left', cursor: 'pointer', background: 'transparent', color: '#cbd5e1' });
  doc.globalStyle('.dashboard-nav button.active', { background: 'var(--primary)', color: '#fff' });
  doc.globalStyle('.dashboard-content', { padding: '32px', minWidth: '0' });
  doc.globalStyle('.metric-grid', { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px' });
  doc.globalStyle('.card', { padding: '20px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--surface)' });
  doc.globalStyle('.activity-row', { display: 'flex', justifyContent: 'space-between', gap: '16px', padding: '12px 0', borderBottom: '1px solid var(--border)' });
  doc.mediaQuery('(max-width: 760px)', {
    '.dashboard-shell': { gridTemplateColumns: '1fr' },
    '.metric-grid': { gridTemplateColumns: '1fr' },
  });

  const shell = doc.div().addClass('dashboard-shell');
  shell.aside((nav) => {
    nav.addClass('dashboard-nav').aria({ label: 'Dashboard navigation' });
    nav.h1('BuildHTML').css({ fontSize: '20px', marginBottom: '24px' });
    nav.button('Overview').data({ viewNav: 'overview' });
    nav.button('Activity').data({ viewNav: 'activity' });
    nav.button('Account').data({ viewNav: 'account' });
  });

  shell.main((main) => {
    main.addClass('dashboard-content');

    main.section((overview) => {
      overview.data({ view: 'overview' });
      overview.h2('Overview');
      overview.p('A complete server-rendered dashboard with reactive browser behavior.')
        .css({ color: 'var(--muted)', margin: '8px 0 24px' });
      overview.div((grid) => {
        grid.addClass('metric-grid');
        for (const metric of [
          ['Active users', '2,418'], ['Monthly revenue', '£48,290'], ['Uptime', '99.99%'],
        ]) {
          grid.div((card) => {
            card.addClass('card');
            card.h3(metric[0]).css({ color: 'var(--muted)', fontSize: '14px' });
            card.strong(metric[1]).css({ display: 'block', marginTop: '8px', fontSize: '28px' });
          });
        }
      });
    });

    main.section((activity) => {
      activity.data({ view: 'activity' });
      activity.h2('Activity');
      activity.label('Filter activity').for('activity-filter');
      activity.input('search', { placeholder: 'Search activity' }).id('activity-filter').bindInput('query');
      activity.button('Sort A–Z').id('sort-ascending').setStateOnClick('sortDirection', 'asc');
      activity.button('Sort Z–A').id('sort-descending').setStateOnClick('sortDirection', 'desc');
      activity.button('Refresh activity').id('refresh-activity').onClick(async function (_event, state) {
        state.loading = true;
        state.status = 'Loading';
        try {
          const response = await fetch('/api/activity');
          if (!response.ok) throw new Error('Request failed: ' + response.status);
          state.activity = await response.json();
          state.status = 'Updated';
        } catch (_error) {
          state.status = 'Could not refresh';
        } finally {
          state.loading = false;
        }
      });
      activity.span().id('activity-status').bind('status', (value) => value).aria({ live: 'polite' });
      activity.div().id('activity-list').liveList('activity', function (item) {
        return {
          tag: 'div', class: 'activity-row',
          children: [{ tag: 'span', text: item.label }, { tag: 'small', text: item.team }],
        };
      }, {
        filter: function (item, state) {
          return !state.query || (item.label + ' ' + item.team).toLowerCase().includes(state.query.toLowerCase());
        },
        filterKeys: ['query'],
        sort: function (a, b, state) {
          return state.sortDirection === 'desc'
            ? b.label.localeCompare(a.label)
            : a.label.localeCompare(b.label);
        },
        sortKeys: ['sortDirection'],
        empty: {
          tag: 'p', text: 'No activity matches your filter.',
          class: 'activity-empty', attrs: { role: 'status' },
        },
      });
    });

    main.section((account) => {
      account.data({ view: 'account' });
      account.h2('Account');
      account.form((form) => {
        form.attr('method', 'post').attr('action', '/account');
        form.formGroup('Display name', 'text', { name: 'displayName', required: true });
        form.formGroup('Email address', 'email', { name: 'email', required: true });
        form.button('Save account').attr('type', 'submit');
      });
    });
  });

  doc.views({ stateKey: 'activePage', default: 'overview', activeClass: 'active' });
  return doc;
}

function renderDashboard() {
  const doc = buildDashboardDocument();
  const validation = doc.validate();
  if (!validation.valid) throw new Error('Dashboard validation failed: ' + JSON.stringify(validation.errors));
  return doc.render();
}

function createDashboardServer() {
  const dashboardHtml = renderDashboard();
  return http.createServer((request, response) => {
    if (request.url === '/api/activity') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify([
        { id: 4, label: 'Live API activity loaded', team: 'Operations' },
        { id: 5, label: 'Dashboard refreshed', team: 'Platform' },
      ]));
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(dashboardHtml);
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createDashboardServer().listen(port, '127.0.0.1', () => {
    console.log(`Dashboard running at http://127.0.0.1:${port}`);
  });
}

module.exports = { buildDashboardDocument, renderDashboard, createDashboardServer };
