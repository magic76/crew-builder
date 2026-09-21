(() => {
  const UI_KEY = 'crew-builder.ui-language';
  const el = (id) => document.getElementById(id);
  const status = el('statusOverlay');
  const statusTitle = el('statusTitle');
  const statusDetail = el('statusDetail');
  const elapsed = el('buildElapsed');
  let startedAt = 0;
  let timer = null;

  const copy = {
    en: {
      manage: 'Manage app',
      rename: 'Rename',
      duplicate: 'Duplicate',
      history: 'Version history',
      historyTitle: 'Version history',
      del: 'Delete',
      preparing: 'Preparing',
      generating: 'Generating',
      validating: 'Validating',
      ready: 'Getting ready',
      repairing: 'Repairing',
      building: 'Building',
      seconds: 's',
      languageRule: 'Create all user-visible text in English. Keep labels, buttons, messages, empty states and errors in English unless the user explicitly requests another language.'
    },
    'zh-TW': {
      manage: '管理工具',
      rename: '重新命名',
      duplicate: '建立副本',
      history: '版本紀錄',
      historyTitle: '版本紀錄',
      del: '刪除',
      preparing: '準備需求',
      generating: '產生介面與功能',
      validating: '檢查可執行性',
      ready: '準備完成',
      repairing: '自動修正',
      building: '建立中',
      seconds: '秒',
      languageRule: '所有使用者看得到的文字都使用繁體中文（台灣用語），包含標題、按鈕、提示、空狀態與錯誤訊息；除非使用者明確指定其他語言。'
    }
  };

  const language = () => localStorage.getItem(UI_KEY) === 'en' ? 'en' : 'zh-TW';
  const t = (key) => copy[language()][key] || copy.en[key] || key;

  function setActionLabel(id, text) {
    const node = el(id)?.querySelector('span');
    if (node) node.textContent = text;
  }

  function syncMenuLanguage() {
    if (el('appMenuTitle')) el('appMenuTitle').textContent = t('manage');
    setActionLabel('renameAppBtn', t('rename'));
    setActionLabel('duplicateAppBtn', t('duplicate'));
    setActionLabel('historyAppBtn', t('history'));
    if (el('versionHistoryTitle')) el('versionHistoryTitle').textContent = t('historyTitle');
    setActionLabel('deleteAppBtn', t('del'));
    setActionLabel('improveAppBtn', language() === 'en' ? 'Improve this app' : '改進這個工具');
    ['prepare', 'generate', 'validate', 'ready'].forEach((step) => {
      const node = document.querySelector('[data-step="' + step + '"] span');
      if (node) node.textContent = t(step === 'prepare' ? 'preparing' : step === 'generate' ? 'generating' : step);
    });
    window.CrewBuilder?.syncAppMenu?.();
  }

  function setStep(step) {
    const order = ['prepare', 'generate', 'validate', 'ready'];
    const active = Math.max(0, order.indexOf(step));
    document.querySelectorAll('#buildSteps [data-step]').forEach((node, index) => {
      node.classList.toggle('done', index < active);
      node.classList.toggle('active', index === active);
      if (node.firstChild) node.firstChild.textContent = index < active ? '✓ ' : (index === active ? '● ' : '○ ');
    });
  }

  function startProgress() {
    startedAt = Date.now();
    syncMenuLanguage();
    setStep('prepare');
    window.CrewBuilder?.updateBuildingProgress?.(0, t('building'), t('seconds'));
    clearInterval(timer);
    timer = setInterval(() => {
      const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      if (elapsed) elapsed.textContent = String(seconds) + t('seconds');
      window.CrewBuilder?.updateBuildingProgress?.(seconds, t('building'), t('seconds'));
    }, 500);
  }

  function stopProgress() {
    clearInterval(timer);
    timer = null;
    setStep('ready');
  }

  function syncRepairState() {
    if (!status || status.hidden) return;
    const text = ((statusTitle?.textContent || '') + ' ' + (statusDetail?.textContent || '')).toLowerCase();
    const validating = document.querySelector('[data-step="validate"] span');
    if (validating) validating.textContent = text.includes('repair') || text.includes('修正') ? t('repairing') : t('validating');
  }

  if (status) {
    new MutationObserver(() => {
      if (!status.hidden && !timer) startProgress();
      else if (status.hidden && timer) stopProgress();
    }).observe(status, { attributes: true, attributeFilter: ['hidden'] });
  }
  if (statusTitle) new MutationObserver(syncRepairState).observe(statusTitle, { childList: true, characterData: true, subtree: true });
  if (statusDetail) new MutationObserver(syncRepairState).observe(statusDetail, { childList: true, characterData: true, subtree: true });

  el('uiLanguageSelect')?.addEventListener('change', () => setTimeout(syncMenuLanguage, 0));
  window.CrewBuilderUX = { syncMenuLanguage, setStep, t };
  syncMenuLanguage();
})();
