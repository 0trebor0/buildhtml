'use strict';

const { Element } = require('./element');
const { toKebab, escapeHtml, sanitizeFunctionSource, hash } = require('./utils');
const { CONFIG } = require('./config');

const voidElements = new Set([
  'area','base','br','col','embed','hr','img','input',
  'link','meta','param','source','track','wbr'
]);

function renderNode(n, ctx) {
  if (n == null) return '';
  if (!(n instanceof Element)) return String(n);

  const parts = ['<', n.tag];
  for (const k in n.attrs) {
    const v = n.attrs[k];
    if (v != null) parts.push(' ', toKebab(k), '="', escapeHtml(v), '"');
  }
  parts.push('>');

  if (n.cssText) ctx.styles.push(n.cssText);
  if (n._state !== null) ctx.states.push({ id: n.attrs.id, value: n._state, tag: n.tag });
  if (n._computed) {
    try {
      ctx.computed.push({ id: n.attrs.id, fn: sanitizeFunctionSource(n._computed, CONFIG.maxComputedFnSize) });
    } catch (_) {}
  }
  if (n._stateBindings && n._stateBindings.length > 0) ctx.stateBindings.push(...n._stateBindings);

  if (!voidElements.has(n.tag)) {
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

  const ns = '_ssr' + Date.now().toString(36);
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
      const prop = (s.tag === 'input' || s.tag === 'textarea') ? 'value' : 'textContent';
      p.push(
        `${ns}.state["${s.id}"]=${JSON.stringify(s.value)};`,
        `(function(){var el=getById("${s.id}");if(el)el.${prop}=${ns}.state["${s.id}"];})();`
      );
    }
    p.push('};');
  }

  if (hasComputed) {
    p.push('var initComputed=function(){');
    for (const c of ctx.computed) {
      p.push(
        `(function(){var el=getById("${c.id}");`,
        `if(el)try{el.textContent=(${c.fn})(${ns}.state);}catch(e){console.error("Computed error:",e);}`,
        '})();'
      );
    }
    p.push('};');
  }

  if (hasStateBindings) {
    p.push('var initBindings=function(){');
    for (const b of ctx.stateBindings) {
      p.push(
        `window.watchState('${b.stateKey}',function(val){`,
        `var el=getById('${b.id}');`,
        `if(el)try{el.textContent=(${b.templateFn})(val);}catch(e){}`,
        '});',
        `(function(){var el=getById('${b.id}');`,
        `if(el&&window.State['${b.stateKey}']!==undefined)`,
        `try{el.textContent=(${b.templateFn})(window.State['${b.stateKey}']);}catch(e){}`,
        '})();'
      );
    }
    p.push('};');
  }

  if (hasEvents) {
    p.push('var initEvents=function(){');
    for (const e of ctx.events) {
      let fnSource = e.fn.toString();
      if (e.targetId) fnSource = fnSource.replace(/__STATE_ID__/g, e.targetId);
      p.push(
        `(function(){var el=getById("${e.id}");`,
        `if(el)try{el.addEventListener("${e.event}",${fnSource});}catch(err){}`,
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
