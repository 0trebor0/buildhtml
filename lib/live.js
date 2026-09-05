'use strict';

const { CONFIG } = require('./config');
const { sanitizeFunctionSource, sanitizeUrl, URL_ATTRS, safeJsonStringify, toKebab, escapeHtml, isValidAttrKey, isValidTagName, clientUrlSanitizerBody, clientAttrKeyValidatorBody } = require('./utils');
const { canonicalizeDeclarations, compileScopedRule, clientCssRuntimeSource, RuleSet } = require('./css');

const VOID_TAGS = new Set([
  'area','base','br','col','embed','hr','img','input',
  'link','meta','param','source','track','wbr'
]);

/**
 * Server-side counterpart of _mkEl.
 * Converts a NodeDef plain object to an HTML string matching what _mkEl builds
 * on the client, byte for byte, so hydration changes nothing on screen.
 *
 * `css` and `style` mean here exactly what they mean on an Element: `css`
 * compiles to a scoped class, `style` becomes an inline style attribute. They
 * used to differ — a liveList turned BOTH into inline styles, so the same
 * `css: { color: 'red' }` object produced a shared class in a normal element and
 * a duplicated style attribute on every row of a list. Anything relying on the
 * class existing (a stylesheet override, a `:hover` rule, a test selector)
 * silently did not apply inside a list.
 *
 * @param {object|string} def
 * @param {RuleSet} [sink] collects the compiled class rules. Omit it only when
 *   the caller is discarding the CSS as well as the markup; `compileLiveList()`
 *   always passes one so the rules reach the page's <style> block.
 */
function nodeDefToHtml(def, sink) {
  if (!def) return '';
  if (typeof def === 'string') return escapeHtml(def);
  if ('if' in def && !def.if) return '';

  const candidateTag = toKebab(typeof def.tag === 'string' ? def.tag : 'div');
  const tag = isValidTagName(candidateTag) ? candidateTag : 'div';
  const parts = ['<', tag];

  // `style` only. Declarations are validated and canonically ordered by the same
  // compiler the Element path uses; this branch previously kebab-cased and
  // sanitised values by hand, and so never validated a property NAME at all.
  if (def.style) {
    const declarations = canonicalizeDeclarations(def.style);
    if (declarations.length) {
      parts.push(' style="', escapeHtml(declarations.map(([p, v]) => `${p}:${v}`).join(';')), '"');
    }
  }

  if (def.id)    parts.push(' id="',    escapeHtml(def.id),    '"');

  // `css` becomes a scoped class, appended after the author's own classes so the
  // client rebuild — which appends in the same order — produces the same string.
  const classes = [];
  if (def.class) {
    const authored = Array.isArray(def.class) ? def.class : String(def.class).split(/\s+/);
    for (const name of authored) if (name) classes.push(name);
  }
  if (def.css) {
    const rule = compileScopedRule(def.css, { prefix: 'c' });
    if (rule) {
      if (sink) sink.add(rule.className, rule.css);
      classes.push(rule.className);
    }
  }
  if (classes.length) parts.push(' class="', escapeHtml(classes.join(' ')), '"');

  if (def.attrs) {
    for (const k in def.attrs) {
      if (!isValidAttrKey(k)) continue;
      let v = def.attrs[k];
      if (URL_ATTRS.has(k)) v = sanitizeUrl(v);
      if (v !== false && v != null) parts.push(' ', k, '="', escapeHtml(String(v)), '"');
    }
  }

  if (def.data) {
    for (const k in def.data) {
      const attr = 'data-' + toKebab(k);
      if (isValidAttrKey(attr)) parts.push(' ', attr, '="', escapeHtml(String(def.data[k])), '"');
    }
  }

  if (def.aria) {
    for (const k in def.aria) {
      const attr = 'aria-' + toKebab(k);
      if (isValidAttrKey(attr)) parts.push(' ', attr, '="', escapeHtml(String(def.aria[k])), '"');
    }
  }

  parts.push('>');

  if (!VOID_TAGS.has(tag)) {
    if (def.text != null) parts.push(escapeHtml(String(def.text)));
    if (def.html != null) parts.push(String(def.html));
    if (def.children) {
      for (const child of def.children) parts.push(nodeDefToHtml(child, sink));
    }
    parts.push('</', tag, '>');
  }

  return parts.join('');
}

