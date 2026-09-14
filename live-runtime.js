(() => {
  const liveBtn = document.getElementById('liveBtn');
  const liveLabel = document.getElementById('liveLabel');
  const preview = document.getElementById('preview');
  const actionRegistry = new Map();
  const pendingActions = new Map();
  let liveState = 'stopped';
  let actionSeq = 0;

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
    const actions = current ? (actionRegistry.get(current.id) || []) : [];
    return JSON.stringify({
      app: current ? { id: current.id, name: current.name, summary: current.summary } : null,
      actions
    });
  };

  liveBtn?.addEventListener('click', () => {
    if (!window.CrewNative?.startGeminiLive) return window.showToast?.('Live requires the Android app', true);
    if (liveState === 'ready' || liveState === 'connecting') {
      window.CrewNative.stopGeminiLive(); setState('stopped'); return;
    }
    if (!window.CrewAI?.hasApiKey?.()) return window.openSettings?.();
    setState('connecting');
    window.CrewNative.startGeminiLive(context());
  });

  window.addEventListener('message', (event) => {
    if (event.source !== preview?.contentWindow) return;
    const msg = event.data || {};
    if (!msg.__crewLive) return;
    const current = app();
    if (!current || msg.appId !== current.id) return;
    if (msg.type === 'register') actionRegistry.set(current.id, Array.isArray(msg.actions) ? msg.actions : []);
    if (msg.type === 'result' && pendingActions.has(msg.id)) {
      const pending = pendingActions.get(msg.id); pendingActions.delete(msg.id);
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
      setTimeout(() => { if (!pendingActions.has(id)) return; pendingActions.delete(id); resolve({ ok: false, error: 'App action timed out' }); }, 5000);
    });
  }

  window.__crewLiveEvent = async (raw) => {
    let event; try { event = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { return; }
    if (event.type === 'state') { setState(event.state, event.message); return; }
    if (event.type !== 'tool') return;
    let result = { ok: false, error: 'Unknown tool' };
    if (event.name === 'app_action') {
      let args = {}; try { args = JSON.parse(event.args?.args_json || '{}'); } catch (_) {}
      result = await executeAction(event.args?.name || '', args);
    } else if (event.name === 'modify_app') {
      const request = String(event.args?.request || '').trim();
      if (request && window.modifyApp) {
        window.CrewNative.respondGeminiLive(event.id, event.name, JSON.stringify({ ok: true, status: 'builder_started' }));
        await window.modifyApp(request);
        return;
      }
    }
    window.CrewNative?.respondGeminiLive?.(event.id, event.name, JSON.stringify(result));
  };

  // Extend the generated-app bridge without giving the iframe native access.
  const originalInject = window.injectRuntimeBridge;
  if (typeof originalInject === 'function') {
    window.injectRuntimeBridge = function injectRuntimeBridgeWithLive(html, appId) {
      let output = originalInject(html, appId);
      const liveScript = `<script>(()=>{let handler=null;window.crew=window.crew||{};window.crew.live={registerActions(actions,onAction){handler=typeof onAction==='function'?onAction:handler;parent.postMessage({__crewLive:true,type:'register',appId:${JSON.stringify(appId)},actions:Array.isArray(actions)?actions:[]},'*')},onAction(fn){handler=fn}};addEventListener('message',async(e)=>{const m=e.data||{};if(!m.__crewLive||m.type!=='execute'||m.appId!==${JSON.stringify(appId)})return;try{if(!handler)throw new Error('No live action handler registered');const result=await handler(m.name,m.args||{});parent.postMessage({__crewLive:true,type:'result',id:m.id,appId:${JSON.stringify(appId)},result},'*')}catch(err){parent.postMessage({__crewLive:true,type:'result',id:m.id,appId:${JSON.stringify(appId)},error:err?.message||String(err)},'*')}})})();<\/script>`;
      return output.replace(/<\/head>/i, `${liveScript}</head>`);
    };
  }
})();
