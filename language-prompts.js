(() => {
  const UI_KEY = 'crew-builder.ui-language';
  const language = () => localStorage.getItem(UI_KEY) === 'en' ? 'en' : 'zh-TW';
  const isZh = () => language() === 'zh-TW';

  function outputLanguageRule() {
    return isZh()
      ? `\n\nOUTPUT LANGUAGE — IMPORTANT:
- The user's language is Traditional Chinese (Taiwan).
- Write ALL user-visible app content in Traditional Chinese using natural Taiwan wording.
- This includes the <title>, headings, buttons, labels, placeholders, default sample data, instructions, empty states, confirmations, validation messages, errors, results and accessibility labels.
- Do not fall back to English for UI copy unless the user explicitly asks for English.
- Internal JavaScript identifiers and Crew API names may remain in English.`
      : `\n\nOUTPUT LANGUAGE — IMPORTANT:
- The user's language is English.
- Write ALL user-visible app content in English, including title, buttons, labels, placeholders, sample data, messages and errors, unless the user explicitly asks for another language.`;
  }

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
      input.value = `請建立「${title}」App。${description || ''}

請做成可以立即使用、適合手機操作的完整工具，保留資料、處理空狀態與錯誤狀態，介面與所有使用者看得到的文字都使用繁體中文（台灣用語）。${native ? '\n這個靈感適合使用 Crew 手機原生能力；有實際幫助時請使用可用的 crew API，並保留一般觸控操作作為備援。' : ''}`;
    });
  });

  window.CrewLanguagePrompts = { language, isZh, outputLanguageRule };
})();