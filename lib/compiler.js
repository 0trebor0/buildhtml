'use strict';

const { Script } = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { Element } = require('./element');
const { Head } = require('./head');
const { renderNode, compileClient } = require('./renderer');
const { isValidAttrKey, sanitizeUrl, URL_ATTRS, VOID_ELEMENTS, safeJsonStringify, unescapeHtml, toKebab, escapeHtml } = require('./utils');

// Serialized into the generated module; this class never runs on the server.
class ClientDocument {
  constructor(options = {}) {
    if (!options || typeof options !== 'object' || (options.nonce != null && typeof options.nonce !== 'string')) {
      throw new TypeError('Page options must be an object with an optional string nonce.');
    }
    this.nonce = options.nonce || '';
    this.root = null;
    this.state = null;
    this._cleanups = [];
  }

  createElement(tagNameOrNode) {
    try {
      if (!this._document) throw new Error('Mount the page before creating nodes.');
      if (typeof tagNameOrNode === 'string') return this._document.createElement(tagNameOrNode);
      const owner = tagNameOrNode && tagNameOrNode.ownerDocument;
      const NodeType = owner && owner.defaultView ? owner.defaultView.Node : this._document.defaultView.Node;
      if (NodeType && tagNameOrNode instanceof NodeType) return tagNameOrNode;
      throw new TypeError('Expected a tag name or DOM node.');
    } catch (error) {
      throw new Error('Unable to create page node: ' + error.message, { cause: error });
    }
  }

  _listen(target, type, listener, options) {
    try {
      const listenerOptions = typeof options === 'boolean' ? { capture: options } : { ...options };
      const ownedSignal = this._controller.signal;
      if (listenerOptions.signal === undefined) listenerOptions.signal = ownedSignal;
      target.addEventListener(type, listener, listenerOptions);
      // A caller's signal must retain native cancellation and validation semantics.
      // The instance still owns removal when that caller never aborts.
      if (listenerOptions.signal !== ownedSignal) {
        const capture = !!listenerOptions.capture;
        this._cleanups.push(() => {
          try { target.removeEventListener(type, listener, capture); }
          catch (error) { throw new Error('Unable to remove page listener: ' + error.message, { cause: error }); }
        });
      }
    } catch (error) {
      throw new Error('Unable to register page listener: ' + error.message, { cause: error });
    }
  }

  _style(css) {
    try {
      const style = this.createElement('style');
      if (this.nonce) style.nonce = this.nonce;
      style.textContent = css;
      this._head.appendChild(style);
    } catch (error) {
      throw new Error('Unable to create page styles: ' + error.message, { cause: error });
    }
  }

  mount(target) {
    if (this.root) throw new Error('Page is already mounted; call destroy() before mounting again.');
    try {
      if (!target || !(target.nodeType === 1 || (target.nodeType === 11 && target.host)) || !target.ownerDocument) {
        throw new TypeError('Mount target must be an Element or ShadowRoot.');
      }
      this._document = target.ownerDocument;
      this.state = null;
      this._controller = new this._document.defaultView.AbortController();
      this._host = this.createElement('div');
      this.root = this._host.attachShadow({ mode: 'open' });
      this._html = this.createElement('html');
      this._head = this.createElement('head');
      this._body = this.createElement('body');
      this.root.appendChild(this._html);
      this._html.appendChild(this._head);
      this._html.appendChild(this._body);
      this._build();
      target.appendChild(this._host);
      this._initialize();
      return this;
    } catch (error) {
      try { this.destroy(); } catch (cleanupError) { error.cleanupError = cleanupError; }
      throw new Error('Unable to mount page: ' + error.message, { cause: error });
    }
  }

  destroy() {
    let failure;
    // Lifecycle cleanup runs while the instance nodes are still available.
    for (const cleanup of this._cleanups.splice(0).reverse()) {
      try { cleanup(); } catch (error) { failure = failure || error; }
    }
    try {
      if (this._controller) this._controller.abort();
      if (this._host) this._host.remove();
    } catch (error) { failure = failure || error; }
    this.root = null;
    this._host = this._html = this._head = this._body = this._document = this._controller = null;
    if (failure) throw new Error('Unable to destroy page: ' + failure.message, { cause: failure });
  }
}

