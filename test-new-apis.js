'use strict';

const { Document, Element, components } = require('../index');

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

/* ==== DOCUMENT-LEVEL APIs ==== */

test('doc.lang()', () => {
  const doc = new Document();
  doc.lang('fr');
  doc.p('Bonjour');
  const html = doc.render();
  assert(html.includes('lang="fr"'), 'html lang attr');
});

test('doc.htmlAttr()', () => {
  const doc = new Document();
  doc.htmlAttr('data-theme', 'dark');
  doc.p('test');
  const html = doc.render();
  assert(html.includes('data-theme="dark"'), 'html custom attr');
});

test('doc.bodyClass()', () => {
  const doc = new Document();
  doc.bodyClass('dark-mode', 'no-scroll');
  doc.p('test');
  const html = doc.render();
  assert(html.includes('<body class="dark-mode no-scroll">'), 'body classes');
});

test('doc.bodyId()', () => {
  const doc = new Document();
  doc.bodyId('app');
  doc.p('test');
  const html = doc.render();
  assert(html.includes('<body id="app">'), 'body id');
});

test('doc.bodyAttr()', () => {
  const doc = new Document();
  doc.bodyAttr('data-page', 'home');
  doc.p('test');
  const html = doc.render();
  assert(html.includes('data-page="home"'), 'body attr');
});

test('doc.bodyCss()', () => {
  const doc = new Document();
  doc.bodyCss({ margin: '0', fontFamily: 'sans-serif' });
  doc.p('test');
  const html = doc.render();
  assert(html.includes('margin:0'), 'body css margin');
  assert(html.includes('font-family:sans-serif'), 'body css font');
});

test('doc.rawHead()', () => {
  const doc = new Document();
  doc.rawHead('<link rel="preconnect" href="https://fonts.googleapis.com">');
  doc.p('test');
  const html = doc.render();
  assert(html.includes('preconnect'), 'raw head injected');
});

test('doc.inlineScript()', () => {
  const doc = new Document();
  doc.inlineScript('console.log("hello")');
  doc.p('test');
  const html = doc.render();
  assert(html.includes('console.log("hello")'), 'inline script');
});

test('doc.inlineStyle()', () => {
  const doc = new Document();
  doc.inlineStyle('.custom { color: red }');
  doc.p('test');
  const html = doc.render();
  assert(html.includes('.custom { color: red }'), 'inline style');
});

test('doc.preload()', () => {
  const doc = new Document();
  doc.preload('/font.woff2', 'font', 'font/woff2');
  doc.p('test');
  const html = doc.render();
  assert(html.includes('rel="preload"'), 'preload rel');
  assert(html.includes('as="font"'), 'preload as');
});

test('doc.prefetch()', () => {
  const doc = new Document();
  doc.prefetch('/next-page.js');
  doc.p('test');
  const html = doc.render();
  assert(html.includes('rel="prefetch"'), 'prefetch');
});

test('doc.preconnect()', () => {
  const doc = new Document();
  doc.preconnect('https://api.example.com');
  doc.p('test');
  const html = doc.render();
  assert(html.includes('rel="preconnect"'), 'preconnect');
});

test('doc.canonical()', () => {
  const doc = new Document();
  doc.canonical('https://example.com/page');
  doc.p('test');
  const html = doc.render();
  assert(html.includes('rel="canonical"'), 'canonical');
});

test('doc.ogTags()', () => {
  const doc = new Document();
  doc.ogTags({ title: 'My Page', description: 'A description', image: '/img.png' });
  doc.p('test');
  const html = doc.render();
  assert(html.includes('og:title'), 'og title');
  assert(html.includes('og:description'), 'og description');
  assert(html.includes('og:image'), 'og image');
});

test('doc.twitterCard()', () => {
  const doc = new Document();
  doc.twitterCard({ card: 'summary', site: '@example' });
  doc.p('test');
  const html = doc.render();
  assert(html.includes('twitter:card'), 'twitter card');
  assert(html.includes('twitter:site'), 'twitter site');
});