// Client-side mini DOM builder — defined once per page as window._mkEl.
// Converts a NodeDef plain object into an actual DOM element.
// Intentionally written in ES5 for broad compatibility.
const MK_EL_SRC =
  'window._mkEl=(function(){' +
    'function kb(s){return s.replace(/([A-Z])/g,function(m){return"-"+m.toLowerCase();});}' +
    // Generated, not copied. The old literal omitted the optional dash, so it
    // accepted "on-click" — the kebab form of attr('onClick') — as an ordinary
    // attribute and set a live inline handler that SSR had refused.
    'function ak(k){' + clientAttrKeyValidatorBody('k') + '}' +
    // Generated from the shared source in utils, not hand-copied: this literal
    // used to omit tab, LF and CR, so a list item could carry "java\tscript:"
    // straight into an href after the server-side check had been widened.
    'function uv(v){' + clientUrlSanitizerBody('v') + '}' +
    // Generated, not copied. The old literal also stripped quotes, so a
    // client-rebuilt node silently lost them from values that need them —
    // font-family: "Fira Code" became font-family: Fira Code after hydration.
    // The CSS compiler: kebab-casing, property validation, canonical ordering,
    // the FNV-1a class hash, and a runtime <style> element the minted rules are
    // appended to. Generated from lib/css.js so the class a rebuilt row gets is
    // the same class the server rendered — test/test-css.js asserts that parity
    // over a corpus, because two implementations of one hash is exactly how the
    // URL and attribute guards drifted before.
    clientCssRuntimeSource() +
    'function mk(d){' +
      'if(!d)return null;' +
      'if(typeof d==="string")return document.createTextNode(d);' +
      'if("if" in d&&!d["if"])return null;' +
      'var t=kb(typeof d.tag==="string"?d.tag:"div");if(!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(t))t="div";' +
      'var e=document.createElement(t);' +
      'if(d.text!=null)e.textContent=String(d.text);' +
      'if(d.html!=null)e.innerHTML=d.html;' +
      'if(d.id)e.id=d.id;' +
      // Author classes first, then the class minted from `css` — the same order
      // nodeDefToHtml() writes them in, so SSR and rebuild agree character for
      // character.
      'var _cl=[];' +
      'if(d.class){var _ac=Array.isArray(d.class)?d.class:String(d.class).split(/\\s+/);' +
      'for(var _i=0;_i<_ac.length;_i++)if(_ac[_i])_cl.push(_ac[_i]);}' +
      'if(d.css){var _cc=_bhCssClass(d.css);if(_cc)_cl.push(_cc);}' +
      'if(_cl.length)e.className=_cl.join(" ");' +
      'if(d.attrs){for(var k in d.attrs){var v=d.attrs[k];if(ak(k)&&v!==false&&v!=null){if(/^(?:href|src|action|formaction|cite|poster|xlink:href)$/.test(k))v=uv(v);e.setAttribute(k,String(v));}}}' +
      // `style` stays inline, and is the only thing that does.
      'if(d.style){var _sd=_bhDecls(d.style);if(_sd)e.style.cssText=_sd;}' +
      'if(d.on){for(var ev in d.on){if(typeof d.on[ev]==="function")e.addEventListener(ev,d.on[ev]);}}' +
      'if(d.data){for(var dk in d.data){var da="data-"+kb(dk);if(ak(da))e.setAttribute(da,String(d.data[dk]));}} ' +
      'if(d.aria){for(var ar in d.aria){var aa="aria-"+kb(ar);if(ak(aa))e.setAttribute(aa,String(d.aria[ar]));}} ' +
      'if(d.children){for(var i=0;i<d.children.length;i++){var ch=mk(d.children[i]);if(ch)e.appendChild(ch);}}' +
      'return e;' +
    '}' +
    'return mk;' +
  '})();';

/**
 * Compile a reactive list into the document.
 *
 * The server renders the initial items using buildhtml's normal API (via buildNode).
 * The client watches State[stateKey] (and any filterKeys) and re-renders the list
 * using a serialized itemFn + the _mkEl mini runtime.
 *
 * @param {Document} doc         - The root document (for inlineScript + globalState)
 * @param {Element|Document} parent - Where the container element is created
 * @param {string} stateKey      - State key holding the array (e.g. 'tasks')
 * @param {Function} itemFn      - (item, index) => NodeDef — MUST return a plain object
 * @param {object} options
 * @param {Function} [options.filter]     - (item, State) => boolean — client-side filter
 * @param {string[]} [options.filterKeys] - Extra state keys that trigger a re-render
 */
