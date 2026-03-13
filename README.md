# @trebor/buildhtml

**High-performance server-side HTML builder for Node.js** — components, templates, reactive state, layouts, and CSS-in-JS with zero dependencies.

---

## Install

```bash
npm install @trebor/buildhtml
```

## Quick Start

```javascript
const { page } = require('@trebor/buildhtml');

const doc = page('My Page');
doc.bodyCss({ fontFamily: 'system-ui', margin: '0' });

doc.container((c) => {
  c.h(1).text('Hello World').hover({ color: '#007bff' });
  c.p('Built with buildhtml.')
    .media('(max-width: 600px)', { fontSize: '14px' });
});

console.log(doc.render());
```

Elements created with `doc.create()` or tag shortcuts are **automatically attached** to the document — no manual DOM insertion needed.

### JSON-first workflow

```javascript
const { renderJSON } = require('@trebor/buildhtml');

const html = renderJSON({
  title: 'My Page',
  viewport: true,
  resetCss: true,
  cssVars: { primary: '#007bff' },
  body: {
    tag: 'div', class: 'container', children: [
      { tag: 'h1', text: 'Hello World' },
      { tag: 'p', text: 'Built from plain JSON.' },
    ]
  }
});
```

---

## Table of Contents

- [Document API](#document-api)
- [Element API](#element-api)
- [Components](#components)
- [Declarative Builder](#declarative-builder)
- [JSON Import](#json-import)
- [Templates (.bhtml)](#templates-bhtml)
- [State & Events](#state--events)
- [Express Integration](#express-integration)
- [Exports](#exports)

---

## Document API

### Convenience Factory

```javascript
const { page } = require('@trebor/buildhtml');

// Equivalent to: new Document() + title() + viewport() + resetCss() + lang()
const doc = page('My Page');
const doc = page('My Page', { lang: 'fr', nonce: 'abc' });
```

### Constructor

Create with `new Document(options)`.

```javascript
new Document({
  cache: true,       // Enable response caching
  cacheKey: 'home',  // Cache key
  nonce: 'abc123'    // CSP nonce for inline scripts/styles
})
```

### Head & Meta

| Method | Description |
|--------|-------------|
| `title(t)` | Set page title |
| `meta(name, content)` | Add `<meta>` tag |
| `viewport(v?)` | Add viewport meta (default: responsive) |
| `charset(c?)` | Set charset (default: UTF-8) |
| `favicon(href)` | Add favicon link |
| `addMeta(obj)` | Add meta with full attribute object |
| `addLink(href)` | Add stylesheet link |
| `addScript(src)` | Add external script |
| `addStyle(css)` | Add CSS string to `<head>` |

### SEO & Social

| Method | Description |
|--------|-------------|
| `canonical(url)` | `<link rel="canonical">` |
| `ogTags({ title, description, image })` | Open Graph meta tags |
| `twitterCard({ card, site, title })` | Twitter Card meta tags |
| `jsonLd(schemaObj)` | JSON-LD structured data |
| `noindex(nofollow?)` | Add robots noindex (and optionally nofollow) |

### Resource Hints

| Method | Description |
|--------|-------------|
| `preload(href, as, type?)` | `<link rel="preload">` |
| `prefetch(href)` | `<link rel="prefetch">` |
| `preconnect(href)` | `<link rel="preconnect">` |

### Head Injection

| Method | Description |
|--------|-------------|
| `rawHead(html)` | Inject arbitrary HTML into `<head>` |
| `inlineScript(code)` | Add inline `<script>` block |
| `inlineStyle(css)` | Add raw CSS string to `<head>` |

### HTML & Body Attributes

| Method | Description |
|--------|-------------|
| `lang(l)` | Set `<html lang="...">` |
| `htmlAttr(key, value)` | Set any `<html>` attribute |
| `bodyId(id)` | Set `<body id="...">` |
| `bodyClass(...names)` | Add classes to `<body>` |
| `bodyAttr(key, value)` | Set any `<body>` attribute |
| `bodyCss(rules)` | Style `<body>` via global CSS rule |

```javascript
doc.lang('en')
  .bodyClass('dark-mode', 'no-scroll')
  .bodyCss({ backgroundColor: '#1a1a1a', color: '#fff' });
```

### Global CSS

| Method | Description |
|--------|-------------|
| `globalStyle(selector, rules)` | Add global CSS rule |
| `sharedClass(name, rules)` | Define reusable class |
| `defineClass(selector, rules, isRaw?)` | Define class or raw selector |
| `resetCss()` | Box-sizing reset + normalize basics |

```javascript
doc.resetCss();
doc.globalStyle('body', { fontFamily: 'system-ui', lineHeight: '1.6' });
doc.sharedClass('btn', { padding: '8px 16px', borderRadius: '4px' });
```

### CSS Features

| Method | Description |
|--------|-------------|
| `keyframes(name, frames)` | Define `@keyframes` animation |
| `mediaQuery(query, selectorRules)` | `@media` block with selector-rules map |
| `cssVar(name, value)` | CSS custom property on `:root` |
| `cssVars(obj)` | Set multiple CSS variables at once |
| `darkMode(selectorRules)` | `@media (prefers-color-scheme: dark)` shorthand |
| `print(selectorRules)` | `@media print` shorthand |

```javascript
doc.cssVars({ primary: '#007bff', radius: '8px', spacing: '16px' });

doc.keyframes('fadeIn', {
  from: { opacity: '0', transform: 'translateY(-10px)' },
  to: { opacity: '1', transform: 'translateY(0)' }
});

doc.darkMode({
  body: { backgroundColor: '#1a1a1a', color: '#eee' },
  '.card': { borderColor: '#333' }
});

doc.print({
  '.no-print': { display: 'none' },
  body: { fontSize: '12pt' }
});

doc.mediaQuery('(max-width: 768px)', {
  '.sidebar': { display: 'none' },
  '.content': { width: '100%' }
});
```

### State & Lifecycle

| Method | Description |
|--------|-------------|
| `state(key, value)` | Set a global reactive state key |
| `states(obj)` | Set multiple state keys at once |
| `oncreate(fn)` | Run function on page load |

### Element Creation

| Method | Description |
|--------|-------------|
| `create(tag)` / `child(tag)` | Create element (auto-attached) |
| `div()`, `span()`, `section()`, `header()`, `footer()`, `main()`, `nav()`, `article()`, `aside()`, `form()`, `ul()`, `ol()`, `table()`, `details()`, `pre()`, `code()`, `blockquote()`, `dialog()` | Tag shortcuts |
| `h(level)` | Heading `<h1>`–`<h6>` |
| `p(text?)` | Paragraph |
| `a(href, text?)` | Anchor |
| `button(text?)` | Button |
| `img(src, alt?)` | Image |
| `input(type?, attrs?)` | Input |
| `textarea(attrs?)` | Textarea |
| `select(options, attrs?)` | Select dropdown |
| `hr()` | Horizontal rule |
| `br()` | Line break |

```javascript
doc.h(1).text('Title');
doc.p('A paragraph of text.');
doc.a('/about', 'About Us');
doc.img('/photo.jpg', 'A photo');
doc.input('email', { placeholder: 'you@example.com', required: true });
doc.select([
  { value: 'us', text: 'United States' },
  { value: 'uk', text: 'United Kingdom', selected: true },
], { name: 'country' });
```

### Form Helpers

| Method | Description |
|--------|-------------|
| `formGroup(label, type?, attrs?)` | Label + input pair in wrapper |
| `checkbox(name, label, checked?)` | Checkbox with label |
| `radio(name, options)` | Radio button group |
| `fieldset(legend, setupFn?)` | Fieldset with legend |
| `hiddenInput(name, value)` | Hidden input |

```javascript
doc.formGroup('Email', 'email', { name: 'email', placeholder: 'you@example.com' });
doc.checkbox('terms', 'I agree to the terms', false);
doc.radio('size', [
  { value: 's', label: 'Small' },
  { value: 'm', label: 'Medium', checked: true },
  { value: 'l', label: 'Large' },
]);
doc.fieldset('Shipping Address', (fs) => {
  fs.child('input').type('text').name('street').placeholder('Street');
  fs.child('input').type('text').name('city').placeholder('City');
});
doc.hiddenInput('csrf', 'abc123');
```

### Layout Helpers

| Method | Description |
|--------|-------------|
| `grid(columns, items?, gap?)` | CSS Grid wrapper |
| `flex(items?, options?)` | Flex container |
| `stack(items?, gap?)` | Vertical stack (flex column) |
| `row(items?, gap?)` | Horizontal row (flex row) |
| `center(childFn?)` | Centered flex wrapper |
| `container(childFn?, maxWidth?)` | Max-width centered container |
| `spacer(height?)` | Empty spacer div |
| `divider(options?)` | Styled `<hr>` |
| `columns(count, columnFns?, gap?)` | Multi-column grid |

```javascript
doc.container((c) => {
  c.child('h1').text('Dashboard');
}, '960px');

doc.grid(3, ['Card 1', 'Card 2', 'Card 3'], '20px');

doc.columns(2, [
  (col) => col.child('p').text('Left side'),
  (col) => col.child('p').text('Right side'),
]);

doc.stack([
  (el) => el.child('h2').text('Section 1'),
  (el) => el.child('h2').text('Section 2'),
], '24px');
```

### Data Helpers

| Method | Description |
|--------|-------------|
| `list(items, renderer?, tag?)` | Create `<ul>` or `<ol>` from array |
| `dataTable(headers, rows, options?)` | Create `<table>` from data |

```javascript
doc.list(['Apples', 'Bananas', 'Cherries']);
doc.list(users, (li, user) => li.text(`${user.name} (${user.age})`));

doc.dataTable(['Name', 'Age'], [['Alice', 30], ['Bob', 25]]);
doc.dataTable(null, [
  { name: 'Alice', age: 30 },
  { name: 'Bob', age: 25 },
], { autoHeaders: true, class: 'data-table' });
```

### Utility Methods

| Method | Description |
|--------|-------------|
| `comment(text)` | HTML comment in body |
| `raw(html)` | Raw HTML string in body (no wrapper) |
| `each(items, fn)` | Loop helper: `fn(doc, item, index)` |
| `when(condition, fn)` | Conditional: runs `fn(doc)` if truthy |
| `group(fn)` | Logical grouping: runs `fn(doc)`, no wrapper element |
| `template(name, fn)` | Define reusable document-level fragment |
| `useTemplate(name, vars)` | Stamp out a defined template |
| `isEmpty()` | Check if body has content |
| `elementCount()` | Total elements in body (recursive) |

```javascript
doc.comment('Navigation section');

doc.template('userCard', (d, { name, role }) => {
  const card = d.create('div').addClass('user-card');
  card.child('h3').text(name);
  card.child('span').text(role);
});

doc.each(users, (d, user) => {
  d.useTemplate('userCard', user);
});

doc.when(isAdmin, (d) => {
  d.create('button').text('Admin Panel');
});

doc.group((d) => {
  d.h(2).text('Section');
  d.p('Content without a wrapper element.');
});
```

### Rendering

| Method | Description |
|--------|-------------|
| `render()` | Return full HTML string |
| `output()` | Get last rendered HTML |
| `save(path)` | Write rendered HTML to file |
| `toJSON()` | Export document structure as JSON |

---

## Element API

Created via `doc.create(tag)`, `parent.child(tag)`, or any tag shortcut. All methods return `this` for chaining (or the new child element for creation methods).

### Tag Shortcuts (create child elements)

All the same tag shortcuts available on `Document` work on `Element` too — they create and return a child element:

```javascript
const card = doc.div().addClass('card');

card.h(2).text('Title');
card.p('Body text.');
card.a('/more', 'Read more').hover({ textDecoration: 'underline' });
card.img('/photo.jpg', 'A photo').size('100%', '200px');
card.button('Submit').onClick(function() { State.submitted = true; });
card.input('email', { placeholder: 'you@example.com' });
card.hr();
card.br();
```

**Available:** `div()`, `span()`, `section()`, `header()`, `footer()`, `main()`, `nav()`, `article()`, `aside()`, `form()`, `ul()`, `ol()`, `table()`, `details()`, `summary()`, `dialog()`, `pre()`, `code()`, `blockquote()`, `h(level)`, `p(text?)`, `a(href, text?)`, `button(text?)`, `img(src, alt?)`, `input(type?, attrs?)`, `textarea(attrs?)`, `select(options, attrs?)`, `hr()`, `br()`

### Tree Manipulation

| Method | Description |
|--------|-------------|
| `child(tag)` / `create(tag)` | Create child element |
| `append(child)` | Append element or text |
| `appendUnsafe(html)` | Append raw HTML |
| `text(content)` | Append escaped text |
| `before(sibling)` | Insert before this element |
| `after(sibling)` | Insert after this element |
| `wrap(tag)` | Wrap this element in a new parent |
| `remove()` | Remove from parent |
| `empty()` | Clear all children |
| `clone()` | Deep copy element |
| `replaceWith(el)` | Swap this element for another in parent |
| `prependChild(child)` | Insert child at beginning |
| `insertAt(index, child)` | Insert child at position |
| `find(tag)` | Find first descendant by tag |
| `findById(id)` | Find descendant by id |
| `findAll(tag)` | Find all descendants by tag |
| `closest(tag)` | Walk up to find ancestor by tag |
| `parent()` | Get parent element |
| `siblings()` | Get sibling elements (excluding self) |
| `nextSibling()` | Next sibling element |
| `prevSibling()` | Previous sibling element |
| `childCount()` | Number of children |
| `index()` | Position in parent's children |
| `isVoid()` | Check if self-closing (img, br, input, etc.) |
| `html()` / `toString()` | Render this element to HTML string |

```javascript
const div = doc.div();
const p = div.p('Hello');
p.wrap('section');                  // <section><p>Hello</p></section>
const cloned = div.clone();        // deep copy
p.replaceWith(doc.create('span')); // swap p for span
div.prependChild(doc.create('h1').text('First'));
console.log(div.childCount());     // 3
console.log(p.parent());           // section element
console.log(p.siblings());         // sibling elements
```

### Attributes

| Method | Description |
|--------|-------------|
| `attr(key, value)` | Set any attribute |
| `id(v?)` | Set id (auto-generated if omitted) |
| `setAttrs(obj)` | Set multiple attributes |
| `data(obj)` | Set `data-*` attributes |
| `aria(obj)` | Set `aria-*` attributes |

**Attribute shortcuts:** `href()`, `src()`, `type()`, `placeholder()`, `value()`, `name()`, `role()`, `for()`, `title()`, `tabindex()`, `action()`, `method()`, `target()`, `rel()`, `alt()`, `width()`, `height()`, `min()`, `max()`, `step()`, `pattern()`, `autocomplete()`

**Boolean shortcuts:** `disabled()`, `hidden()`, `required()`, `readonly()`, `autofocus()`, `multiple()`, `checked()`, `selected()`, `contentEditable()`, `draggable()`

**Visibility toggles:** `show()`, `hide()`, `enable()`, `disable()`, `focus()`

**Form validation:** `minLength(n)`, `maxLength(n)`, `accept(types)`, `rows(n)`, `cols(n)`

**Utility:** `tooltip(text)` — sets `title` + `aria-describedby`

```javascript
doc.create('input')
  .type('email')
  .name('email')
  .placeholder('you@example.com')
  .required()
  .minLength(5)
  .maxLength(100)
  .focus();

doc.create('textarea').rows(10).cols(80).placeholder('Write here...');

doc.create('div')
  .data({ userId: 42, role: 'admin' })
  .aria({ label: 'User card', expanded: 'false' })
  .tooltip('Click to expand');

const btn = doc.create('button').text('Submit');
btn.disable();  // disabled="disabled"
btn.enable();   // removes disabled
btn.hide();     // hidden="hidden"
btn.show();     // removes hidden
```

### CSS & Classes

| Method | Description |
|--------|-------------|
| `css(obj)` | Scoped CSS (generates unique class) |
| `style(prop, value)` / `style(obj)` | Inline `style` attribute |
| `addClass(...names)` | Add class names |
| `removeClass(...names)` | Remove class names |
| `classIf(cond, trueClass, falseClass?)` | Conditional class |
| `classMap(obj)` | Map of classes with boolean conditions |
| `toggleClass(cond, name)` | Conditional add (no else) |
| `hasClass(name)` | Check if class is present |

```javascript
el.css({ padding: '16px', borderRadius: '8px' });      // scoped class
el.style('color', 'red');                                // inline style=""
el.style({ color: 'blue', margin: '10px' });            // object form
el.addClass('btn', 'btn-primary');
el.classIf(isActive, 'active', 'inactive');
el.classMap({ bold: true, italic: false, underline: true });
```

### CSS Pseudo-classes & Responsive

| Method | Description |
|--------|-------------|
| `hover(rules)` | `:hover` styles |
| `focusCss(rules)` | `:focus` styles |
| `active(rules)` | `:active` styles |
| `firstChild(rules)` | `:first-child` styles |
| `lastChild(rules)` | `:last-child` styles |
| `nthChild(n, rules)` | `:nth-child(n)` styles |
| `pseudo('before', rules)` | `::before` pseudo-element |
| `pseudo('after', rules)` | `::after` pseudo-element |
| `media(query, rules)` | Responsive CSS scoped to this element |

```javascript
doc.create('button').text('Save')
  .css({ padding: '8px 16px', backgroundColor: '#007bff', color: '#fff', border: 'none' })
  .hover({ backgroundColor: '#0056b3' })
  .active({ transform: 'scale(0.98)' })
  .focusCss({ outline: '2px solid #80bdff' })
  .transition({ property: 'background-color', duration: '0.2s' });

doc.create('div').css({ display: 'flex', gap: '16px' })
  .media('(max-width: 768px)', { flexDirection: 'column', gap: '8px' });

doc.create('h2')
  .pseudo('before', { content: '"§ "', color: '#999' })
  .pseudo('after', { content: '""', display: 'block', height: '2px', backgroundColor: '#007bff' });

doc.create('tr')
  .nthChild('2n', { backgroundColor: '#f5f5f5' })
  .firstChild({ fontWeight: 'bold' });
```

### CSS Animation & Style Shorthands

| Method | Description |
|--------|-------------|
| `transition(props)` | CSS transition (string or `{ property, duration, timing, delay }`) |
| `transform(value)` | CSS transform |
| `animate(name, options)` | Link to `@keyframes` (`{ duration, timing, delay, iterations, direction, fillMode }`) |
| `opacity(n)` | Set opacity |
| `zIndex(n)` | Set z-index |
| `cursor(type)` | Set cursor |
| `overflow(value)` | Set overflow |
| `display(value)` | Set display |
| `position(value)` | Set position |
| `size(w, h?)` | Set width + height (square if h omitted) |

```javascript
doc.keyframes('fadeIn', {
  from: { opacity: '0' },
  to: { opacity: '1' }
});

doc.create('div')
  .animate('fadeIn', { duration: '0.5s' })
  .opacity(0.9)
  .cursor('pointer')
  .position('relative')
  .zIndex(10)
  .size('200px', '100px')
  .overflow('hidden');

doc.create('a').text('Link')
  .transition('color 0.2s ease')
  .hover({ color: '#007bff' });
```

### Slots

For components that accept arbitrary child content:

```javascript
function Modal(el) {
  el.addClass('modal');
  el.child('div').addClass('modal-header').slot('header');
  el.child('div').addClass('modal-body').slot('default');
  el.child('div').addClass('modal-footer').slot('footer');
}

const modal = doc.use(Modal);
modal.fillSlot('header', (slot) => slot.child('h2').text('Title'));
modal.fillSlot('default', (slot) => slot.child('p').text('Body'));
modal.fillSlot('footer', (slot) => slot.child('button').text('Close'));
```

### State & Events

| Method | Description |
|--------|-------------|
| `state(value)` | Set element state for hydration |
| `bind(stateKey, fn?)` | Bind to global state |
| `computed(fn)` | Compute content from state |
| `on(event, fn)` | Attach event handler |
| `bindState(target, event, fn)` | Cross-element state binding |

**Event shorthands:** `onClick`, `onChange`, `onInput`, `onSubmit`, `onKeydown`, `onKeyup`, `onKeypress`, `onFocus`, `onBlur`, `onMouseenter`, `onMouseleave`, `onMousedown`, `onMouseup`, `onMousemove`, `onDblclick`, `onContextmenu`, `onScroll`, `onLoad`, `onError`, `onDragstart`, `onDragend`, `onDragover`, `onDrop`, `onTouchstart`, `onTouchend`, `onTouchmove`

```javascript
doc.state('count', 0);

doc.div().bind('count', (val) => `Count: ${val}`);

doc.button('+1').onClick(function() {
  State.count++;
});
```

### Layout Helpers (on Element)

The same layout helpers available on `Document` work on any `Element`:

| Method | Description |
|--------|-------------|
| `grid(columns, items?, gap?)` | CSS Grid child |
| `flex(items?, options?)` | Flex child |
| `stack(items?, gap?)` | Vertical stack child |
| `row(items?, gap?)` | Horizontal row child |
| `center(childFn?)` | Centered flex child |
| `container(childFn?, maxWidth?)` | Max-width centered child |
| `spacer(height?)` | Empty spacer div child |
| `divider(options?)` | Styled `<hr>` child |
| `columns(count, fns?, gap?)` | Multi-column grid child |

```javascript
const sidebar = doc.aside();

sidebar.stack([
  (el) => el.a('/home', 'Home'),
  (el) => el.a('/about', 'About'),
], '8px');

sidebar.divider();

sidebar.container((c) => {
  c.p('Footer text');
}, '240px');
```

### Form Helpers (on Element)

| Method | Description |
|--------|-------------|
| `formGroup(label, type?, attrs?)` | Label + input pair |
| `checkbox(name, label, checked?)` | Checkbox with label |
| `radio(name, options)` | Radio button group |
| `fieldset(legend, setupFn?)` | Fieldset with legend |
| `hiddenInput(name, value)` | Hidden input |

```javascript
const form = doc.form().attr('action', '/submit').attr('method', 'post');

form.formGroup('Email', 'email', { name: 'email', required: true });
form.formGroup('Password', 'password', { name: 'password' });
form.checkbox('remember', 'Remember me');
form.button('Sign in').type('submit');
form.hiddenInput('csrf', token);
```

### Data Helpers (on Element)

| Method | Description |
|--------|-------------|
| `list(items, renderer?, tag?)` | `<ul>/<ol>` from array |
| `dataTable(headers, rows, options?)` | `<table>` from data |

```javascript
const sidebar = doc.nav();
sidebar.list(['Home', 'About', 'Contact'], (li, item) => {
  li.a('/' + item.toLowerCase(), item);
});

const main = doc.main();
main.dataTable(['Name', 'Role'], [['Alice', 'Engineer'], ['Bob', 'Designer']]);
```

### Component Helpers (on Element)

| Method | Description |
|--------|-------------|
| `component(name, props?, overrides?)` | Use registered component as child |
| `use(fn, props?, tag?)` | Use inline component function as child |

```javascript
const grid = doc.div().css({ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px' });

grid.component('Card', { title: 'One', body: 'First card' });
grid.component('Card', { title: 'Two', body: 'Second card' });
grid.use(Alert, { message: 'All done!', type: 'success' });
```

### Utility Helpers (on Element)

| Method | Description |
|--------|-------------|
| `each(items, fn)` | Loop: `fn(el, item, index)` |
| `when(condition, fn)` | Conditional: runs `fn(el)` if truthy |

```javascript
const ul = doc.ul();
ul.each(users, (el, user) => {
  el.child('li').text(user.name);
});

const nav = doc.nav();
nav.when(isLoggedIn, (el) => {
  el.a('/logout', 'Log out');
});
```

---

## Components

Define reusable UI pieces as functions that receive `(el, props)`:

```javascript
const { Document, components } = require('@trebor/buildhtml');

// Define
function Card(el, { title, body, footer }) {
  el.addClass('card').css({ border: '1px solid #ddd', borderRadius: '8px', padding: '16px' });
  el.child('h2').text(title);
  el.child('p').text(body);
  if (footer) el.child('footer').text(footer);
}

// Register globally
components.register('Card', Card);

// Use by name
doc.component('Card', { title: 'Hello', body: 'World' });

// Or use inline (no registration)
doc.use(Card, { title: 'Hello', body: 'World' });
```

### Component Registry

| Method | Description |
|--------|-------------|
| `components.register(name, fn, options?)` | Register component |
| `components.unregister(name)` | Remove component |
| `components.has(name)` | Check if registered |
| `components.get(name)` | Get component definition |
| `components.list()` | List all registered names |
| `components.extend(newName, baseName, extendFn)` | Extend existing component |
| `components.clear()` | Remove all |

### Component Inheritance

```javascript
components.register('Card', Card);
components.extend('CardWithImage', 'Card', (el, { image }) => {
  if (image) el.child('img').src(image);
});

doc.component('CardWithImage', { title: 'Photo', body: 'Nice pic', image: '/photo.jpg' });
```

### Nested Components

```javascript
function NavLink(el, { href, text, active }) {
  el.child('a').href(href).text(text).classIf(active, 'active');
}

function Navbar(el, { links }) {
  el.addClass('navbar').css({ display: 'flex', gap: '16px' });
  for (const link of links) {
    NavLink(el.child('div'), link);
  }
}

doc.use(Navbar, {
  links: [
    { href: '/', text: 'Home', active: true },
    { href: '/about', text: 'About' },
  ]
});
```

---

## Declarative Builder

Build element trees from plain objects:

```javascript
doc.build({
  tag: 'div', class: 'container', children: [
    { tag: 'h1', text: 'Dashboard', class: 'title' },
    { tag: 'p', text: 'Welcome back', css: { color: '#666' } },
    { tag: 'ul', children: [
      { tag: 'li', text: 'Home' },
      { tag: 'li', text: 'Settings' },
    ]}
  ]
});
```

### Conditionals & Iteration

```javascript
doc.build({
  tag: 'div', children: [
    { tag: 'p', text: 'Admin only', if: user.isAdmin },
    {
      each: users,
      itemTemplate: (user, i) => ({
        tag: 'li', children: [
          { tag: 'strong', text: user.name },
          { tag: 'span', text: ` — ${user.email}` },
        ]
      })
    }
  ]
});
```

### Components in Builder

```javascript
doc.build({
  tag: 'div', children: [
    { component: 'Card', props: { title: 'One', body: 'First' } },
    { use: Alert, props: { message: 'Inline!', type: 'info' } },
  ]
});
```

### Builder Node Options

| Key | Type | Description |
|-----|------|-------------|
| `tag` | string | HTML tag (default: `'div'`) |
| `text` | string | Text content |
| `html` | string | Raw HTML (unsafe) |
| `class` | string/array | CSS classes |
| `id` | string | Element ID |
| `css` | object | Scoped CSS |
| `style` | object | Inline style |
| `attrs` | object | HTML attributes |
| `data` | object | `data-*` attributes |
| `aria` | object | `aria-*` attributes |
| `on` | object | Events `{ click: fn }` |
| `children` | array | Child nodes |
| `component` | string | Registered component name |
| `use` | function | Inline component function |
| `props` | object | Component props |
| `if` | boolean | Conditional rendering |
| `each` | array | Iteration source |
| `itemTemplate` | function | `(item, index) => nodeDef` |
| `state` | any | Element state |
| `bind` | object | `{ key, fn }` state binding |
| `setup` | function | `(el) => { ... }` custom setup |

---

## JSON Import

Define an entire page as a plain object — useful for config-driven pages, APIs, or serialized templates.

### `renderJSON(def, options?)`

Builds and renders a full page from a definition object. Returns an HTML string.

```javascript
const { renderJSON } = require('@trebor/buildhtml');

const html = renderJSON({
  title: 'Dashboard',
  lang: 'en',
  viewport: true,
  resetCss: true,
  favicon: '/favicon.ico',
  canonical: 'https://example.com/dashboard',
  cssVars: { primary: '#007bff', radius: '8px' },
  globalStyles: {
    body: { fontFamily: 'system-ui', margin: '0' }
  },
  sharedClasses: {
    card: { border: '1px solid #ddd', borderRadius: '8px', padding: '16px' }
  },
  darkMode: {
    body: { backgroundColor: '#111', color: '#eee' }
  },
  ogTags: { title: 'Dashboard', description: 'My dashboard' },
  state: { count: 0 },
  bodyCss: { padding: '20px' },
  bodyClass: 'app light-theme',
  body: {
    tag: 'div', class: 'container', children: [
      { tag: 'h1', text: 'Hello World' },
      { tag: 'p', text: 'Built from JSON.', css: { color: '#666' } },
    ]
  }
});
```

### `doc.fromJSON(def)`

Populate an existing Document from a definition object. Useful when you need to further manipulate the document after loading.

```javascript
const { Document } = require('@trebor/buildhtml');

const doc = new Document();
doc.fromJSON({
  title: 'My Page',
  viewport: true,
  body: { tag: 'h1', text: 'Hello' }
});

// Further manipulation
doc.addScript('/app.js');
console.log(doc.render());
```

### JSON Definition Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Page title |
| `lang` | string | HTML lang attribute |
| `charset` | string | Charset (default UTF-8) |
| `viewport` | boolean/string | Add viewport meta |
| `resetCss` | boolean | Box-sizing reset |
| `favicon` | string | Favicon URL |
| `canonical` | string | Canonical URL |
| `noindex` | boolean/`'nofollow'` | Robots noindex |
| `meta` | array | `[{ name, content }]` |
| `links` | array | Stylesheet URLs |
| `scripts` | array | Script URLs |
| `cssVars` | object | CSS custom properties |
| `globalStyles` | object | `{ selector: rules }` |
| `sharedClasses` | object | `{ name: rules }` |
| `keyframes` | object | `{ name: frames }` |
| `darkMode` | object | Dark mode selector rules |
| `print` | object | Print media rules |
| `bodyCss` | object | Body CSS rules |
| `bodyClass` | string/array | Body class names |
| `ogTags` | object | Open Graph tags |
| `twitterCard` | object | Twitter Card tags |
| `state` | object | Initial global state |
| `body` | object/array | Body content (builder nodes) |

---

## Templates (.bhtml)

An indentation-based template language that compiles to buildhtml documents:

```
---
title "My App"
viewport
link "https://cdn.example.com/styles.css"
---

:reset
:global body { font-family: system-ui; line-height: 1.6 }
:class container { max-width: 1200px; margin: 0 auto }

div#app.container
  header
    h1 "Welcome #{user.name}"
    nav
      a(href="/") "Home"
      a(href="/about") "About"

  main
    .card { padding: 16px; border: 1px solid #eee }
      h2 "Dashboard"

      ?if user.isAdmin
        button "Admin Panel"
      ?else
        span "Read only"

      ul
        ?each item in items
          li "#{item}"

  footer
    | Copyright 2025
```

### Template Syntax

| Syntax | Description |
|--------|-------------|
| `div` | Element |
| `div#id.class` | ID and classes (CSS selector style) |
| `.card` | Implicit div with class |
| `(href="/about")` | Attributes |
| `"Hello"` | Inline text |
| `\| text` | Multiline text (pipe prefix) |
| `! <b>raw</b>` | Raw HTML |
| `{ color: red }` | Scoped CSS |
| `[userId=42]` | Data attributes |
| `// comment` | Comment (ignored) |
| `@Card(title="Hi")` | Component |
| `?if condition` | Conditional |
| `?else` | Else branch |
| `?each item in items` | Loop |
| `#{variable}` | Interpolation |

### Template API

```javascript
const { renderTemplate, compileTemplate, renderFile, compileFile, templateEngine } = require('@trebor/buildhtml');

// Render to HTML string
const html = renderTemplate(source, { user: { name: 'Alice' }, items: [1, 2, 3] });

// Get a Document back (for further manipulation)
const doc = compileTemplate(source, { name: 'World' });
doc.addScript('/extra.js');
const html = doc.render();

// File-based
const html = renderFile('./views/home.bhtml', { user });
const doc = compileFile('./views/home.bhtml', { user });

// Express view engine
app.engine('bhtml', templateEngine);
app.set('view engine', 'bhtml');
// Then: res.render('home', { name: 'World', items: [1, 2, 3] });
```

---

## State & Events

### Reactive State

```javascript
doc.state('count', 0);
doc.states({ name: 'World', items: [] });

// Bind element to state
doc.create('span').bind('count', (val) => `Count: ${val}`);

// Update state in browser (auto-updates UI)
doc.create('button').text('+1').onClick(function() {
  State.count++;
});

// Client-side: window.State.count is a reactive Proxy
```

### Limitations

Event handlers are serialized — closures won't work:

```javascript
// ✅ Uses global State
doc.state('count', 0);
btn.onClick(function() { State.count++; });

// ❌ Closure won't survive serialization
let count = 0;
btn.onClick(function() { count++; });
```

State values must be JSON-serializable (no functions, DOM nodes, etc).

---

## Express Integration

### Basic Route

```javascript
const express = require('express');
const { Document } = require('@trebor/buildhtml');

app.get('/', (req, res) => {
  const doc = new Document();
  doc.title('Home').viewport().resetCss();
  doc.container((c) => {
    c.child('h1').text('Welcome');
    c.child('p').text('Built with buildhtml');
  });
  res.send(doc.render());
});
```

### Cached Renderer

```javascript
const { createCachedRenderer } = require('@trebor/buildhtml');

app.get('/about', createCachedRenderer(
  async (req) => {
    const doc = new Document();
    doc.title('About');
    doc.p('This page is cached.');
    return doc;
  },
  'about-page'
));
```

### Template View Engine

```javascript
app.engine('bhtml', require('@trebor/buildhtml').templateEngine);
app.set('view engine', 'bhtml');
app.set('views', './views');

app.get('/', (req, res) => {
  res.render('home', { user: req.user, items: ['A', 'B', 'C'] });
});
```

### Middleware Helpers

| Function | Description |
|----------|-------------|
| `createCachedRenderer(builderFn, key, opts?)` | Express middleware with caching |
| `clearCache(pattern?)` | Clear cached pages (all or by pattern) |
| `getCacheStats()` | Cache, pool, and metrics stats |
| `healthCheck()` | Health check data |
| `resetPools()` | Reset object pools |

---

## Exports

```javascript
const {
  // Core
  Document,
  page,        // convenience factory: page(title, options?)
  renderJSON,  // render a full page from a plain object
  Element,
  Head,
  CONFIG,

  // Components
  components,

  // Templates
  TemplateParser, parseTemplate, renderTemplate, compileTemplate,
  renderFile, compileFile, templateEngine,

  // Middleware
  createCachedRenderer, clearCache, responseCache,
  getCacheStats, resetPools, healthCheck,

  // Metrics
  Metrics, metrics
} = require('@trebor/buildhtml');
```

---

## Project Structure

```
buildhtml/
├── index.js            ← root entry
├── lib/
│   ├── index.js        ← assembles exports
│   ├── document.js     ← Document class
│   ├── element.js      ← Element class
│   ├── head.js         ← Head class
│   ├── components.js   ← Component registry
│   ├── builder.js      ← Declarative builder
│   ├── template.js     ← .bhtml template parser
│   ├── renderer.js     ← HTML rendering + client compiler
│   ├── pools.js        ← Object pooling
│   ├── cache.js        ← LRU cache
│   ├── config.js       ← Configuration
│   ├── metrics.js      ← Performance metrics
│   ├── middleware.js    ← Express helpers
│   └── utils.js        ← Shared utilities
└── test/
    ├── test.js
    ├── test-template.js
    ├── test-new-apis.js
    └── test-apis-v2.js
```

---

## Complete Example

```javascript
const express = require('express');
const { page, components, createCachedRenderer } = require('@trebor/buildhtml');

// Design tokens
function setupTheme(doc) {
  doc.cssVars({ primary: '#007bff', radius: '8px', spacing: '16px' });
  doc.keyframes('fadeIn', {
    from: { opacity: '0', transform: 'translateY(-10px)' },
    to: { opacity: '1', transform: 'translateY(0)' }
  });
  doc.darkMode({
    body: { backgroundColor: '#111', color: '#eee' },
    '.card': { borderColor: '#333', backgroundColor: '#222' }
  });
}

// Component
function Card(el, { title, body }) {
  el.addClass('card')
    .css({ border: '1px solid #ddd', borderRadius: 'var(--radius)', padding: 'var(--spacing)' })
    .animate('fadeIn', { duration: '0.3s' })
    .hover({ boxShadow: '0 4px 12px rgba(0,0,0,0.1)' })
    .transition('box-shadow 0.2s ease');
  el.child('h2').text(title).css({ marginBottom: '8px' });
  el.child('p').text(body);
}
components.register('Card', Card);

const app = express();

app.get('/', (req, res) => {
  const doc = page('My App');
  doc.canonical('https://example.com')
    .ogTags({ title: 'My App', description: 'Built with buildhtml' })
    .bodyClass('light-theme')
    .bodyCss({ fontFamily: 'system-ui', lineHeight: '1.6', margin: '0' });

  setupTheme(doc);

  doc.state('count', 0);

  doc.comment('Main content');

  doc.container((c) => {
    c.h(1).text('Dashboard')
      .hover({ color: 'var(--primary)' })
      .pseudo('after', { content: '""', display: 'block', height: '3px', backgroundColor: 'var(--primary)', marginTop: '8px' });

    c.div().bind('count', (val) => `Count: ${val}`)
      .css({ fontSize: '24px', marginBottom: '16px' });

    c.button('Increment')
      .css({ padding: '8px 16px', cursor: 'pointer' })
      .hover({ backgroundColor: '#e9ecef' })
      .active({ transform: 'scale(0.98)' })
      .transition('all 0.15s ease')
      .onClick(function() { State.count++; });
  }, '800px');

  doc.each(['Getting Started', 'Components', 'Templates'], (d, title) => {
    d.component('Card', { title, body: `Learn about ${title.toLowerCase()}.` });
  });

  doc.when(true, (d) => {
    d.dataTable(['Name', 'Role'], [
      ['Alice', 'Engineer'],
      ['Bob', 'Designer'],
    ]);
  });

  res.send(doc.render());
});

app.listen(3000, () => console.log('http://localhost:3000'));
```

## License

MIT