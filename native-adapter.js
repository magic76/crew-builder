(() => {
  const original = window.handleRuntimeMessage;
  if (typeof original !== 'function') return;

  window.removeEventListener('message', original);
  window.handleRuntimeMessage = async function handleRuntimeMessageWithNative(event) {
    const msg = event.data || {};
    const nativeBridge = window.CrewNative;
    const isRuntimeRequest = msg.__crewForge && msg.type === 'request' && msg.id && msg.appId;

    if (!isRuntimeRequest || !nativeBridge) return original(event);

    const respond = (value, error = null) => event.source?.postMessage({
      __crewForge: true,
      type: 'response',
      id: msg.id,
      value,
      error
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
        nativeBridge.share(
          String(payload.title || ''),
          String(payload.text || ''),
          String(payload.url || '')
        );
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