test('doc.jsonLd()', () => {
  const doc = new Document();
  doc.jsonLd({ '@context': 'https://schema.org', '@type': 'WebPage', name: 'Test' });
  doc.p('test');
  const html = doc.render();
  assert(html.includes('application/ld+json'), 'json-ld type');
  assert(html.includes('"@type":"WebPage"'), 'json-ld content');
});

test('doc.noindex()', () => {
  const doc = new Document();
  doc.noindex();
  doc.p('test');
  const html = doc.render();
  assert(html.includes('noindex'), 'noindex');
});

test('doc.noindex(true) with nofollow', () => {
  const doc = new Document();
  doc.noindex(true);
  doc.p('test');
  const html = doc.render();
  assert(html.includes('noindex, nofollow'), 'noindex nofollow');
});

/* ==== ELEMENT-LEVEL APIs ==== */

test('el.style() inline', () => {
  const doc = new Document();
  doc.create('div').style('color', 'red').style('fontSize', '14px').text('styled');
  const html = doc.render();
  assert(html.includes('style="color:red;font-size:14px;"'), 'inline style');
});

test('el.style() object form', () => {
  const doc = new Document();
  doc.create('div').style({ color: 'blue', margin: '10px' }).text('obj');
  const html = doc.render();
  assert(html.includes('style="color:blue;margin:10px;"'), 'style object');
});

test('el.toggleClass()', () => {
  const doc = new Document();
  doc.create('div').toggleClass(true, 'active').toggleClass(false, 'hidden').text('test');
  const html = doc.render();
  assert(html.includes('active'), 'toggleClass true');
  assert(!html.includes('hidden'), 'toggleClass false');
});

test('el.removeClass()', () => {
  const doc = new Document();
  const el = doc.create('div').addClass('a', 'b', 'c');
  el.removeClass('b');
  const html = doc.render();
  assert(html.includes('a'), 'has a');
  assert(!html.includes('"a b c"'), 'b removed');
  assert(html.includes('c'), 'has c');
});

test('el.hasClass()', () => {
  const doc = new Document();
  const el = doc.create('div').addClass('active');
  assert(el.hasClass('active'), 'hasClass true');
  assert(!el.hasClass('hidden'), 'hasClass false');
  doc.render();
});

test('el.for() label attribute', () => {
  const doc = new Document();
  doc.create('label').for('email-input').text('Email');
  const html = doc.render();
  assert(html.includes('for="email-input"'), 'for attr');
});

test('el.title()', () => {
  const doc = new Document();
  doc.create('div').title('tooltip text');
  const html = doc.render();
  assert(html.includes('title="tooltip text"'), 'title attr');
});

test('el.tabindex()', () => {
  const doc = new Document();
  doc.create('div').tabindex(0);
  const html = doc.render();
  assert(html.includes('tabindex="0"'), 'tabindex');
});

test('el.contentEditable()', () => {
  const doc = new Document();
  doc.create('div').contentEditable().text('editable');
  const html = doc.render();
  assert(html.includes('contenteditable="true"'), 'contenteditable');
});

test('el.draggable()', () => {
  const doc = new Document();
  doc.create('div').draggable().text('drag me');
  const html = doc.render();
  assert(html.includes('draggable="true"'), 'draggable');
});

test('el.required(), el.readonly(), el.autofocus()', () => {
  const doc = new Document();
  doc.create('input').type('text').required().readonly().autofocus();
  const html = doc.render();
  assert(html.includes('required="required"'), 'required');
  assert(html.includes('readonly="readonly"'), 'readonly');
  assert(html.includes('autofocus="autofocus"'), 'autofocus');
});

test('el.checked(), el.multiple()', () => {
  const doc = new Document();
  doc.create('input').type('checkbox').checked();
  doc.create('select').multiple();
  const html = doc.render();
  assert(html.includes('checked="checked"'), 'checked');
  assert(html.includes('multiple="multiple"'), 'multiple');
});

test('el.action(), el.method()', () => {
  const doc = new Document();
  doc.create('form').action('/submit').method('POST');
  const html = doc.render();
  assert(html.includes('method="POST"'), 'method');
});

