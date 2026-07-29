'use strict';

const { CONFIG } = require('./config');
const { sanitizeFunctionSource, sanitizeCssValue, sanitizeUrl, URL_ATTRS, safeJsonStringify, toKebab, escapeHtml, isValidAttrKey } = require('./utils');

const VOID_TAGS = new Set([
  'area','base','br','col','embed','hr','img','input',
  'link','meta','param','source','track','wbr'
]);

/**
 * Server-side counterpart of _mkEl.
 * Converts a NodeDef plain object to an HTML string using inline styles,
 * exactly matching what _mkEl produces on the client.
 * No scoped CSS classes, no event compilation — clean SSR with zero waste.
 */
function nodeDefToHtml(def) {
  if (!def) return '';
  if (typeof def === 'string') return escapeHtml(def);
  if ('if' in def && !def.if) return '';

  const tag = (def.tag || 'div').toLowerCase();
  const parts = ['<', tag];

  // Inline styles from css + style (same order as _mkEl)
  const styleProps = [];
  if (def.css)   for (const k in def.css)   styleProps.push(toKebab(k) + ':' + sanitizeCssValue(def.css[k]));
  if (def.style) for (const k in def.style) styleProps.push(toKebab(k) + ':' + sanitizeCssValue(def.style[k]));
  if (styleProps.length) parts.push(' style="', escapeHtml(styleProps.join(';')), '"');

  if (def.id)    parts.push(' id="',    escapeHtml(def.id),    '"');
  if (def.class) {
    const cls = Array.isArray(def.class) ? def.class.join(' ') : def.class;
    parts.push(' class="', escapeHtml(cls), '"');
  }

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
      for (const child of def.children) parts.push(nodeDefToHtml(child));
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
    'function ak(k){return/^[a-zA-Z_][\\w\\-:.]*$/.test(k)&&!/^on[a-z]/i.test(k);}' +
    'function uv(v){var s=String(v).replace(/[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]/g,"");return/^[\\x00-\\x20]*(?:javascript|vbscript|data)\\s*:/i.test(s)?"#":s;}' +
    'function sv(v){return String(v).replace(/[<>"\'{};\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]|\\/\\*|\\*\\/|expression\\s*\\(|url\\s*\\(\\s*["\']?\\s*(?:javascript|vbscript|data):/gi,"").slice(0,1000);}' +
    'function mk(d){' +
      'if(!d)return null;' +
      'if(typeof d==="string")return document.createTextNode(d);' +
      'if("if" in d&&!d["if"])return null;' +
      'var e=document.createElement(d.tag||"div");' +
      'if(d.text!=null)e.textContent=String(d.text);' +
      'if(d.html!=null)e.innerHTML=d.html;' +
      'if(d.id)e.id=d.id;' +
      'if(d.class){e.className=Array.isArray(d.class)?d.class.join(" "):d.class;}' +
      'if(d.attrs){for(var k in d.attrs){var v=d.attrs[k];if(ak(k)&&v!==false&&v!=null){if(/^(?:href|src|action|formaction|cite|poster|xlink:href)$/.test(k))v=uv(v);e.setAttribute(k,String(v));}}}' +
      'if(d.css||d.style){' +
        'var p=[];' +
        'for(var c in(d.css||{}))p.push(kb(c)+":"+sv(d.css[c]));' +
        'for(var s in(d.style||{}))p.push(kb(s)+":"+sv(d.style[s]));' +
        'if(p.length)e.style.cssText=p.join(";");' +
      '}' +
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
  let itemFnSource;
  try {
    itemFnSource = sanitizeFunctionSource(itemFn, CONFIG.maxComputedFnSize);
  } catch (err) {
    if (CONFIG.mode === 'dev') console.error('[liveList] invalid itemFn:', err.message);
    return parent.div();
  }

  const filter = options.filter || null;
  let filterSource = null;
  if (filter) {
    try { filterSource = sanitizeFunctionSource(filter, CONFIG.maxComputedFnSize); } catch (err) {
      if (CONFIG.mode === 'dev') console.error('[liveList] invalid filter fn:', err.message);
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

  // Server-side: render initial items as inline-styled HTML.
  // Uses nodeDefToHtml (not buildNode) so:
  //   - No scoped CSS classes added to <head> that would be orphaned after _render()
  //   - No events compiled into initEvents for elements that _render() will replace
  //   - SSR output matches _mkEl output exactly — zero visual change on hydration
  const items = doc._globalState[stateKey] || [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!filter || filter(item, doc._globalState)) {
      const def = itemFn(item, i);
      if (def) container.appendUnsafe(nodeDefToHtml(def));
    }
  }

  // Emit _mkEl runtime once per document
  if (!doc._mkElDefined) {
    doc._mkElDefined = true;
    doc.inlineScript(MK_EL_SRC);
  }

  // Reactive client-side re-render script
  const filterKeys = options.filterKeys || [];
  const watchKeys = [stateKey, ...filterKeys];

  const script = [
    '(function(){',
    'var _fn=', itemFnSource, ';',
    'var _filter=', filterSource || 'null', ';',
    'var _key=', safeJsonStringify(stateKey), ';',
    'var _cid=', safeJsonStringify(containerId), ';',
    'var _stop;',
    'function _render(){',
      'var c=document.getElementById(_cid);if(!c){if(_stop)_stop();return;}',
      'while(c.firstChild)c.removeChild(c.firstChild);',
      'var items=State[_key];if(!Array.isArray(items))return;',
      'for(var i=0;i<items.length;i++){',
        'if(!_filter||_filter(items[i],State)){',
          'var el=window._mkEl(_fn(items[i],i));if(el)c.appendChild(el);',
        '}',
      '}',
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

module.exports = { compileLiveList, compileHashRouter, compileHistoryRouter, MK_EL_SRC, nodeDefToHtml };
