'use strict';

const { Element } = require('./element');
const { escapeHtml, sanitizeFunctionSource, VOID_ELEMENTS, isValidAttrKey, escapeJsString, sanitizeUrl, URL_ATTRS, safeJsonStringify } = require('./utils');
const { CONFIG } = require('./config');

function renderNode(n, ctx) {
  if (n == null) return '';
  if (!(n instanceof Element)) return String(n);

  const parts = ['<', n.tag];
  if (n._classes.length > 0) parts.push(' class="', escapeHtml(n._classes.join(' ')), '"');
  for (const k in n.attrs) {
    if (k === 'class') continue;
    if (!isValidAttrKey(k)) continue;
    let v = n.attrs[k];
    if (v == null) continue;
    if (URL_ATTRS.has(k)) v = sanitizeUrl(v);
    parts.push(' ', k, '="', escapeHtml(v), '"');
  }
  parts.push('>');

  if (n.cssText && !ctx.seenCss.has(n.cssText)) {
    ctx.seenCss.add(n.cssText);
    ctx.styles.push(n.cssText);
  }
  if (n._state !== null) ctx.states.push({ id: n.attrs.id, value: n._state, tag: n.tag });
  if (n._computed) {
    // _computed is already a sanitized source string (stored in element.computed())
    ctx.computed.push({ id: n.attrs.id, fn: n._computed });
  }
  if (n._stateBindings && n._stateBindings.length > 0) ctx.stateBindings.push(...n._stateBindings);
  if (n._lifecycle && n._lifecycle.length > 0 && ctx.lifecycles) {
    ctx.lifecycles.push({ id: n.attrs.id, hooks: n._lifecycle });
  }
  if (n._portalTarget && ctx.portals) ctx.portals.push({ id: n.attrs.id, targetId: n._portalTarget });

  if (!VOID_ELEMENTS.has(n.tag)) {
    for (let i = 0; i < n.children.length; i++) {
      const r = renderNode(n.children[i], ctx);
      if (r) parts.push(r);
    }
    parts.push('</', n.tag, '>');
  }

  for (let i = 0; i < n.events.length; i++) ctx.events.push(n.events[i]);

  return parts.join('');
}

