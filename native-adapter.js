(() => {
  const pendingGemini = new Map();
  let geminiSeq = 0;

  window.__crewGeminiResolve = (raw) => {
    let payload;
    try { payload = typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch (_) { return; }
    const pending = pendingGemini.get(payload?.requestId);
    if (!pending) return;
    pendingGemini.delete(payload.requestId);
    if (payload.error) pending.reject(new Error(payload.error));
    else pending.resolve({ text: payload.text || '', model: payload.model || '' });
  };

  window.CrewAI = {
    available: () => Boolean(window.CrewNative?.generateGemini),
    hasApiKey: () => Boolean(window.CrewNative?.hasGeminiApiKey?.()),
    setApiKey: (key) => window.CrewNative?.setGeminiApiKey?.(String(key || '').trim()),
    clearApiKey: () => window.CrewNative?.clearGeminiApiKey?.(),
    generate: (prompt, model = 'auto') => new Promise((resolve, reject) => {
      if (!window.CrewNative?.generateGemini) {
        reject(new Error('Gemini native bridge is unavailable. Run Crew Forge as the Android app.'));
        return;
      }
      const requestId = `gemini_${Date.now()}_${++geminiSeq}`;
      pendingGemini.set(requestId, { resolve, reject });
      window.CrewNative.generateGemini(requestId, String(prompt || ''), String(model || 'auto'));
      setTimeout(() => {
        if (!pendingGemini.has(requestId)) return;
        pendingGemini.delete(requestId);
        reject(new Error('Gemini request timed out'));
      }, 120000);
    })
  };

  const original = window.handleRuntimeMessage;
  if (typeof original !== 'function') return;

  window.removeEventListener('message', original);
  window.handleRuntimeMessage = async function handleRuntimeMessageWithNative(event) {
    const msg = event.data || {};
    const nativeBridge = window.CrewNative;
    const isRuntimeRequest = msg.__crewForge && msg.type === 'request' && msg.id && msg.appId;
    if (!isRuntimeRequest || !nativeBridge) return original(event);

    const respond = (value, error = null) => event.source?.postMessage({
      __crewForge: true, type: 'response', id: msg.id, value, error
    }, '*');

    try {
      const payload = msg.payload || {};
      if (msg.method === 'vibrate') {
        const pattern = payload.pattern;
        const duration = Array.isArray(pattern)
          ? Number(pattern.find((value) => Number(value) > 0) || 60)
          : Number(pattern || 60);
        nativeBridge.vibrate(Math.max(1, Math.min(2000, duration)));
        respond(true);
        return;
      }
      if (msg.method === 'share') {
        nativeBridge.share(String(payload.title || ''), String(payload.text || ''), String(payload.url || ''));
        respond(true);
        return;
      }
    } catch (error) {
      respond(null, error?.message || String(error));
      return;
    }
    return original(event);
  };

  window.addEventListener('message', window.handleRuntimeMessage);
})();
