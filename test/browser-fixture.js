'use strict';

const http = require('http');
const { Document } = require('../index');
const PORT = Number(process.env.BUILDHTML_BROWSER_PORT) || 3344;

function buildPage() {
  const doc = new Document();
  doc.title('buildhtml browser integration');
  doc.states({
    count: 0,
    name: 'Initial',
    visible: true,
    theme: 'light',
    link: '/safe',
    items: [{ id: 1, label: 'One' }],
    profile: { name: 'Ada', tags: ['first'] },
    view: 'all',
    page: 'home',
    routeParams: {},
    lifecycleUpdates: 0,
    lifecycleDestroyed: false,
    contextResult: '',
    contextLabel: 'ready',
    eventContract: '',
    asyncEventContract: '',
  });

  doc.div().id('portal-source').text('Portaled').portal('portal-target');
  doc.div().id('portal-target');

  doc.span().id('count-output').bind('count', value => String(value));
  doc.button('Increment').id('increment').onClick(function () { State.count += 1; });
  doc.button('Use context').id('use-context').onClick(function (event, state, element, context) {
    state.contextResult = element.id + ':' + context.page;
  }, { page: 'projects' });
  doc.span().id('context-result').bind('contextResult', function (value, state, context) {
    return context.prefix + value;
  }, { prefix: 'result=' });
  doc.button('Check event contract').id('event-contract').onClick(function (event, state, element) {
    state.eventContract = [this === element, event.currentTarget === element, state === State].join(':');
    return false;
  });
  doc.span().id('event-contract-result').bind('eventContract', value => value);
  doc.button('Check async contract').id('async-event-contract').onClick(async function (event, state, element) {
    await Promise.resolve();
    state.asyncEventContract = [this === element, state === State].join(':');
  });
  doc.span().id('async-event-contract-result').bind('asyncEventContract', value => value);

  doc.input('text').id('name-input').bindInput('name');
  doc.span().id('name-output').bind('name', value => value);

  doc.div().id('visibility').text('Visible').bindShow('visible');
  doc.button('Toggle visibility').id('toggle-visibility').onClick(function () { State.visible = !State.visible; });

  doc.div().id('class-output').bindClass('theme', value => 'theme-' + value);
  doc.button('Toggle theme').id('toggle-theme').onClick(function () { State.theme = State.theme === 'light' ? 'dark' : 'light'; });

  doc.button('Overview view').id('overview-view').addClass('nav-item').classWhen('view', 'all', 'active').setStateOnClick('view', 'all');
  doc.button('Done view').id('done-view').addClass('nav-item').classWhen('view', 'done', 'active').setStateOnClick('view', 'done');
  doc.section('Overview section').id('overview-section').showWhen('view', 'all');
  doc.section('Done section').id('done-section').showWhen('view', 'done');

  doc.button('Summary panel').id('summary-panel-button').data({ viewNav: 'summary' });
  doc.button('Activity panel').id('activity-panel-button').data({ viewNav: 'activity' });
  doc.section('Summary panel content').id('summary-panel').data({ view: 'summary' });
  doc.section('Activity panel content').id('activity-panel').data({ view: 'activity' });
  doc.views({ stateKey: 'panel', default: 'summary', activeClass: 'selected' });

  doc.a('/safe', 'Reactive link').id('link-output').bindAttr('link', 'href', value => value);
  doc.button('Unsafe link').id('unsafe-link').onClick(function () { State.link = 'javascript:alert(1)'; });

  doc.div().id('list').liveList('items', item => ({
    tag: 'span', text: item.label, attrs: { 'data-item': item.id },
  }));
  doc.button('Add item').id('add-item').onClick(function () {
    State.items.push({ id: 2, label: 'Two' });
  });

  doc.span().id('profile-output').bind('profile', value => value.name + ':' + value.tags.join(','));
  doc.button('Mutate nested state').id('mutate-profile').onClick(function () {
    State.profile.name = 'Grace';
    State.profile.tags.push('second');
  });

  doc.div()
    .id('lifecycle-target')
    .text('Lifecycle target')
    .onMount(function () {
      this.dataset.mounted = 'true';
      return function () { State.lifecycleDestroyed = true; };
    })
    .onUpdate('count', function (value) {
      this.dataset.lastCount = String(value);
      State.lifecycleUpdates += 1;
    })
    .onDestroy(function () {
      State.lifecycleDestroyed = true;
    });
  doc.button('Remove lifecycle target').id('remove-lifecycle').onClick(function () {
    var target = document.getElementById('lifecycle-target');
    if (target) target.remove();
  });
  doc.span().id('lifecycle-destroyed').bind('lifecycleDestroyed', value => String(value));

  doc.a('#done', 'Done route').id('done-route');
  doc.span().id('view-output').bind('view', value => value);
  doc.hashRouter({ stateKey: 'view', default: 'all' });

  doc.a('/app/users/alice%20smith', 'User route').id('user-route').attr('data-route', '');
  doc.a('/app/about', 'About route').id('about-route').attr('data-route', '');
  doc.span().id('page-output').bind('page', value => value);
  doc.span().id('params-output').bind('routeParams', value => value.id || '');
  doc.historyRouter({
    stateKey: 'page',
    paramsKey: 'routeParams',
    base: '/app',
    routes: {
      '/': 'home',
      '/users/:id': 'user',
      '/about': 'about',
      '*': 'missing',
    },
  });

  return doc.render();
}

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(buildPage());
});

server.listen(PORT, '127.0.0.1', () => console.log(`browser fixture ready on ${PORT}`));

function shutdown() { server.close(() => process.exit(0)); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
