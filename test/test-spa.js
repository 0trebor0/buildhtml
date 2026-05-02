'use strict';

/**
 * SPA example — everything compiled by the server.
 * No inlineScript() calls written by the user.
 * The server compiles routing, reactive lists, events, and state bindings.
 */

const { page, components } = require('../index');

// ── Components ──────────────────────────────────────────────────────────────

components.register('NavLink', (el, { href, label, active }) => {
  el.tag = 'a';
  el.attr('href', href)
    .text(label)
    .css({
      padding: '8px 16px',
      borderRadius: '6px',
      textDecoration: 'none',
      fontWeight: active ? '600' : '400',
      color: active ? '#fff' : '#94a3b8',
      background: active ? '#3b82f6' : 'transparent',
    });
});

// ── Page setup ──────────────────────────────────────────────────────────────

const doc = page('TaskSPA', { lang: 'en' });

doc.cssVars({
  bg: '#0f172a',
  primary: '#3b82f6',
  text: '#f1f5f9',
  muted: '#94a3b8',
});
doc.bodyCss({ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'system-ui, sans-serif' });

doc.states({
  tasks: [
    { id: 1, title: 'Design the layout',    done: true  },
    { id: 2, title: 'Build with buildhtml', done: false },
    { id: 3, title: 'Write unit tests',     done: false },
  ],
  view: 'all',
  nextId: 4,
});

// ── Shell ────────────────────────────────────────────────────────────────────

const shell = doc.div().css({ minHeight: '100vh', display: 'flex', flexDirection: 'column' });

// Topbar
const nav = shell.child('header').css({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '16px 24px',
  background: '#1e293b',
  borderBottom: '1px solid #334155',
});

nav.h1().text('Tasks').css({ fontSize: '20px', fontWeight: '700', marginRight: 'auto' });

for (const [href, label, view] of [
  ['#all',    'All',    'all'   ],
  ['#active', 'Active', 'active'],
  ['#done',   'Done',   'done'  ],
]) {
  nav.component('NavLink', { href, label, active: view === 'all' });
}

// ── Main content ─────────────────────────────────────────────────────────────

const main = shell.child('main').css({
  flex: '1',
  padding: '32px 24px',
  maxWidth: '640px',
  margin: '0 auto',
  width: '100%',
});

// Add-task form — compiled by buildhtml's event system
const addForm = main.form().id('add-form').css({ display: 'flex', gap: '8px', marginBottom: '24px' });

addForm.input('text', { placeholder: 'Add a task…' })
  .id('task-input')
  .css({
    flex: '1',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: 'var(--text)',
    fontSize: '15px',
  });

addForm.button('Add')
  .attr('type', 'submit')
  .css({
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    background: 'var(--primary)',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer',
  })
  .hover({ background: '#2563eb' });

// Submit wired via buildhtml's compiled event system
addForm.onSubmit(function (e) {
  e.preventDefault();
  var input = document.getElementById('task-input');
  var title = input ? input.value.trim() : '';
  if (!title) return;
  State.tasks = State.tasks.concat([{ id: State.nextId++, title: title, done: false }]);
  if (input) input.value = '';
});

// ── Reactive task list — compiled by doc.liveList() ──────────────────────────
//
// itemFn(task, i) returns a NodeDef plain object.
// The server renders the initial items server-side.
// The client re-renders whenever State.tasks or State.view changes.

const taskList = main.liveList('tasks', function (task) {
  return {
    tag: 'div',
    css: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '14px 16px',
      background: '#1e293b',
      borderRadius: '8px',
      marginBottom: '8px',
    },
    children: [
      {
        tag: 'input',
        attrs: {
          type: 'checkbox',
          'data-id': String(task.id),
          ...(task.done ? { checked: 'checked' } : {}),
        },
        on: {
          change: function () {
            var id = Number(this.dataset.id);
            var ck = this.checked;
            State.tasks = State.tasks.map(function (t) {
              return t.id === id ? { id: t.id, title: t.title, done: ck } : t;
            });
          },
        },
      },
      {
        tag: 'label',
        text: task.title,
        css: {
          flex: '1',
          cursor: 'pointer',
          textDecoration: task.done ? 'line-through' : 'none',
          color: task.done ? '#64748b' : '#f1f5f9',
        },
      },
      {
        tag: 'button',
        text: '×',
        attrs: { 'data-del': String(task.id) },
        css: {
          background: 'none',
          border: 'none',
          color: '#64748b',
          fontSize: '20px',
          cursor: 'pointer',
          lineHeight: '1',
        },
        on: {
          click: function () {
            var id = Number(this.dataset.del);
            State.tasks = State.tasks.filter(function (t) { return t.id !== id; });
          },
        },
      },
    ],
  };
}, {
  filter: function (task, state) {
    if (state.view === 'active') return !task.done;
    if (state.view === 'done')   return  task.done;
    return true;
  },
  filterKeys: ['view'],
});

taskList.css({ display: 'flex', flexDirection: 'column' });

// ── Footer ────────────────────────────────────────────────────────────────────

const footer = shell.child('footer').css({
  padding: '16px 24px',
  borderTop: '1px solid #334155',
  display: 'flex',
  justifyContent: 'space-between',
  color: 'var(--muted)',
  fontSize: '13px',
});

// Tasks-left counter — compiled via buildhtml's .bind() system
const remaining = doc._globalState.tasks.filter(t => !t.done).length;
footer.span()
  .text(remaining + ' task' + (remaining !== 1 ? 's' : '') + ' left')
  .bind('tasks', function (tasks) {
    var r = tasks.filter(function (t) { return !t.done; }).length;
    return r + ' task' + (r !== 1 ? 's' : '') + ' left';
  });

// Clear completed — compiled via buildhtml's .onClick() system
footer.button('Clear completed')
  .css({ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '13px' })
  .hover({ color: '#ef4444' })
  .onClick(function () {
    State.tasks = State.tasks.filter(function (t) { return !t.done; });
  });

// ── Hash router — compiled by doc.hashRouter() ────────────────────────────────
//
// Maps location.hash → State.view and highlights the active nav link.
// No raw JS written by the user.

doc.hashRouter({
  stateKey: 'view',
  default: 'all',
  navSelector: 'header a',
  activeStyle:   { background: '#3b82f6', color: '#fff',     fontWeight: '600' },
  inactiveStyle: { background: 'transparent', color: '#94a3b8', fontWeight: '400' },
});

// ── Output ────────────────────────────────────────────────────────────────────

const html = doc.render();
console.log(html);
