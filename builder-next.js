(() => {
  const UI_KEY = 'crew-builder.ui-language';
  const APPS_KEY = 'crew-builder.apps.v1';
  const ACTIVE_KEY = 'crew-builder.active.v1';
  const el = (id) => document.getElementById(id);
  const lang = () => localStorage.getItem(UI_KEY) === 'en' ? 'en' : 'zh-TW';
  const copy = {
    en: { recent:'Recent', explore:'Explore ideas', exploreSub:'Tiny problems worth building an app for', all:'All', daily:'Daily', family:'Family', work:'Work', travel:'Travel', health:'Health', fun:'Fun', improve:'Improve this app', improveHint:'Ask Gemini for useful upgrades to this app', native:'Uses phone features', pinned:'Pinned', pin:'Pin app', unpin:'Unpin app' },
    'zh-TW': { recent:'最近使用', explore:'探索靈感', exploreSub:'遇到這些小問題，就做一個 App 解決', all:'全部', daily:'日常', family:'家庭', work:'工作', travel:'旅行', health:'健康', fun:'聚會', improve:'改進這個工具', improveHint:'讓 Gemini 幫這個工具加入實用的新功能', native:'使用手機能力', pinned:'已釘選', pin:'釘選工具', unpin:'取消釘選' }
  };
  const t = k => copy[lang()][k] || copy.en[k] || k;
  const ideas = [
    ['daily','🍽️','Dinner decider','晚餐選擇器','Pick tonight’s dinner from saved choices.','從常吃的選項快速決定今晚吃什麼。','Make a dinner decision app with saved choices, random pick, history, and a no-repeat option.'],
    ['daily','💧','Water tracker','喝水追蹤','Quick daily water goal with reminders.','快速記錄每日喝水量與目標。','Make a water tracker with a daily goal, quick-add buttons, streaks, and local persistence.'],
    ['family','🏆','Kids reward board','小孩獎勵板','Points, rewards and weekly wins.','記錄小孩積分、獎勵與每週成果。','Make a kids reward board for two children with points, custom rewards, weekly reset, celebration, vibration and persistence.'],
    ['family','🎡','Who goes first?','誰先來？','Fairly choose turns without arguing.','公平決定誰先洗澡、誰先玩。','Make a playful family turn picker with editable names, random selection, history and no immediate repeats.'],
    ['work','⏱️','Meeting timer','會議控時器','Keep agenda sections on schedule.','幫每個議程控時，避免會議超時。','Make a meeting agenda timer with editable sections, current section, overtime warning, vibration and total remaining time.'],
    ['work','🗳️','Quick vote','快速投票','Vote on options and see the result instantly.','新增選項、現場投票、立即看結果。','Make a meeting voting board with editable options, tap voting, totals, percentages, reset and local persistence.'],
    ['travel','💸','Trip splitter','旅行分帳','Track expenses and who owes whom.','旅途中快速記帳並算出誰欠誰。','Make a trip expense splitter with people, payer, participants, balances, settlement suggestions and persistence.'],
    ['travel','🧳','Packing checklist','旅行打包清單','Reusable packing list by category.','依分類準備行李，完成後快速勾選。','Make a reusable packing checklist with categories, quantities, progress, reset and local persistence.'],
    ['health','🏃','HIIT coach','HIIT 教練','Work/rest rounds with vibration.','工作與休息回合、自動震動提醒。','Make a HIIT timer with editable work/rest, rounds, large controls, vibration, progress and pause/resume.'],
    ['health','🧘','Stretch routine','伸展流程','Guide a short stretch sequence.','用倒數引導一套簡單伸展流程。','Make a stretch routine timer with editable moves, duration, next/previous, vibration and progress.'],
    ['fun','📱','Shake picker','搖手機抽籤','Shake the phone to pick a person or choice.','直接搖手機抽人或抽選項。','Make a shake-to-pick app. Let me edit choices and use crew.sensor.onShake when available, with a button fallback, vibration and history.'],
    ['fun','⚡','Reaction game','反應力遊戲','Wait for the signal, then tap fast.','等畫面變化後比誰最快點到。','Make a reaction-time game with random delay, false-start detection, best score and vibration.']
  ];
  function ensureExplore(){
    if(el('exploreSection')) return;
    const library = document.querySelector('.library-section'); if(!library) return;
    const section=document.createElement('section'); section.id='exploreSection'; section.className='explore-section';
    section.innerHTML='<div class="section-heading"><div><div class="eyebrow">IDEAS</div><h2 id="exploreTitle"></h2></div><span id="exploreSub"></span></div><div id="ideaFilters" class="idea-filters"></div><div id="ideaGrid" class="idea-grid"></div>';
    library.after(section); renderExplore('all');
  }
  function renderExplore(filter='all'){
    const title=el('exploreTitle'), sub=el('exploreSub'), filters=el('ideaFilters'), grid=el('ideaGrid'); if(!grid)return;
    title.textContent=t('explore'); sub.textContent=t('exploreSub');
    const cats=['all','daily','family','work','travel','health','fun']; filters.innerHTML=cats.map(c=>`<button class="idea-filter ${c===filter?'active':''}" data-filter="${c}">${t(c)}</button>`).join('');
    filters.querySelectorAll('button').forEach(b=>b.onclick=()=>renderExplore(b.dataset.filter));
    const list=ideas.filter(i=>filter==='all'||i[0]===filter);
    grid.innerHTML=list.map((i,n)=>`<button class="idea-card" data-idea="${ideas.indexOf(i)}"><span class="idea-icon">${i[1]}</span><strong>${lang()==='en'?i[2]:i[3]}</strong><small>${lang()==='en'?i[4]:i[5]}</small>${i[6].includes('crew.sensor')?`<em>⌁ ${t('native')}</em>`:''}</button>`).join('');
    grid.querySelectorAll('[data-idea]').forEach(b=>b.onclick=()=>{const idea=ideas[Number(b.dataset.idea)]; const input=el('promptInput'); input.value=idea[6]; input.focus(); window.scrollTo({top:0,behavior:'smooth'});});
  }
  function enhanceMenu(){
    const actions=document.querySelector('.app-menu-actions'); if(!actions||el('improveAppBtn'))return;
    const improve=document.createElement('button'); improve.id='improveAppBtn'; improve.className='menu-action improve-action'; improve.innerHTML='✦ <span></span>'; actions.prepend(improve);
    const pin=document.createElement('button'); pin.id='pinAppBtn'; pin.className='menu-action'; pin.innerHTML='⌁ <span></span>'; actions.insertBefore(pin, document.getElementById('deleteAppBtn'));
    improve.onclick=()=>{const input=el('modifyInput'); el('appMenuCloseBtn')?.click(); el('modifyOpenBtn')?.click(); setTimeout(()=>{input.value=lang()==='en'?'Review this app and improve it with 2–3 useful features that fit its purpose. Keep the current behavior and data. Prioritize mobile usability and use available Crew native capabilities when they genuinely help.':'檢查這個工具，依照它的用途加入 2～3 個真正實用的改進。保留目前功能與資料，優先改善手機操作；如果 Crew 的手機原生能力真的有幫助就使用。'; input.focus();},80);};
    pin.onclick=()=>{const id=localStorage.getItem(ACTIVE_KEY); let apps=[]; try{apps=JSON.parse(localStorage.getItem(APPS_KEY)||'[]')}catch(_){} const app=apps.find(a=>a.id===id); if(!app)return; app.pinned=!app.pinned; app.updatedAt=Date.now(); localStorage.setItem(APPS_KEY,JSON.stringify(apps)); syncMenu();};
    syncMenu();
  }
  function syncMenu(){const improve=el('improveAppBtn'), pin=el('pinAppBtn'); if(improve)improve.querySelector('span').textContent=t('improve'); if(pin){let apps=[];try{apps=JSON.parse(localStorage.getItem(APPS_KEY)||'[]')}catch(_){}const app=apps.find(a=>a.id===localStorage.getItem(ACTIVE_KEY));pin.querySelector('span').textContent=app?.pinned?t('unpin'):t('pin');}}
  function addNativePromptContext(event){const target=event.target; if(!target?.closest?.('#forgeBtn')&&!target?.closest?.('#modifyBtn'))return; const input=target.closest('#modifyBtn')?el('modifyInput'):el('promptInput'); if(!input||input.dataset.nativeInjected)return; const original=input.value; input.value=`${original}\n\n[CREW NATIVE CAPABILITIES]\nWhen useful, generated apps may use crew.vibrate(), crew.share(), crew.sensor.onShake(handler), crew.sensor.accelerometer(handler), crew.location.get(), and crew.clipboard.write(text). Always provide a normal touch fallback for sensor-based actions.`; input.dataset.nativeInjected='1'; queueMicrotask(()=>{input.value=original;delete input.dataset.nativeInjected;});}
  document.addEventListener('click',addNativePromptContext,true);
  el('versionBtn')?.addEventListener('click',()=>setTimeout(()=>{enhanceMenu();syncMenu();},0));
  el('uiLanguageSelect')?.addEventListener('change',()=>setTimeout(()=>{renderExplore('all');syncMenu();},0));
  ensureExplore(); enhanceMenu();
})();
