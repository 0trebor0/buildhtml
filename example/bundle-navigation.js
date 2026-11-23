'use strict';

const path = require('node:path');
const { Document } = require('..');

function basic() {
  const doc = new Document();
  doc.title('Basic navigation');
  const nav = doc.nav().attr('aria-label', 'Main navigation');
  nav.a('#home', 'Home');
  nav.a('#about', 'About');
  nav.a('#contact', 'Contact');
  doc.create('main').h1().bind('view');
  doc.hashRouter({
    default: 'home',
    routes: { home: 'Home', about: 'About', contact: 'Contact', '*': 'Page not found' },
  });
  return doc;
}

function panels() {
  const doc = new Document();
  doc.title('Dashboard navigation');
  const nav = doc.nav().id('main-nav').attr('aria-label', 'Main navigation');
  nav.a('#home', 'Home');
  nav.a('#projects', 'Projects');
  nav.a('#about', 'About');

  const main = doc.create('main');
  const home = main.section().data({ view: 'home' });
  home.h1('Dashboard');
  home.p('Choose a project to view its details.');

  const projects = main.section().data({ view: 'projects' });
  projects.h1('Projects');
  projects.a('#projects/42', 'Open project 42');

  const project = main.section().data({ view: 'project' });
  project.h1().bind('routeParams', params => params?.id ? `Project ${params.id}` : 'Project');
  project.a('#projects', 'Back to projects');

  main.section().data({ view: 'about' }).h1('About');
  const missing = main.section().data({ view: 'missing' });
  missing.h1('Page not found');
  missing.a('#home', 'Back to dashboard');

  // Register panels before the router sets the initial view from the URL.
  doc.views({ stateKey: 'view', default: 'home' });
  doc.hashRouter({
    default: 'home',
    routes: { home: 'home', projects: 'projects', 'projects/:id': 'project', about: 'about', '*': 'missing' },
    navSelector: '#main-nav a',
    activeStyle: { color: '#1d4ed8', fontWeight: '700' },
    inactiveStyle: { color: '#475569', fontWeight: '400' },
  });
  return doc;
}

function dashboard() {
  const doc = new Document();
  doc.title('Project dashboard').viewport();
  doc.states({
    routeParams: {},
    projects: [
      { id: 'atlas', name: 'Atlas', status: 'In progress', summary: 'Redesign the customer portal.' },
      { id: 'orbit', name: 'Orbit', status: 'In review', summary: 'Build the analytics dashboard.' },
      { id: 'harbor', name: 'Harbor', status: 'Complete', summary: 'Ship the onboarding flow.' },
    ],
  });
  doc.inlineStyle(`
    * { box-sizing: border-box; }
    body { margin: 0; font: 1rem/1.5 system-ui, sans-serif; color: #182235; background: #f5f7fb; }
    .shell { display: grid; grid-template-columns: 14rem 1fr; min-height: 100vh; }
    .sidebar { padding: 1.5rem; border-right: 1px solid #dce2ec; background: white; }
    .sidebar h2 { margin: 0 0 1rem; font-size: 1.125rem; }
    .sidebar nav { display: grid; gap: .5rem; }
    .sidebar a { padding: .625rem .75rem; border-radius: .5rem; text-decoration: none; }
    main { min-width: 0; padding: clamp(1.25rem, 4vw, 3rem); }
    h1 { margin: 0 0 .5rem; font-size: clamp(1.75rem, 4vw, 2.5rem); }
    p { color: #475569; }
    a { color: #1d4ed8; }
    a:focus-visible { outline: 3px solid #2563eb; outline-offset: 3px; }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
      gap: 1rem;
      margin-top: 1.5rem;
      max-width: 60rem;
    }
    .cards a, .detail { padding: 1.25rem; background: white; border: 1px solid #dce2ec; border-radius: .75rem; }
    .cards a { color: inherit; text-decoration: none; }
    .cards a:hover { border-color: #2563eb; }
    .cards h2 { margin: 0; font-size: 1.125rem; }
    .cards p { margin: .5rem 0 0; }
    .status { font-weight: 600; }
    .detail { max-width: 40rem; margin-top: 1rem; }
    @media (max-width: 42rem) {
      .shell { grid-template-columns: 1fr; }
      .sidebar { border-right: 0; border-bottom: 1px solid #dce2ec; }
      .sidebar nav { display: flex; flex-wrap: wrap; }
    }
  `);

  const shell = doc.div().addClass('shell');
  const sidebar = shell.create('aside').addClass('sidebar');
  sidebar.h2('Workspace');
  const nav = sidebar.create('nav').id('workspace-nav').attr('aria-label', 'Workspace');
  nav.a('#overview', 'Overview');
  nav.a('#projects', 'Projects');

  const main = shell.create('main');
  const overview = main.section().data({ view: 'overview' });
  overview.h1('Workspace overview');
  overview.p().computed(() => `${State.projects.length} projects in your workspace.`);
  overview.a('#projects', 'Browse projects');

  const projects = main.section().data({ view: 'projects' });
  projects.h1('Projects');
  projects.p('Select a project to see its status and summary.');
  projects.liveList('projects', project => ({
    tag: 'a',
    attrs: { href: `#projects/${encodeURIComponent(project.id)}` },
    children: [
      { tag: 'h2', text: project.name },
      { tag: 'p', text: project.status },
      { tag: 'p', text: project.summary },
    ],
  }), { key: 'id' }).addClass('cards');

  const project = main.section().data({ view: 'project' });
  project.a('#projects', '← All projects');
  const detail = project.div().addClass('detail');
  detail.h1().computed(() => State.projects.find(item => item.id === State.routeParams.id)?.name ?? 'Project not found');
  detail.p().addClass('status').computed(() => State.projects.find(item => item.id === State.routeParams.id)?.status ?? '');
  detail.p().computed(() => State.projects.find(item => item.id === State.routeParams.id)?.summary ?? 'Choose a project from the list.');

  const missing = main.section().data({ view: 'missing' });
  missing.h1('Page not found');
  missing.a('#overview', 'Return to overview');

  doc.views({ stateKey: 'view', default: 'overview' });
  doc.hashRouter({
    default: 'overview',
    routes: { overview: 'overview', projects: 'projects', 'projects/:id': 'project', '*': 'missing' },
    navSelector: '#workspace-nav a',
    activeStyle: { backgroundColor: '#e0eaff', color: '#173c87', fontWeight: '700' },
    inactiveStyle: { backgroundColor: 'transparent', color: '#475569', fontWeight: '400' },
  });
  return doc;
}

const examples = { basic, panels, dashboard };

if (require.main === module) {
  try {
    const directory = process.argv[2] || 'public/navigation';
    for (const [name, create] of Object.entries(examples)) {
      create().saveBundle(path.join(directory, name));
    }
    console.log(`Wrote basic, panels, and dashboard bundles to ${directory}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = examples;