test('el.min(), el.max(), el.step()', () => {
  const doc = new Document();
  doc.create('input').type('number').min('0').max('100').step('5');
  const html = doc.render();
  assert(html.includes('min="0"'), 'min');
  assert(html.includes('max="100"'), 'max');
  assert(html.includes('step="5"'), 'step');
});

test('el.pattern()', () => {
  const doc = new Document();
  doc.create('input').pattern('[A-Za-z]+');
  const html = doc.render();
  assert(html.includes('pattern="[A-Za-z]+"'), 'pattern');
});

/* ==== TREE MANIPULATION ==== */

test('el.empty()', () => {
  const doc = new Document();
  const div = doc.create('div');
  div.child('p').text('A');
  div.child('p').text('B');
  div.empty();
  div.child('p').text('C');
  const html = doc.render();
  assert(!html.includes('>A<'), 'A removed');
  assert(!html.includes('>B<'), 'B removed');
  assert(html.includes('>C<'), 'C present');
});

test('el.clone()', () => {
  const doc = new Document();
  const original = doc.create('div').addClass('card');
  original.child('h2').text('Title');
  const cloned = original.clone();
  doc.body.push(cloned);
  const html = doc.render();
  // Should have two divs with card class
  const matches = html.match(/class="card"/g);
  assert(matches && matches.length === 2, 'two cloned elements');
});

test('el.find() and el.findAll()', () => {
  const doc = new Document();
  const div = doc.create('div');
  div.child('p').text('first');
  div.child('span').child('p').text('nested');
  const found = div.find('p');
  assert(found && found.children[0] === 'first', 'find first p');
  const all = div.findAll('p');
  assert(all.length === 2, 'findAll p count');
});

test('el.findById()', () => {
  const doc = new Document();
  const div = doc.create('div');
  div.child('span').id('target').text('found');
  const found = div.findById('target');
  assert(found != null, 'findById found');
  assert(found.attrs.id === 'target', 'findById correct element');
  doc.render();
});

test('el.closest()', () => {
  const doc = new Document();
  const div = doc.create('div');
  const section = div.child('section');
  const p = section.child('p');
  const result = p.closest('div');
  assert(result === div, 'closest finds ancestor');
  assert(p.closest('article') === null, 'closest returns null');
  doc.render();
});

test('el.remove()', () => {
  const doc = new Document();
  const div = doc.create('div');
  const toRemove = div.child('p').text('remove me');
  div.child('p').text('keep');
  toRemove.remove();
  const html = doc.render();
  assert(!html.includes('remove me'), 'removed');
  assert(html.includes('keep'), 'kept');
});

test('el.wrap()', () => {
  const doc = new Document();
  const div = doc.create('div');
  const p = div.child('p').text('wrapped');
  p.wrap('section');
  const html = doc.render();
  assert(html.includes('<section><p>wrapped</p></section>'), 'wrapped in section');
});

test('el.before() and el.after()', () => {
  const doc = new Document();
  const div = doc.create('div');
  const middle = div.child('p').text('middle');
  const beforeEl = doc._poolElement('span');
  beforeEl.text('before');
  const afterEl = doc._poolElement('span');
  afterEl.text('after');
  middle.before(beforeEl);
  middle.after(afterEl);
  const html = doc.render();
  const beforeIdx = html.indexOf('before');
  const middleIdx = html.indexOf('middle');
  const afterIdx = html.indexOf('after');
  assert(beforeIdx < middleIdx, 'before is before middle');
  assert(afterIdx > middleIdx, 'after is after middle');
});

test('el.html() preview', () => {
  const doc = new Document();
  const div = doc.create('div').addClass('test');
  div.child('p').text('hello');
  const preview = div.html();
  assert(preview.includes('<div class="test">'), 'html() renders tag');
  assert(preview.includes('<p>hello</p>'), 'html() renders children');
  doc.render();
});

/* ==== SLOTS ==== */

