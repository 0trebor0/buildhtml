'use strict';

/**
 * .bhtml Template Parser
 * 
 * A clean, indentation-based template language that compiles to buildhtml documents.
 * Think Pug/Slim but designed specifically for buildhtml's features.
 *
 * ============================================================================
 * SYNTAX REFERENCE
 * ============================================================================
 *
 * ELEMENTS:
 *   div                          → <div></div>
 *   h1 "Hello World"             → <h1>Hello World</h1>
 *   p "Some text here"           → <p>Some text here</p>
 *   img                          → <img>
 *
 * NESTING (2-space indent):
 *   div
 *     h1 "Title"
 *     p "Body"
 *
 * ID & CLASSES (CSS selector style):
 *   div#main                     → <div id="main">
 *   div.container                → <div class="container">
 *   div#app.wrapper.dark         → <div id="app" class="wrapper dark">
 *   .card                        → <div class="card">  (div is default)
 *   #hero                        → <div id="hero">
 *
 * ATTRIBUTES (parentheses):
 *   a(href="/about") "About"     → <a href="/about">About</a>
 *   input(type="email" placeholder="you@example.com")
 *   button(disabled)             → <button disabled>
 *   div(role="dialog" aria-label="Modal")
 *   img(src="/pic.jpg" alt="Photo")
 *
 * INLINE TEXT:
 *   h1 "Hello World"
 *   p "This is a paragraph"
 *   span "inline text"
 *
 * MULTILINE TEXT (pipe prefix):
 *   p
 *     | This is a long paragraph
 *     | that spans multiple lines
 *     | and stays as one block.
 *
 * RAW HTML (exclamation prefix):
 *   div
 *     ! <strong>Raw HTML</strong>
 *
 * CSS (curly braces, one per line):
 *   div.card
 *     { padding: 16px }
 *     { border: 1px solid #ddd }
 *     { border-radius: 8px }
 *     h2 "Title"
 *
 * SHORTHAND CSS BLOCK:
 *   div.card { padding: 16px; border: 1px solid #ddd; border-radius: 8px }
 *     h2 "Title"
 *
 * DATA ATTRIBUTES:
 *   div[userId=42 role="admin"]   → data-user-id="42" data-role="admin"
 *
 * COMMENTS:
 *   // This is a comment (ignored)
 *
 * COMPONENTS (@ prefix):
 *   @Card(title="Hello" body="World")
 *   @Badge(label="New" color="#4caf50")
 *   @Navbar
 *     @NavLink(href="/" text="Home" active)
 *     @NavLink(href="/about" text="About")
 *
 * CONDITIONALS:
 *   ?if isAdmin
 *     button "Delete All"
 *   ?else
 *     span "No access"
 *
 * LOOPS:
 *   ?each item in items
 *     li "#{item}"
 *
 *   ?each user, index in users
 *     li "#{index}. #{user.name}"
 *
 * INTERPOLATION (in strings):
 *   h1 "Hello #{name}"
 *   p "You have #{count} messages"
 *
 * EVENTS (@ in attributes):
 *   button(@click="handleClick") "Save"
 *   input(@input="handleInput" @change="handleChange")
 *
 * STATE:
 *   span(:bind="counter") 
 *   span(:bind="counter" :fn="(val) => `Count: ${val}`")
 *
 * HEAD SECTION:
 *   ---
 *   title "My Page"
 *   meta(name="description" content="A cool page")
 *   link "https://cdn.example.com/styles.css"
 *   script "https://cdn.example.com/app.js"
 *   viewport
 *   ---
 *
 * GLOBAL STYLES:
 *   :global body { font-family: sans-serif; margin: 0 }
 *   :global a { color: #0066cc; text-decoration: none }
 *   :class btn { padding: 8px 16px; border-radius: 4px }
 *   :reset
 *
 * FULL EXAMPLE:
 *   ---
 *   title "My App"
 *   viewport
 *   link "https://cdn.example.com/normalize.css"
 *   ---
 *
 *   :reset
 *   :global body { font-family: system-ui; line-height: 1.6 }
 *   :class container { max-width: 1200px; margin: 0 auto; padding: 0 20px }
 *
 *   div#app.container
 *     header
 *       h1 "Welcome"
 *       nav
 *         a(href="/") "Home"
 *         a(href="/about") "About"
 *
 *     main
 *       .card { padding: 16px; border: 1px solid #eee; border-radius: 8px }
 *         h2 "Hello #{name}"
 *         p "This is a buildhtml template"
 *
 *         ?if showButton
 *           button(@click="handleClick") "Click me"
 *
 *         ul
 *           ?each item in items
 *             li "#{item}"
 *
 *     footer
 *       | Copyright 2025. All rights reserved.
 */

