/**
 * TypeScript example for @trebor/buildhtml
 *
 * This file shows typed usage of the library.
 * It is NOT compiled automatically — run it with ts-node or tsc.
 *
 * Install deps:
 *   npm install --save-dev typescript ts-node @types/node
 *
 * Run:
 *   npx ts-node typescript/example.ts
 */

import {
  Document,
  Element,
  Head,
  page,
  renderFromJSON,
  parseTemplate,
  renderTemplate,
  compileTemplate,
  components,
  configure,
  getCacheStats,
  responseCache,
  type CSSRules,
  type PageDef,
  type ComponentFn,
  type SelectOption,
  type TemplateAST,
} from '@trebor/buildhtml';

// ─── 1. Basic page ────────────────────────────────────────────────────────────

type DashboardState = {
  activePage: 'overview' | 'projects' | 'account';
  sidebarOpen: boolean;
  count: number;
  projects: Array<{ id: number; name: string }>;
};

const typedStateDoc = page<DashboardState>('Typed state');
typedStateDoc.states({
  activePage: 'overview',
  sidebarOpen: false,
  count: 0,
  projects: [{ id: 1, name: 'BuildHTML' }],
});
typedStateDoc.main(main => {
  main.button('Projects').setStateOnClick('activePage', 'projects');
  main.section('Projects').showWhen('activePage', 'projects');
  main.span().bind('count', (count, state) => `${count}:${state.activePage}`);
  main.button('Open').onClick(function (_event, state) {
    state.sidebarOpen = true;
  });
  main.onUpdate('count', function (count, state) {
    this.dataset.count = String(count + state.count);
  });
  main.liveList('projects', project => ({ tag: 'p', text: project.name }), {
    sort: (a, b, state) => state.sidebarOpen ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name),
    sortKeys: ['sidebarOpen'],
    empty: { tag: 'p', text: 'No projects' },
  });
});
typedStateDoc.views({ stateKey: 'activePage', default: 'overview' });
typedStateDoc.main().build([
  { tag: 'h2', text: 'Declarative child' },
  { tag: 'p', bind: { key: 'count', fn: count => String(count) } },
]);
const typedField = typedStateDoc.field('Count', { type: 'number', bind: 'count' });
typedField.input.addClass('number-input').bind('count', count => String(count));

// @ts-expect-error unknown state keys are rejected on typed documents
typedStateDoc.div().bind('missing', value => value);
// @ts-expect-error fluent element configuration preserves the state type
typedStateDoc.div().id('typed').addClass('card').bind('missing', value => value);
// @ts-expect-error state-setting values must match the selected state key
typedStateDoc.button('Invalid').setStateOnClick('sidebarOpen', 'yes');
// @ts-expect-error declared state values must match DashboardState
typedStateDoc.state('count', 'one');
// @ts-expect-error view defaults must be valid state values
typedStateDoc.views({ stateKey: 'activePage', default: 'missing' });
// @ts-expect-error field bindings use declared state keys
typedStateDoc.field('Unknown', { bind: 'missing' });

const doc: Document = page('Home', { lang: 'en' });
const typedHead: Head = new Head().setTitle('Typed head').setCharset('UTF-8');
console.log(typedHead.hasStyles(), responseCache.has('missing'), responseCache.get('missing'));

doc.resetCss();
doc.cssVars({ primaryColor: '#3b82f6', fontBase: '16px' });

const hero: Element = doc.div().css({ padding: '40px', textAlign: 'center' } as CSSRules);
hero.h1().text('Hello from TypeScript').css({ color: 'var(--primary-color)' } as CSSRules);
hero.section(section => section.strong('Typed setup callback'));
hero.button('Typed context').onClick(function (_event, state, _element, context) {
  state.activePage = context.page;
}, { page: 'overview' });
hero.p('Built with full type safety.');

const html: string = doc.render();
console.log('--- Basic page ---');
console.log(html.slice(0, 200) + '...\n');

const templateAst: TemplateAST = parseTemplate('h1 "Typed template"');
const templateHtml: string = renderTemplate('h1 "Typed template"');
const templateDocument: Document = compileTemplate('h1 "Typed template"');
console.log(templateAst.type, templateHtml.length, templateDocument.isEmpty());

// ─── 2. Layout helpers ────────────────────────────────────────────────────────

const doc2: Document = page('Layout Demo');

doc2.container((wrapper: Element) => {
  wrapper.h2().text('Features');

  wrapper.grid(3, [
    (cell: Element) => cell.p('Zero dependencies'),
    (cell: Element) => cell.p('Ultra-fast SSR'),
    (cell: Element) => cell.p('Full TypeScript types'),
  ], '24px');

  wrapper.divider({ color: '#e5e7eb', margin: '32px 0' });

  wrapper.flex([
    (col: Element) => col.button('Get started').css({ background: 'var(--primary)' } as CSSRules),
    (col: Element) => col.a('/docs', 'Read the docs'),
  ], { gap: '12px', align: 'center' });
});

