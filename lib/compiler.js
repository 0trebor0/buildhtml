'use strict';

const { Script } = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Element } = require('./element');
const { Head } = require('./head');
const { renderNode, compileClient } = require('./renderer');
const { isValidAttrKey, sanitizeUrl, URL_ATTRS, VOID_ELEMENTS, safeJsonStringify, unescapeHtml, escapeHtml } = require('./utils');

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
    this._nodes = [];
    this._headNodes = [];
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
      const listenerOptions = typeof options === 'boolean' ? { capture: options } : {
        capture: options?.capture,
        once: options?.once,
        passive: options?.passive,
        signal: options?.signal,
      };
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
      this._headNodes.push(style);
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
      this.root = target;
      this._head = this._document.head;
      const fragment = this._document.createDocumentFragment();
      this._build(fragment);
      this._nodes = Array.from(fragment.childNodes);
      target.appendChild(fragment);
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
    } catch (error) { failure = failure || error; }
    for (const node of [...this._nodes.splice(0), ...this._headNodes.splice(0)]) {
      try { node.remove(); } catch (error) { failure = failure || error; }
    }
    this.root = null;
    this._head = this._document = this._controller = null;
    if (failure) throw new Error('Unable to destroy page: ' + failure.message, { cause: failure });
  }
}

