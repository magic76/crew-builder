(() => {
  const CAPS = {
    shake: 'crew.sensor.onShake(handler)',
    accelerometer: 'crew.sensor.accelerometer(handler)',
    gyroscope: 'crew.sensor.gyroscope(handler)',
    location: 'await crew.location.get()',
    vibration: 'await crew.vibrate(pattern)',
    share: 'await crew.share({title,text,url})',
    clipboard: 'await crew.clipboard.write(text)',
    battery: 'await crew.device.battery()',
    tts: 'await crew.tts.speak(text)'
  };

  const lang = () => (document.documentElement.dataset.uiLanguage || localStorage.getItem('crew-builder.ui-language') || 'zh-TW') === 'en' ? 'en' : 'zh-TW';
  const languageName = () => lang() === 'en' ? 'English' : 'Traditional Chinese (Taiwan)';
  const cleanJson = text => String(text || '').replace(/^\`\`\`(?:json)?\\s*/i, '').replace(/\`\`\`\\s*$/i, '').trim();

  function normalize(spec) {
    const value = spec && typeof spec === 'object' ? spec : {};
    return {
      purpose: String(value.purpose || '').trim(),
      screens: Array.isArray(value.screens) ? value.screens.map(String).slice(0, 4) : [],
      data: Array.isArray(value.data) ? value.data.map(String).slice(0, 8) : [],
      actions: Array.isArray(value.actions) ? value.actions.map(String).slice(0, 8) : [],
      nativeCapabilities: Array.isArray(value.nativeCapabilities)
        ? [...new Set(value.nativeCapabilities.filter(key => CAPS[key]))]
        : [],
      language: lang()
    };
  }

  async function runPlanner(prompt, model = 'auto') {
    const result = await window.CrewAI.generate(prompt, model);
    return normalize(JSON.parse(cleanJson(result.text)));
  }

  async function plan(request, model = 'auto') {
    return runPlanner(`You are Crew Builder's product planner. Convert the user's request into a SMALL implementation spec before code generation.

USER REQUEST:
${request}

USER LANGUAGE: ${languageName()}
AVAILABLE PHONE CAPABILITIES:
${Object.entries(CAPS).map(([key, api]) => `- ${key}: ${api}`).join('\n')}

Choose native capabilities only when they materially improve the app. Infer them automatically; the user should never need to know API names.
Return ONLY JSON, no markdown, with exactly this shape:
{"purpose":"one sentence in ${languageName()}","screens":["..."],"data":["..."],"actions":["..."],"nativeCapabilities":["capability keys from the list"],"language":"${lang()}"}

Keep screens <= 4, actions <= 8, and prefer a focused useful app over feature bloat.`, model);
  }

  async function revise(request, currentSpec, model = 'auto') {
    const base = normalize(currentSpec);
    return runPlanner(`You maintain Crew Builder's authoritative AppSpec across app edits.

CURRENT APP SPEC:
${JSON.stringify(base, null, 2)}

USER CHANGE:
${request}

USER LANGUAGE: ${languageName()}
AVAILABLE PHONE CAPABILITIES:
${Object.entries(CAPS).map(([key, api]) => `- ${key}: ${api}`).join('\n')}

Update the spec to reflect the requested change while preserving existing purpose, data, and actions that are not being changed.
Add or remove native capabilities only when the updated app actually needs them.
Return ONLY JSON, no markdown, with exactly this shape:
{"purpose":"one sentence in ${languageName()}","screens":["..."],"data":["..."],"actions":["..."],"nativeCapabilities":["capability keys from the list"],"language":"${lang()}"}

Keep screens <= 4, actions <= 8. Do not describe implementation details in user-facing fields.`, model);
  }

  function capabilityPrompt(spec) {
    const normalized = normalize(spec);
    if (!normalized.nativeCapabilities.length) return '- No native capability is required.';
    return normalized.nativeCapabilities.map(key => `- ${key}: ${CAPS[key]}`).join('\n');
  }

  window.CrewAppSpec = {
    plan,
    revise,
    normalize,
    capabilityPrompt,
    capabilities: CAPS,
    languageName
  };
})();