class TemplateParser {
  constructor() {
    this.lines = [];
    this.pos = 0;
    this.variables = {};
  }

  /**
   * Parse a .bhtml template string into an AST.
   */
  parse(source, variables = {}) {
    this.variables = variables;
    this.lines = source.split('\n');
    this.pos = 0;

    const ast = {
      type: 'document',
      head: null,
      globals: [],
      body: []
    };

    // Parse head section if present
    ast.head = this._parseHead();

    // Parse globals and body
    while (this.pos < this.lines.length) {
      const line = this.lines[this.pos];
      const trimmed = line.trim();

      if (trimmed === '' || trimmed.startsWith('//')) {
        this.pos++;
        continue;
      }

      if (trimmed.startsWith(':global ') || trimmed.startsWith(':class ') || trimmed === ':reset') {
        ast.globals.push(this._parseGlobal(trimmed));
        this.pos++;
        continue;
      }

      const indent = this._getIndent(line);
      const nodes = this._parseBlock(indent);
      ast.body.push(...nodes);
    }

    return ast;
  }

  /**
   * Compile a .bhtml template string directly to a buildhtml Document.
   */
  compile(source, variables = {}) {
    const ast = this.parse(source, variables);
    return this._astToDocument(ast, variables);
  }

  // ---- Head Parsing ----

  _parseHead() {
    // Look for --- delimiters
    while (this.pos < this.lines.length) {
      const trimmed = this.lines[this.pos].trim();
      if (trimmed === '' || trimmed.startsWith('//')) { this.pos++; continue; }
      if (trimmed === '---') break;
      return null; // No head section
    }

    if (this.pos >= this.lines.length) return null;
    this.pos++; // skip opening ---

    const head = { title: null, metas: [], links: [], scripts: [], viewport: false };

    while (this.pos < this.lines.length) {
      const trimmed = this.lines[this.pos].trim();
      if (trimmed === '---') { this.pos++; break; }
      if (trimmed === '' || trimmed.startsWith('//')) { this.pos++; continue; }

      if (trimmed.startsWith('title ')) {
        head.title = this._extractQuotedString(trimmed.substring(6).trim());
      } else if (trimmed === 'viewport') {
        head.viewport = true;
      } else if (trimmed.startsWith('meta')) {
        const attrs = this._parseAttributes(trimmed.substring(4));
        head.metas.push(attrs);
      } else if (trimmed.startsWith('link ')) {
        head.links.push(this._extractQuotedString(trimmed.substring(5).trim()));
      } else if (trimmed.startsWith('script ')) {
        head.scripts.push(this._extractQuotedString(trimmed.substring(7).trim()));
      }

      this.pos++;
    }

    return head;
  }

  // ---- Global Styles ----

  _parseGlobal(trimmed) {
    if (trimmed === ':reset') {
      return { type: 'reset' };
    }

    if (trimmed.startsWith(':global ')) {
      const rest = trimmed.substring(8);
      const braceIdx = rest.indexOf('{');
      if (braceIdx === -1) return null;
      const selector = rest.substring(0, braceIdx).trim();
      const cssStr = rest.substring(braceIdx + 1, rest.lastIndexOf('}')).trim();
      return { type: 'globalStyle', selector, css: this._parseCssString(cssStr) };
    }

    if (trimmed.startsWith(':class ')) {
      const rest = trimmed.substring(7);
      const braceIdx = rest.indexOf('{');
      if (braceIdx === -1) return null;
      const name = rest.substring(0, braceIdx).trim();
      const cssStr = rest.substring(braceIdx + 1, rest.lastIndexOf('}')).trim();
      return { type: 'sharedClass', name, css: this._parseCssString(cssStr) };
    }

    return null;
  }

