'use strict';

const { toKebab, escapeHtml, sanitizeCssValue } = require('./utils');

class Head {
  constructor() {
    this.title = 'Document';
    this.metas = [];
    this.links = [];
    this.styles = [];
    this.scripts = [];
    this.globalStyles = [];
    this.classStyles = {};
    this.nonce = null;
  }

  setNonce(n) { this.nonce = n; return this; }
  setTitle(t) { this.title = escapeHtml(t); return this; }

  addMeta(m) {
    if (m && typeof m === 'object') this.metas.push(m);
    return this;
  }

  addLink(l) {
    if (l && typeof l === 'string' && !this.links.includes(l)) this.links.push(l);
    return this;
  }

  addStyle(s) {
    if (s && typeof s === 'string') this.styles.push(s);
    return this;
  }

  addScript(s) {
    if (s && typeof s === 'string') this.scripts.push(s);
    return this;
  }

  globalCss(selector, rules) {
    if (!selector || !rules || typeof rules !== 'object') return this;
    const parts = [];
    for (const k in rules) parts.push(`${toKebab(k)}:${sanitizeCssValue(rules[k])}`);
    if (parts.length > 0) this.globalStyles.push(`${selector}{${parts.join(';')};}`);
    return this;
  }

  addClass(name, rules) {
    if (!name || !rules || typeof rules !== 'object') return this;
    const parts = [];
    for (const k in rules) parts.push(`${toKebab(k)}:${sanitizeCssValue(rules[k])}`);
    if (parts.length > 0) this.classStyles[name] = parts.join(';') + ';';
    return this;
  }

  hasStyles() {
    return Object.keys(this.classStyles).length > 0 || this.globalStyles.length > 0 || this.styles.length > 0;
  }

  render() {
    const p = [];
    const na = this.nonce ? ` nonce="${escapeHtml(this.nonce)}"` : '';

    p.push('<meta charset="UTF-8">');
    p.push('<title>', this.title, '</title>');

    for (const m of this.metas) {
      p.push('<meta ');
      for (const k in m) p.push(toKebab(k), '="', escapeHtml(m[k]), '" ');
      p.push('>');
    }

    for (const l of this.links) p.push('<link rel="stylesheet" href="', escapeHtml(l), '">');

    if (this.hasStyles()) {
      p.push('<style', na, '>');
      for (const n in this.classStyles) p.push('.', toKebab(n), '{', this.classStyles[n], '}');
      for (const s of this.globalStyles) p.push(s);
      for (const s of this.styles) p.push(s);
      p.push('</style>');
    }

    for (const s of this.scripts) p.push('<script', na, ' src="', escapeHtml(s), '"></script>');

    return p.join('');
  }
}

module.exports = { Head };