function compileDocument(doc, options = {}) {
  let ctx;
  try {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Expected compile options.');
    const output = options.output === undefined ? 'html' : options.output;
    if (output !== 'html' && output !== 'class') throw new TypeError('output must be "html" or "class".');
    ctx = doc._createRenderContext();
    if (output === 'html') return doc._renderHtml(ctx);

    const className = options.className === undefined ? 'GeneratedPage' : options.className;
    if (typeof className !== 'string' || !/^[A-Za-z_$][\w$]*$/.test(className) || className === 'await') {
      throw new TypeError('className must be a valid JavaScript class name.');
    }
    new Script('"use strict"; class ' + className + ' {}');
    if (doc.head.links.length || doc.head.rawLinks.length || doc.head.scripts.length || doc._rawHeadContent.length) {
      throw new Error('Class output does not support external stylesheets, head links/scripts, or rawHead().');
    }
    if (doc._inlineScripts.some(source => !doc._classScripts.has(source))) {
      throw new Error('Class output supports generated liveList/views scripts; routers and authored inlineScript() are unsupported.');
    }

    for (const node of doc.body) renderNode(node, ctx);
    ctx.scoped = true;
    const lines = [];
    let nextId = 0;
    const setAttrs = (target, attrs, skipClass = false) => {
      try {
        for (const key of Object.keys(attrs)) {
          if ((skipClass && key === 'class') || !isValidAttrKey(key) || attrs[key] == null) continue;
          const value = URL_ATTRS.has(key.toLowerCase()) ? sanitizeUrl(attrs[key]) : attrs[key];
          lines.push(`${target}.setAttribute(${safeJsonStringify(key)},${safeJsonStringify(String(value))});`);
        }
      } catch (error) {
        throw new Error('Unable to compile attributes for ' + target + ': ' + error.message, { cause: error });
      }
    };
    const emit = (node, parent) => {
      try {
        const name = 'node' + nextId++;
        if (!(node instanceof Element)) {
          const content = String(node);
          if (content.includes('<')) {
            // Strings containing markup come from the existing explicitly raw paths.
            lines.push(`const ${name}=this.createElement('template');${name}.innerHTML=${safeJsonStringify(content)};`);
            lines.push(`if(${name}.content.querySelector('script'))throw new Error('Scripts inside raw HTML are unsupported by class output.');`);
            lines.push(`${parent}.appendChild(${name}.content);`);
          } else {
            lines.push(`${parent}.appendChild(this._document.createTextNode(${safeJsonStringify(unescapeHtml(content))}));`);
          }
          return;
        }
        if (node.tag === 'script') throw new Error('Script elements are unsupported by class output.');
        if (node.tag === 'svg' || node.tag === 'math') throw new Error('Class output currently supports HTML elements, not SVG/MathML trees.');
        lines.push(`const ${name}=this.createElement(${safeJsonStringify(node.tag)});`);
        setAttrs(name, node.attrs, true);
        if (node._classes.length) lines.push(`${name}.className=${safeJsonStringify(node._classes.join(' '))};`);
        if (!VOID_ELEMENTS.has(node.tag)) {
          const childTarget = node.tag === 'template' ? name + '.content' : name;
          for (const child of node.children) emit(child, childTarget);
        }
        lines.push(`${parent}.appendChild(${name});`);
      } catch (error) {
        throw new Error('Unable to compile DOM content: ' + error.message, { cause: error });
      }
    };

    setAttrs('this._html', doc._htmlAttrs);
    setAttrs('this._body', doc._bodyAttrs);
    if (doc._bodyClasses.length) lines.push(`this._body.className=${safeJsonStringify(doc._bodyClasses.join(' '))};`);
    lines.push(`const charset=this.createElement('meta');charset.setAttribute('charset',${safeJsonStringify(String(doc.head.charset))});this._head.appendChild(charset);`);
    lines.push(`const title=this.createElement('title');title.textContent=${safeJsonStringify(unescapeHtml(doc.head.title))};this._head.appendChild(title);`);
    for (const meta of doc.head.metas) {
      const name = 'meta' + nextId++;
      lines.push(`const ${name}=this.createElement('meta');`);
      setAttrs(name, Object.fromEntries(Object.keys(meta).map(key => [toKebab(key), meta[key]])));
      lines.push(`this._head.appendChild(${name});`);
    }
    const styles = [
      ...Object.keys(doc.head.classStyles).map(name => `.${name}{${doc.head.classStyles[name]}}`),
      ...doc.head.globalStyles.map((css, index) => {
        if (index === doc._cssVarsRuleIdx) return css.replace(/^:root/, ':host');
        if (css.includes(':root')) throw new Error('Class output supports root variables through cssVars(); arbitrary :root selectors are unsupported.');
        return css;
      }),
      ...doc.head.styles.map(css => {
        if (css.includes(':root')) throw new Error('Class output does not support :root in raw styles; use cssVars().');
        return css;
      }), ...ctx.styles,
    ].join('');
    if (styles) lines.push(`this._style(${safeJsonStringify(styles)});`);
    for (const node of doc.body) emit(node, 'this._body');

    const initialize = `
      let State, watchState;
      const instance=this, nativeDocument=this._document, nativeWindow=nativeDocument.defaultView;
      const root=this.root, body=this._body, head=this._head, html=this._html;
      const scope={listen:this._listen.bind(this),cleanup:fn=>this._cleanups.push(fn)};
      const document=new Proxy(nativeDocument,{
        get(target,key){
          if(key==='body')return body;
          if(key==='head')return head;
          if(key==='documentElement')return html;
          if(key==='defaultView')return window;
          if(key==='readyState')return 'complete';
          if(key==='currentScript')return {nonce:instance.nonce};
          if(key==='activeElement')return root.activeElement;
          if(key==='getElementById'||key==='querySelector'||key==='querySelectorAll')return root[key].bind(root);
          if(key==='getElementsByTagName'||key==='getElementsByTagNameNS'||key==='getElementsByClassName')return html[key].bind(html);
          if(key==='contains')return root.contains.bind(root);
          if(key==='addEventListener')return (type,fn,opts)=>scope.listen(root,type,fn,opts);
          if(key==='removeEventListener')return root.removeEventListener.bind(root);
          if(key==='title')return head.querySelector('title').textContent;
          const value=target[key];return typeof value==='function'&&!Object.prototype.hasOwnProperty.call(value,'prototype')?value.bind(target):value;
        },
        set(target,key,value){if(key==='title'){head.querySelector('title').textContent=value;return true;}throw new Error('Unsupported scoped document assignment: '+String(key));}
      });
      const locals=Object.create(null);
      locals.State=State=Object.create(null);instance.state=State;
      locals.watchState=locals._trackStateTarget=locals._mkEl=locals.BuildHTMLDebug=undefined;
      locals.BuildHTML={...nativeWindow.BuildHTML,_listen:scope.listen,_cleanup:scope.cleanup};
      const window=new Proxy(locals,{
        get(target,key){if(key==='window'||key==='self')return window;if(key==='document')return document;if(Object.prototype.hasOwnProperty.call(target,key))return target[key];if(key==='addEventListener')return (type,fn,opts)=>scope.listen(nativeWindow,type,fn,opts);const value=nativeWindow[key];return typeof value==='function'&&!Object.prototype.hasOwnProperty.call(value,'prototype')?value.bind(nativeWindow):value;},
        set(target,key,value){target[key]=value;if(key==='State'){State=value;instance.state=value;}if(key==='watchState')watchState=value;return true;}
      });
      ${compileClient(ctx)}
      ${doc._inlineScripts.join(';\n')};
    `;
    // An export alias cannot shadow browser globals used by the generated code.
    // For example, choosing className: 'Object' must not replace Object.create.
    const runtime = ClientDocument.toString();
    return 'const __buildhtmlPage = ' + runtime.slice(0, -1) + `\n_build(){try{${lines.join('\n')}}catch(error){throw new Error('Unable to build page DOM: '+error.message,{cause:error});}}\n_initialize(){try{${initialize}}catch(error){throw new Error('Unable to initialize page: '+error.message,{cause:error});}}\n};\nObject.defineProperty(__buildhtmlPage,'name',{value:${safeJsonStringify(className)}});\nexport { __buildhtmlPage as ${className} };\n`;
  } catch (error) {
    throw new Error('[Document.compile] ' + error.message, { cause: error });
  } finally {
    if (ctx) doc._releaseRenderContext(ctx);
  }
}

