(() => {
  const pendingGemini = new Map();
  const pendingLocation = new Map();
  let geminiSeq = 0;
  let locationSeq = 0;

  window.__crewGeminiResolve = raw => {
    let payload;
    try { payload = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { return; }
    const pending = pendingGemini.get(payload?.requestId);
    if (!pending) return;
    pendingGemini.delete(payload.requestId);
    payload.error
      ? pending.reject(new Error(payload.error))
      : pending.resolve({ text: payload.text || '', model: payload.model || '' });
  };

  window.__crewLocationResolve = raw => {
    let payload;
    try { payload = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { return; }
    const pending = pendingLocation.get(payload?.requestId);
    if (!pending) return;
    pendingLocation.delete(payload.requestId);
    clearTimeout(pending.timer);
    if (payload.error) {
      const error = new Error(payload.error);
      if (payload.code) error.code = payload.code;
      pending.reject(error);
    } else {
      pending.resolve(payload.value || null);
    }
  };

  window.CrewAI = {
    available: () => Boolean(window.CrewNative?.generateGemini),
    hasApiKey: () => Boolean(window.CrewNative?.hasGeminiApiKey?.()),
    setApiKey: key => window.CrewNative?.setGeminiApiKey?.(String(key || '').trim()),
    clearApiKey: () => window.CrewNative?.clearGeminiApiKey?.(),
    generate: (prompt, model = 'auto') => new Promise((resolve, reject) => {
      if (!window.CrewNative?.generateGemini) {
        reject(new Error('Gemini native bridge is unavailable.'));
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

  window.__crewSensorEvent = raw => {
    let payload;
    try { payload = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { return; }
    const frame = document.getElementById('preview');
    if (!frame?.contentWindow || !payload?.type) return;
    frame.contentWindow.postMessage({ __crewForge: true, type: 'native-sensor', sensor: payload.type, payload }, '*');
  };

  const requestNativeLocation = () => new Promise((resolve, reject) => {
    const bridge = window.CrewLocation;
    if (!bridge?.requestLocation) {
      const legacy = window.CrewNative?.getLastLocation?.();
      if (legacy) {
        try { resolve(JSON.parse(legacy)); } catch (error) { reject(error); }
      } else {
        reject(new Error('Location runtime is unavailable'));
      }
      return;
    }

    const requestId = `location_${Date.now()}_${++locationSeq}`;
    const timer = setTimeout(() => {
      if (!pendingLocation.has(requestId)) return;
      pendingLocation.delete(requestId);
      const error = new Error('Could not get the current location in time');
      error.code = 'LOCATION_TIMEOUT';
      reject(error);
    }, 14000);
    pendingLocation.set(requestId, { resolve, reject, timer });
    bridge.requestLocation(requestId);
  });

  const original = window.handleRuntimeMessage;
  if (typeof original !== 'function') return;
  window.removeEventListener('message', original);

  window.handleRuntimeMessage = async function(event) {
    const msg = event.data || {};
    const nativeBridge = window.CrewNative;
    const deviceBridge = window.CrewDevice;
    const isReq = msg.__crewForge && msg.type === 'request' && msg.id && msg.appId;
    if (!isReq) return original(event);

    const respond = (value, error = null) => event.source?.postMessage({
      __crewForge: true,
      type: 'response',
      id: msg.id,
      value,
      error
    }, '*');

    try {
      const payload = msg.payload || {};
      if (msg.method === 'vibrate' && nativeBridge) {
        const pattern = payload.pattern;
        const duration = Array.isArray(pattern)
          ? Number(pattern.find(value => Number(value) > 0) || 60)
          : Number(pattern || 60);
        nativeBridge.vibrate(Math.max(1, Math.min(2000, duration)));
        respond(true);
        return;
      }
      if (msg.method === 'share' && nativeBridge) {
        nativeBridge.share(String(payload.title || ''), String(payload.text || ''), String(payload.url || ''));
        respond(true);
        return;
      }
      if (msg.method === 'location') {
        const value = await requestNativeLocation();
        respond(value);
        return;
      }
      if (msg.method === 'clipboard' && nativeBridge) {
        nativeBridge.copyToClipboard?.(String(payload.text || ''));
        respond(true);
        return;
      }
      if (msg.method === 'device.battery' && deviceBridge) {
        const raw = deviceBridge.getBattery?.();
        respond(raw ? JSON.parse(raw) : null);
        return;
      }
      if (msg.method === 'tts.speak' && deviceBridge) {
        respond(Boolean(deviceBridge.speak?.(String(payload.text || ''), String(payload.language || ''))));
        return;
      }
      if (msg.method === 'tts.stop' && deviceBridge) {
        deviceBridge.stopSpeaking?.();
        respond(true);
        return;
      }
    } catch (error) {
      const code = error?.code ? `${error.code}: ` : '';
      respond(null, `${code}${error?.message || String(error)}`);
      return;
    }
    return original(event);
  };

  window.addEventListener('message', window.handleRuntimeMessage);
})();