function compileLiveList(doc, parent, stateKey, itemFn, options = {}) {
  if (!options || typeof options !== 'object') options = {};
  let itemFnSource;
  try {
    itemFnSource = sanitizeFunctionSource(itemFn, CONFIG.maxComputedFnSize);
  } catch (err) {
    if (typeof doc._recordCallbackFailure === 'function') doc._recordCallbackFailure('liveList:item', err);
    if (CONFIG.mode === 'dev') console.error('[liveList] invalid itemFn:', err.message);
    return parent.div();
  }

  const filter = options.filter || null;
  let filterSource = null;
  if (filter) {
    try { filterSource = sanitizeFunctionSource(filter, CONFIG.maxComputedFnSize); } catch (err) {
      if (typeof doc._recordCallbackFailure === 'function') doc._recordCallbackFailure('liveList:filter', err);
      if (CONFIG.mode === 'dev') console.error('[liveList] invalid filter fn:', err.message);
    }
  }

  const sort = options.sort || null;
  let sortSource = null;
  if (sort) {
    try { sortSource = sanitizeFunctionSource(sort, CONFIG.maxComputedFnSize); } catch (err) {
      if (typeof doc._recordCallbackFailure === 'function') doc._recordCallbackFailure('liveList:sort', err);
      if (CONFIG.mode === 'dev') console.error('[liveList] invalid sort fn:', err.message);
    }
  }

  // Dev-mode warning if stateKey is not in globalState — catches typos early
  if (CONFIG.mode === 'dev' && !(stateKey in doc._globalState)) {
    console.warn(`[liveList] stateKey "${stateKey}" not found in doc.states(). Did you forget to call doc.states({ ${stateKey}: [] })?`);
  }

  // Container element — created as a child of parent
  const container = parent.div();
  if (!container.attrs.id) container.id();
  const containerId = container.attrs.id;
  doc._callbackSources.push({ source: itemFnSource, callbackType: 'liveList:item', element: container });
  if (filterSource) doc._callbackSources.push({ source: filterSource, callbackType: 'liveList:filter', element: container });
  if (sortSource) doc._callbackSources.push({ source: sortSource, callbackType: 'liveList:sort', element: container });

  // Server-side: render initial items as inline-styled HTML.
  // Uses nodeDefToHtml (not buildNode) so:
  //   - No scoped CSS classes added to <head> that would be orphaned after _render()
  //   - No events compiled into initEvents for elements that _render() will replace
  //   - SSR output matches _mkEl output exactly — zero visual change on hydration
  const items = Array.isArray(doc._globalState[stateKey]) ? doc._globalState[stateKey] : [];
  const visibleItems = items.filter(item => !filter || filter(item, doc._globalState));
  if (sortSource) visibleItems.sort((a, b) => sort(a, b, doc._globalState));
  // Classes minted while rendering the initial rows are collected here and
  // attached to the container, so the ordinary render path emits them into the
  // page's <style> block. Identical rows share one rule instead of repeating a
  // style attribute per row, which is the point of `css` meaning a class.
  const ruleSink = new RuleSet();
  for (let i = 0; i < visibleItems.length; i++) {
    const def = itemFn(visibleItems[i], i);
    if (def) container.appendUnsafe(nodeDefToHtml(def, ruleSink));
  }
  if (visibleItems.length === 0 && options.empty) container.appendUnsafe(nodeDefToHtml(options.empty, ruleSink));
  for (const [key, css] of ruleSink.entries()) container._cssRules.add(key, css);

  // Emit _mkEl runtime once per document
  if (!doc._mkElDefined) {
    doc._mkElDefined = true;
    doc.inlineScript(MK_EL_SRC);
  }

  // Reactive client-side re-render script
  const filterKeys = options.filterKeys || [];
  const sortKeys = options.sortKeys || [];
  const watchKeys = [...new Set([stateKey, ...filterKeys, ...sortKeys])];

  const script = [
    '(function(){',
    'var _fn=', itemFnSource, ';',
    'var _filter=', filterSource || 'null', ';',
    'var _sort=', sortSource || 'null', ';',
    'var _empty=', safeJsonStringify(options.empty || null), ';',
    'var _key=', safeJsonStringify(stateKey), ';',
    'var _cid=', safeJsonStringify(containerId), ';',
    'var _stop;',
    'function _report(type,error){if(window.BuildHTML&&typeof window.BuildHTML._reportClientError==="function")window.BuildHTML._reportClientError({type:type,stateKey:_key,elementId:_cid,tag:"div"},error);}',
    'function _render(){',
      'var c=document.getElementById(_cid);if(!c){if(_stop)_stop();return;}',
      'while(c.firstChild)c.removeChild(c.firstChild);',
      'var items=State[_key];if(!Array.isArray(items))return;var visible=[];',
      'for(var i=0;i<items.length;i++)try{if(!_filter||_filter(items[i],State))visible.push(items[i]);}catch(error){_report("liveList:filter",error);}',
      'items=visible;',
      'if(_sort)try{items.sort(function(a,b){return _sort(a,b,State);});}catch(error){_report("liveList:sort",error);}',
      'var rendered=0;',
      'for(var i=0;i<items.length;i++){try{',
        'var el=window._mkEl(_fn(items[i],i));if(el){c.appendChild(el);rendered++;}',
        '}catch(error){_report("liveList:item",error);}',
      '}',
      'if(rendered===0&&_empty){var emptyEl=window._mkEl(_empty);if(emptyEl)c.appendChild(emptyEl);}',
    '}',
    'var _watchers=[',
    watchKeys.map(k => 'watchState(' + safeJsonStringify(k) + ',_render)').join(','),
    '];',
    '_stop=window._trackStateTarget(_cid,function(){for(var i=0;i<_watchers.length;i++)_watchers[i]();_watchers=[];});',
    '_render();',
    '})()',
  ].join('');

  doc.inlineScript(script);
  return container;
}

