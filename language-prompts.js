(() => {
  const UI_KEY = 'crew-builder.ui-language';
  const language = () => localStorage.getItem(UI_KEY) === 'en' ? 'en' : 'zh-TW';
  const isZh = () => language() === 'zh-TW';

  function outputLanguageRule() {
    return isZh()
      ? `\n\nOUTPUT LANGUAGE — IMPORTANT:\n- The user's language is Traditional Chinese (Taiwan).\n- Write ALL user-visible app content in Traditional Chinese using natural Taiwan wording.\n- This includes the <title>, headings, buttons, labels, placeholders, default sample data, instructions, empty states, confirmations, validation messages, errors, results and accessibility labels.\n- Do not fall back to English for UI copy unless the user explicitly asks for English.\n- Internal JavaScript identifiers and Crew API names may remain in English.`
      : `\n\nOUTPUT LANGUAGE — IMPORTANT:\n- The user's language is English.\n- Write ALL user-visible app content in English, including title, buttons, labels, placeholders, sample data, messages and errors, unless the user explicitly asks for another language.`;
  }

  // Make language a first-class part of Create / Modify / Repair rather than relying
  // on temporary input mutation from click handlers.
  ['buildCreatePrompt', 'buildModifyPrompt', 'buildRepairPrompt'].forEach((name) => {
    const base = window[name];
    if (typeof base !== 'function') return;
    window[name] = function (...args) {
      return base.apply(this, args) + outputLanguageRule();
    };
  });

  // AI Explore previously requested a localized title/description but forced the
  // generated build prompt to English. Rewrite that instruction before Gemini sees it.
  const crewGenerate = window.CrewAI?.generate;
  if (typeof crewGenerate === 'function' && !window.CrewAI.__languagePromptWrapped) {
    window.CrewAI.generate = function (prompt, model) {
      let next = String(prompt || '');
      if (isZh() && next.includes('invent exactly 6') && next.includes('detailed English build instruction')) {
        next = next.replace(
          'a detailed English build instruction mentioning relevant crew APIs if needed',
          '一段完整、自然的繁體中文（台灣用語）建置指令；描述功能、互動與畫面，若需要 Crew 手機能力則保留 crew API 名稱'
        );
        next += '\nThe JSON prompt field itself MUST be written in Traditional Chinese (Taiwan), except code/API identifiers.';
      }
      return crewGenerate.call(window.CrewAI, next, model);
    };
    window.CrewAI.__languagePromptWrapped = true;
  }

  // Curated defaults from older data still store their build instruction in English.
  // Keep English unchanged, but turn the selected visible zh-TW idea into a zh-TW
  // Builder request. This also keeps old saved/static idea data backward compatible.
  document.addEventListener('click', (event) => {
    if (!isZh()) return;
    const card = event.target?.closest?.('.idea-card[data-idea]');
    if (!card) return;
    queueMicrotask(() => {
      const input = document.getElementById('promptInput');
      const title = card.querySelector('strong')?.textContent?.trim();
      const description = card.querySelector('small')?.textContent?.trim();
      const native = Boolean(card.querySelector('em'));
      if (!input || !title) return;
      input.value = `請建立「${title}」App。${description || ''}\n\n請做成可以立即使用、適合手機操作的完整工具，保留資料、處理空狀態與錯誤狀態，介面與所有使用者看得到的文字都使用繁體中文（台灣用語）。${native ? '\n這個靈感適合使用 Crew 手機原生能力；有實際幫助時請使用可用的 crew API，並保留一般觸控操作作為備援。' : ''}`;
    });
  });
})();