console.log('--- Layout page rendered ---\n');
doc2.render();

// ─── 3. State & events ────────────────────────────────────────────────────────

const doc3: Document = page('Counter');
doc3.state('count', 0);

const counter: Element = doc3.div().css({ textAlign: 'center', padding: '40px' } as CSSRules);

counter.h1().text('Counter').css({ marginBottom: '16px' } as CSSRules);
counter
  .onMount(function (state) {
    this.dataset.initialCount = String(state.count);
    return () => { this.dataset.disposed = 'true'; };
  })
  .onUpdate('count', function (value: number, state) {
    this.dataset.currentCount = String(value);
    this.dataset.stateCount = String(state.count);
  })
  .onDestroy(function (state) {
    console.log('Counter removed at', state.count);
  });

counter
  .div()
  .css({ fontSize: '48px', fontWeight: 'bold' } as CSSRules)
  .bind('count', (val: number) => String(val));

const controls: Element = counter.div().css({ marginTop: '24px' } as CSSRules);

controls
  .button('−')
  .onClick(() => { (window as any).State.count--; })
  .css({ padding: '8px 20px', marginRight: '8px' } as CSSRules);

controls
  .button('+')
  .onClick(() => { (window as any).State.count++; })
  .css({ padding: '8px 20px' } as CSSRules);

doc3.historyRouter({
  base: '/app',
  routes: {
    '/': 'counter',
    '/settings': 'settings',
    '*': 'not-found',
  },
});

console.log('--- Counter page rendered ---\n');
doc3.render();

// ─── 4. Form with typed select options ───────────────────────────────────────

const doc4: Document = page('Contact Form');

const form: Element = doc4.form().css({ maxWidth: '480px', margin: '40px auto' } as CSSRules);
form.attr('action', '/submit').attr('method', 'post');

form.h2().text('Contact Us');

form.formGroup('Your name', 'text', { name: 'name', placeholder: 'Jane Doe' });
form.formGroup('Email', 'email', { name: 'email', placeholder: 'jane@example.com' });

const topics: SelectOption[] = [
  { value: '', text: 'Select a topic…' },
  { value: 'support', text: 'Support' },
  { value: 'sales', text: 'Sales' },
  { value: 'other', text: 'Other' },
];
form.select(topics, { name: 'topic' });

form.child('textarea').attr('name', 'message').attr('rows', '5').attr('placeholder', 'Your message…');

form.button('Send message').attr('type', 'submit');

console.log('--- Contact form rendered ---\n');
doc4.render();

// ─── 5. Component system ──────────────────────────────────────────────────────

interface CardProps {
  title: string;
  body: string;
  accent?: string;
}

const Card: ComponentFn<CardProps> = (el: Element, { title, body, accent = '#3b82f6' }) => {
  el.css({
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '20px',
    borderTop: `4px solid ${accent}`,
  } as CSSRules);
  el.h3().text(title).css({ marginBottom: '8px' } as CSSRules);
  el.p(body).css({ color: '#6b7280' } as CSSRules);
};

components.register('Card', Card);

const doc5: Document = page('Cards');
doc5.resetCss();

doc5.container((wrap: Element) => {
  wrap.h1().text('Our Services');

  wrap.grid(3, [
    (cell: Element) => cell.component('Card', { title: 'Speed', body: 'Sub-millisecond renders.' }),
    (cell: Element) => cell.component('Card', { title: 'Types', body: 'Full TypeScript support.' }),
    (cell: Element) => cell.component('Card', { title: 'Size', body: 'Zero runtime dependencies.' }),
  ]);
});

console.log('--- Cards page rendered ---\n');
doc5.render();

// ─── 6. renderFromJSON ────────────────────────────────────────────────────────

const def: PageDef = {
  title: 'JSON Page',
  lang: 'en',
  resetCss: true,
  cssVars: { primary: '#3b82f6' },
  ogTags: { title: 'JSON Page', description: 'Built from JSON.' },
  body: [
    { tag: 'h1', text: 'Hello from JSON' },
    { tag: 'p', text: 'This page was built from a plain object.' },
  ],
};

const jsonHtml: string = renderFromJSON(def);
console.log('--- JSON page ---');
console.log(jsonHtml.slice(0, 200) + '...\n');

// ─── 7. configure & stats ─────────────────────────────────────────────────────

configure({ mode: 'prod', cacheLimit: 500 });

const stats = getCacheStats();
console.log('--- Cache stats ---');
console.log(JSON.stringify(stats, null, 2));
