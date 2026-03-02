'use strict';

const { Document, Element, components } = require('./index');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

function test(name, fn) {
  console.log(`\n▸ ${name}`);
  try { fn(); } catch (e) { failed++; console.error(`  ✗ THREW: ${e.message}`); }
}

/* ============================================================
   ELEMENT: Visibility / State Toggles
   ============================================================ */

test('el.show() / el.hide()', () => {
  const doc = new Document();
  const el = doc.create('div').text('toggle');
  el.hide();
  assert(el.attrs.hidden === 'hidden', 'hide sets hidden');
  el.show();
  assert(el.attrs.hidden === undefined, 'show removes hidden');
  doc.render();
});

test('el.enable() / el.disable()', () => {
  const doc = new Document();
  const el = doc.create('button').text('btn');
  el.disable();
  assert(el.attrs.disabled === 'disabled', 'disable sets disabled');
  el.enable();
  assert(el.attrs.disabled === undefined, 'enable removes disabled');
  doc.render();
});

test('el.focus()', () => {
  const doc = new Document();
  doc.create('input').focus();
  const html = doc.render();
  assert(html.includes('autofocus'), 'focus sets autofocus');
});

/* ============================================================
   ELEMENT: Additional Tree Manipulation
   ============================================================ */

test('el.replaceWith()', () => {
  const doc = new Document();
  const div = doc.create('div');
  const old = div.child('p').text('old');
  const replacement = doc._poolElement('span');
  replacement.text('new');
  old.replaceWith(replacement);
  const html = doc.render();
  assert(!html.includes('>old<'), 'old removed');
  assert(html.includes('<span>new</span>'), 'replacement present');
});

test('el.prependChild()', () => {
  const doc = new Document();
  const div = doc.create('div');
  div.child('p').text('second');
  const first = doc._poolElement('p');
  first.text('first');
  div.prependChild(first);
  const html = doc.render();
  const firstIdx = html.indexOf('first');
  const secondIdx = html.indexOf('second');
  assert(firstIdx < secondIdx, 'prepended child is first');
});

test('el.insertAt()', () => {
  const doc = new Document();
  const div = doc.create('div');
  div.child('span').text('A');
  div.child('span').text('C');
  const b = doc._poolElement('span');
  b.text('B');
  div.insertAt(1, b);
  const html = doc.render();
  const aIdx = html.indexOf('>A<');
  const bIdx = html.indexOf('>B<');
  const cIdx = html.indexOf('>C<');
  assert(aIdx < bIdx && bIdx < cIdx, 'inserted at correct position');
});

test('el.childCount()', () => {
  const doc = new Document();
  const div = doc.create('div');
  div.child('p');
  div.child('p');
  div.child('p');
  assert(div.childCount() === 3, 'childCount is 3');
  doc.render();
});

test('el.parent()', () => {
  const doc = new Document();
  const div = doc.create('div');
  const p = div.child('p');
  assert(p.parent() === div, 'parent returns parent');
  doc.render();
});

test('el.index()', () => {
  const doc = new Document();
  const div = doc.create('div');
  div.child('span').text('A');
  const b = div.child('span').text('B');
  div.child('span').text('C');
  assert(b.index() === 1, 'index is 1');
  doc.render();
});

test('el.siblings()', () => {
  const doc = new Document();
  const div = doc.create('div');
  const a = div.child('span').text('A');
  const b = div.child('span').text('B');
  const c = div.child('span').text('C');
  const sibs = b.siblings();
  assert(sibs.length === 2, 'has 2 siblings');
  assert(sibs.includes(a), 'includes A');
  assert(sibs.includes(c), 'includes C');
  assert(!sibs.includes(b), 'excludes self');
  doc.render();
});

