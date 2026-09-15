(() => {
  const APPS_KEY = 'crew-builder.apps.v1';
  const ACTIVE_KEY = 'crew-builder.active.v1';
  const UI_KEY = 'crew-builder.ui-language';
  const el = (id) => document.getElementById(id);
  const menu = el('appMenuSheet');
  const status = el('statusOverlay');
  const statusTitle = el('statusTitle');
  const statusDetail = el('statusDetail');
  const elapsed = el('buildElapsed');
  let startedAt = 0;
  let timer = null;
  let currentStep = '';

  const copy = {
    en: {
      manage: 'Manage app', rename: 'Rename', duplicate: 'Duplicate', del: 'Delete',
      renamePrompt: 'New app name', deleteConfirm: 'Delete this app? This cannot be undone.', copied: 'App duplicated', renamed: 'App renamed', deleted: 'App deleted',
      preparing: 'Preparing', generating: 'Generating', validating: 'Validating', ready: 'Getting ready', repairing: 'Repairing', seconds: 's',
      languageRule: 'Create all user-visible text in English. Keep labels, buttons, messages, empty states and errors in English unless the user explicitly requests another language.'
    },
    'zh-TW': {
      manage: '管理工具', rename: '重新命名', duplicate: '建立副本', del: '刪除',
      renamePrompt: '輸入新的工具名稱', deleteConfirm: '確定刪除這個工具？刪除後無法復原。', copied: '已建立副本', renamed: '已重新命名', deleted: '已刪除工具',
      preparing: '準備需求', generating: '產生介面與功能', validating: '檢查可執行性', ready: '準備完成', repairing: '自動修正', seconds: '秒',
      languageRule: '所有使用者看得到的文字都使用繁體中文（台灣用語），包含標題、按鈕、提示、空狀態與錯誤訊息；除非使用者明確指定其他語言。'
    }
  };
  const lang = () => localStorage.getItem(UI_KEY) === 'en' ? 'en' : 'zh-TW';
  const t = (key) => copy[lang()][key] || copy.en[key] || key;
  const load = () => { try { const v = JSON.parse(localStorage.getItem(APPS_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
  const save = (apps) => localStorage.setItem(APPS_KEY, JSON.stringify(apps));
  const activeId = () => localStorage.getItem(ACTIVE_KEY);
  const reloadBuilder = (openId = null) => { if (openId) localStorage.setItem(ACTIVE_KEY, openId); else localStorage.removeItem(ACTIVE_KEY); location.reload(); };

  function syncMenuLanguage() {
    el('appMenuTitle').textContent = t('manage');
    el('renameAppBtn').querySelector('span').textContent = t('rename');
    el('duplicateAppBtn').querySelector('span').textContent = t('duplicate');
    el('deleteAppBtn').querySelector('span').textContent = t('del');
    document.querySelector('[data-step="prepare"] span').textContent = t('preparing');
    document.querySelector('[data-step="generate"] span').textContent = t('generating');
    document.querySelector('[data-step="validate"] span').textContent = currentStep === 'repair' ? t('repairing') : t('validating');
    document.querySelector('[data-step="ready"] span').textContent = t('ready');
  }

  function openMenu(event) { event.preventDefault(); event.stopImmediatePropagation(); const app = load().find((item) => item.id === activeId()); if (!app) return; syncMenuLanguage(); el('appMenuEyebrow').textContent = app.name || 'APP'; menu.hidden = false; }
  function closeMenu() { menu.hidden = true; }
  function rename() { const id=activeId(),apps=load(),app=apps.find(item=>item.id===id);if(!app)return;const name=window.prompt(t('renamePrompt'),app.name||'');if(!name||!name.trim())return;app.name=name.trim();app.updatedAt=Date.now();save(apps);reloadBuilder(id); }
  function duplicate() { const id=activeId(),apps=load(),app=apps.find(item=>item.id===id);if(!app)return;const now=Date.now(),clone=JSON.parse(JSON.stringify(app));clone.id=crypto.randomUUID?crypto.randomUUID():`builder_${now}_${Math.random().toString(36).slice(2,8)}`;clone.name=`${app.name||'App'}${lang()==='zh-TW'?' 副本':' Copy'}`;clone.createdAt=now;clone.updatedAt=now;apps.unshift(clone);save(apps);reloadBuilder(clone.id); }
  function remove() { const id=activeId();if(!id||!window.confirm(t('deleteConfirm')))return;save(load().filter(item=>item.id!==id));reloadBuilder(null); }

  const model=el('modelSelect');if(model)model.value='auto';localStorage.setItem('crew-builder.gemini-model','auto');
  function injectLanguage(event) { const target=event.target,isBuildClick=target?.closest?.('#forgeBtn'),isModifyClick=target?.closest?.('#modifyBtn'),isShortcut=event.type==='keydown'&&(event.metaKey||event.ctrlKey)&&event.key==='Enter'&&target===el('promptInput');const input=isModifyClick?el('modifyInput'):((isBuildClick||isShortcut)?el('promptInput'):null);if(!input||input.dataset.languageInjected==='1')return;const original=input.value;input.value=`${original}\n\n[CREW BUILDER LANGUAGE]\n${t('languageRule')}`;input.dataset.languageInjected='1';queueMicrotask(()=>{input.value=original;delete input.dataset.languageInjected;}); }
  document.addEventListener('click',injectLanguage,true);document.addEventListener('keydown',injectLanguage,true);

  function setStep(step) {
    if (currentStep === step) return;
    currentStep = step;
    const visualStep = step === 'repair' ? 'validate' : step;
    const order=['prepare','generate','validate','ready'],active=Math.max(0,order.indexOf(visualStep));
    document.querySelectorAll('#buildSteps [data-step]').forEach((node,index)=>{
      node.classList.toggle('done',index<active);node.classList.toggle('active',index===active);
      const mark=index<active?'✓ ':(index===active?'● ':'○ ');
      if(node.firstChild?.textContent!==mark)node.firstChild.textContent=mark;
    });
    const validating=document.querySelector('[data-step="validate"] span');
    if(validating)validating.textContent=step==='repair'?t('repairing'):t('validating');
  }
  function startProgress() {
    if(timer)return;
    startedAt=Date.now();currentStep='';syncMenuLanguage();setStep('prepare');
    const tick=()=>{const seconds=Math.max(0,Math.floor((Date.now()-startedAt)/1000));if(elapsed)elapsed.textContent=`${seconds}${t('seconds')}`;if(currentStep!=='repair'){if(seconds>=1&&seconds<5)setStep('generate');else if(seconds>=5)setStep('validate');}};
    tick();timer=setInterval(tick,500);
  }
  function stopProgress() { if(timer){clearInterval(timer);timer=null;}setStep('ready'); }
  function inspectStatusText() { if(!status||status.hidden)return;const text=`${statusTitle?.textContent||''} ${statusDetail?.textContent||''}`.toLowerCase();if(text.includes('repair')||text.includes('修正'))setStep('repair'); }

  // Observe visibility separately from status copy. The old subtree observer watched the
  // progress labels that it also modified, causing a MutationObserver feedback loop that
  // could starve the interval and make the UI appear frozen at validation.
  if(status){
    new MutationObserver(()=>{if(status.hidden)stopProgress();else startProgress();}).observe(status,{attributes:true,attributeFilter:['hidden']});
    if(statusTitle)new MutationObserver(inspectStatusText).observe(statusTitle,{childList:true,characterData:true,subtree:true});
    if(statusDetail)new MutationObserver(inspectStatusText).observe(statusDetail,{childList:true,characterData:true,subtree:true});
  }

  el('versionBtn')?.addEventListener('click',openMenu,true);el('appMenuCloseBtn')?.addEventListener('click',closeMenu);menu?.addEventListener('click',event=>{if(event.target===menu)closeMenu();});el('renameAppBtn')?.addEventListener('click',rename);el('duplicateAppBtn')?.addEventListener('click',duplicate);el('deleteAppBtn')?.addEventListener('click',remove);el('uiLanguageSelect')?.addEventListener('change',()=>setTimeout(syncMenuLanguage,0));syncMenuLanguage();
})();