function routeMatcherSource(routes) {
  return 'var _routes=' + safeJsonStringify(routes) + ';' +
    'function _parts(p){p=p.replace(/^\\/+|\\/+$/g,"");return p?p.split("/"):[];}' +
    'function _match(path){var actual=_parts(path),fallback=null;' +
    'for(var i=0;i<_routes.length;i++){var pattern=_routes[i][0],value=_routes[i][1];' +
    'if(pattern==="*"){fallback={value:value,params:{}};continue;}' +
    'var expected=_parts(pattern);if(expected.length!==actual.length)continue;' +
    'var params={},ok=true;for(var j=0;j<expected.length;j++){var segment=actual[j];' +
    'try{segment=decodeURIComponent(segment);}catch(e){}' +
    'if(expected[j].charAt(0)===":"){params[expected[j].slice(1)]=segment;}' +
    'else if(expected[j]!==segment){ok=false;break;}}' +
    'if(ok)return{value:value,params:params};}return fallback;}';
}

/**
 * Compile a hash-based router that syncs the URL hash to a State key.
 * Optionally highlights the active nav link.
 *
 * @param {Document} doc
 * @param {object} options
 * @param {string} [options.stateKey='view']  - State key to update on hash change
 * @param {string} [options.default='all']    - Fallback when hash is empty
 * @param {object} [options.routes]            - Route patterns mapped to state values
 * @param {string} [options.paramsKey='routeParams'] - State key for named parameters
 * @param {string} [options.notFound='not-found'] - State value for unmatched routes
 * @param {string} [options.navSelector]      - CSS selector for nav links (e.g. 'header a')
 * @param {object} [options.activeStyle]      - Inline styles applied to the active link
 * @param {object} [options.inactiveStyle]    - Inline styles applied to inactive links
 */
