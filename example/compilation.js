'use strict';

const http = require('node:http');
const { Document } = require('..');

// This class runs on Node. compile() generates the separate browser class.
class CounterDocument extends Document {
  constructor() {
    super();
    this.title('Compilation walkthrough').viewport();
    this.bodyCss({ fontFamily: 'system-ui, sans-serif', margin: '24px', color: '#172033' });
    this.globalCss('button', { padding: '8px 12px', marginRight: '8px', cursor: 'pointer' });
    this.states({
      name: 'Ada', count: 0,
      tasks: [{ id: 1, title: 'Try the counter', done: false }, { id: 2, title: 'Toggle a task', done: false }],
    });
    this.main(main => {
      main.h1('Build once, choose the output');
      main.button('Counter').id('counter-view').data({ viewNav: 'counter' });
      main.button('Tasks').id('tasks-view').data({ viewNav: 'tasks' });
      main.section(panel => {
        panel.id('counter-panel').data({ view: 'counter' });
        panel.field('Your name', { id: 'example-name', bind: 'name' });
        panel.p().id('greeting').bind('name', name => `Hello, ${name}`);
        panel.button('+1').id('increment').onClick(function () { State.count++; });
        panel.p().id('count').bind('count', count => `Count: ${count}`);
        panel.p().id('double').computed(function () { return `Double: ${State.count * 2}`; });
      });
      main.section(panel => {
        panel.id('tasks-panel').data({ view: 'tasks' });
        panel.div().id('example-tasks').liveList('tasks', function (task) {
          return {
            tag: 'p', attrs: { 'data-task': task.id },
            children: [
              { tag: 'span', text: task.title + ' ' },
              { tag: 'button', text: task.done ? 'Undo' : 'Done', attrs: { 'aria-pressed': String(task.done) }, on: {
                click: function () {
                  const current = State.tasks.find(entry => entry.id === task.id);
                  if (current) current.done = !current.done;
                },
              } },
            ],
          };
        }, { key: 'id' });
      });
    });
    this.views({ stateKey: 'activeView', default: 'counter' });
  }
}

const HOST_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Browser class walkthrough</title></head>
<body>
  <h1>Browser class host</h1>
  <p><a href="/server">Open the server-rendered version</a></p>
  <button id="mount" type="button">Mount</button>
  <button id="destroy" type="button">Destroy</button>
  <p id="mount-status" role="status"></p>
  <div id="app"></div>
  <script type="module">
    import { CounterPage } from '/counter-page.js';
    const page = new CounterPage();
    window.examplePage = page;
    const target = document.getElementById('app');
    const status = document.getElementById('mount-status');
    function mountPage() {
      try {
        if (!page.root) page.mount(target);
        status.textContent = 'Mounted. Try the counter, name field and Tasks view.';
      } catch (error) { status.textContent = 'Mount failed: ' + error.message; }
    }
    document.getElementById('mount').addEventListener('click', mountPage);
    document.getElementById('destroy').addEventListener('click', function () {
      try { page.destroy(); status.textContent = 'Destroyed. Mount again to reset state.'; }
      catch (error) { status.textContent = 'Destroy failed: ' + error.message; }
    });
    mountPage();
  </script>
</body></html>`;

function createCompilationServer() {
  try {
    const doc = new CounterDocument();
    const html = doc.compile({ output: 'html' });
    const javascript = doc.compile({ output: 'class', className: 'CounterPage' });
    return http.createServer((request, response) => {
      try {
        if (request.method !== 'GET') {
          response.writeHead(405, { Allow: 'GET', 'Content-Type': 'text/plain; charset=utf-8' });
          response.end('Method not allowed');
          return;
        }
        const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
        let body;
        let contentType = 'text/html; charset=utf-8';
        if (pathname === '/') body = HOST_HTML;
        else if (pathname === '/server') body = html;
        else if (pathname === '/counter-page.js') {
          body = javascript;
          contentType = 'text/javascript; charset=utf-8';
        } else {
          response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          response.end('Not found');
          return;
        }
        response.writeHead(200, { 'Content-Type': contentType });
        response.end(body);
      } catch (error) {
        response.writeHead(error.code === 'ERR_INVALID_URL' ? 400 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end(error.code === 'ERR_INVALID_URL' ? 'Invalid URL' : 'Unable to serve compilation example');
      }
    });
  } catch (error) {
    throw new Error('Unable to create compilation example server: ' + error.message, { cause: error });
  }
}

if (require.main === module) {
  try {
    if (process.argv[2] === '--build') {
      const outputPath = process.argv[3];
      new CounterDocument().saveBundle(outputPath, { className: 'CounterPage' });
      console.log(`Wrote ${outputPath} and its matching JavaScript module.`);
    } else {
      const port = Number(process.env.PORT) || 3006;
      const server = createCompilationServer();
      server.on('error', error => { console.error(error.message); process.exitCode = 1; });
      server.listen(port, '127.0.0.1', () => {
        console.log(`Compilation example: http://127.0.0.1:${port}/ (browser class), /server (HTML), /counter-page.js (module)`);
      });
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { CounterDocument, createCompilationServer };