function compileDocument(doc, options = {}, bundle = null) {
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
    if (!bundle && (doc.head.links.length || doc.head.rawLinks.length || doc.head.scripts.length || doc._rawHeadContent.length)) {
      throw new Error('Class output does not support external stylesheets, head links/scripts, or rawHead().');
    }
    const generatedScripts = doc._inlineScripts.filter(source => doc._classScripts.has(source)
      || (bundle && doc._routerScripts.has(source)));
    if (!bundle && generatedScripts.length !== doc._inlineScripts.length) {
      throw new Error('Class output supports generated liveList/views scripts; routers and authored inlineScript() are unsupported.');
    }

    if (bundle) ctx.foreignMarkup = new Map();
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
    const emit = (node, parent, insideTemplate = false) => {
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
        if (node.tag === 'script') {
          if (!bundle) throw new Error('Script elements are unsupported by class output.');
          if (node.children.some(child => child instanceof Element)) throw new Error('Body scripts require text content.');
          lines.push(`const ${name}Template=this.createElement('template');${name}Template.innerHTML='<script></script>';`);
          lines.push(`const ${name}=${name}Template.content.firstChild;`);
          setAttrs(name, node.attrs, true);
          if (node._classes.length) lines.push(`${name}.className=${safeJsonStringify(node._classes.join(' '))};`);
          lines.push(`${name}.textContent=${safeJsonStringify(unescapeHtml(node.children.join('')))};`);
          if (!insideTemplate) {
            bundle.hasBodyScripts = true;
            lines.push(`${parent}.appendChild(this._prepareBundleScript?this._prepareBundleScript(${name}):${name});`);
          } else {
            lines.push(`${parent}.appendChild(${name});`);
          }
          return;
        }
        if (node.tag === 'svg' || node.tag === 'math') {
          if (!bundle) throw new Error('Class output currently supports HTML elements, not SVG/MathML trees.');
          // HTML parsing supplies foreign namespaces, canonical names, and integration points.
          lines.push(`const ${name}=this.createElement('template');${name}.innerHTML=${safeJsonStringify(ctx.foreignMarkup.get(node))};`);
          lines.push(`if(${name}.content.querySelector('script'))throw new Error('Scripts inside SVG/MathML are unsupported by bundle output.');`);
          lines.push(`${parent}.appendChild(${name}.content);`);
          return;
        }
        lines.push(`const ${name}=this.createElement(${safeJsonStringify(node.tag)});`);
        setAttrs(name, node.attrs, true);
        if (node._classes.length) lines.push(`${name}.className=${safeJsonStringify(node._classes.join(' '))};`);
        if (!VOID_ELEMENTS.has(node.tag)) {
          const childTarget = node.tag === 'template' ? name + '.content' : name;
          for (const child of node.children) emit(child, childTarget, insideTemplate || node.tag === 'template');
        }
        lines.push(`${parent}.appendChild(${name});`);
      } catch (error) {
        throw new Error('Unable to compile DOM content: ' + error.message, { cause: error });
      }
    };

    const headStyles = [
      ...Object.keys(doc.head.classStyles).map(name => `.${name}{${doc.head.classStyles[name]}}`),
      ...doc.head.globalStyles.map((css, index) => {
        if (bundle || index === doc._cssVarsRuleIdx) return css;
        if (css.includes(':root')) throw new Error('Class output supports root variables through cssVars(); arbitrary :root selectors are unsupported.');
        return css;
      }),
      ...doc.head.styles.map(css => {
        if (!bundle && css.includes(':root')) throw new Error('Class output does not support :root in raw styles; use cssVars().');
        return css;
      }),
    ].join('');
    const instanceStyles = ctx.styles.join('');
    if (bundle) {
      bundle.headStyles = headStyles;
      bundle.elementStyles = instanceStyles;
    } else if (headStyles || instanceStyles) {
      lines.push(`this._style(${safeJsonStringify(headStyles + instanceStyles)});`);
    }
    for (const node of doc.body) emit(node, 'fragment');

    const initialize = `
      let State, watchState;
      const instance=this, nativeDocument=this._document, nativeWindow=nativeDocument.defaultView;
      const root=this.root, head=this._head;
      let title=${safeJsonStringify(unescapeHtml(doc.head.title))};
      const owns=node=>root.contains(node)&&instance._nodes.some(top=>top.contains(node));
      const select=selector=>Array.from(root.querySelectorAll(selector)).filter(owns);
      const collection=(method,args)=>new Proxy(Object.create(null),{
        get(target,key){
          const read=()=>{
            if(root[method])return Array.from(root[method](...args)).filter(owns);
            return select('*').filter(node=>{
              const [name,localName]=args;
              if(method==='getElementsByTagNameNS')return (name==='*'||node.namespaceURI===(name||null))&&(localName==='*'||node.localName===localName);
              if(method==='getElementsByTagName')return name==='*'||(node.namespaceURI==='http://www.w3.org/1999/xhtml'?node.localName===String(name).toLowerCase():node.tagName===name);
              const classes=String(name).trim().split(/[\\t\\n\\f\\r ]+/);
              return classes[0]!==''&&classes.every(token=>node.classList.contains(token));
            });
          };
          if(key==='item')return index=>read()[index]||null;
          if(key==='namedItem')return name=>read().find(node=>name&&(node.id===name||node.getAttribute('name')===name))||null;
          const nodes=read();
          if(key===Symbol.iterator)return nodes[Symbol.iterator].bind(nodes);
          return key==='length'||(typeof key==='string'&&/^\\d+$/.test(key))?nodes[key]:undefined;
        }
      });
      const ownedHead=new Proxy(head,{
        get(target,key){
          if(key==='appendChild')return node=>{
            try {
              const nodes=node.nodeType===11?Array.from(node.childNodes):target.contains(node)?[]:[node];
              const appended=target.appendChild(node);
              instance._headNodes.push(...nodes);
              return appended;
            } catch(error){throw new Error('Unable to append page head content: '+error.message,{cause:error});}
          };
          const value=target[key];return typeof value==='function'?value.bind(target):value;
        }
      });
      const scope={listen:this._listen.bind(this),cleanup:fn=>this._cleanups.push(fn)};
      const document=new Proxy(nativeDocument,{
        get(target,key){
          if(key==='body')return root;
          if(key==='head')return ownedHead;
          if(key==='defaultView')return window;
          if(key==='readyState')return 'complete';
          if(key==='currentScript')return {nonce:instance.nonce};
          if(key==='activeElement'){const active=root.getRootNode().activeElement;return active&&owns(active)?active:null;}
          if(key==='getElementById')return id=>select('[id]').find(node=>node.id===String(id))||null;
          if(key==='querySelector')return selector=>select(selector)[0]||null;
          if(key==='querySelectorAll')return select;
          if(key==='getElementsByTagName'||key==='getElementsByTagNameNS'||key==='getElementsByClassName')return (...args)=>collection(key,args);
          if(key==='contains')return node=>!!node&&owns(node);
          if(key==='addEventListener')return (type,fn,opts)=>scope.listen(root,type,fn,opts);
          if(key==='removeEventListener')return root.removeEventListener.bind(root);
          if(key==='title')return title;
          const value=target[key];return typeof value==='function'&&!Object.prototype.hasOwnProperty.call(value,'prototype')?value.bind(target):value;
        },
        set(target,key,value){if(key==='title'){title=value;return true;}throw new Error('Unsupported scoped document assignment: '+String(key));}
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
      ${generatedScripts.join(';\n')};
    `;
    // An export alias cannot shadow browser globals used by the generated code.
    // For example, choosing className: 'Object' must not replace Object.create.
    const runtime = ClientDocument.toString();
    return 'const __buildhtmlPage = ' + runtime.slice(0, -1) + `\n_build(fragment){try{${lines.join('\n')}}catch(error){throw new Error('Unable to build page DOM: '+error.message,{cause:error});}}\n_initialize(){try{${initialize}}catch(error){throw new Error('Unable to initialize page: '+error.message,{cause:error});}}\n};\nObject.defineProperty(__buildhtmlPage,'name',{value:${safeJsonStringify(className)}});\nexport { __buildhtmlPage as ${className} };\n`;
  } catch (error) {
    throw new Error('[Document.compile] ' + error.message, { cause: error });
  } finally {
    if (ctx) doc._releaseRenderContext(ctx);
  }
}

