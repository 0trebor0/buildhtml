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

test('el.remove() on a top-level element', () => {
  // Document.create() appends to document.body without setting _parent, so this
  // used to hit the no-parent guard and silently do nothing.
  const doc = new Document();
  doc.create('div').id('keep-first');
  const toRemove = doc.create('div').id('drop-me');
  doc.create('div').id('keep-last');

  assert(toRemove.remove() === toRemove, 'remove() stays chainable');
  const html = doc.render();
  assert(!html.includes('drop-me'), 'top-level element removed');
  assert(html.includes('keep-first'), 'earlier sibling kept');
  assert(html.includes('keep-last'), 'later sibling kept');
});

test('el.remove() twice is harmless', () => {
  const doc = new Document();
  const el = doc.create('div').id('gone');
  el.remove();
  el.remove();
  assert(!doc.render().includes('gone'), 'still removed, no error');
});

test('el.wrap()', () => {
  const doc = new Document();
  const div = doc.create('div');
  const p = div.child('p').text('wrapped');
  p.wrap('section');
  const html = doc.render();
  assert(html.includes('<section><p>wrapped</p></section>'), 'wrapped in section');
});

test('el.wrap() on a top-level element', () => {
  // Top-level elements live in document.body with no _parent, so this used to
  // hit the no-parent guard and return the element unwrapped.
  const doc = new Document();
  doc.create('div').id('keep-first');
  const target = doc.create('div').id('wrapme');
  doc.create('div').id('keep-last');

  const wrapper = target.wrap('section');
  assert(wrapper !== target && wrapper.tag === 'section', 'returns the new wrapper');
  assert(target._parent === wrapper, 'wrapped element is reparented');

  const html = doc.render();
  assert(html.includes('<section><div id="wrapme"></div></section>'), 'wrapped in place');
  assert((html.match(/id="wrapme"/g) || []).length === 1, 'element not duplicated');
  assert(
    html.indexOf('keep-first') < html.indexOf('wrapme') && html.indexOf('wrapme') < html.indexOf('keep-last'),
    'position among siblings preserved'
  );
});