function saveBundle(doc, htmlPath, options = {}) {
  let outputPath = htmlPath;
  try {
    if (typeof htmlPath !== 'string' || path.extname(htmlPath).toLowerCase() !== '.html') {
      throw new TypeError('The HTML output path must end in .html.');
    }
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Expected bundle options.');
    if (doc._nonce || doc.head.nonce) throw new Error('Static bundles cannot reuse a response nonce. Use a Document without nonce.');
    // Compile before creating output directories so unsupported features leave no files.
    const source = compileDocument(doc, { output: 'class', className: options.className });
    const htmlFile = path.resolve(htmlPath);
    const jsFile = path.join(path.dirname(htmlFile), path.parse(htmlFile).name + '.js');
    const moduleUrl = './' + encodeURIComponent(path.basename(jsFile));
    const head = new Head();
    head.title = doc.head.title;
    // Bundle files are written as UTF-8 regardless of the source render charset.
    head.charset = 'UTF-8';
    head.metas = doc.head.metas;
    // Source IDs/classes belong to the isolated page, not the bootstrap shell.
    const attrs = doc._htmlAttrs;
    const lang = Object.prototype.hasOwnProperty.call(attrs, 'lang') && attrs.lang != null ? attrs.lang : 'en';
    const direction = Object.prototype.hasOwnProperty.call(attrs, 'dir') && attrs.dir != null ? ` dir="${escapeHtml(attrs.dir)}"` : '';
    const html = `<!DOCTYPE html><html lang="${escapeHtml(lang)}"${direction}><head>${head.render()}</head><body><div id="app"></div><script type="module" src="${escapeHtml(moduleUrl)}"></script></body></html>`;
    const javascript = source + '\nconst __buildhtmlInstance = new __buildhtmlPage();\n__buildhtmlInstance.mount(globalThis.document.querySelector("body > div#app"));\n';
    fs.mkdirSync(path.dirname(htmlFile), { recursive: true });
    outputPath = jsFile;
    fs.writeFileSync(jsFile, javascript, 'utf8');
    outputPath = htmlFile;
    fs.writeFileSync(htmlFile, html, 'utf8');
    return doc;
  } catch (error) {
    const label = typeof outputPath === 'string' ? outputPath : 'bundle';
    const failure = new Error(`[Document.saveBundle] Could not write ${label}: ${error.message}`, { cause: error });
    failure.code = error.code;
    throw failure;
  }
}

module.exports = { compileDocument, saveBundle };
