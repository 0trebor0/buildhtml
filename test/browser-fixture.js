'use strict';

const http = require('http');
const { Document } = require('../index');

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
    view: 'all',
  });

  doc.div().id('portal-source').text('Portaled').portal('portal-target');
  doc.div().id('portal-target');

  doc.span().id('count-output').bind('count', value => String(value));
  doc.button('Increment').id('increment').onClick(function () { State.count += 1; });

  doc.input('text').id('name-input').bindInput('name');
  doc.span().id('name-output').bind('name', value => value);

  doc.div().id('visibility').text('Visible').bindShow('visible');
  doc.button('Toggle visibility').id('toggle-visibility').onClick(function () { State.visible = !State.visible; });

  doc.div().id('class-output').bindClass('theme', value => 'theme-' + value);
  doc.button('Toggle theme').id('toggle-theme').onClick(function () { State.theme = State.theme === 'light' ? 'dark' : 'light'; });

  doc.a('/safe', 'Reactive link').id('link-output').bindAttr('link', 'href', value => value);
  doc.button('Unsafe link').id('unsafe-link').onClick(function () { State.link = 'javascript:alert(1)'; });

  doc.div().id('list').liveList('items', item => ({
    tag: 'span', text: item.label, attrs: { 'data-item': item.id },
  }));
  doc.button('Add item').id('add-item').onClick(function () {
    State.items = State.items.concat([{ id: 2, label: 'Two' }]);
  });

  doc.a('#done', 'Done route').id('done-route');
  doc.span().id('view-output').bind('view', value => value);
  doc.hashRouter({ stateKey: 'view', default: 'all' });

  return doc.render();
}

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(buildPage());
});

server.listen(3344, '127.0.0.1', () => console.log('browser fixture ready'));

function shutdown() { server.close(() => process.exit(0)); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