test('el.nextSibling() / el.prevSibling()', () => {
  const doc = new Document();
  const div = doc.create('div');
  const a = div.child('span').text('A');
  const b = div.child('span').text('B');
  const c = div.child('span').text('C');
  assert(b.nextSibling() === c, 'nextSibling');
  assert(b.prevSibling() === a, 'prevSibling');
  assert(a.prevSibling() === null, 'first has no prev');
  assert(c.nextSibling() === null, 'last has no next');
  doc.render();
});

test('el.isVoid()', () => {
  const doc = new Document();
  assert(doc.create('img').isVoid(), 'img is void');
  assert(doc.create('input').isVoid(), 'input is void');
  assert(doc.create('br').isVoid(), 'br is void');
  assert(!doc.create('div').isVoid(), 'div is not void');
  assert(!doc.create('p').isVoid(), 'p is not void');
  doc.render();
});

test('el.toString()', () => {
  const doc = new Document();
  const el = doc.create('div').addClass('test').text('hello');
  const str = el.toString();
  assert(str.includes('<div class="test">hello</div>'), 'toString returns html');
  doc.render();
});

test('el.tooltip()', () => {
  const doc = new Document();
  doc.create('button').tooltip('Click to save').text('Save');
  const html = doc.render();
  assert(html.includes('title="Click to save"'), 'tooltip title');
  assert(html.includes('aria-describedby'), 'tooltip aria');
});

/* ============================================================
   ELEMENT: CSS Pseudo-classes & Responsive
   ============================================================ */

test('el.hover()', () => {
  const doc = new Document();
  doc.create('button').text('Hover me').hover({ color: 'red', textDecoration: 'underline' });
  const html = doc.render();
  assert(html.includes(':hover'), 'has :hover rule');
  assert(html.includes('color:red'), 'hover color');
  assert(html.includes('text-decoration:underline'), 'hover underline');
});

test('el.focusCss()', () => {
  const doc = new Document();
  doc.create('input').focusCss({ outline: '2px solid blue' });
  const html = doc.render();
  assert(html.includes(':focus'), 'has :focus rule');
  assert(html.includes('outline:2px solid blue'), 'focus outline');
});

test('el.active()', () => {
  const doc = new Document();
  doc.create('button').active({ transform: 'scale(0.95)' });
  const html = doc.render();
  assert(html.includes(':active'), 'has :active rule');
});

test('el.firstChild() / el.lastChild()', () => {
  const doc = new Document();
  doc.create('li').firstChild({ fontWeight: 'bold' }).text('first');
  doc.create('li').lastChild({ marginBottom: '0' }).text('last');
  const html = doc.render();
  assert(html.includes(':first-child'), 'has :first-child');
  assert(html.includes(':last-child'), 'has :last-child');
});

test('el.nthChild()', () => {
  const doc = new Document();
  doc.create('tr').nthChild('2n', { backgroundColor: '#f5f5f5' });
  const html = doc.render();
  assert(html.includes(':nth-child(2n)'), 'has :nth-child');
  assert(html.includes('background-color:#f5f5f5'), 'nth-child bg');
});

test('el.pseudo("before")', () => {
  const doc = new Document();
  doc.create('div').pseudo('before', { content: '""', display: 'block', height: '2px', backgroundColor: 'red' });
  const html = doc.render();
  assert(html.includes('::before'), 'has ::before');
  assert(html.includes('display:block'), 'before display');
});

test('el.pseudo("after")', () => {
  const doc = new Document();
  doc.create('div').pseudo('after', { content: '"→"' });
  const html = doc.render();
  assert(html.includes('::after'), 'has ::after');
});

test('el.media()', () => {
  const doc = new Document();
  doc.create('div').css({ display: 'flex' }).media('(max-width: 768px)', { flexDirection: 'column', padding: '8px' });
  const html = doc.render();
  assert(html.includes('@media (max-width: 768px)'), 'has media query');
  assert(html.includes('flex-direction:column'), 'responsive column');
});

test('el.transition()', () => {
  const doc = new Document();
  doc.create('div').transition({ property: 'opacity', duration: '0.5s', timing: 'ease-in' });
  const html = doc.render();
  assert(html.includes('transition:opacity 0.5s ease-in'), 'transition');
});