test('el.slot() and el.fillSlot()', () => {
  function Modal(el) {
    el.addClass('modal');
    el.child('div').addClass('modal-header').slot('header');
    el.child('div').addClass('modal-body').slot('default');
    el.child('div').addClass('modal-footer').slot('footer');
  }

  const doc = new Document();
  const modal = doc.use(Modal);
  modal.fillSlot('header', (slot) => slot.child('h2').text('Title'));
  modal.fillSlot('default', (slot) => slot.child('p').text('Body content'));
  modal.fillSlot('footer', (slot) => slot.child('button').text('Close'));
  const html = doc.render();
  assert(html.includes('<h2>Title</h2>'), 'header slot filled');
  assert(html.includes('<p>Body content</p>'), 'default slot filled');
  assert(html.includes('<button>Close</button>'), 'footer slot filled');
});

/* ==== FORM HELPERS ==== */

test('doc.formGroup()', () => {
  const doc = new Document();
  doc.formGroup('Email', 'email', { placeholder: 'you@example.com' });
  const html = doc.render();
  assert(html.includes('form-group'), 'form-group class');
  assert(html.includes('<label'), 'has label');
  assert(html.includes('Email'), 'label text');
  assert(html.includes('type="email"'), 'input type');
});

test('doc.checkbox()', () => {
  const doc = new Document();
  doc.checkbox('terms', 'I agree', true);
  const html = doc.render();
  assert(html.includes('type="checkbox"'), 'checkbox type');
  assert(html.includes('I agree'), 'label text');
  assert(html.includes('checked'), 'checked attr');
});

test('doc.radio()', () => {
  const doc = new Document();
  doc.radio('size', [
    { value: 's', label: 'Small' },
    { value: 'm', label: 'Medium', checked: true },
    { value: 'l', label: 'Large' },
  ]);
  const html = doc.render();
  assert(html.includes('type="radio"'), 'radio type');
  assert(html.includes('Small'), 'option 1');
  assert(html.includes('Medium'), 'option 2');
  assert(html.includes('Large'), 'option 3');
  assert(html.includes('checked'), 'checked');
});

test('doc.fieldset()', () => {
  const doc = new Document();
  doc.fieldset('Contact Info', (fs) => {
    fs.child('input').type('text').name('name');
    fs.child('input').type('email').name('email');
  });
  const html = doc.render();
  assert(html.includes('<fieldset>'), 'fieldset tag');
  assert(html.includes('<legend>Contact Info</legend>'), 'legend');
  assert(html.includes('name="name"'), 'input 1');
  assert(html.includes('name="email"'), 'input 2');
});

test('doc.hiddenInput()', () => {
  const doc = new Document();
  doc.hiddenInput('csrf', 'abc123');
  const html = doc.render();
  assert(html.includes('type="hidden"'), 'hidden type');
  assert(html.includes('name="csrf"'), 'name');
  assert(html.includes('value="abc123"'), 'value');
});

/* ==== LAYOUT HELPERS ==== */

test('doc.grid()', () => {
  const doc = new Document();
  doc.grid(3, ['A', 'B', 'C'], '20px');
  const html = doc.render();
  assert(html.includes('grid'), 'grid display');
  assert(html.includes('repeat(3, 1fr)'), 'grid columns');
  assert(html.includes('>A<'), 'item A');
  assert(html.includes('>C<'), 'item C');
});

test('doc.flex()', () => {
  const doc = new Document();
  doc.flex(['X', 'Y'], { direction: 'row', gap: '10px', align: 'center' });
  const html = doc.render();
  assert(html.includes('flex'), 'flex display');
  assert(html.includes('>X<'), 'item X');
});

test('doc.stack()', () => {
  const doc = new Document();
  doc.stack(['A', 'B']);
  const html = doc.render();
  assert(html.includes('column'), 'flex-direction column');
});

test('doc.row()', () => {
  const doc = new Document();
  doc.row(['A', 'B']);
  const html = doc.render();
  assert(html.includes('flex'), 'flex display');
  assert(html.includes('row'), 'flex-direction row');
});

test('doc.center()', () => {
  const doc = new Document();
  doc.center((c) => c.child('h1').text('Centered'));
  const html = doc.render();
  assert(html.includes('justify-content:center'), 'centered');
  assert(html.includes('Centered'), 'content');
});

test('doc.container()', () => {
  const doc = new Document();
  doc.container((c) => c.child('p').text('Contained'), '800px');
  const html = doc.render();
  assert(html.includes('max-width:800px'), 'max-width');
  assert(html.includes('Contained'), 'content');
});