  // ---- Block Parsing ----

  _parseBlock(baseIndent) {
    const nodes = [];

    while (this.pos < this.lines.length) {
      const line = this.lines[this.pos];
      const trimmed = line.trim();

      if (trimmed === '' || trimmed.startsWith('//')) {
        this.pos++;
        continue;
      }

      const indent = this._getIndent(line);
      if (indent < baseIndent) break;
      if (indent > baseIndent) break; // children handled by parent

      // Conditional
      if (trimmed.startsWith('?if ')) {
        nodes.push(this._parseConditional(indent));
        continue;
      }

      // Loop
      if (trimmed.startsWith('?each ')) {
        nodes.push(this._parseLoop(indent));
        continue;
      }

      // Component
      if (trimmed.startsWith('@')) {
        nodes.push(this._parseComponent(indent));
        continue;
      }

      // Element
      nodes.push(this._parseElement(indent));
    }

    return nodes;
  }

  // ---- Element Parsing ----

  _parseElement(baseIndent) {
    const line = this.lines[this.pos].trim();
    this.pos++;

    const node = {
      type: 'element',
      tag: 'div',
      id: null,
      classes: [],
      attrs: {},
      css: {},
      text: null,
      rawHtml: null,
      events: {},
      bind: null,
      bindFn: null,
      dataAttrs: {},
      children: []
    };

    let rest = line;

    // Parse tag#id.class.class
    const selectorMatch = rest.match(/^([a-zA-Z][a-zA-Z0-9-]*)?([#.][^(\s{[\]]*)?/);
    if (selectorMatch) {
      const tagPart = selectorMatch[1] || '';
      const selectorPart = selectorMatch[2] || '';
      rest = rest.substring(selectorMatch[0].length);

      if (tagPart) node.tag = tagPart;

      // Parse #id and .classes from selector
      const parts = selectorPart.split(/(?=[#.])/);
      for (const part of parts) {
        if (part.startsWith('#')) node.id = part.substring(1);
        else if (part.startsWith('.')) node.classes.push(part.substring(1));
      }

      // If we only have selectors with no tag, default to div
      if (!tagPart && selectorPart) node.tag = 'div';
    }

    rest = rest.trim();

    // Parse data attributes [key=val key2=val2]
    if (rest.startsWith('[')) {
      const closeIdx = rest.indexOf(']');
      if (closeIdx !== -1) {
        const dataStr = rest.substring(1, closeIdx);
        node.dataAttrs = this._parseAttrString(dataStr);
        rest = rest.substring(closeIdx + 1).trim();
      }
    }

    // Parse attributes (key="val" key2="val2" @click="fn")
    if (rest.startsWith('(')) {
      const closeIdx = this._findClosingParen(rest);
      if (closeIdx !== -1) {
        const attrStr = rest.substring(1, closeIdx);
        const parsed = this._parseAttrString(attrStr);

        for (const key in parsed) {
          if (key.startsWith('@')) {
            node.events[key.substring(1)] = parsed[key];
          } else if (key === ':bind') {
            node.bind = parsed[key];
          } else if (key === ':fn') {
            node.bindFn = parsed[key];
          } else {
            node.attrs[key] = parsed[key];
          }
        }

        rest = rest.substring(closeIdx + 1).trim();
      }
    }

    // Parse inline CSS block { prop: val; prop: val }
    if (rest.startsWith('{')) {
      const closeIdx = rest.lastIndexOf('}');
      if (closeIdx !== -1) {
        const cssStr = rest.substring(1, closeIdx).trim();
        node.css = { ...node.css, ...this._parseCssString(cssStr) };
        rest = rest.substring(closeIdx + 1).trim();
      }
    }

    // Parse inline text "..."
    if (rest.startsWith('"')) {
      node.text = this._extractQuotedString(rest);
      rest = '';
    }

    // Parse children
    this._parseChildren(node, baseIndent);

    return node;
  }

  _parseChildren(node, baseIndent) {
    while (this.pos < this.lines.length) {
      const line = this.lines[this.pos];
      const trimmed = line.trim();

      if (trimmed === '') { this.pos++; continue; }
      if (trimmed.startsWith('//')) { this.pos++; continue; }

      const indent = this._getIndent(line);
      if (indent <= baseIndent) break;

      // Pipe text
      if (trimmed.startsWith('| ') || trimmed === '|') {
        const textContent = trimmed.substring(2) || '';
        if (node.text) node.text += '\n' + this._interpolate(textContent);
        else node.text = this._interpolate(textContent);
        this.pos++;
        continue;
      }

      // Raw HTML
      if (trimmed.startsWith('! ')) {
        const htmlContent = trimmed.substring(2);
        if (node.rawHtml) node.rawHtml += htmlContent;
        else node.rawHtml = htmlContent;
        this.pos++;
        continue;
      }

      // CSS line
      if (trimmed.startsWith('{ ') || trimmed.startsWith('{')) {
        const cssLine = trimmed.replace(/^\{/, '').replace(/\}$/, '').trim();
        if (cssLine) {
          const parsed = this._parseCssString(cssLine);
          node.css = { ...node.css, ...parsed };
        }
        this.pos++;
        continue;
      }

      // Nested conditional
      if (trimmed.startsWith('?if ')) {
        node.children.push(this._parseConditional(indent));
        continue;
      }

      // Nested loop
      if (trimmed.startsWith('?each ')) {
        node.children.push(this._parseLoop(indent));
        continue;
      }

      // Nested component
      if (trimmed.startsWith('@')) {
        node.children.push(this._parseComponent(indent));
        continue;
      }

      // Nested element
      node.children.push(this._parseElement(indent));
    }
  }

  // ---- Components ----

  _parseComponent(baseIndent) {
    const line = this.lines[this.pos].trim();
    this.pos++;

    const node = {
      type: 'component',
      name: null,
      props: {},
      children: []
    };

    let rest = line.substring(1); // remove @

    // Component name
    const nameMatch = rest.match(/^([a-zA-Z][a-zA-Z0-9_]*)/);
    if (nameMatch) {
      node.name = nameMatch[1];
      rest = rest.substring(nameMatch[0].length).trim();
    }

    // Props (same as attributes)
    if (rest.startsWith('(')) {
      const closeIdx = this._findClosingParen(rest);
      if (closeIdx !== -1) {
        node.props = this._parseAttrString(rest.substring(1, closeIdx));
        rest = rest.substring(closeIdx + 1).trim();
      }
    }

    // Parse children (components can have child elements)
    this._parseChildren(node, baseIndent);

    return node;
  }

  // ---- Conditionals ----

  _parseConditional(baseIndent) {
    const line = this.lines[this.pos].trim();
    this.pos++;

    const condition = line.substring(4).trim(); // remove ?if

    const node = {
      type: 'conditional',
      condition,
      trueBranch: [],
      falseBranch: []
    };

    let inElse = false;

    // Parse branches — scan each child line and check for ?else
    while (this.pos < this.lines.length) {
      const nextLine = this.lines[this.pos];
      const trimmed = nextLine.trim();

      if (trimmed === '' || trimmed.startsWith('//')) { this.pos++; continue; }

      const indent = this._getIndent(nextLine);
      if (indent <= baseIndent) break;

      // Check for ?else at child indent
      if (trimmed === '?else') {
        inElse = true;
        this.pos++;
        continue;
      }

      // Parse one node (parseBlock reads siblings at the same indent, so it'll
      // consume only nodes until indent drops — but we need it to stop at ?else too).
      // Safest: parse a single element/block starting at this line.
      const parsed = this._parseSingleNode(indent);
      if (parsed) {
        if (inElse) node.falseBranch.push(parsed);
        else node.trueBranch.push(parsed);
      }
    }

    return node;
  }

  /**
   * Parse a single node at the current position (element, conditional, loop, or component).
   */
  _parseSingleNode(indent) {
    if (this.pos >= this.lines.length) return null;
    const trimmed = this.lines[this.pos].trim();
    if (trimmed === '' || trimmed.startsWith('//')) { this.pos++; return null; }

    if (trimmed.startsWith('?if ')) return this._parseConditional(indent);
    if (trimmed.startsWith('?each ')) return this._parseLoop(indent);
    if (trimmed.startsWith('@')) return this._parseComponent(indent);
    return this._parseElement(indent);
  }

  // ---- Loops ----

  _parseLoop(baseIndent) {
    const line = this.lines[this.pos].trim();
    this.pos++;

    // ?each item in items
    // ?each item, index in items
    const loopMatch = line.match(/^\?each\s+(\w+)(?:\s*,\s*(\w+))?\s+in\s+(.+)$/);
    if (!loopMatch) return { type: 'error', message: 'Invalid loop syntax: ' + line };

    const node = {
      type: 'loop',
      itemVar: loopMatch[1],
      indexVar: loopMatch[2] || null,
      source: loopMatch[3].trim(),
      children: []
    };

    // Parse loop body
    while (this.pos < this.lines.length) {
      const nextLine = this.lines[this.pos];
      const trimmed = nextLine.trim();
      if (trimmed === '' || trimmed.startsWith('//')) { this.pos++; continue; }

      const indent = this._getIndent(nextLine);
      if (indent <= baseIndent) break;

      const children = this._parseBlock(indent);
      node.children.push(...children);
    }

    return node;
  }

  // ---- Helpers ----

  _getIndent(line) {
    let count = 0;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === ' ') count++;
      else if (line[i] === '\t') count += 2;
      else break;
    }
    return count;
  }

  _findClosingParen(str) {
    let depth = 0;
    let inQuote = false;
    let quoteChar = '';
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (inQuote) {
        if (ch === quoteChar && str[i - 1] !== '\\') inQuote = false;
        continue;
      }
      if (ch === '"' || ch === "'") { inQuote = true; quoteChar = ch; continue; }
      if (ch === '(') depth++;
      if (ch === ')') { depth--; if (depth === 0) return i; }
    }
    return -1;
  }

  _extractQuotedString(str) {
    str = str.trim();
    if (str.startsWith('"') && str.endsWith('"')) {
      return this._interpolate(str.slice(1, -1));
    }
    if (str.startsWith("'") && str.endsWith("'")) {
      return this._interpolate(str.slice(1, -1));
    }
    return this._interpolate(str);
  }

  _interpolate(str) {
    return str.replace(/#\{([^}]+)\}/g, (_, expr) => {
      const trimmed = expr.trim();
      const parts = trimmed.split('.');
      let val = this.variables;
      for (const part of parts) {
        if (val == null) return `#{${trimmed}}`;  // preserve token for loop resolution
        val = val[part];
      }
      return val != null ? String(val) : `#{${trimmed}}`;
    });
  }

  _parseAttrString(str) {
    const attrs = {};
    const regex = /([:\@]?[\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
    let match;
    while ((match = regex.exec(str)) !== null) {
      const key = match[1];
      const value = match[2] ?? match[3] ?? match[4] ?? true;
      attrs[key] = value;
    }
    return attrs;
  }

  _parseCssString(str) {
    const css = {};
    const pairs = str.split(';').filter(s => s.trim());
    for (const pair of pairs) {
      const colonIdx = pair.indexOf(':');
      if (colonIdx === -1) continue;
      const prop = pair.substring(0, colonIdx).trim();
      const value = pair.substring(colonIdx + 1).trim();
      if (prop && value) {
        // Convert kebab to camelCase for buildhtml
        const camelProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        css[camelProp] = value;
      }
    }
    return css;
  }

  // ---- AST → Document ----

  _astToDocument(ast, variables) {
    const { Document, components } = require('./index');
    const doc = new Document();

    // Apply head
    if (ast.head) {
      if (ast.head.title) doc.title(ast.head.title);
      if (ast.head.viewport) doc.viewport();
      for (const m of ast.head.metas) doc.addMeta(m);
      for (const l of ast.head.links) doc.addLink(l);
      for (const s of ast.head.scripts) doc.addScript(s);
    }

    // Apply globals
    for (const g of ast.globals) {
      if (!g) continue;
      if (g.type === 'reset') doc.resetCss();
      else if (g.type === 'globalStyle') doc.globalStyle(g.selector, g.css);
      else if (g.type === 'sharedClass') doc.sharedClass(g.name, g.css);
    }

    // Build body
    for (const node of ast.body) {
      this._buildAstNode(doc, null, node, variables);
    }

    return doc;
  }

  _buildAstNode(doc, parentEl, node, variables) {
    if (!node) return;

    switch (node.type) {
      case 'element':
        return this._buildElement(doc, parentEl, node, variables);

      case 'component':
        return this._buildComponent(doc, parentEl, node, variables);

      case 'conditional':
        return this._buildConditional(doc, parentEl, node, variables);

      case 'loop':
        return this._buildLoop(doc, parentEl, node, variables);
    }
  }

  _buildElement(doc, parentEl, node, variables) {
    const el = parentEl ? parentEl.child(node.tag) : doc.create(node.tag);

    if (node.id) el.id(node.id);
    if (node.classes.length > 0) el.addClass(...node.classes);
    if (Object.keys(node.attrs).length > 0) el.setAttrs(node.attrs);
    if (Object.keys(node.dataAttrs).length > 0) el.data(node.dataAttrs);
    if (Object.keys(node.css).length > 0) el.css(node.css);
    if (node.text != null) el.text(node.text);
    if (node.rawHtml != null) el.appendUnsafe(node.rawHtml);

    if (node.bind) {
      const fn = node.bindFn ? new Function('return ' + node.bindFn)() : undefined;
      el.bind(node.bind, fn);
    }

    // Events are stored as strings — they reference function names in the variables
    for (const ev in node.events) {
      const fnRef = node.events[ev];
      if (variables && typeof variables[fnRef] === 'function') {
        el.on(ev, variables[fnRef]);
      }
    }

    for (const child of node.children) {
      this._buildAstNode(doc, el, child, variables);
    }

    return el;
  }

  _buildComponent(doc, parentEl, node, variables) {
    const { components } = require('./index');

    // Resolve prop values from variables
    const resolvedProps = {};
    for (const key in node.props) {
      const val = node.props[key];
      if (val === true) {
        resolvedProps[key] = true;
      } else if (typeof val === 'string' && variables && variables[val] !== undefined) {
        resolvedProps[key] = variables[val];
      } else {
        resolvedProps[key] = val;
      }
    }

    const el = parentEl
      ? (() => { const child = parentEl.child('div'); const { fn } = components.get(node.name); fn(child, resolvedProps); return child; })()
      : doc.component(node.name, resolvedProps);

    // Build children into the component
    for (const child of node.children) {
      this._buildAstNode(doc, el, child, variables);
    }

    return el;
  }

  _buildConditional(doc, parentEl, node, variables) {
    // Evaluate condition against variables
    const condResult = this._evaluateCondition(node.condition, variables);

    const branch = condResult ? node.trueBranch : node.falseBranch;
    for (const child of branch) {
      this._buildAstNode(doc, parentEl, child, variables);
    }
  }

  _buildLoop(doc, parentEl, node, variables) {
    // Resolve the source array from variables
    const source = this._resolveVar(node.source, variables);
    if (!Array.isArray(source)) return;

    for (let i = 0; i < source.length; i++) {
      const item = source[i];

      // Create a new variable scope for this iteration
      const loopVars = { ...variables, [node.itemVar]: item };
      if (node.indexVar) loopVars[node.indexVar] = i;

      // Deep clone + resolve children with loop variables
      for (const child of node.children) {
        const resolvedChild = this._deepResolve(child, loopVars);
        this._buildAstNode(doc, parentEl, resolvedChild, loopVars);
      }
    }
  }

  _deepResolve(node, variables) {
    if (!node || typeof node !== 'object') return node;

    const resolved = { ...node };

    // Resolve text interpolation
    if (resolved.text != null && typeof resolved.text === 'string') {
      resolved.text = this._resolveInterpolation(resolved.text, variables);
    }

    // Deep resolve children
    if (resolved.children && resolved.children.length > 0) {
      resolved.children = resolved.children.map(c => this._deepResolve(c, variables));
    }

    // Deep resolve loop branches
    if (resolved.trueBranch) resolved.trueBranch = resolved.trueBranch.map(c => this._deepResolve(c, variables));
    if (resolved.falseBranch) resolved.falseBranch = resolved.falseBranch.map(c => this._deepResolve(c, variables));

    return resolved;
  }

  _resolveInterpolation(str, variables) {
    return str.replace(/#\{([^}]+)\}/g, (_, expr) => {
      const val = this._resolveVar(expr.trim(), variables);
      return val != null ? String(val) : '';
    });
  }

  _evaluateCondition(condition, variables) {
    // Simple boolean resolution: check if variable is truthy
    // Supports: varName, !varName, var === "val", var !== "val"
    const trimmed = condition.trim();

    if (trimmed.startsWith('!')) {
      return !this._resolveVar(trimmed.substring(1).trim(), variables);
    }

    if (trimmed.includes('===')) {
      const [left, right] = trimmed.split('===').map(s => s.trim());
      const leftVal = this._resolveVar(left, variables);
      const rightVal = right.replace(/^["']|["']$/g, '');
      return String(leftVal) === rightVal;
    }

    if (trimmed.includes('!==')) {
      const [left, right] = trimmed.split('!==').map(s => s.trim());
      const leftVal = this._resolveVar(left, variables);
      const rightVal = right.replace(/^["']|["']$/g, '');
      return String(leftVal) !== rightVal;
    }

    return !!this._resolveVar(trimmed, variables);
  }

  _resolveVar(path, variables) {
    if (!variables) return undefined;
    const parts = path.split('.');
    let val = variables;
    for (const part of parts) {
      if (val == null) return undefined;
      val = val[part];
    }
    return val;
  }
}

// ---- Convenience API ----

const defaultParser = new TemplateParser();

/**
 * Parse a .bhtml template string to an AST.
 *   const ast = parseTemplate(source, { name: 'World' });
 */
function parseTemplate(source, variables = {}) {
  return new TemplateParser().parse(source, variables);
}

/**
 * Compile a .bhtml template string directly to a rendered HTML string.
 *   const html = renderTemplate(source, { name: 'World' });
 */
function renderTemplate(source, variables = {}) {
  const doc = new TemplateParser().compile(source, variables);
  return doc.render();
}

/**
 * Compile a .bhtml template string to a Document (for further manipulation).
 *   const doc = compileTemplate(source, { name: 'World' });
 *   doc.addScript('extra.js');
 *   const html = doc.render();
 */
function compileTemplate(source, variables = {}) {
  return new TemplateParser().compile(source, variables);
}

/**
 * Load and compile a .bhtml file from disk.
 *   const html = renderFile('./views/home.bhtml', { user: 'Alice' });
 */
function renderFile(filePath, variables = {}) {
  const fs = require('fs');
  const source = fs.readFileSync(filePath, 'utf-8');
  return renderTemplate(source, variables);
}

/**
 * Load a .bhtml file and return a Document.
 *   const doc = compileFile('./views/home.bhtml', { user: 'Alice' });
 */
function compileFile(filePath, variables = {}) {
  const fs = require('fs');
  const source = fs.readFileSync(filePath, 'utf-8');
  return compileTemplate(source, variables);
}

/**
 * Express view engine integration.
 *   app.engine('bhtml', buildhtml.templateEngine);
 *   app.set('view engine', 'bhtml');
 *
 *   // In routes:
 *   res.render('home', { name: 'World', items: [1, 2, 3] });
 */
function templateEngine(filePath, options, callback) {
  try {
    const fs = require('fs');
    const source = fs.readFileSync(filePath, 'utf-8');
    const html = renderTemplate(source, options);
    callback(null, html);
  } catch (err) {
    callback(err);
  }
}

module.exports = {
  TemplateParser,
  parseTemplate,
  renderTemplate,
  compileTemplate,
  renderFile,
  compileFile,
  templateEngine
};