test('el.transition() string form', () => {
  const doc = new Document();
  doc.create('div').transition('all 0.3s ease');
  const html = doc.render();
  assert(html.includes('transition:all 0.3s ease'), 'transition string');
});

test('el.transform()', () => {
  const doc = new Document();
  doc.create('div').transform('rotate(45deg)');
  const html = doc.render();
  assert(html.includes('transform:rotate(45deg)'), 'transform');
});

test('el.animate()', () => {
  const doc = new Document();
  doc.create('div').animate('spin', { duration: '2s', iterations: 'infinite' });
  const html = doc.render();
  assert(html.includes('animation:spin 2s'), 'animate name + duration');
  assert(html.includes('infinite'), 'animate iterations');
});

test('el.opacity()', () => {
  const doc = new Document();
  doc.create('div').opacity(0.5);
  const html = doc.render();
  assert(html.includes('opacity:0.5'), 'opacity');
});

test('el.zIndex()', () => {
  const doc = new Document();
  doc.create('div').zIndex(100);
  const html = doc.render();
  assert(html.includes('z-index:100'), 'zIndex');
});

test('el.cursor()', () => {
  const doc = new Document();
  doc.create('div').cursor('pointer');
  const html = doc.render();
  assert(html.includes('cursor:pointer'), 'cursor');
});

test('el.overflow()', () => {
  const doc = new Document();
  doc.create('div').overflow('hidden');
  const html = doc.render();
  assert(html.includes('overflow:hidden'), 'overflow');
});

test('el.display()', () => {
  const doc = new Document();
  doc.create('div').display('inline-block');
  const html = doc.render();
  assert(html.includes('display:inline-block'), 'display');
});

test('el.position()', () => {
  const doc = new Document();
  doc.create('div').position('absolute');
  const html = doc.render();
  assert(html.includes('position:absolute'), 'position');
});

test('el.size()', () => {
  const doc = new Document();
  doc.create('div').size('100px', '50px');
  const html = doc.render();
  assert(html.includes('width:100px'), 'size width');
  assert(html.includes('height:50px'), 'size height');
});

test('el.size() square', () => {
  const doc = new Document();
  doc.create('div').size('64px');
  const html = doc.render();
  assert(html.includes('width:64px'), 'square width');
  assert(html.includes('height:64px'), 'square height');
});

/* ============================================================
   ELEMENT: Form Validation Attributes
   ============================================================ */

test('el.minLength() / el.maxLength()', () => {
  const doc = new Document();
  doc.create('input').minLength(3).maxLength(50);
  const html = doc.render();
  assert(html.includes('minlength="3"'), 'minlength');
  assert(html.includes('maxlength="50"'), 'maxlength');
});

test('el.accept()', () => {
  const doc = new Document();
  doc.create('input').type('file').accept('image/*');
  const html = doc.render();
  assert(html.includes('accept="image&#x2F;*"'), 'accept');
});

test('el.rows() / el.cols()', () => {
  const doc = new Document();
  doc.create('textarea').rows(10).cols(80);
  const html = doc.render();
  assert(html.includes('rows="10"'), 'rows');
  assert(html.includes('cols="80"'), 'cols');
});

/* ============================================================
   DOCUMENT: CSS Features
   ============================================================ */

test('doc.keyframes()', () => {
  const doc = new Document();
  doc.keyframes('spin', {
    from: { transform: 'rotate(0deg)' },
    to: { transform: 'rotate(360deg)' }
  });
  doc.create('div').animate('spin', { duration: '2s', iterations: 'infinite' });
  const html = doc.render();
  assert(html.includes('@keyframes spin'), 'keyframes defined');
  assert(html.includes('rotate(0deg)'), 'keyframes from');
  assert(html.includes('rotate(360deg)'), 'keyframes to');
});