test('doc.spacer()', () => {
  const doc = new Document();
  doc.spacer('32px');
  const html = doc.render();
  assert(html.includes('height:32px'), 'spacer height');
});

test('doc.divider()', () => {
  const doc = new Document();
  doc.divider({ color: '#ccc' });
  const html = doc.render();
  assert(html.includes('<hr'), 'hr tag');
  assert(html.includes('#ccc'), 'divider color');
});

test('doc.columns()', () => {
  const doc = new Document();
  doc.columns(2, [
    (col) => col.child('p').text('Left'),
    (col) => col.child('p').text('Right'),
  ]);
  const html = doc.render();
  assert(html.includes('Left'), 'left column');
  assert(html.includes('Right'), 'right column');
  assert(html.includes('grid'), 'uses grid');
});

/* ==== COMPONENT EXTEND ==== */

test('components.extend()', () => {
  function Card(el, { title }) {
    el.addClass('card');
    el.child('h2').text(title);
  }

  components.register('Card', Card);
  components.extend('CardWithBadge', 'Card', (el, { badge }) => {
    if (badge) el.child('span').addClass('badge').text(badge);
  });

  const doc = new Document();
  doc.component('CardWithBadge', { title: 'Extended', badge: 'New' });
  const html = doc.render();
  assert(html.includes('card'), 'base class');
  assert(html.includes('Extended'), 'base title');
  assert(html.includes('badge'), 'extended badge class');
  assert(html.includes('New'), 'extended badge text');

  components.unregister('Card');
  components.unregister('CardWithBadge');
});

/* ==== ADDITIONAL TAG SHORTCUTS ==== */

test('doc.details(), doc.pre(), doc.code(), doc.blockquote()', () => {
  const doc = new Document();
  doc.details().child('summary').text('Click');
  doc.pre().text('preformatted');
  doc.code().text('const x = 1');
  doc.blockquote().text('A quote');
  const html = doc.render();
  assert(html.includes('<details>'), 'details');
  assert(html.includes('<pre>'), 'pre');
  assert(html.includes('<code>'), 'code');
  assert(html.includes('<blockquote>'), 'blockquote');
});

test('doc.hr() and doc.br()', () => {
  const doc = new Document();
  doc.hr();
  doc.br();
  doc.p('after');
  const html = doc.render();
  assert(html.includes('<hr'), 'hr');
  assert(html.includes('<br>'), 'br');
});

/* ==== COMBINED FULL PAGE ==== */

test('Full page with all new APIs', () => {
  const doc = new Document();
  doc.lang('en')
    .title('Full Test')
    .viewport()
    .canonical('https://example.com')
    .ogTags({ title: 'Test', description: 'A test page' })
    .noindex()
    .preconnect('https://fonts.googleapis.com')
    .resetCss()
    .bodyClass('dark-mode')
    .bodyCss({ backgroundColor: '#1a1a1a', color: '#fff' });

  doc.container((c) => {
    c.child('h1').text('Hello World');
    c.child('p').text('Welcome').style('color', 'cyan');
  }, '960px');

  doc.formGroup('Name', 'text', { name: 'fullname' });
  doc.divider();
  doc.grid(2, ['Col 1', 'Col 2']);

  const html = doc.render();
  assert(html.includes('lang="en"'), 'lang');
  assert(html.includes('<title>Full Test</title>'), 'title');
  assert(html.includes('canonical'), 'canonical');
  assert(html.includes('og:title'), 'og tags');
  assert(html.includes('noindex'), 'noindex');
  assert(html.includes('dark-mode'), 'body class');
  assert(html.includes('background-color:#1a1a1a'), 'body css');
  assert(html.includes('Hello World'), 'content');
  assert(html.includes('style="color:cyan;"'), 'inline style');
  assert(html.includes('form-group'), 'form group');
  assert(html.includes('<hr'), 'divider');
  assert(html.includes('grid'), 'grid');
});

/* ---- Summary ---- */
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(40));
process.exit(failed > 0 ? 1 : 0);
