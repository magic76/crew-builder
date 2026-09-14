(() => {
  const STYLE_KEY = 'crew-forge.live-style';
  const LANGUAGE_KEY = 'crew-forge.live-language';
  const liveBtn = document.getElementById('liveBtn');
  const liveLabel = document.getElementById('liveLabel');
  const styleSelect = document.getElementById('liveStyleSelect');
  const languageSelect = document.getElementById('liveLanguageSelect');
  const preview = document.getElementById('preview');
  const actionRegistry = new Map();
  const pendingActions = new Map();
  const describeWaiters = [];
  let liveState = 'stopped';
  let actionSeq = 0;

  if (styleSelect) styleSelect.value = localStorage.getItem(STYLE_KEY) || 'concise';
  if (languageSelect) languageSelect.value = localStorage.getItem(LANGUAGE_KEY) || 'auto';
  styleSelect?.addEventListener('change', () => localStorage.setItem(STYLE_KEY, styleSelect.value || 'concise'));
  languageSelect?.addEventListener('change', () => localStorage.setItem(LANGUAGE_KEY, languageSelect.value || 'auto'));

  const setState = (state, message) => {
    liveState = state;
    liveBtn?.classList.toggle('active', state === 'ready');
    liveBtn?.classList.toggle('connecting', state === 'connecting');
    if (liveLabel) liveLabel.textContent = state === 'ready' ? 'Listening' : state === 'connecting' ? 'Connecting' : 'Live';
    if (message && window.showToast) window.showToast(message, state === 'error');
  };

  const app = () => window.getActiveApp?.();
  const context = () => {
    const current = app();
    return JSON.stringify({
      app: current ? { id: current.id, name: current.name, summary: current.summary } : null,
      actions: current ? (actionRegistry.get(current.id) || []) : [],
      live: {
        style: localStorage.getItem(STYLE_KEY) || 'concise',
        language: localStorage.getItem(LANGUAGE_KEY) || 'auto',
        interruption: 'finish-speaking-first'
      }
    });
  };

  function freshActions(timeoutMs = 700) {
    return new Promise((resolve) => {
      const current = app();
      if (!current || !preview?.contentWindow) return resolve([]);
      let settled = false;
      const finish = (actions) => {
        if (settled) return;
        settled = true;
        resolve(Array.isArray(actions) ? actions : []);
      };
      describeWaiters.push({ appId: current.id, finish });
      preview.contentWindow.postMessage({ __crewLive: true, type: 'describe', appId: current.id }, '*');
      setTimeout(() => finish(actionRegistry.get(current.id) || []), timeoutMs);
    });
  }

  liveBtn?.addEventListener('click', async () => {
    if (!window.CrewNative?.startGeminiLive) return window.showToast?.('Live requires the Android app', true);
    if (liveState === 'ready' || liveState === 'connecting') {
      window.CrewNative.stopGeminiLive();
      setState('stopped');
      return;
    }
    if (!window.CrewAI?.hasApiKey?.()) return window.openSettings?.();
    setState('connecting', 'Reading app controls…');
    await freshActions();
    window.CrewNative.startGeminiLive(context());
  });

  window.addEventListener('message', (event) => {
    if (event.source !== preview?.contentWindow) return;
    const msg = event.data || {};
    if (!msg.__crewLive) return;
    const current = app();
    if (!current || msg.appId !== current.id) return;
    if (msg.type === 'register') {
      const actions = Array.isArray(msg.actions) ? msg.actions : [];
      actionRegistry.set(current.id, actions);
      for (let i = describeWaiters.length - 1; i >= 0; i--) {
        const waiter = describeWaiters[i];
        if (waiter.appId === current.id) {
          describeWaiters.splice(i, 1);
          waiter.finish(actions);
        }
      }
    }
    if (msg.type === 'result' && pendingActions.has(msg.id)) {
      const pending = pendingActions.get(msg.id);
      pendingActions.delete(msg.id);
      pending(msg);
    }
  });

  function executeAction(name, args) {
    return new Promise((resolve) => {
      const current = app();
      if (!current || !preview?.contentWindow) return resolve({ ok: false, error: 'No active app' });
      const id = `live_${Date.now()}_${++actionSeq}`;
      pendingActions.set(id, (msg) => resolve(msg.error ? { ok: false, error: msg.error } : { ok: true, result: msg.result ?? null }));
      preview.contentWindow.postMessage({ __crewLive: true, type: 'execute', id, appId: current.id, name, args }, '*');
      setTimeout(() => {
        if (!pendingActions.has(id)) return;
        pendingActions.delete(id);
        resolve({ ok: false, error: 'App action timed out' });
      }, 5000);
    });
  }

  window.__crewLiveEvent = async (raw) => {
    let event;
    try { event = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { return; }
    if (event.type === 'state') {
      setState(event.state, event.message);
      return;
    }
    if (event.type !== 'tool') return;

    let result = { ok: false, error: 'Unknown tool' };
    if (event.name === 'inspect_app') {
      result = { ok: true, actions: await freshActions(900) };
    } else if (event.name === 'app_action') {
      let args = {};
      try { args = JSON.parse(event.args?.args_json || '{}'); } catch (_) {}
      result = await executeAction(event.args?.name || '', args);
    } else if (event.name === 'modify_app') {
      const request = String(event.args?.request || '').trim();
      if (request && window.modifyApp) {
        window.CrewNative.respondGeminiLive(event.id, event.name, JSON.stringify({ ok: true, status: 'builder_started' }));
        window.CrewNative.stopGeminiLive();
        setState('stopped');
        await window.modifyApp(request);
        return;
      }
    }
    window.CrewNative?.respondGeminiLive?.(event.id, event.name, JSON.stringify(result));
  };

  const originalInject = window.injectRuntimeBridge;
  if (typeof originalInject === 'function') {
    window.injectRuntimeBridge = function(html, appId) {
      const output = originalInject(html, appId);
      const liveScript = `<script>(()=>{let customHandler=null;const norm=s=>String(s||'').replace(/\\s+/g,' ').trim();const visible=el=>{const s=getComputedStyle(el);const r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};const describe=()=>{const buttons=[...document.querySelectorAll('button,[role="button"]')].filter(visible).map((el,i)=>({index:i,text:norm(el.innerText||el.getAttribute('aria-label')||el.title)})).filter(x=>x.text).slice(0,30);const inputs=[...document.querySelectorAll('input,textarea,select')].filter(visible).map((el,i)=>({index:i,label:norm(el.getAttribute('aria-label')||el.placeholder||el.name||el.id),type:el.type||el.tagName.toLowerCase(),value:String(el.value??'').slice(0,120)})).slice(0,20);const text=norm(document.body?.innerText||'').slice(0,1200);parent.postMessage({__crewLive:true,type:'register',appId:${JSON.stringify(appId)},actions:[{name:'click',description:'Click a visible control. args: text or index',buttons},{name:'set_input',description:'Set a visible input. args: label or index, plus value',inputs},{name:'page_state',description:'Current visible page text and control state',text}]},'*')};window.crew=window.crew||{};window.crew.live={registerActions(actions,onAction){customHandler=typeof onAction==='function'?onAction:customHandler;parent.postMessage({__crewLive:true,type:'register',appId:${JSON.stringify(appId)},actions:Array.isArray(actions)?actions:[]},'*')},onAction(fn){customHandler=fn},refresh:describe};addEventListener('message',async(e)=>{const m=e.data||{};if(!m.__crewLive||m.appId!==${JSON.stringify(appId)})return;if(m.type==='describe'){describe();return}if(m.type!=='execute')return;try{let result;if(customHandler)result=await customHandler(m.name,m.args||{});else if(m.name==='click'){const target=norm(m.args?.text);const els=[...document.querySelectorAll('button,[role="button"]')].filter(visible);const el=els.find(x=>target&&norm(x.innerText||x.getAttribute('aria-label')||x.title).toLowerCase().includes(target.toLowerCase()))||els[Number(m.args?.index)];if(!el)throw new Error('Control not found');el.click();result=true;setTimeout(describe,80)}else if(m.name==='set_input'){const els=[...document.querySelectorAll('input,textarea,select')].filter(visible);const target=norm(m.args?.label);const el=els.find(x=>target&&norm(x.getAttribute('aria-label')||x.placeholder||x.name||x.id).toLowerCase().includes(target.toLowerCase()))||els[Number(m.args?.index)];if(!el)throw new Error('Input not found');el.value=String(m.args?.value??'');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));result=true;setTimeout(describe,80)}else if(m.name==='page_state'){result={text:norm(document.body?.innerText||'').slice(0,1200)}}else throw new Error('Unsupported action '+m.name);parent.postMessage({__crewLive:true,type:'result',id:m.id,appId:${JSON.stringify(appId)},result},'*')}catch(err){parent.postMessage({__crewLive:true,type:'result',id:m.id,appId:${JSON.stringify(appId)},error:err?.message||String(err)},'*')}});addEventListener('load',()=>setTimeout(describe,80));setTimeout(describe,120)})();<\/script>`;
      return output.replace(/<\/head>/i, `${liveScript}</head>`);
    };
  }
})();