test('doc.mediaQuery()', () => {
  const doc = new Document();
  doc.mediaQuery('(max-width: 600px)', {
    '.sidebar': { display: 'none' },
    '.content': { width: '100%' }
  });
  doc.p('test');
  const html = doc.render();
  assert(html.includes('@media (max-width: 600px)'), 'media query');
  assert(html.includes('.sidebar{display:none;}'), 'sidebar rule');
  assert(html.includes('.content{width:100%;}'), 'content rule');
});

test('doc.cssVar()', () => {
  const doc = new Document();
  doc.cssVar('primary', '#007bff');
  doc.cssVar('radius', '4px');
  doc.p('test');
  const html = doc.render();
  assert(html.includes(':root{'), 'root rule');
  assert(html.includes('--primary:#007bff'), 'primary var');
  assert(html.includes('--radius:4px'), 'radius var');
});

test('doc.cssVars()', () => {
  const doc = new Document();
  doc.cssVars({ spacing: '16px', fontMono: 'monospace' });
  doc.p('test');
  const html = doc.render();
  assert(html.includes('--spacing:16px'), 'spacing var');
  assert(html.includes('--font-mono:monospace'), 'font-mono var');
});

test('doc.darkMode()', () => {
  const doc = new Document();
  doc.darkMode({
    body: { backgroundColor: '#1a1a1a', color: '#eee' }
  });
  doc.p('test');
  const html = doc.render();
  assert(html.includes('prefers-color-scheme: dark'), 'dark mode query');
  assert(html.includes('background-color:#1a1a1a'), 'dark bg');
});

test('doc.print()', () => {
  const doc = new Document();
  doc.print({
    '.no-print': { display: 'none' },
    body: { fontSize: '12pt' }
  });
  doc.p('test');
  const html = doc.render();
  assert(html.includes('@media print'), 'print query');
  assert(html.includes('.no-print{display:none;}'), 'no-print rule');
});

/* ============================================================
   DOCUMENT: Utility APIs
   ============================================================ */

test('doc.comment()', () => {
  const doc = new Document();
  doc.comment('Start of section');
  doc.p('test');
  const html = doc.render();
  assert(html.includes('<!-- Start of section -->'), 'html comment');
});

test('doc.raw()', () => {
  const doc = new Document();
  doc.raw('<div class="special">Raw HTML</div>');
  const html = doc.render();
  assert(html.includes('<div class="special">Raw HTML</div>'), 'raw html in body');
});

test('doc.each()', () => {
  const doc = new Document();
  const colors = ['red', 'green', 'blue'];
  doc.each(colors, (d, color, i) => {
    d.create('span').text(`${i}: ${color}`);
  });
  const html = doc.render();
  assert(html.includes('0: red'), 'each item 0');
  assert(html.includes('1: green'), 'each item 1');
  assert(html.includes('2: blue'), 'each item 2');
});

test('doc.when() true', () => {
  const doc = new Document();
  doc.when(true, (d) => d.p('shown'));
  const html = doc.render();
  assert(html.includes('shown'), 'when true renders');
});

test('doc.when() false', () => {
  const doc = new Document();
  doc.when(false, (d) => d.p('hidden'));
  doc.p('fallback');
  const html = doc.render();
  assert(!html.includes('hidden'), 'when false skips');
  assert(html.includes('fallback'), 'fallback present');
});

test('doc.group()', () => {
  const doc = new Document();
  doc.group((d) => {
    d.h(1).text('Title');
    d.p('Paragraph');
  });
  const html = doc.render();
  assert(html.includes('Title'), 'group title');
  assert(html.includes('Paragraph'), 'group paragraph');
});