function compileClient(ctx) {
  const hasStates = ctx.states.length > 0;
  const hasComputed = ctx.computed.length > 0;
  const hasEvents = ctx.events.length > 0;
  const hasOncreates = ctx.oncreates && ctx.oncreates.length > 0;
  const hasGlobalState = ctx.globalState && Object.keys(ctx.globalState).length > 0;
  const hasStateBindings = ctx.stateBindings && ctx.stateBindings.length > 0;
  const hasLifecycles = ctx.lifecycles && ctx.lifecycles.length > 0;
  const hasPortals = ctx.portals && ctx.portals.length > 0;

  if (!hasStates && !hasComputed && !hasEvents && !hasOncreates && !hasGlobalState && !hasStateBindings && !hasLifecycles && !hasPortals) return '';

  const ns = '_ssr' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  const p = [
    '(function(){',
    `var ${ns}={state:{}};`,
    'var getById=function(id){return document.getElementById(id);};'
  ];

  if (hasGlobalState || hasStateBindings || hasLifecycles) {
    p.push(
      'var _cbs=Object.create(null);',
      'window.watchState=function(k,f){',
      'if(typeof f!=="function")return function(){};',
      'var list=_cbs[k]=_cbs[k]||[],active=true;list.push(f);',
      'return function(){if(!active)return;active=false;var i=list.indexOf(f);if(i!==-1)list.splice(i,1);if(!list.length)delete _cbs[k];};',
      '};',
      'var _trackedTargets=[],_cleanupObserver=null;',
      'function _ensureCleanupObserver(){',
      'if(_cleanupObserver||typeof MutationObserver==="undefined"||!document.body)return;',
      '_cleanupObserver=new MutationObserver(function(){',
      'for(var i=_trackedTargets.length-1;i>=0;i--){var e=_trackedTargets[i];if(e.active&&!getById(e.id))e.stop();}',
      '});',
      '_cleanupObserver.observe(document.body,{childList:true,subtree:true});',
      '}',
      'window._trackStateTarget=function(id,dispose){',
      'var entry={id:id,active:true,dispose:dispose};',
      'entry.stop=function(){if(!entry.active)return;entry.active=false;entry.dispose();var i=_trackedTargets.indexOf(entry);if(i!==-1)_trackedTargets.splice(i,1);if(!_trackedTargets.length&&_cleanupObserver){_cleanupObserver.disconnect();_cleanupObserver=null;}};',
      '_trackedTargets.push(entry);_ensureCleanupObserver();return entry.stop;',
      '};',
      'var _rawState=JSON.parse(' + safeJsonStringify(safeJsonStringify(ctx.globalState || {})) + ');',
      'var _deepCache=new WeakMap(),_proxyRaw=new WeakMap();',
      'function _unwrap(v){return v&&typeof v==="object"?(_proxyRaw.get(v)||v):v;}',
      'function _notify(root){if(_cbs[root]){var value=_deep(_rawState[root],root);_cbs[root].slice().forEach(function(f){f(value);});}}',
      'function _deep(value,root){',
      'if(value===null||typeof value!=="object")return value;',
      'var byRoot=_deepCache.get(value);if(!byRoot){byRoot=new Map();_deepCache.set(value,byRoot);}',
      'if(byRoot.has(root))return byRoot.get(root);',
      'var proxy=new Proxy(value,{',
      'get:function(t,k){return _deep(t[k],root);},',
      'set:function(t,k,v){v=_unwrap(v);if(t[k]===v)return true;t[k]=v;_notify(root);return true;},',
      'deleteProperty:function(t,k){if(!Object.prototype.hasOwnProperty.call(t,k))return true;delete t[k];_notify(root);return true;}',
      '});',
      'byRoot.set(root,proxy);_proxyRaw.set(proxy,value);return proxy;',
      '}',
      'window.State=new Proxy(_rawState,{',
      'get:function(t,k){return _deep(t[k],k);},',
      'set:function(t,k,v){v=_unwrap(v);if(t[k]===v)return true;t[k]=v;_notify(k);return true;},',
      'deleteProperty:function(t,k){if(!Object.prototype.hasOwnProperty.call(t,k))return true;delete t[k];if(_cbs[k])_cbs[k].slice().forEach(function(f){f(undefined);});return true;}',
      '});'
    );
  }

  if (hasStates) {
    p.push('var initStates=function(){');
    for (const s of ctx.states) {
      const safeId = escapeJsString(s.id);
      const prop = (s.tag === 'input' || s.tag === 'textarea') ? 'value' : 'textContent';
      p.push(
        `${ns}.state["${safeId}"]=${safeJsonStringify(s.value)};`,
        `(function(){var el=getById("${safeId}");if(el)el.${prop}=${ns}.state["${safeId}"];})();`
      );
    }
    p.push('};');
  }

  if (hasComputed) {
    p.push('var initComputed=function(){');
    for (const c of ctx.computed) {
      const safeId = escapeJsString(c.id);
      p.push(
        `(function(){var el=getById("${safeId}");`,
        `if(el)try{el.textContent=(${c.fn})(${ns}.state);}catch(e){console.error("Computed error:",e);}`,
        '})();'
      );
    }
    p.push('};');
  }

  if (hasStateBindings) {
    p.push('var initBindings=function(){');
    let bindingIndex = 0;
    for (const b of ctx.stateBindings) {
      const safeId = escapeJsString(b.id);
      const safeKey = escapeJsString(b.stateKey);
      const offVar = `_off${bindingIndex++}`;
      const watchVar = `${offVar}w`;
      const type = b.bindType || 'text';
      let updateExpr;

      if (type === 'show') {
        updateExpr = `el.style.display=(${b.templateFn})(val)?'':'none';`;
      } else if (type === 'class') {
        updateExpr = `var _c=(${b.templateFn})(val);if(typeof _c==='string')el.className=_c;`;
      } else if (type === 'attr') {
        const safeAttr = escapeJsString(b.attrName || '');
        const urlGuard = URL_ATTRS.has(b.attrName)
          ? `var _u=String(_v).replace(/[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]/g,'');_v=/^[\\x00-\\x20]*(?:javascript|vbscript|data)\\s*:/i.test(_u)?'#':_u;`
          : '';
        updateExpr = `var _v=(${b.templateFn})(val);if(_v===null||_v===false)el.removeAttribute("${safeAttr}");else{${urlGuard}el.setAttribute("${safeAttr}",String(_v));}`;
      } else if (type === 'style') {
        updateExpr = `var _s=(${b.templateFn})(val);if(_s&&typeof _s==='object'){for(var _k in _s)el.style[_k]=_s[_k];}`;
      } else if (type === 'prop') {
        const safeProp = escapeJsString(b.prop || 'value');
        updateExpr = `el["${safeProp}"]=(${b.templateFn})(val);`;
      } else {
        // text (default): fn(val) — if it returns a value, set textContent
        updateExpr = `var _r=(${b.templateFn})(val);if(_r!==undefined)el.textContent=_r;`;
      }

      p.push(
        `var ${offVar};`,
        `var ${watchVar}=window.watchState("${safeKey}",function(val){`,
        `var el=getById("${safeId}");`,
        `if(!el){${offVar}();return;}`,
        `try{${updateExpr}}catch(e){}`,
        '});',
        `${offVar}=window._trackStateTarget("${safeId}",${watchVar});`,
        `(function(){`,
        `var val=window.State&&window.State["${safeKey}"];`,
        `var el=getById("${safeId}");`,
        `if(!el){${offVar}();return;}`,
        `if(val!==undefined)try{${updateExpr}}catch(e){}`,
        '})();'
      );
    }
    p.push('};');
  }

  if (hasEvents) {
    p.push('var initEvents=function(){');
    for (const e of ctx.events) {
      const safeId = escapeJsString(e.id);
      const safeEvent = escapeJsString(e.event);
      // e.fn is now always a pre-sanitized source string (stored at validation time).
      // Fallback to toString() only for any legacy callers that stored a function reference.
      let fnSource = typeof e.fn === 'string' ? e.fn : e.fn.toString();
      if (e.targetId) fnSource = fnSource.replace(/__STATE_ID__/g, escapeJsString(e.targetId));
      p.push(
        `(function(){var el=getById("${safeId}");`,
        `if(el)try{el.addEventListener("${safeEvent}",${fnSource});}catch(err){}`,
        '})();'
      );
    }
    p.push('};');
  }

  if (hasPortals) {
    p.push('var initPortals=function(){');
    for (const portal of ctx.portals) {
      const safeId = escapeJsString(portal.id);
      const safeTargetId = escapeJsString(portal.targetId);
      p.push(`(function(){var el=getById("${safeId}");var target=getById("${safeTargetId}");if(el&&target)target.appendChild(el);})();`);
    }
    p.push('};');
  }

  if (hasLifecycles) {
    p.push('var initLifecycles=function(){');
    for (const lifecycle of ctx.lifecycles) {
      const safeId = escapeJsString(lifecycle.id);
      const mounts = lifecycle.hooks.filter(h => h.type === 'mount');
      const updates = lifecycle.hooks.filter(h => h.type === 'update');
      const destroys = lifecycle.hooks.filter(h => h.type === 'destroy');
      p.push(
        '(function(){',
        `var el=getById("${safeId}");if(!el)return;`,
        'var _cleanups=[],_watchers=[],_destroyed=false,_stop;',
        'function _destroy(){if(_destroyed)return;_destroyed=true;',
        'for(var i=0;i<_watchers.length;i++)_watchers[i]();_watchers=[];',
        'for(var j=_cleanups.length-1;j>=0;j--)try{_cleanups[j].call(el);}catch(e){}_cleanups=[];'
      );
      for (const hook of destroys) {
        p.push(`try{(${hook.fn}).call(el,window.State);}catch(e){}`);
      }
      p.push('}');
      p.push(`_stop=window._trackStateTarget("${safeId}",_destroy);`);
      for (const hook of mounts) {
        p.push(`try{var _cleanup=(${hook.fn}).call(el,window.State);if(typeof _cleanup==="function")_cleanups.push(_cleanup);}catch(e){}`);
      }
      for (const hook of updates) {
        const safeKey = escapeJsString(hook.stateKey);
        p.push(
          `_watchers.push(window.watchState("${safeKey}",function(value){`,
          `var current=getById("${safeId}");if(!current){_stop();return;}`,
          `try{(${hook.fn}).call(current,value,window.State);}catch(e){}`,
          '}));'
        );
      }
      p.push('})();');
    }
    p.push('};');
  }

  if (hasOncreates) {
    p.push('var initOncreate=function(){');
    for (const src of ctx.oncreates) {
      // src is already a sanitized source string (stored in document.oncreate())
      p.push(`(${src})();`);
    }
    p.push('};');
  }

  const inits = [];
  if (hasStates) inits.push('initStates();');
  if (hasComputed) inits.push('initComputed();');
  if (hasStateBindings) inits.push('initBindings();');
  if (hasEvents) inits.push('initEvents();');
  if (hasLifecycles) inits.push('initLifecycles();');
  if (hasPortals) inits.push('initPortals();');
  if (hasOncreates) inits.push('initOncreate();');

  const initBlock = inits.join('');
  p.push(
    'if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",function(){' + initBlock + '});}else{' + initBlock + '}',
    `window.${ns}=${ns};`,
    '})();'
  );

  return p.join('');
}

module.exports = { renderNode, compileClient };
