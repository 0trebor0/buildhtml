'use strict';

const http = require('http');
const { Document } = require('../index');
const PORT = Number(process.env.BUILDHTML_BROWSER_PORT) || 3344;

// Unicode that browsers, not string comparisons, have opinions about: astral
// plane, combining marks, RTL, bidi override, zero-width joiner, fullwidth
// forms, and the two separators that terminate a JS string literal if they
// reach one unescaped.
const UNICODE_TEXT = 'astral \u{1F600} combining e\u0301 rtl \u05D0\u05D1 bidi \u202Eevil\u202C zwj \u200D fullwidth \uFF21\uFF22 sep \u2028\u2029 nbsp \u00A0 end';

function buildPage() {
  const doc = new Document();
  doc.title('buildhtml browser integration');
  doc.states({
    count: 0,
    keyedItems: [{ id: 'a', label: 'One' }, { id: 'b', label: 'Two' }],
    keyedSelection: '',
    name: 'Initial',
    visible: true,
    theme: 'light',
    link: '/safe',
    items: [{ id: 1, label: 'One' }],
    linkItems: [{ id: 1, url: '/safe' }],
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
    onceCount: 0,
    repeatCount: 0,
    preventedCount: 0,
    cssRows: [{ id: 1, label: 'First' }],
    unicodeText: UNICODE_TEXT,
    unicodeRows: [
      { id: 1, label: 'emoji \u{1F600}\u{1F1EC}\u{1F1E7}' },
      { id: 2, label: 'combining a\u0301e\u0300 rtl \u05D0\u05D1\u05D2' },
      { id: 3, label: 'sep \u2028 and \u2029 and zwj \u200D done' },
    ],
  });

  doc.div().id('portal-source').text('Portaled').portal('portal-target');
  doc.div().id('portal-target');

  doc.span().id('count-output').bind('count', value => String(value));
  doc.span().id('computed-count').computed(() => State.count * 2);
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

  doc.div().id('keyed-list').liveList('keyedItems', function (item) {
    return {
      tag: 'section',
      attrs: { 'data-key': item.id },
      children: [
        { tag: 'span', text: item.label },
        { tag: 'input', attrs: { 'aria-label': 'Edit ' + item.id } },
        { tag: 'button', text: 'Select', on: { click: function () { State.keyedSelection = item.label; } } },
        { tag: 'small', html: '<!--keyed row marker-->' },
      ],
    };
  }, { key: 'id', empty: { tag: 'p', text: 'No keyed items' } });

  doc.div().id('list').liveList('items', item => ({
    tag: 'span', text: item.label, attrs: { 'data-item': item.id },
  }));
  doc.button('Add item').id('add-item').onClick(function () {
    State.items.push({ id: 2, label: 'Two' });
  });

  // A reactive list whose items carry hrefs, so the _mkEl client rebuild is
  // exercised on the same URL payloads the bindAttr path is.
  doc.div().id('link-list').liveList('linkItems', item => ({
    tag: 'a', text: 'link', attrs: { href: item.url, 'data-link': item.id },
  }));

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

  // ---- CSS compilation, in a real stylesheet parser ----
  //
  // A server-side assertion can only prove which characters were emitted. Whether
  // the browser's CSS parser then reassembles them into a rule, a new element, or
  // a selector that matches something it should not, is only observable here.
  const CSS_BREAKOUT = '}</style><script>window.__cssPwned=true;</script><style>.x{';
  doc.div().id('css-pseudo-attack').text('pseudo').pseudo(CSS_BREAKOUT, { color: 'rgb(1, 2, 3)' });
  doc.div().id('css-media-attack').text('media').media(`screen{}${CSS_BREAKOUT}`, { color: 'rgb(1, 2, 3)' });
  doc.div().id('css-nth-attack').text('nth')
    .nthChild('1){} #css-canary{display:none} .x:nth-child(1', { color: 'rgb(1, 2, 3)' });
  doc.div().id('css-canary').text('canary');

  // A legitimate pseudo-class and media query must still compile and apply.
  doc.div().id('css-hover-ok').text('hover').hover({ color: 'rgb(4, 5, 6)' });
  doc.div().id('css-nth-ok').text('nth-ok').nthChild('odd', { color: 'rgb(7, 8, 9)' });

  // Two elements whose declarations are written in different orders must land on
  // one shared class, and the rule must reach the stylesheet exactly once.
  doc.div().id('css-order-a').text('a').css({ color: 'rgb(10, 11, 12)', paddingTop: '3px' });
  doc.div().id('css-order-b').text('b').css({ paddingTop: '3px', color: 'rgb(10, 11, 12)' });

  // A liveList whose rows carry `css`: the class the server rendered and the
  // class the client mints on rebuild must be the same, and it must actually
  // style the row — which is only true if the client also inserted the rule.
  doc.div().id('css-list').liveList('cssRows', item => ({
    tag: 'span',
    text: item.label,
    attrs: { 'data-row': item.id },
    css: { color: 'rgb(13, 14, 15)', paddingLeft: '2px' },
    style: { fontStyle: 'italic' },
  }));
  doc.button('Add styled row').id('add-css-row').onClick(function () {
    State.cssRows.push({ id: 2, label: 'Second' });
  });

  // ---- Unicode through the whole pipeline ----
  //
  // Escaping is asserted on strings elsewhere; only a browser shows whether the
  // bytes survive HTML parsing, JS string parsing, a reactive binding, and a
  // liveList rebuild that reconstructs the text through the client runtime.
  doc.div().id('unicode-ssr').text(UNICODE_TEXT);
  doc.span().id('unicode-bound').bind('unicodeText', value => value);
  doc.div().id('unicode-list').liveList('unicodeRows', item => ({
    tag: 'span', text: item.label, attrs: { 'data-u': item.id },
    css: { fontFamily: '"Fira Code", monospace' },
  }));
  doc.button('Add unicode row').id('add-unicode-row').onClick(function () {
    State.unicodeRows.push({ id: 4, label: 'added \u{1F680} \u05D3\u05D4 \u200D' });
  });

  doc.a('#done', 'Done route').id('done-route');
  doc.span().id('view-output').bind('view', value => value);
  doc.hashRouter({ stateKey: 'view', default: 'all' });

  doc.a('/app/users/alice%20smith', 'User route').id('user-route').attr('data-route', '');
  doc.a('/app/about', 'About route').id('about-route').attr('data-route', '');
  doc.span().id('page-output').bind('page', value => value);
  doc.span().id('params-output').bind('routeParams', value => value.id || '');
  // Event options. `once` unregistering and `preventDefault` actually cancelling
  // are runtime behaviours; a server-side assertion can only prove what source
  // was emitted, not what the browser does with it.
  doc.button('Once').id('once-button').onClick(function () { State.onceCount += 1; }, undefined, { once: true });
  doc.span().id('once-count').bind('onceCount', value => String(value));
  doc.button('Repeat').id('repeat-button').onClick(function () { State.repeatCount += 1; });
  doc.span().id('repeat-count').bind('repeatCount', value => String(value));
  doc.button('Prevented').id('prevented-button').onClick(function () { State.preventedCount += 1; }, undefined, { preventDefault: true });
  doc.span().id('prevented-count').bind('preventedCount', value => String(value));

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
  if (_req.url === '/compiled-stateless.js') {
    const doc = new Document();
    doc.button('Local state').onClick(function () { State.count = (State.count || 0) + 1; });
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
    return res.end(doc.compile({ output: 'class', className: 'StatelessPage' }));
  }
  if (_req.url === '/compiled.js' || _req.url === '/compiled-object.js') {
    const doc = new Document();
    doc.title('Local class title').bodyCss({ color: 'rgb(10, 20, 30)' });
    doc.cssVars({ accent: 'rgb(0, 128, 0)' });
    doc.states({ count: 0, name: 'Initial', ready: false, items: [{ id: 1, title: 'One' }] });
    doc.h1('Compiled page').css({ color: 'var(--accent)' });
    doc.span().id('compiled-count').bind('count');
    doc.span().id('compiled-double').computed(() => State.count * 2);
    doc.button('Increment').id('compiled-increment').onClick(function () { State.count++; });
    doc.input('text').id('compiled-input').addClass('scoped-input').attr('name', 'scoped-name').bindInput('name');
    doc.create('template').id('compiled-template').span('Template content');
    doc.div().id('compiled-platform').onMount(function () {
      const input = document.getElementById('compiled-input');
      this.dataset.array = String(window.Array === Array && typeof window.Array.isArray === 'function' && window.Array.isArray([]));
      this.dataset.event = String(window.Event.prototype === Event.prototype);
      this.dataset.promise = String(typeof window.Promise.resolve === 'function');
      this.dataset.view = String(document.defaultView === window);
      this.dataset.contains = String(document.contains(input));
      this.dataset.method = String(window.getComputedStyle(input).color === getComputedStyle(input).color);
      this.dataset.tag = String(document.getElementsByTagName('input')[0] === input);
      this.dataset.class = String(document.getElementsByClassName('scoped-input')[0] === input);
      const inputs = document.getElementsByTagName('input');
      const extra = document.createElement('input');
      document.body.appendChild(extra);
      this.dataset.live = String(inputs.length === 2);
      extra.remove();
    });
    doc.span().id('compiled-name').bind('name');
    doc.div().id('compiled-lifecycle')
      .onMount(function () {
        this.dataset.mounted = 'true';
        document.addEventListener('custom-event', function () { State.count++; });
        return () => { this.dataset.cleaned = 'true'; };
      })
      .onDestroy(function () { this.dataset.destroyed = 'true'; });
    doc.oncreate(function () { State.ready = true; });
    doc.button('Overview').data({ viewNav: 'overview' });
    doc.button('Details').data({ viewNav: 'details' });
    doc.section('Overview content').id('compiled-overview').data({ view: 'overview' });
    doc.section('Details content').id('compiled-details').data({ view: 'details' });
    doc.views({ stateKey: 'activeView', default: 'overview' });
    doc.p('Local portal').id('compiled-portal').portal('compiled-portal-target');
    doc.div().id('compiled-portal-target');
    doc.div().id('compiled-list').liveList('items', item => ({
      tag: 'button', text: item.title, css: { color: item.id === 1 ? 'red' : 'blue' },
      on: { click: function () { State.name = item.title; } },
    }), { key: 'id' });
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
    return res.end(doc.compile({ output: 'class', className: _req.url === '/compiled-object.js' ? 'Object' : 'CompiledPage' }));
  }
  if (_req.url === '/class-host') {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "script-src 'self' 'nonce-test-class-nonce'; style-src 'nonce-test-class-nonce'",
    });
    return res.end('<!DOCTYPE html><title>Host title</title><div id="class-target"></div><p id="compiled-count">Host count</p><input class="scoped-input" name="scoped-name" value="Host input">');
  }
  if (_req.url === '/csp') {
    const doc = new Document({ nonce: 'test-csp-nonce' });
    doc.states({ colors: [{ color: 'rgb(255, 0, 0)' }] });
    doc.div().id('csp-list').liveList('colors', item => ({
      tag: 'p', text: 'Styled row', css: { color: item.color },
    }));
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "script-src 'nonce-test-csp-nonce'; style-src 'nonce-test-csp-nonce'",
    });
    return res.end(doc.render());
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(buildPage());
});

server.listen(PORT, '127.0.0.1', () => console.log(`browser fixture ready on ${PORT}`));

function shutdown() { server.close(() => process.exit(0)); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
