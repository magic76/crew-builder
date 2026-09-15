(() => {
  const UI_KEY = 'crew-builder.ui-language';
  const el = (id) => document.getElementById(id);
  const language = () => localStorage.getItem(UI_KEY) === 'en' ? 'en' : 'zh-TW';
  const copy = {
    en: {
      explore: 'Explore ideas',
      exploreSub: 'Tiny problems worth building an app for',
      all: 'All',
      daily: 'Daily',
      family: 'Family',
      work: 'Work',
      travel: 'Travel',
      health: 'Health',
      fun: 'Fun',
      improve: 'Improve this app',
      native: 'Uses phone features'
    },
    'zh-TW': {
      explore: '探索靈感',
      exploreSub: '遇到這些小問題，就做一個 App 解決',
      all: '全部',
      daily: '日常',
      family: '家庭',
      work: '工作',
      travel: '旅行',
      health: '健康',
      fun: '聚會',
      improve: '改進這個工具',
      native: '使用手機能力'
    }
  };
  const t = (key) => copy[language()][key] || copy.en[key] || key;
  const ideas = [
    ['daily', '🍽️', 'Dinner decider', '晚餐選擇器', 'Pick tonight’s dinner from saved choices.', '從常吃的選項快速決定今晚吃什麼。', 'Make a dinner decision app with saved choices, random pick, history, and a no-repeat option.'],
    ['family', '🏆', 'Kids reward board', '小孩獎勵板', 'Points, rewards and weekly wins.', '記錄小孩積分、獎勵與每週成果。', 'Make a kids reward board for two children with points, custom rewards, weekly reset, celebration, vibration and persistence.'],
    ['work', '⏱️', 'Meeting timer', '會議控時器', 'Keep agenda sections on schedule.', '幫每個議程控時，避免會議超時。', 'Make a meeting agenda timer with editable sections, current section, overtime warning, vibration and total remaining time.'],
    ['travel', '💸', 'Trip splitter', '旅行分帳', 'Track expenses and who owes whom.', '旅途中快速記帳並算出誰欠誰。', 'Make a trip expense splitter with people, payer, participants, balances, settlement suggestions and persistence.'],
    ['health', '🏃', 'HIIT coach', 'HIIT 教練', 'Work/rest rounds with vibration.', '工作與休息回合、自動震動提醒。', 'Make a HIIT timer with editable work/rest, rounds, large controls, vibration, progress and pause/resume.'],
    ['fun', '📱', 'Shake picker', '搖手機抽籤', 'Shake the phone to pick a person or choice.', '直接搖手機抽人或抽選項。', 'Make a shake-to-pick app. Let me edit choices and use crew.sensor.onShake when available, with a button fallback, vibration and history.'],
    ['fun', '⚡', 'Reaction game', '反應力遊戲', 'Wait for the signal, then tap fast.', '等畫面變化後比誰最快點到。', 'Make a reaction-time game with random delay, false-start detection, best score and vibration.']
  ];

  function ensureExplore() {
    if (el('exploreSection')) return;
    const library = document.querySelector('.library-section');
    if (!library) return;
    const section = document.createElement('section');
    section.id = 'exploreSection';
    section.className = 'explore-section';
    section.innerHTML = '<div class="section-heading"><div><div class="eyebrow">IDEAS</div><h2 id="exploreTitle"></h2></div><span id="exploreSub"></span></div><div id="ideaFilters" class="idea-filters"></div><div id="ideaGrid" class="idea-grid"></div>';
    library.after(section);
    renderExplore('all');
  }

  function renderExplore(filter) {
    const title = el('exploreTitle');
    const sub = el('exploreSub');
    const filters = el('ideaFilters');
    const grid = el('ideaGrid');
    if (!grid || !filters) return;
    title.textContent = t('explore');
    sub.textContent = t('exploreSub');
    const selected = filter || 'all';
    const categories = ['all', 'daily', 'family', 'work', 'travel', 'health', 'fun'];
    filters.innerHTML = categories.map((category) => '<button class="idea-filter ' + (category === selected ? 'active' : '') + '" data-filter="' + category + '">' + t(category) + '</button>').join('');
    filters.querySelectorAll('button').forEach((button) => {
      button.onclick = () => renderExplore(button.dataset.filter);
    });
    const list = ideas.filter((idea) => selected === 'all' || idea[0] === selected);
    grid.innerHTML = list.map((idea) => {
      const index = ideas.indexOf(idea);
      const native = idea[6].includes('crew.sensor') ? '<em>⌁ ' + t('native') + '</em>' : '';
      return '<button class="idea-card" data-idea="' + index + '"><span class="idea-icon">' + idea[1] + '</span><strong>' + (language() === 'en' ? idea[2] : idea[3]) + '</strong><small>' + (language() === 'en' ? idea[4] : idea[5]) + '</small>' + native + '</button>';
    }).join('');
    grid.querySelectorAll('[data-idea]').forEach((button) => {
      button.onclick = () => {
        const input = el('promptInput');
        input.value = ideas[Number(button.dataset.idea)][6];
        input.focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };
    });
  }

  function syncMenu() {
    const improve = el('improveAppBtn')?.querySelector('span');
    if (improve) improve.textContent = t('improve');
    window.CrewBuilder?.syncAppMenu?.();
  }

  function enhanceMenu() {
    const actions = document.querySelector('.app-menu-actions');
    if (!actions || el('improveAppBtn')) return;

    const improve = document.createElement('button');
    improve.id = 'improveAppBtn';
    improve.className = 'menu-action improve-action';
    improve.innerHTML = '✦ <span></span>';
    actions.prepend(improve);

    const pin = document.createElement('button');
    pin.id = 'pinAppBtn';
    pin.className = 'menu-action';
    pin.innerHTML = '⌁ <span></span>';
    actions.insertBefore(pin, el('deleteAppBtn'));

    improve.onclick = () => {
      const input = el('modifyInput');
      el('appMenuCloseBtn')?.click();
      el('modifyOpenBtn')?.click();
      setTimeout(() => {
        input.value = language() === 'en'
          ? 'Review this app and improve it with 2–3 useful features that fit its purpose. Keep current behavior and data. Use Crew native capabilities when they genuinely help.'
          : '檢查這個工具，依照用途加入 2～3 個真正實用的改進。保留目前功能與資料；Crew 手機原生能力真的有幫助時就使用。';
        input.focus();
      }, 80);
    };
    // forge.js owns the app state and persistence; this button only delegates.
    pin.onclick = () => window.CrewBuilder?.toggleActivePin?.();
    syncMenu();
  }

  function addNativePromptContext(event) {
    const target = event.target;
    if (!target?.closest?.('#forgeBtn') && !target?.closest?.('#modifyBtn')) return;
    const input = target.closest('#modifyBtn') ? el('modifyInput') : el('promptInput');
    if (!input || input.dataset.nativeInjected) return;
    const original = input.value;
    input.value = original + '\n\n[CREW NATIVE CAPABILITIES]\nWhen useful, generated apps may use crew.vibrate(), crew.share(), crew.sensor.onShake(handler), crew.sensor.accelerometer(handler), await crew.location.get(), and await crew.clipboard.write(text). onShake receives {strength,timestamp}; accelerometer receives {x,y,z,timestamp}. Always provide a normal touch fallback for sensor-based actions.';
    input.dataset.nativeInjected = '1';
    queueMicrotask(() => {
      input.value = original;
      delete input.dataset.nativeInjected;
    });
  }

  // Extend each generated iframe with native-capability APIs without changing stored app HTML.
  if (typeof window.injectRuntimeBridge === 'function') {
    const base = window.injectRuntimeBridge;
    window.injectRuntimeBridge = function (html, appId) {
      const output = base(html, appId);
      const extension = '<script>(()=>{const shake=new Set(),accel=new Set();addEventListener("message",e=>{const m=e.data||{};if(!m.__crewForge||m.type!=="native-sensor")return;const set=m.sensor==="shake"?shake:m.sensor==="accelerometer"?accel:null;if(set)set.forEach(fn=>{try{fn(m.payload)}catch(_){}})});crew.sensor={onShake(fn){if(typeof fn==="function")shake.add(fn);return()=>shake.delete(fn)},accelerometer(fn){if(typeof fn==="function")accel.add(fn);return()=>accel.delete(fn)}};crew.location={get:()=>{const id="crew_"+Date.now()+"_"+Math.random().toString(36).slice(2);return new Promise((resolve,reject)=>{const h=e=>{const m=e.data||{};if(m.__crewForge&&m.type==="response"&&m.id===id){removeEventListener("message",h);m.error?reject(new Error(m.error)):resolve(m.value)}};addEventListener("message",h);parent.postMessage({__crewForge:true,type:"request",id,appId:' + JSON.stringify(appId) + ',method:"location",payload:{}}, "*");setTimeout(()=>{removeEventListener("message",h);reject(new Error("Location request timed out"))},8000)})}};crew.clipboard={write:text=>{const id="crew_"+Date.now()+"_"+Math.random().toString(36).slice(2);parent.postMessage({__crewForge:true,type:"request",id,appId:' + JSON.stringify(appId) + ',method:"clipboard",payload:{text:String(text||"")}}, "*");return Promise.resolve(true)}}})();<\/script>';
      return output.replace(/<\/head>/i, extension + '</head>');
    };
  }

  document.addEventListener('click', addNativePromptContext, true);
  el('uiLanguageSelect')?.addEventListener('change', () => setTimeout(() => {
    renderExplore('all');
    syncMenu();
  }, 0));
  ensureExplore();
  enhanceMenu();
})();
