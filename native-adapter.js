(() => {
  const pending = new Map();
  let seq = 0;
  let hasKey = false;

  const hostAvailable = () => Boolean(window.CrewHost?.postMessage);

  function hostCall(method, payload = {}, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
      if (!hostAvailable()) {
        reject(new Error('Android host bridge is unavailable.'));
        return;
      }
      const id = `host_${Date.now()}_${++seq}`;
      pending.set(id, { resolve, reject });
      try {
        window.CrewHost.postMessage(JSON.stringify({ id, method, payload }));
      } catch (error) {
        pending.delete(id);
        reject(error);
        return;
      }
      setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        reject(new Error(`Native request timed out: ${method}`));
      }, timeoutMs);
    });
  }

  function emitKeyState() {
    window.dispatchEvent(new CustomEvent('crew-key-state', { detail: { hasKey } }));
  }

  if (hostAvailable()) {
    window.CrewHost.onmessage = (event) => {
      let message;
      try { message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch (_) { return; }
      if (!message) return;

      if (message.type === 'event') {
        if (message.channel === 'live') {
          window.__crewLiveEvent?.(message.payload);
          return;
        }
        if (message.channel === 'sensor') {
          const payload = message.payload || {};
          const app = window.CrewBuilder?.getActiveApp?.();
          const allowed = app ? window.CrewBuilder?.capabilitiesForApp?.(app) : null;
          if (!app || !payload.type || !allowed?.has?.(payload.type)) return;
          const frame = document.getElementById('preview');
          frame?.contentWindow?.postMessage({ __crewForge: true, type: 'native-sensor', sensor: payload.type, payload }, '*');
          return;
        }
        return;
      }

      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id);
      if (message.error) item.reject(new Error(message.error));
      else item.resolve(message.result);
    };

    hostCall('gemini.hasKey', {}, 5000)
      .then(value => { hasKey = Boolean(value); emitKeyState(); })
      .catch(() => { hasKey = false; emitKeyState(); });
  }

  window.CrewAI = {
    available: hostAvailable,
    hasApiKey: () => hasKey,
    setApiKey: async (key) => {
      const value = String(key || '').trim();
      await hostCall('gemini.setKey', { key: value }, 10000);
      hasKey = Boolean(value);
      emitKeyState();
      return true;
    },
    clearApiKey: async () => {
      await hostCall('gemini.clearKey', {}, 10000);
      hasKey = false;
      emitKeyState();
      return true;
    },
    generate: async (prompt, model = 'auto') => {
      const result = await hostCall('gemini.generate', {
        prompt: String(prompt || ''),
        model: String(model || 'auto')
      }, 120000);
      return {
        text: String(result?.text || ''),
        model: String(result?.model || '')
      };
    },
    clearSensors: () => {
      if (!hostAvailable()) return Promise.resolve(false);
      return hostCall('sensor.clear', {}, 5000).catch(() => false);
    },
    hostCall
  };

  const original = window.handleRuntimeMessage;
  if (typeof original !== 'function') return;
  window.removeEventListener('message', original);

  window.handleRuntimeMessage = async function(event) {
    const msg = event.data || {};
    const check = window.CrewBuilder?.runtimeRequestCheck?.(event, msg);
    if (!check?.handled) return original(event);

    const respond = (value, error = null) => event.source?.postMessage({
      __crewForge: true,
      type: 'response',
      id: msg.id,
      value,
      error
    }, '*');

    if (!check.ok) {
      respond(null, check.error);
      return;
    }

    const p = msg.payload || {};
    try {
      if (msg.method === 'vibrate' && hostAvailable()) {
        const pattern = p.pattern;
        const duration = Array.isArray(pattern)
          ? Number(pattern.find(value => Number(value) > 0) || 60)
          : Number(pattern || 60);
        respond(await hostCall('vibrate', { duration: Math.max(1, Math.min(2000, duration)) }, 5000));
        return;
      }
      if (msg.method === 'share' && hostAvailable()) {
        respond(await hostCall('share', {
          title: String(p.title || ''),
          text: String(p.text || ''),
          url: String(p.url || '')
        }, 15000));
        return;
      }
      if (msg.method === 'location' && hostAvailable()) {
        respond(await hostCall('location', {}, 30000));
        return;
      }
      if (msg.method === 'clipboard' && hostAvailable()) {
        respond(await hostCall('clipboard', { text: String(p.text || '') }, 5000));
        return;
      }
      if (msg.method === 'device.battery' && hostAvailable()) {
        respond(await hostCall('device.battery', {}, 5000));
        return;
      }
      if (msg.method === 'tts.speak' && hostAvailable()) {
        respond(await hostCall('tts.speak', {
          text: String(p.text || ''),
          language: String(p.language || '')
        }, 5000));
        return;
      }
      if (msg.method === 'tts.stop' && hostAvailable()) {
        respond(await hostCall('tts.stop', {}, 5000));
        return;
      }
      if ((msg.method === 'sensor.subscribe' || msg.method === 'sensor.unsubscribe') && hostAvailable()) {
        const sensor = String(p.sensor || '');
        respond(await hostCall(msg.method, { sensor }, 5000));
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