function compileHashRouter(doc, options = {}) {
  // A default only applies to undefined; null reaches the property reads below.
  if (!options || typeof options !== 'object') options = {};
  const stateKey   = options.stateKey  || 'view';
  const defaultVal = options.default   || 'all';
  const routes     = options.routes && typeof options.routes === 'object' && !Array.isArray(options.routes)
    ? Object.entries(options.routes).filter(([pattern, value]) => typeof pattern === 'string' && typeof value === 'string')
    : null;
  const paramsKey  = options.paramsKey || 'routeParams';
  const notFound   = options.notFound  || 'not-found';
  const navSel     = options.navSelector   || null;
  const activeStyle   = options.activeStyle   || null;
  const inactiveStyle = options.inactiveStyle || null;

  let script = '(function(){';
  if (routes) script += routeMatcherSource(routes);
  script += 'function _go(){';
  script += 'var h=location.hash.slice(1)||' + safeJsonStringify(defaultVal) + ';';
  if (routes) {
    script += 'var m=_match(h);';
    script += 'State[' + safeJsonStringify(paramsKey) + ']=m?m.params:{};';
    script += 'State[' + safeJsonStringify(stateKey) + ']=m?m.value:' + safeJsonStringify(notFound) + ';';
  } else {
    script += 'State[' + safeJsonStringify(stateKey) + ']=h;';
  }

  if (navSel && (activeStyle || inactiveStyle)) {
    script += 'document.querySelectorAll(' + safeJsonStringify(navSel) + ').forEach(function(a){';
    script += 'var act=a.getAttribute("href")==="#"+h;';
    if (activeStyle && inactiveStyle) {
      script += 'var s=act?' + safeJsonStringify(activeStyle) + ':' + safeJsonStringify(inactiveStyle) + ';';
      script += 'for(var k in s)a.style[k]=s[k];';
    } else if (activeStyle) {
      script += 'if(act){var s=' + safeJsonStringify(activeStyle) + ';for(var k in s)a.style[k]=s[k];}';
    } else if (inactiveStyle) {
      script += 'if(!act){var s=' + safeJsonStringify(inactiveStyle) + ';for(var k in s)a.style[k]=s[k];}';
    }
    script += '});';
  }

  script += '}';
  script += 'window.addEventListener("hashchange",_go);';
  script += '_go();';
  script += '})()';

  doc.inlineScript(script);
  return doc;
}

/**
 * Compile a History API router that syncs location.pathname to a State key,
 * intercepts opted-in same-origin links, and handles back/forward navigation.
 *
 * @param {Document} doc
 * @param {object} options
 * @param {string} [options.stateKey='view']
 * @param {string} [options.default='/']
 * @param {object} [options.routes]
 * @param {string} [options.paramsKey='routeParams']
 * @param {string} [options.notFound='not-found']
 * @param {string} [options.base='/']
 * @param {string} [options.linkSelector='a[data-route]']
 * @param {string} [options.navSelector]
 * @param {object} [options.activeStyle]
 * @param {object} [options.inactiveStyle]
 */
