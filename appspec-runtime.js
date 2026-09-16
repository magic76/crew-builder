(() => {
  const CAPS = {
    shake: 'crew.sensor.onShake(handler)', accelerometer: 'crew.sensor.accelerometer(handler)', gyroscope: 'crew.sensor.gyroscope(handler)',
    location: 'await crew.location.get()', vibration: 'await crew.vibrate(pattern)', share: 'await crew.share({title,text,url})',
    clipboard: 'await crew.clipboard.write(text)', battery: 'await crew.device.battery()', tts: 'await crew.tts.speak(text)'
  };
  const lang = () => (document.documentElement.dataset.uiLanguage || localStorage.getItem('crew-builder.ui-language') || 'zh-TW') === 'en' ? 'en' : 'zh-TW';
  const languageName = () => lang() === 'en' ? 'English' : 'Traditional Chinese (Taiwan)';
  const cleanJson = text => String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/,'').trim();
  let currentSpec = null;

  async function plan(request, model='auto') {
    const prompt = `You are Crew Builder's product planner. Convert the user's request into a SMALL implementation spec before code generation.\n\nUSER REQUEST:\n${request}\n\nUSER LANGUAGE: ${languageName()}\nAVAILABLE PHONE CAPABILITIES:\n${Object.entries(CAPS).map(([k,v])=>`- ${k}: ${v}`).join('\n')}\n\nChoose native capabilities only when they materially improve the app. Infer them automatically; the user should never need to know API names. Return ONLY JSON, no markdown, with exactly this shape:\n{"purpose":"one sentence in ${languageName()}","screens":["..."],"data":["..."],"actions":["..."],"nativeCapabilities":["capability keys from the list"],"language":"${lang()}"}\nKeep screens <= 4, actions <= 8, and prefer a focused useful app over feature bloat.`;
    const result = await window.CrewAI.generate(prompt, model);
    const spec = JSON.parse(cleanJson(result.text));
    spec.language = lang();
    spec.nativeCapabilities = Array.isArray(spec.nativeCapabilities) ? spec.nativeCapabilities.filter(k => CAPS[k]) : [];
    spec.screens = Array.isArray(spec.screens) ? spec.screens.slice(0,4) : [];
    spec.actions = Array.isArray(spec.actions) ? spec.actions.slice(0,8) : [];
    spec.data = Array.isArray(spec.data) ? spec.data.slice(0,8) : [];
    return spec;
  }

  const originalCreatePrompt = window.buildCreatePrompt;
  if (typeof originalCreatePrompt === 'function') {
    window.buildCreatePrompt = function(request) {
      const base = originalCreatePrompt(request);
      const spec = currentSpec;
      if (!spec) return base;
      const native = spec.nativeCapabilities.map(k => `${k}: ${CAPS[k]}`).join('\n- ');
      return `${base}\n\nAPP SPEC (authoritative product plan):\n${JSON.stringify(spec, null, 2)}\n\nCAPABILITY SELECTION:\n${native ? '- '+native : '- No native capability is required.'}\n\nImplement the AppSpec faithfully. All user-visible UI must use ${languageName()}. Do not expose API names or implementation terminology to the user.`;
    };
  }

  const originalCreate = window.createApp;
  if (typeof originalCreate === 'function') {
    window.createApp = async function(rawPrompt) {
      const request = String(rawPrompt || '').trim();
      if (!request) return originalCreate(rawPrompt);
      try {
        const model = typeof window.selectedModel === 'function' ? window.selectedModel() : 'auto';
        window.CrewBuilderUX?.setPlanningState?.(true);
        currentSpec = await plan(request, model);
        window.CrewBuilder?.setLastAppSpec?.(currentSpec);
        return await originalCreate(rawPrompt);
      } catch (error) {
        console.warn('AppSpec planning fallback:', error);
        currentSpec = null;
        return await originalCreate(rawPrompt);
      } finally {
        window.CrewBuilderUX?.setPlanningState?.(false);
        queueMicrotask(() => { currentSpec = null; });
      }
    };
  }

  window.CrewAppSpec = { plan, capabilities: CAPS, getCurrent: () => currentSpec };
})();