function saveBundle(doc, destination, options = {}) {
  let outputPath = destination;
  try {
    if (typeof destination !== 'string' || !destination.trim()) {
      throw new TypeError('The bundle destination must be a directory or an HTML path ending in .html.');
    }
    const extension = path.extname(destination).toLowerCase();
    const isDirectory = !extension || destination.endsWith('/') || destination.endsWith(path.sep);
    if (!isDirectory && extension !== '.html') {
      throw new TypeError('The bundle destination must be a directory or an HTML path ending in .html.');
    }
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Expected bundle options.');
    const filename = options.filename;
    if (filename !== undefined && (typeof filename !== 'string' || !filename.trim()
      || /[<>:"/\\|?*\x00-\x1f]/.test(filename) || /[. ]$/.test(filename)
      || /\.(?:html|js)$/i.test(filename) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(filename))) {
      throw new TypeError('filename must be a valid filename stem without a path or .html/.js extension.');
    }
    if (doc._nonce || doc.head.nonce) throw new Error('Static bundles cannot reuse a response nonce. Use a Document without nonce.');
    // Compile before creating output directories so unsupported features leave no files.
    const head = new Head();
    const bundle = { hasBodyScripts: false };
    const source = compileDocument(doc, { output: 'class', className: options.className }, bundle);
    const requestedHtml = isDirectory ? path.resolve(destination, 'index.html') : path.resolve(destination);
    const htmlFile = filename === undefined ? requestedHtml : path.join(path.dirname(requestedHtml), filename + '.html');
    outputPath = htmlFile;
    const { dir: directory, name: stem } = path.parse(htmlFile);
    const elementSuffix = '.buildhtml-elements';
    if (stem.toLowerCase().endsWith(elementSuffix)) {
      throw new TypeError(`The bundle filename suffix ${elementSuffix} is reserved for generated stylesheets.`);
    }
    const jsFile = path.join(directory, stem + '.js');
    const cssFile = path.join(directory, stem + '.css');
    const moduleUrl = './' + encodeURIComponent(path.basename(jsFile));
    const stylesheetUrl = './' + encodeURIComponent(path.basename(cssFile));
    head.title = doc.head.title;
    // Bundle files are written as UTF-8 regardless of the source render charset.
    head.charset = 'UTF-8';
    head.metas = doc.head.metas;
    head.links = doc.head.links;
    head.rawLinks = [...doc.head.rawLinks];
    head.scripts = doc.head.scripts;
    const rawHead = [...doc._rawHeadContent];
    let baseEnd = 0;
    for (const [index, fragment] of rawHead.entries()) {
      if (/^\s*(?:<!--(?:[^-]|-(?!->))*-->\s*)*$/.test(fragment)) continue;
      const tag = /^\s*<(base|meta)(?=[\s/>])(?:[^"'<>]|"[^"]*"|'[^']*')*>\s*$/i.exec(fragment);
      if (!tag) break;
      if (tag[1].toLowerCase() === 'base') baseEnd = index + 1;
    }
    // Move metadata with the base so a preceding CSP policy stays in force.
    head._bundleBaseTags = rawHead.splice(0, baseEnd).join('');
    const rawHeadMarkup = rawHead.join('');
    const rawLinks = rawHeadMarkup.match(/<link(?=[\s/>])(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi) || [];
    const rawStylesheets = /<style(?=[\s/>])/i.test(rawHeadMarkup) || rawLinks.some(link => {
      const rel = /\srel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(link);
      return rel && /(?:^|\s)stylesheet(?:\s|$)/i.test(rel[1] ?? rel[2] ?? rel[3]);
    });
    const deferElementStyles = bundle.elementStyles && rawStylesheets;
    const elementCssFile = deferElementStyles && bundle.headStyles ? path.join(directory, stem + elementSuffix + '.css') : null;
    const stylesheetLink = `<link rel="stylesheet" href="${escapeHtml(stylesheetUrl)}">`;
    let elementLink = '';
    if (elementCssFile) {
      elementLink = `<link rel="stylesheet" href="./${escapeHtml(encodeURIComponent(path.basename(elementCssFile)))}">`;
    } else if (deferElementStyles) {
      elementLink = stylesheetLink;
    }
    if (!deferElementStyles || elementCssFile) head.rawLinks.push(stylesheetLink);
    const html = `<!DOCTYPE html><html${doc._renderHtmlAttrs()}><head>${head.render()}${rawHeadMarkup}${elementLink}</head><body${doc._renderBodyAttrs()}><div id="app"></div><script type="module" src="${escapeHtml(moduleUrl)}"></script></body></html>`;
    const authoredScripts = doc._inlineScripts.filter(script => !doc._classScripts.has(script) && !doc._routerScripts.has(script));
    let javascript = source + '\nconst __buildhtmlInstance = new __buildhtmlPage();\n';
    if (bundle.hasBodyScripts) {
      javascript += `const __buildhtmlScripts = [], __buildhtmlPendingScripts = new WeakMap();
const __buildhtmlCompletion = new AbortController();
const __buildhtmlFinishScript = event => { __buildhtmlPendingScripts.get(event.target)?.(); };
// Observe completion before capture listeners on the mounted tree.
for (const type of ['load', 'error']) {
  globalThis.document.addEventListener(type, __buildhtmlFinishScript, { capture: true, signal: __buildhtmlCompletion.signal });
}
__buildhtmlInstance._prepareBundleScript = placeholder => {
  const originalType = placeholder.getAttribute('type');
  const type = (originalType || '').trim().toLowerCase();
  const isModule = type === 'module';
  const isClassic = !type || /^(?:(?:application|text)\\/(?:x-)?(?:java|ecma)script|text\\/(?:javascript1\\.[0-5]|jscript|livescript))$/.test(type);
  const src = placeholder.getAttribute('src');
  const text = placeholder.textContent;
  if ((!isModule && (!isClassic || placeholder.hasAttribute('nomodule'))) || (src === null && !text)) return placeholder;
  const script = globalThis.document.createElement('script');
  script.async = placeholder.hasAttribute('async');
  for (const attr of placeholder.attributes) {
    if (attr.name !== 'src' && attr.name !== 'type') script.setAttribute(attr.name, attr.value);
  }
  // Keep the same element inert while mounting attaches its lifecycle hooks and listeners.
  script.type = 'application/x-buildhtml-inert';
  const finished = src !== null && new Promise(resolve => __buildhtmlPendingScripts.set(script, resolve));
  __buildhtmlScripts.push({ script, src, text, originalType, finished });
  return script;
};
`;
    }
    const mount = '__buildhtmlInstance.mount(globalThis.document.querySelector("body > div#app"));';
    javascript += bundle.hasBodyScripts
      ? `try { ${mount} } catch (error) { __buildhtmlCompletion.abort(); throw error; }\n`
      : mount + '\n';
    if (bundle.hasBodyScripts) {
      javascript += `delete __buildhtmlInstance._prepareBundleScript;
void (async () => {
for (const { script, src, text, originalType, finished } of __buildhtmlScripts) {
  if (!__buildhtmlInstance.root?.contains(script)) continue;
  script.removeAttribute('src');
  script.textContent = '';
  if (originalType === null) script.removeAttribute('type');
  else script.type = originalType;
  if (src !== null) script.setAttribute('src', src);
  script.textContent = text;
  if (finished && !script.async) await finished;
}
__buildhtmlScripts.length = 0;
`;
    }
    if (authoredScripts.length) {
      // Insert classic scripts separately so they use the page's native global scope.
      javascript += `for (const source of ${safeJsonStringify(authoredScripts)}) {\n  const script = globalThis.document.createElement('script');\n  script.textContent = source;\n  globalThis.document.body.appendChild(script);\n}\n`;
    }
    if (bundle.hasBodyScripts) {
      javascript += `})().catch(error => { globalThis.console.error('Unable to activate bundle body scripts:', error); }).finally(() => __buildhtmlCompletion.abort());\n`;
    }
    // A legacy stylesheet declaration must not override the encoding used for file writes.
    const stylesheet = bundle.headStyles + (elementCssFile ? '' : bundle.elementStyles);
    fs.mkdirSync(directory, { recursive: true });
    // A fixed, same-directory staging path also excludes competing writers of this stem.
    const lockKey = createHash('sha256').update(path.basename(jsFile).toLowerCase()).digest('hex');
    const staging = path.join(directory, `.buildhtml-bundle-${lockKey}`);
    outputPath = staging;
    fs.mkdirSync(staging);
    const files = [
      { destination: cssFile, contents: stylesheet, next: path.join(staging, 'next.css'), previous: path.join(staging, 'previous.css') },
      { destination: jsFile, contents: javascript, next: path.join(staging, 'next.js'), previous: path.join(staging, 'previous.js') },
      { destination: htmlFile, contents: html, next: path.join(staging, 'next.html'), previous: path.join(staging, 'previous.html') },
    ];
    if (elementCssFile) {
      files.unshift({ destination: elementCssFile, contents: bundle.elementStyles, next: path.join(staging, 'next.elements.css'), previous: path.join(staging, 'previous.elements.css') });
    }
    let failure;
    try {
      for (const file of files) {
        outputPath = file.destination;
        const contents = file.destination.endsWith('.css')
          ? '@charset "UTF-8";\n' + file.contents.replace(/^\uFEFF?(?:@charset "[^"\r\n]*";)?/i, '')
          : file.contents;
        fs.writeFileSync(file.next, contents, 'utf8');
        file.existing = fs.lstatSync(file.destination, { throwIfNoEntry: false });
        if (file.existing && !file.existing.isFile() && !file.existing.isSymbolicLink()) {
          throw Object.assign(new Error('Existing bundle output must be a file or symbolic link.'), { code: 'EISDIR' });
        }
        if (file.existing?.isFile()) fs.chmodSync(file.next, file.existing.mode & 0o777);
      }
      for (const file of files) {
        outputPath = file.destination;
        if (file.existing) {
          fs.renameSync(file.destination, file.previous);
          file.backedUp = true;
        }
        fs.renameSync(file.next, file.destination);
        file.published = true;
      }
    } catch (error) {
      failure = error;
      const rollbackErrors = [];
      for (const file of [...files].reverse()) {
        try {
          if (file.backedUp) fs.renameSync(file.previous, file.destination);
          else if (file.published) fs.unlinkSync(file.destination);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      if (rollbackErrors.length) {
        throw Object.assign(new AggregateError([error, ...rollbackErrors],
          `${error.message} Rollback failed. Recovery files remain in ${staging}.`), { code: error.code });
      }
    }
    try {
      for (const file of files) {
        fs.rmSync(file.next, { force: true });
        fs.rmSync(file.previous, { force: true });
      }
      fs.rmdirSync(staging);
    } catch (cleanupError) {
      const result = failure ? failure.message : 'All bundle files were published.';
      throw Object.assign(new AggregateError(failure ? [failure, cleanupError] : [cleanupError],
        `${result} Could not clean up ${staging}: ${cleanupError.message}`), { code: (failure || cleanupError).code });
    }
    if (failure) throw failure;
    return doc;
  } catch (error) {
    const label = typeof outputPath === 'string' ? outputPath : 'bundle';
    const failure = new Error(`[Document.saveBundle] Could not write ${label}: ${error.message}`, { cause: error });
    failure.code = error.code;
    throw failure;
  }
}

module.exports = { compileDocument, saveBundle };