function compileHistoryRouter(doc, options = {}) {
  if (!options || typeof options !== 'object') options = {};
  const stateKey   = options.stateKey || 'view';
  const defaultVal = options.default  || '/';
  const routes     = options.routes && typeof options.routes === 'object' && !Array.isArray(options.routes)
    ? Object.entries(options.routes).filter(([pattern, value]) => typeof pattern === 'string' && typeof value === 'string')
    : null;
  const paramsKey  = options.paramsKey || 'routeParams';
  const notFound   = options.notFound  || 'not-found';
  const rawBase    = typeof options.base === 'string' ? options.base : '/';
  const base       = ('/' + rawBase.replace(/^\/+|\/+$/g, '')) || '/';
  const linkSel    = options.linkSelector || 'a[data-route]';
  const navSel     = options.navSelector || null;
  const activeStyle   = options.activeStyle || null;
  const inactiveStyle = options.inactiveStyle || null;

  let script = '(function(){';
  script += 'var _base=' + safeJsonStringify(base) + ';';
  if (routes) script += routeMatcherSource(routes);
  script += 'function _path(){var p=location.pathname;';
  script += 'if(_base!=="/"&&(p===_base||p.indexOf(_base+"/")===0))p=p.slice(_base.length);';
  script += 'return p||' + safeJsonStringify(defaultVal) + ';}';
  script += 'function _go(){var p=_path();';
  if (routes) {
    script += 'var m=_match(p);';
    script += 'State[' + safeJsonStringify(paramsKey) + ']=m?m.params:{};';
    script += 'State[' + safeJsonStringify(stateKey) + ']=m?m.value:' + safeJsonStringify(notFound) + ';';
  } else {
    script += 'State[' + safeJsonStringify(stateKey) + ']=p;';
  }

  if (navSel && (activeStyle || inactiveStyle)) {
    script += 'document.querySelectorAll(' + safeJsonStringify(navSel) + ').forEach(function(a){';
    script += 'var act=false;try{act=new URL(a.href,location.href).pathname===location.pathname;}catch(e){}';
    if (activeStyle && inactiveStyle) {
      script += 'var s=act?' + safeJsonStringify(activeStyle) + ':' + safeJsonStringify(inactiveStyle) + ';';
      script += 'for(var k in s)a.style[k]=s[k];';
    } else if (activeStyle) {
      script += 'if(act){var s=' + safeJsonStringify(activeStyle) + ';for(var k in s)a.style[k]=s[k];}';
    } else if (inactiveStyle) {
      script += 'if(!act){var s=' + safeJsonStringify(inactiveStyle) + ';for(var k in s)a.style[k]=s[k];}';
    }
    script += '});';
  }

  script += '}';
  script += 'window.addEventListener("popstate",_go);';
  script += 'document.addEventListener("click",function(e){';
  script += 'if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;';
  script += 'var a=e.target&&e.target.closest?e.target.closest(' + safeJsonStringify(linkSel) + '):null;';
  script += 'if(!a||(a.target&&a.target!=="_self")||a.hasAttribute("download"))return;';
  script += 'var u;try{u=new URL(a.href,location.href);}catch(err){return;}';
  script += 'if(u.origin!==location.origin)return;';
  script += 'if(_base!=="/"&&u.pathname!==_base&&u.pathname.indexOf(_base+"/")!==0)return;';
  script += 'e.preventDefault();history.pushState(null,"",u.pathname+u.search+u.hash);_go();';
  script += '});';
  script += '_go();';
  script += '})()';

  doc.inlineScript(script);
  return doc;
}

/** Compile non-URL view switching driven by data attributes and reactive state. */
function compileViews(doc, options = {}) {
  if (!options || typeof options !== 'object') options = {};
  const stateKey = typeof options.stateKey === 'string' && options.stateKey ? options.stateKey : 'activeView';
  const defaultValue = options.default === undefined ? 'default' : options.default;
  const requestedNav = options.navigation || options.navSelector;
  const navSelector = typeof requestedNav === 'string' && requestedNav.trim() ? requestedNav : '[data-view-nav]';
  const viewSelector = typeof options.viewSelector === 'string' && options.viewSelector.trim() ? options.viewSelector : '[data-view]';
  const activeClass = typeof options.activeClass === 'string' && options.activeClass.trim() && !/\s/.test(options.activeClass.trim())
    ? options.activeClass.trim()
    : 'active';

  if (!Object.prototype.hasOwnProperty.call(doc._globalState, stateKey)) doc.state(stateKey, defaultValue);

  let script = '(function(){';
  script += 'var key=' + safeJsonStringify(stateKey) + ',navSelector=' + safeJsonStringify(navSelector) + ',viewSelector=' + safeJsonStringify(viewSelector) + ',activeClass=' + safeJsonStringify(activeClass) + ';';
  script += 'function valueOf(el){return el.getAttribute("data-view-nav")||el.getAttribute("data-view");}';
  script += 'function render(value){';
  script += 'document.querySelectorAll(viewSelector).forEach(function(el){if(el.matches(navSelector))return;el.hidden=valueOf(el)!==String(value);});';
  script += 'document.querySelectorAll(navSelector).forEach(function(el){var active=valueOf(el)===String(value);el.classList.toggle(activeClass,active);if(active)el.setAttribute("aria-current","page");else el.removeAttribute("aria-current");});';
  script += '}';
  script += 'document.addEventListener("click",function(event){var target=event.target&&event.target.closest?event.target.closest(navSelector):null;if(!target)return;var value=valueOf(target);if(value===null)return;if(target.tagName==="A")event.preventDefault();State[key]=value;});';
  script += 'watchState(key,render);render(State[key]);';
  script += '})()';
  doc.inlineScript(script);
  return doc;
}

module.exports = { compileLiveList, compileHashRouter, compileHistoryRouter, compileViews, MK_EL_SRC, nodeDefToHtml };
