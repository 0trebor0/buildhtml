'use strict';

// ---- Element ----
class Element {
  constructor(tag) {
    this.tag = tag;
    this.attrs = {};
    this.children = [];
    this.events = [];
    this._classes = [];
    this.cssText = '';
    this._text = null;
  }

  text(t) { this._text = t; return this; }

  css(rules) {
    const parts = Object.entries(rules).map(([k, v]) =>
      k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()) + ':' + v
    );
    this.cssText += '.' + this.tag + '{' + parts.join(';') + '}';
    this._classes.push(this.tag + '-scoped');
    this.attrs.class = this._classes.join(' ');
    return this;
  }

  attr(k, v) { this.attrs[k] = v; return this; }

  on(event, fn) { this.events.push({ event, fn: fn.toString() }); return this; }

  create(tag) {
    const el = new Element(tag);
    this.children.push(el);
    return el;
  }

  render() {
    const attrs = Object.entries(this.attrs)
      .map(([k, v]) => ` ${k}="${v}"`).join('');
    const content = this._text || this.children.map(c => c.render()).join('');
    return `<${this.tag}${attrs}>${content}</${this.tag}>`;
  }
}

// ---- Document ----
class Document {
  constructor() {
    this.body = [];
    this._styles = '';
    this._events = [];
  }

  create(tag) {
    const el = new Element(tag);
    this.body.push(el);
    return el;
  }

  _collect(el) {
    this._styles += el.cssText;
    for (const ev of el.events) this._events.push({ id: el.attrs.id, ...ev });
    for (const child of el.children) this._collect(child);
  }

  render() {
    this._styles = '';
    this._events = [];
    for (const el of this.body) this._collect(el);

    const style = this._styles ? `<style>${this._styles}</style>` : '';
    const script = this._events.length
      ? `<script>${this._events.map(e =>
          `document.getElementById("${e.id}").addEventListener("${e.event}",${e.fn});`
        ).join('')}</script>`
      : '';

    return `<!DOCTYPE html><html><head>${style}</head><body>${
      this.body.map(el => el.render()).join('')
    }${script}</body></html>`;
  }

  save(path) {
    require('fs').writeFileSync(path, this.render());
  }
}

// ---- Usage ----
const doc = new Document();

const div = doc.create('div');
div.css({ display: 'flex', flexDirection: 'column' });

const btn = div.create('button');
btn.attr('id', 'my-btn');
btn.text('Click me');
btn.on('click', () => {
  alert('clicked');
});
div.attr('id', 'my-div');
div.on('hover',()=>{
  console.log('loaded');
});

doc.save('./test/output.html');
console.log('done');