test('doc.template() / doc.useTemplate()', () => {
  const doc = new Document();
  doc.template('userCard', (d, { name, role }) => {
    const card = d.create('div').addClass('user-card');
    card.child('h3').text(name);
    card.child('span').text(role);
  });
  doc.useTemplate('userCard', { name: 'Alice', role: 'Admin' });
  doc.useTemplate('userCard', { name: 'Bob', role: 'User' });
  const html = doc.render();
  assert(html.includes('Alice'), 'template 1 name');
  assert(html.includes('Admin'), 'template 1 role');
  assert(html.includes('Bob'), 'template 2 name');
  assert(html.includes('User'), 'template 2 role');
  const cards = html.match(/user-card/g);
  assert(cards && cards.length === 2, 'two cards rendered');
});

test('doc.isEmpty()', () => {
  const doc = new Document();
  assert(doc.isEmpty(), 'empty at start');
  doc.p('text');
  assert(!doc.isEmpty(), 'not empty after adding');
  doc.render();
});

test('doc.elementCount()', () => {
  const doc = new Document();
  const div = doc.create('div');
  div.child('p').text('A');
  div.child('p').text('B');
  doc.create('span');
  // div(1) + p(2) + p(3) + span(4) = 4 elements
  assert(doc.elementCount() === 4, 'elementCount is 4');
  doc.render();
});

/* ============================================================
   COMBINED: Full integration test
   ============================================================ */

test('Full integration with all new APIs', () => {
  const doc = new Document();
  doc.title('All APIs')
    .lang('en')
    .viewport()
    .resetCss()
    .bodyClass('app')
    .bodyCss({ margin: '0' });

  // CSS vars & keyframes
  doc.cssVars({ primary: '#007bff', radius: '8px' });
  doc.keyframes('fadeIn', {
    from: { opacity: '0' },
    to: { opacity: '1' }
  });
  doc.darkMode({ body: { backgroundColor: '#111' } });
  doc.print({ '.no-print': { display: 'none' } });

  // Comment
  doc.comment('Main content');

  // Container with hover, media, pseudo
  doc.container((c) => {
    c.child('h1').text('Dashboard')
      .hover({ color: 'var(--primary)' })
      .animate('fadeIn', { duration: '0.5s' });

    c.child('p').text('Responsive text')
      .media('(max-width: 600px)', { fontSize: '14px' })
      .pseudo('before', { content: '"→ "' });
  }, '800px');

  // Templates
  doc.template('badge', (d, { label }) => {
    d.create('span').addClass('badge').text(label)
      .transition({ duration: '0.2s' })
      .cursor('pointer')
      .opacity(0.9);
  });

  // Each + when
  doc.each(['New', 'Sale', 'Hot'], (d, label) => {
    d.useTemplate('badge', { label });
  });

  doc.when(true, (d) => d.p('Visible section'));

  // Form with validation
  const form = doc.create('form');
  form.child('input').type('text').minLength(2).maxLength(100).required().focus();
  form.child('textarea').rows(5).cols(40).placeholder('Write here');
  form.child('input').type('file').accept('image/*,.pdf');

  const html = doc.render();

  assert(html.includes('--primary:#007bff'), 'css var');
  assert(html.includes('@keyframes fadeIn'), 'keyframes');
  assert(html.includes('prefers-color-scheme'), 'dark mode');
  assert(html.includes('@media print'), 'print');
  assert(html.includes('<!-- Main content -->'), 'comment');
  assert(html.includes(':hover'), 'hover');
  assert(html.includes('@media (max-width: 600px)'), 'responsive');
  assert(html.includes('::before'), 'pseudo');
  assert(html.includes('fadeIn'), 'animate');
  assert(html.includes('badge'), 'template');
  assert(html.includes('New'), 'each 1');
  assert(html.includes('Hot'), 'each 3');
  assert(html.includes('Visible section'), 'when');
  assert(html.includes('minlength="2"'), 'minlength');
  assert(html.includes('maxlength="100"'), 'maxlength');
  assert(html.includes('rows="5"'), 'rows');
  assert(html.includes('cols="40"'), 'cols');
});

/* ---- Summary ---- */
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(40));
process.exit(failed > 0 ? 1 : 0);
