(() => {
  const KEY = 'crew-builder.ui-language';
  const select = document.getElementById('uiLanguageSelect');
  const dictionaries = {
    en: {
      heroTitle: 'Describe it.<br />Use it. Change it.',
      heroCopy: 'Turn a small need into a working mini app. Powered directly by Gemini.',
      buildApp: 'Build app', yourApps: 'YOUR APPS', recentlyBuilt: 'Recently built', storedDevice: 'Stored on this device', undo: 'Undo', modify: 'Modify', modifyUpper: 'MODIFY', whatChange: 'What should change?', applyChanges: 'Apply changes', settingsTitle: 'Builder & Live settings', interfaceLanguage: 'Interface language', preferredModel: 'Preferred model', modelHelp: 'If the preferred model fails, Builder automatically tries compatible Gemini fallback models.', responseStyle: 'Response style', responseLanguage: 'Response language', liveHelp: 'Live waits until it finishes speaking before listening again, reducing accidental interruptions from speaker echo or ambient sound.', apiHelp: 'Stored only in Crew Builder on this device. The same key powers Gemini Live.', clearKey: 'Clear key', save: 'Save', starterScoreboard: 'Kids scoreboard', starterWheel: 'Decision wheel', starterTalkTimer: 'Talk timer', starterPomodoro: 'Pomodoro', starterDinner: 'Dinner picker', starterExpense: 'Expense split', starterHiit: 'HIIT timer', starterFlashcards: 'Flash cards', starterHabit: 'Habit tracker', starterVote: 'Vote board', starterTruth: 'Truth or dare', starterGrocery: 'Grocery list', starterTip: 'Tip calculator'
    },
    'zh-TW': {
      heroTitle: '說出需求。<br />直接使用。隨時修改。',
      heroCopy: '把一個小需求，直接變成可以使用的小工具。由 Gemini 驅動。',
      buildApp: '建立小工具', yourApps: '你的小工具', recentlyBuilt: '最近建立', storedDevice: '儲存在這台裝置', undo: '復原', modify: '修改', modifyUpper: '修改', whatChange: '你想改什麼？', applyChanges: '套用修改', settingsTitle: 'Builder 與 Live 設定', interfaceLanguage: '介面語言', preferredModel: '偏好模型', modelHelp: '如果偏好模型失敗，Builder 會自動嘗試相容的 Gemini 備援模型。', responseStyle: '回應風格', responseLanguage: '語音回應語言', liveHelp: 'Live 會先把話說完再恢復聆聽，降低喇叭回音或環境音造成的誤打斷。', apiHelp: 'API key 只儲存在這台裝置的 Crew Builder 中，同一把 key 也用於 Gemini Live。', clearKey: '清除 key', save: '儲存', starterScoreboard: '兒童計分板', starterWheel: '隨機轉盤', starterTalkTimer: '簡報計時器', starterPomodoro: '番茄鐘', starterDinner: '晚餐選擇器', starterExpense: '旅費分帳', starterHiit: 'HIIT 計時器', starterFlashcards: '單字卡', starterHabit: '習慣追蹤', starterVote: '會議投票板', starterTruth: '真心話大冒險', starterGrocery: '購物清單', starterTip: '小費計算機'
    }
  };

  function current() { return localStorage.getItem(KEY) || 'zh-TW'; }
  function apply(language = current()) {
    const lang = dictionaries[language] ? language : 'en';
    localStorage.setItem(KEY, lang);
    document.documentElement.lang = lang;
    if (select) select.value = lang;
    const dict = dictionaries[lang];
    document.querySelectorAll('[data-i18n]').forEach((node) => {
      const value = dict[node.dataset.i18n];
      if (value != null) node.innerHTML = value;
    });
    const prompt = document.getElementById('promptInput');
    const modify = document.getElementById('modifyInput');
    if (lang === 'zh-TW') {
      if (prompt) prompt.placeholder = '你現在需要什麼？\n例如：做一個兩個小孩使用的計分板，先到 10 分的人獲勝。';
      if (modify) modify.placeholder = '例如：把按鈕放大，並在到達 10 分時顯示煙火。';
    } else {
      if (prompt) prompt.placeholder = 'What do you need right now?\nExample: Make a scoreboard for two kids. First to 10 wins.';
      if (modify) modify.placeholder = 'Example: Make the buttons bigger and add fireworks when someone reaches 10.';
    }
  }

  if (select) {
    select.value = current();
    select.addEventListener('change', () => apply(select.value));
  }
  apply();
  window.CrewBuilderUI = { language: current, applyLanguage: apply };
})();
