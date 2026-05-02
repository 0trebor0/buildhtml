'use strict';

const { CONFIG } = require('./config');
const { sanitizeFunctionSource, toKebab, escapeHtml } = require('./utils');

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

  const tag = (def.tag || 'div').toLowerCase();
  const parts = ['<', tag];

  // Inline styles from css + style (same order as _mkEl)
  const styleProps = [];
  if (def.css)   for (const k in def.css)   styleProps.push(toKebab(k) + ':' + def.css[k]);
  if (def.style) for (const k in def.style) styleProps.push(toKebab(k) + ':' + def.style[k]);
  if (styleProps.length) parts.push(' style="', escapeHtml(styleProps.join(';')), '"');

  if (def.id)    parts.push(' id="',    escapeHtml(def.id),    '"');
  if (def.class) {
    const cls = Array.isArray(def.class) ? def.class.join(' ') : def.class;
    parts.push(' class="', escapeHtml(cls), '"');
  }

  if (def.attrs) {
    for (const k in def.attrs) {
      const v = def.attrs[k];
      if (v !== false && v != null) parts.push(' ', k, '="', escapeHtml(String(v)), '"');
    }
  }

  if (def.data) {
    for (const k in def.data) parts.push(' data-', toKebab(k), '="', escapeHtml(String(def.data[k])), '"');
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
    'function mk(d){' +
      'if(!d)return null;' +
      'var e=document.createElement(d.tag||"div");' +
      'if(d.text!=null)e.textContent=String(d.text);' +
      'if(d.id)e.id=d.id;' +
      'if(d.class){e.className=Array.isArray(d.class)?d.class.join(" "):d.class;}' +
      'if(d.attrs){for(var k in d.attrs){var v=d.attrs[k];if(v!==false&&v!=null)e.setAttribute(k,String(v));}}' +
      'if(d.css||d.style){' +
        'var p=[];' +
        'for(var c in(d.css||{}))p.push(kb(c)+":"+d.css[c]);' +
        'for(var s in(d.style||{}))p.push(kb(s)+":"+d.style[s]);' +
        'if(p.length)e.style.cssText=p.join(";");' +
      '}' +
      'if(d.on){for(var ev in d.on){if(typeof d.on[ev]==="function")e.addEventListener(ev,d.on[ev]);}}' +
      'if(d.data){for(var dk in d.data)e.setAttribute("data-"+kb(dk),String(d.data[dk]));} ' +
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
  try {
    sanitizeFunctionSource(itemFn, CONFIG.maxComputedFnSize);
  } catch (err) {
    if (CONFIG.mode === 'dev') console.error('[liveList] invalid itemFn:', err.message);
    return parent.div();
  }

  const filter = options.filter || null;
  if (filter) {
    try { sanitizeFunctionSource(filter, CONFIG.maxComputedFnSize); } catch (err) {
      if (CONFIG.mode === 'dev') console.error('[liveList] invalid filter fn:', err.message);
    }
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
    'var _fn=', itemFn.toString(), ';',
    'var _filter=', filter ? filter.toString() : 'null', ';',
    'var _key=', JSON.stringify(stateKey), ';',
    'var _cid=', JSON.stringify(containerId), ';',
    'function _render(){',
      'var c=document.getElementById(_cid);if(!c)return;',
      'while(c.firstChild)c.removeChild(c.firstChild);',
      'var items=State[_key];if(!Array.isArray(items))return;',
      'for(var i=0;i<items.length;i++){',
        'if(!_filter||_filter(items[i],State)){',
          'var el=window._mkEl(_fn(items[i],i));if(el)c.appendChild(el);',
        '}',
      '}',
    '}',
    watchKeys.map(k => 'watchState(' + JSON.stringify(k) + ',_render);').join(''),
    '_render();',
    '})()',
  ].join('');

  doc.inlineScript(script);
  return container;
}

/**
 * Compile a hash-based router that syncs the URL hash to a State key.
 * Optionally highlights the active nav link.
 *
 * @param {Document} doc
 * @param {object} options
 * @param {string} [options.stateKey='view']  - State key to update on hash change
 * @param {string} [options.default='all']    - Fallback when hash is empty
 * @param {string} [options.navSelector]      - CSS selector for nav links (e.g. 'header a')
 * @param {object} [options.activeStyle]      - Inline styles applied to the active link
 * @param {object} [options.inactiveStyle]    - Inline styles applied to inactive links
 */
function compileHashRouter(doc, options = {}) {
  const stateKey   = options.stateKey  || 'view';
  const defaultVal = options.default   || 'all';
  const navSel     = options.navSelector   || null;
  const activeStyle   = options.activeStyle   || null;
  const inactiveStyle = options.inactiveStyle || null;

  let script = '(function(){';
  script += 'function _go(){';
  script += 'var h=location.hash.slice(1)||' + JSON.stringify(defaultVal) + ';';
  script += 'State.' + stateKey + '=h;';

  if (navSel && (activeStyle || inactiveStyle)) {
    script += 'document.querySelectorAll(' + JSON.stringify(navSel) + ').forEach(function(a){';
    script += 'var act=a.getAttribute("href")==="#"+h;';
    if (activeStyle && inactiveStyle) {
      script += 'var s=act?' + JSON.stringify(activeStyle) + ':' + JSON.stringify(inactiveStyle) + ';';
      script += 'for(var k in s)a.style[k]=s[k];';
    } else if (activeStyle) {
      script += 'if(act){var s=' + JSON.stringify(activeStyle) + ';for(var k in s)a.style[k]=s[k];}';
    } else if (inactiveStyle) {
      script += 'if(!act){var s=' + JSON.stringify(inactiveStyle) + ';for(var k in s)a.style[k]=s[k];}';
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

module.exports = { compileLiveList, compileHashRouter, MK_EL_SRC };