test('el.wrap() returns a usable wrapper at top level', () => {
  const doc = new Document();
  const target = doc.create('div').id('c');
  const wrapper = target.wrap('section');
  wrapper.addClass('box');
  wrapper.child('em').text('added');

  const html = doc.render();
  assert(html.includes('<section class="box">'), 'wrapper accepts further configuration');
  assert(html.includes('<em>added</em>'), 'wrapper accepts new children');
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

test('el.before() and el.after() on a top-level element', () => {
  // Top-level elements live in document.body with no _parent, so these used to
  // hit the no-parent guard and silently insert nothing.
  const doc = new Document();
  const anchor = doc.create('div').id('anchor');
  anchor.before('BEFORE_MARK');
  anchor.after('AFTER_MARK');

  const html = doc.render();
  const beforeIdx = html.indexOf('BEFORE_MARK');
  const anchorIdx = html.indexOf('id="anchor"');
  const afterIdx = html.indexOf('AFTER_MARK');
  assert(beforeIdx !== -1, 'before() inserted at top level');
  assert(afterIdx !== -1, 'after() inserted at top level');
  assert(beforeIdx < anchorIdx, 'before() lands ahead of the anchor');
  assert(afterIdx > anchorIdx, 'after() lands behind the anchor');
});

test('el.before() escapes a string sibling at top level', () => {
  const doc = new Document();
  const anchor = doc.create('div').id('a');
  anchor.before('<script>alert(1)</script>');
  const html = doc.render();
  assert(!html.includes('<script>alert(1)</script>'), 'string sibling is escaped, not injected');
  assert(html.includes('&lt;script&gt;'), 'escaped form present');
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

test('el.build() adds declarative definitions below an existing element', () => {
  const doc = new Document();
  const panel = doc.section().id('declarative-panel');
  const returned = panel.build([
    { tag: 'h2', text: 'Nested definition' },
    'Escaped <content>',
    { tag: 'p', text: 'Visible', class: 'message' },
    { tag: 'p', text: 'Skipped', if: false },
    { tag: 'li', each: ['One', 'Two'] },
  ]);
  assert(returned === panel, 'element build remains chainable');
  returned.addClass('built-panel');
  const html = doc.render();
  assert(html.includes('<section'), 'existing parent rendered');
  assert(html.includes('<h2>Nested definition</h2>'), 'nested heading built');
  assert(html.includes('Escaped &lt;content&gt;'), 'string definition escaped');
  assert(html.includes('class="message"'), 'definition classes applied');
  assert(!html.includes('Skipped'), 'conditional child skipped');
  assert(html.includes('<li>One</li><li>Two</li>'), 'iterated children built');
  assert(html.includes('built-panel'), 'parent remains configurable');
});

test('declarative liveList forwards sorting and empty-state options', () => {
  const doc = new Document();
  doc.states({ rows: [{ name: 'Zulu' }, { name: 'Alpha' }], descending: false });
  doc.build({
    liveList: {
      stateKey: 'rows',
      itemFn: row => ({ tag: 'p', text: row.name }),
      sort: (a, b, state) => state.descending ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name),
      sortKeys: ['descending'],
      empty: { tag: 'p', text: 'No rows', attrs: { role: 'status' } },
    },
  });
  const html = doc.render();
  assert(html.indexOf('<p>Alpha</p>') < html.indexOf('<p>Zulu</p>'), 'declarative list forwards sorting');
  assert(html.includes('No rows'), 'declarative list compiles its browser empty state');
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
  assert(!html.includes('class='), 'no class injected into the group');
  assert(html.includes('<label'), 'has label');
  assert(html.includes('Email'), 'label text');
  assert(html.includes('type="email"'), 'input type');
});

test('doc.field() returns accessible references and unique ids for shared state', () => {
  const doc = new Document();
  doc.states({ email: '' });
  const login = doc.field('Login email', {
    type: 'email', name: 'loginEmail', bind: 'email', attrs: { required: true }
  });
  const account = doc.field('Account email', {
    type: 'email', name: 'accountEmail', bind: 'email'
  });

  assert(login.group && !login.group.hasClass('form-group'), 'field returns an unstyled group reference');
  assert(login.label.attrs.for === login.input.attrs.id, 'field label targets its input');
  assert(account.label.attrs.for === account.input.attrs.id, 'second label targets its input');
  assert(login.input.attrs.id !== account.input.attrs.id, 'fields sharing state receive unique ids');
  assert(login.input._stateBindings[0].stateKey === 'email', 'field bind registers two-way state');
  assert(doc.validate().valid, 'generated fields pass document validation');

  const html = doc.render();
  assert(html.includes('name="loginEmail"'), 'field applies name');
  assert(html.includes('required="true"'), 'field applies input attributes');
});

test('doc.field() supports explicit identity and custom group classes', () => {
  const doc = new Document();
  const field = doc.field('Search', {
    id: 'site-search', groupClass: 'search-field', attrs: { id: 'ignored-id', placeholder: 'Find' }
  });
  assert(field.input.attrs.id === 'site-search', 'explicit field id takes precedence over attrs.id');
  assert(field.label.attrs.for === 'site-search', 'explicit id is shared with label');
  assert(field.group.hasClass('search-field'), 'custom group class applied');
  const html = doc.render();
  assert(html.includes('placeholder="Find"'), 'custom field attributes rendered');
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

test('helpers emit no styling the caller did not pass', () => {
  const doc = new Document();
  doc.grid(2, ['A']);
  doc.flex(['B']);
  doc.stack(['C']);
  doc.spacer();
  doc.divider();
  doc.container((c) => c.child('p').text('D'));
  doc.checkbox('terms', 'I agree');
  doc.radio('plan', [{ value: 'free', label: 'Free' }]);
  doc.input();
  doc.img('/logo.png');
  const html = doc.render();

  // css() emits generated atomic classes for styles the caller asked for; only
  // library-authored semantic names count as injected.
  assert(!/class="[^"]*form-/.test(html), 'no form class names injected');
  assert(!html.includes('gap:'), 'no default gap');
  assert(!html.includes('max-width:'), 'no default container width');
  assert(!html.includes('padding:'), 'no default container padding');
  assert(!html.includes('margin:'), 'no default container margin');
  assert(!html.includes('height:'), 'no default spacer height');
  assert(html.includes('<hr style=""') || html.includes('<hr>'), 'bare divider has no border or margin');
  assert(!html.includes('type="text"'), 'no default input type');
  assert(!html.includes('alt='), 'no default img alt');
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
  assert(html.includes('name="fullname"'), 'form group');
  assert(html.includes('<hr'), 'divider');
  assert(html.includes('grid'), 'grid');
});

/* ---- Summary ---- */
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(40));
process.exit(failed > 0 ? 1 : 0);
