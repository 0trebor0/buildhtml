'use strict';

/**
 * Measures the client-side JavaScript each reactive facility compiles into a page.
 *
 * buildhtml ships no runtime library — every byte of browser JavaScript is
 * generated per page from the features actually used. This reports what each
 * facility costs so the trade-off is visible before you reach for one.
 *
 * Run: npm run benchmark:size
 */

const zlib = require('zlib');
const { Document, configure, CONFIG } = require('..');

const gzip = (s) => (s ? zlib.gzipSync(Buffer.from(s, 'utf8'), { level: 9 }).length : 0);

/** Sum of every inline <script> body in the rendered page (src= scripts excluded). */
function inlineScriptBytes(html) {
  let total = '';
  const re = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) total += m[1];
  return total;
}

function measure(build) {
  const doc = new Document();
  doc.title('size probe');
  build(doc);
  const js = inlineScriptBytes(doc.render());
  return { raw: Buffer.byteLength(js, 'utf8'), gz: gzip(js) };
}

const SCENARIOS = [
  ['Static page (no reactivity)', (d) => { d.h1('Title'); d.p('Body copy'); }],
  ['Core runtime (state only)', (d) => { d.states({ n: 0 }); d.p('x'); }],
  ['+ text binding', (d) => { d.states({ n: 0 }); d.span().bind('n', (v) => String(v)); }],
  ['+ event handler', (d) => { d.states({ n: 0 }); d.button('go').onClick(function () { State.n++; }); }],
  ['+ two-way input', (d) => { d.states({ n: '' }); d.input('text').bindInput('n'); }],
  ['+ show/hide binding', (d) => { d.states({ n: true }); d.div().bindShow('n'); }],
  ['+ class binding', (d) => { d.states({ n: 'a' }); d.div().bindClass('n', (v) => 'is-' + v); }],
  ['+ attribute binding', (d) => { d.states({ n: '/x' }); d.a('/x', 'l').bindAttr('n', 'href', (v) => v); }],
  ['+ style binding', (d) => { d.states({ n: 1 }); d.div().bindStyle('n', () => ({ opacity: '1' })); }],
  ['+ element state', (d) => { d.states({ n: 0 }); d.span().state('hello'); }],
  ['+ computed', (d) => { d.states({ n: 0 }); d.span().computed(function (s) { return s.n; }); }],
  ['+ lifecycle hooks', (d) => {
    d.states({ n: 0 });
    d.div().onMount(function () { return function () {}; })
      .onUpdate('n', function () {})
      .onDestroy(function () {});
  }],
  ['+ portal', (d) => { d.states({ n: 0 }); d.div().id('src').portal('dst'); d.div().id('dst'); }],
  ['+ oncreate', (d) => { d.states({ n: 0 }); d.oncreate(function () { return 1; }); }],
  ['+ liveList', (d) => {
    d.states({ items: [{ id: 1, label: 'a' }] });
    d.div().liveList('items', (i) => ({ tag: 'li', text: i.label }));
  }],
  ['+ hash router', (d) => { d.states({ view: 'all' }); d.hashRouter({ stateKey: 'view' }); }],
  ['+ history router', (d) => {
    d.states({ page: '/', routeParams: {} });
    d.historyRouter({ stateKey: 'page', routes: { '/': 'home', '/a/:id': 'a', '*': 'nf' } });
  }],
  ['+ views', (d) => { d.states({ panel: 'x' }); d.views({ stateKey: 'panel' }); }],
];

const original = { ...CONFIG };
configure({ mode: 'prod', debug: false });

const rows = SCENARIOS.map(([name, build]) => ({ name, ...measure(build) }));
const core = rows.find((r) => r.name === 'Core runtime (state only)');

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const W = Math.max(...rows.map((r) => r.name.length));

console.log('\nCompiled client JavaScript by feature (mode: prod)\n');
console.log(`${pad('Feature', W)}  ${lpad('bytes', 8)}  ${lpad('gzip', 7)}  ${lpad('vs core', 9)}  ${lpad('gzip Δ', 8)}`);
console.log(`${'-'.repeat(W)}  ${'-'.repeat(8)}  ${'-'.repeat(7)}  ${'-'.repeat(9)}  ${'-'.repeat(8)}`);
for (const r of rows) {
  const isBase = r.raw === 0;
  const delta = isBase || r === core ? '—' : `+${r.raw - core.raw}`;
  const gzDelta = isBase || r === core ? '—' : `+${r.gz - core.gz}`;
  console.log(`${pad(r.name, W)}  ${lpad(r.raw, 8)}  ${lpad(r.gz, 7)}  ${lpad(delta, 9)}  ${lpad(gzDelta, 8)}`);
}

// Debug mode ships callback sources and the inspector; worth calling out separately.
configure({ mode: 'dev', debug: true });
const dbg = measure((d) => { d.states({ n: 0 }); d.span().bind('n', (v) => String(v)); });
configure({ mode: 'dev', debug: false });
const devPlain = measure((d) => { d.states({ n: 0 }); d.span().bind('n', (v) => String(v)); });
configure(original);

console.log(`\nText binding in dev mode:            ${devPlain.raw} bytes (${devPlain.gz} gzip)`);
console.log(`Text binding in dev mode with debug: ${dbg.raw} bytes (${dbg.gz} gzip)  <- inspector + callback sources`);
console.log('\nEach page carries only the facilities it uses; there is no shared runtime to cache.');
console.log('"vs core" is the delta over a page that declares state but no bindings.\n');
