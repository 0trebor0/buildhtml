'use strict';

const { Element } = require('./element');
const { escapeHtml, sanitizeFunctionSource, VOID_ELEMENTS, isValidAttrKey, escapeJsString, sanitizeUrl, URL_ATTRS } = require('./utils');
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

  if (!hasStates && !hasComputed && !hasEvents && !hasOncreates && !hasGlobalState && !hasStateBindings) return '';

  const ns = '_ssr' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  const p = [
    '(function(){',
    `var ${ns}={state:{}};`,
    'var getById=function(id){return document.getElementById(id);};'
  ];

  if (hasGlobalState || hasStateBindings) {
    p.push(
      'var _cbs={};',
      'window.watchState=function(k,f){(_cbs[k]=_cbs[k]||[]).push(f);};',
      'window.State=new Proxy(' + JSON.stringify(ctx.globalState || {}) + ',{',
      'set:function(t,k,v){if(t[k]===v)return true;t[k]=v;if(_cbs[k])_cbs[k].forEach(function(f){f(v);});return true;}',
      '});'
    );
  }

  if (hasStates) {
    p.push('var initStates=function(){');
    for (const s of ctx.states) {
      const safeId = escapeJsString(s.id);
      const prop = (s.tag === 'input' || s.tag === 'textarea') ? 'value' : 'textContent';
      p.push(
        `${ns}.state["${safeId}"]=${JSON.stringify(s.value)};`,
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
    for (const b of ctx.stateBindings) {
      const safeId = escapeJsString(b.id);
      const safeKey = escapeJsString(b.stateKey);
      const type = b.bindType || 'text';
      let updateExpr;

      if (type === 'show') {
        updateExpr = `el.style.display=(${b.templateFn})(val)?'':'none';`;
      } else if (type === 'class') {
        updateExpr = `var _c=(${b.templateFn})(val);if(typeof _c==='string')el.className=_c;`;
      } else if (type === 'attr') {
        const safeAttr = escapeJsString(b.attrName || '');
        updateExpr = `var _v=(${b.templateFn})(val);if(_v===null||_v===false)el.removeAttribute("${safeAttr}");else el.setAttribute("${safeAttr}",String(_v));`;
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
        `window.watchState("${safeKey}",function(val){`,
        `var el=getById("${safeId}");`,
        `if(el)try{${updateExpr}}catch(e){}`,
        '});',
        `(function(){`,
        `var val=window.State&&window.State["${safeKey}"];`,
        `var el=getById("${safeId}");`,
        `if(el&&val!==undefined)try{${updateExpr}}catch(e){}`,
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

  if (hasOncreates) {
    p.push('var initOncreate=function(){');
    for (const fn of ctx.oncreates) {
      try {
        const src = sanitizeFunctionSource(fn, CONFIG.maxEventFnSize);
        p.push(`(${src})();`);
      } catch (_) {}
    }
    p.push('};');
  }

  const inits = [];
  if (hasStates) inits.push('initStates();');
  if (hasComputed) inits.push('initComputed();');
  if (hasStateBindings) inits.push('initBindings();');
  if (hasEvents) inits.push('initEvents();');
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
