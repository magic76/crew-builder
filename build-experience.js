(() => {
  const el = id => document.getElementById(id);
  const language = () => localStorage.getItem('crew-builder.ui-language') === 'en' ? 'en' : 'zh-TW';
  const copy = {
    en: {
      building: 'Building', preparing: 'Preparing request', generating: 'Generating UI & logic',
      validating: 'Checking app', repairing: 'Repairing app', seconds: 's',
      generate: '✨ Give me ideas', more: '✨ Another batch', ideaError: 'Could not generate ideas. Try again.'
    },
    'zh-TW': {
      building: '建立中', preparing: '準備需求', generating: '產生介面與功能',
      validating: '檢查可執行性', repairing: '自動修正', seconds: '秒',
      generate: '✨ 給我靈感', more: '✨ 再來一批', ideaError: '暫時無法產生靈感，請再試一次。'
    }
  };
  const t = key => copy[language()][key] || copy.en[key] || key;

  const status = el('statusOverlay');
  const statusTitle = el('statusTitle');
  const statusDetail = el('statusDetail');
  const library = el('library');
  let buildStartedAt = 0;
  let currentBuildStage = 'preparing';
  let planningTimer = null;
  let scrolledToBuild = false;

  const style = document.createElement('style');
  style.textContent = `
    #statusOverlay.inline-build-mode{display:none!important}
    .app-card.building,.pending-build-card{position:relative;overflow:hidden;border-color:rgba(130,148,255,.34)}
    .app-card.building .app-card-copy,.pending-build-card .app-card-copy{min-width:0}
    .app-card.building .app-card-status,.pending-build-card .app-card-status{display:block;margin-top:4px;font-weight:650;color:rgba(225,230,255,.82)}
    .app-card.building .app-card-meta,.pending-build-card .app-card-meta{font-size:11px;opacity:.8}
    .inline-build-track{height:3px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:9px;width:100%}
    .inline-build-fill{height:100%;width:12%;border-radius:inherit;background:currentColor;opacity:.72;transition:width .45s ease}
    .ai-idea-skeleton{pointer-events:none;min-height:112px}
    .ai-skeleton-line{display:block;height:11px;border-radius:999px;background:rgba(255,255,255,.09);margin-top:9px;overflow:hidden;position:relative}
    .ai-skeleton-line.short{width:54%}.ai-skeleton-line.long{width:88%}
    .ai-skeleton-line::after{content:'';position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,rgba(255,255,255,.14),transparent);animation:crewIdeaShimmer 1.1s infinite}
    @keyframes crewIdeaShimmer{to{transform:translateX(100%)}}
    #ideaGenerate[aria-busy="true"]{opacity:.88}
  `;
  document.head.appendChild(style);

  function actualBuildCard() {
    return document.querySelector('.app-card[data-status="building"]');
  }

  function buildCard() {
    return actualBuildCard() || document.querySelector('.pending-build-card');
  }

  function elapsedSeconds() {
    return buildStartedAt ? Math.max(0, Math.floor((Date.now() - buildStartedAt) / 1000)) : 0;
  }

  function visibleStage() {
    const text = `${statusTitle?.textContent || ''} ${statusDetail?.textContent || ''}`.toLowerCase();
    if (text.includes('repair') || text.includes('修正')) return 'repairing';
    return currentBuildStage;
  }

  function progressFor(stage, seconds) {
    if (stage === 'preparing') return Math.min(24, 10 + seconds * 2);
    if (stage === 'generating') return Math.min(72, 28 + seconds * 2.3);
    if (stage === 'repairing') return 90;
    return Math.min(86, 74 + seconds * .5);
  }

  function decorateBuildCard(card) {
    if (!card) return;
    const statusNode = card.querySelector('.app-card-status');
    const copyNode = card.querySelector('.app-card-copy');
    if (statusNode) {
      statusNode.setAttribute('role', 'status');
      statusNode.setAttribute('aria-live', 'polite');
    }
    let track = copyNode?.querySelector('.inline-build-track');
    if (!track && copyNode) {
      track = document.createElement('div');
      track.className = 'inline-build-track';
      track.innerHTML = '<div class="inline-build-fill"></div>';
      copyNode.appendChild(track);
    }
  }

  function paintBuildCard() {
    const card = buildCard();
    if (!card) return;
    decorateBuildCard(card);
    const seconds = elapsedSeconds();
    const stage = visibleStage();
    const statusNode = card.querySelector('.app-card-status');
    const meta = card.querySelector('.app-card-meta');
    if (statusNode) statusNode.textContent = `${t(stage)} · ${seconds}${t('seconds')}`;
    if (meta) meta.textContent = t('building');
    const fill = card.querySelector('.inline-build-fill');
    if (fill) fill.style.width = `${progressFor(stage, seconds)}%`;
    if (!scrolledToBuild) {
      scrolledToBuild = true;
      setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
    }
    if (actualBuildCard() && planningTimer) {
      clearInterval(planningTimer);
      planningTimer = null;
    }
  }

  function cleanPromptForCard(value) {
    const clean = String(value || '').split('\n\n[CREW')[0].replace(/\s+/g, ' ').trim();
    return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean;
  }

  function showPlanningCard(rawPrompt) {
    const prompt = cleanPromptForCard(rawPrompt);
    if (!prompt || !library || actualBuildCard() || document.querySelector('.pending-build-card')) return;
    if (!window.CrewAI?.available?.() || !window.CrewAI?.hasApiKey?.()) return;

    buildStartedAt = Date.now();
    currentBuildStage = 'preparing';
    scrolledToBuild = false;
    if (!library.querySelector('.app-card')) library.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'app-card building pending-build-card';
    card.innerHTML = `
      <div class="app-card-icon">✦</div>
      <div class="app-card-copy">
        <strong></strong>
        <span class="app-card-status"></span>
      </div>
      <div class="app-card-meta"></div>`;
    card.querySelector('strong').textContent = prompt;
    library.prepend(card);
    paintBuildCard();
    clearInterval(planningTimer);
    planningTimer = setInterval(paintBuildCard, 500);
  }

  const originalUpdateProgress = window.CrewBuilder?.updateBuildingProgress;
  if (window.CrewBuilder) {
    window.CrewBuilder.updateBuildingProgress = function() {
      if (!buildStartedAt) buildStartedAt = Date.now();
      paintBuildCard();
      if (typeof originalUpdateProgress === 'function' && !buildCard()) {
        originalUpdateProgress(0, t('building'), t('seconds'));
      }
    };
  }

  const originalValidate = window.validateGeneratedHtml;
  if (typeof originalValidate === 'function') {
    window.validateGeneratedHtml = function(html) {
      currentBuildStage = 'validating';
      paintBuildCard();
      return originalValidate(html);
    };
  }

  function syncBuildMode() {
    const active = Boolean(status && !status.hidden && actualBuildCard());
    status?.classList.toggle('inline-build-mode', active);
    if (active) {
      currentBuildStage = visibleStage() === 'repairing' ? 'repairing' : 'generating';
      if (!buildStartedAt) buildStartedAt = Date.now();
      paintBuildCard();
    } else if (status?.hidden && !buildCard()) {
      clearInterval(planningTimer);
      planningTimer = null;
      buildStartedAt = 0;
      currentBuildStage = 'preparing';
      scrolledToBuild = false;
    }
  }

  if (status) new MutationObserver(syncBuildMode).observe(status, { attributes: true, attributeFilter: ['hidden'] });
  if (statusTitle) new MutationObserver(paintBuildCard).observe(statusTitle, { childList: true, characterData: true, subtree: true });
  if (statusDetail) new MutationObserver(paintBuildCard).observe(statusDetail, { childList: true, characterData: true, subtree: true });
  if (library) new MutationObserver(() => {
    if (actualBuildCard()) {
      currentBuildStage = status && !status.hidden ? 'generating' : currentBuildStage;
      paintBuildCard();
    }
  }).observe(library, { childList: true, subtree: false });

  // AI idea generation: loading lives in the result grid; the action button always stays usable.
  let ideaRequestSeq = 0;
  let latestIdeas = [];

  function ideaButton() { return el('ideaGenerate'); }
  function ideaGrid() { return el('aiIdeaGrid'); }

  function syncIdeaButton() {
    const button = ideaButton();
    if (!button) return;
    button.disabled = false;
    button.textContent = latestIdeas.length ? t('more') : t('generate');
  }

  function renderIdeaLoading() {
    const grid = ideaGrid();
    if (!grid) return;
    grid.innerHTML = Array.from({ length: 6 }, () => `
      <div class="idea-card ai-idea-skeleton" aria-hidden="true">
        <span class="idea-icon">✦</span>
        <span class="ai-skeleton-line short"></span>
        <span class="ai-skeleton-line long"></span>
      </div>`).join('');
  }

  function escapeText(value) {
    const node = document.createElement('div');
    node.textContent = String(value || '');
    return node.innerHTML;
  }

  function usePrompt(prompt) {
    const input = el('promptInput');
    if (!input) return;
    input.value = String(prompt || '');
    input.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderIdeas(ideas) {
    const grid = ideaGrid();
    if (!grid) return;
    latestIdeas = Array.isArray(ideas) ? ideas.slice(0, 6) : [];
    grid.innerHTML = latestIdeas.map((idea, index) => `
      <button class="idea-card ai-idea-card" data-inline-ai="${index}">
        <span class="idea-icon">${escapeText(idea.icon || '✦')}</span>
        <strong>${escapeText(idea.title)}</strong>
        <small>${escapeText(idea.description)}</small>
        <em>✦ AI</em>
      </button>`).join('');
    grid.querySelectorAll('[data-inline-ai]').forEach(button => {
      button.onclick = () => usePrompt(latestIdeas[Number(button.dataset.inlineAi)]?.prompt || '');
    });
    syncIdeaButton();
  }

  function renderIdeaError() {
    const grid = ideaGrid();
    if (!grid) return;
    if (latestIdeas.length) {
      renderIdeas(latestIdeas);
      return;
    }
    grid.innerHTML = `<div class="empty-card"><strong>${escapeText(t('ideaError'))}</strong></div>`;
    syncIdeaButton();
  }

  function parseIdeas(text) {
    const raw = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 6) : [];
  }

  async function generateIdeas(topicOverride = '') {
    const input = el('ideaPrompt');
    const topic = String(topicOverride || input?.value || '').trim();
    if (!topic || !window.CrewAI?.available?.() || !window.CrewAI?.hasApiKey?.()) return;
    if (input) input.value = topic;

    const requestSeq = ++ideaRequestSeq;
    const button = ideaButton();
    if (button) {
      button.disabled = false;
      button.setAttribute('aria-busy', 'true');
      button.textContent = latestIdeas.length ? t('more') : t('generate');
    }
    renderIdeaLoading();

    try {
      const langName = language() === 'en' ? 'English' : 'Traditional Chinese (Taiwan)';
      const prompt = `You are an inventive mobile mini-app product designer. The user gives a tiny theme: "${topic}". Invent exactly 6 diverse, immediately useful or delightful mini-app ideas for Crew Builder. Prefer ideas that can be used instantly on a phone. Available native capabilities: shake/accelerometer, location, vibration, clipboard and share. Use native capabilities only when genuinely useful. Respond ONLY with a JSON array, no markdown. Each object must have: {"icon":"one emoji","title":"short title in ${langName}","description":"one short sentence in ${langName}","prompt":"a detailed build instruction in ${langName}, mentioning relevant crew APIs only when needed"}. Avoid login, payments, medical diagnosis and network-dependent ideas.`;
      const result = await window.CrewAI.generate(prompt, 'auto');
      if (requestSeq !== ideaRequestSeq) return;
      renderIdeas(parseIdeas(result.text));
    } catch (error) {
      if (requestSeq !== ideaRequestSeq) return;
      renderIdeaError();
      window.showToast?.(error?.message || t('ideaError'), true);
    } finally {
      if (requestSeq === ideaRequestSeq && button) {
        button.removeAttribute('aria-busy');
        button.disabled = false;
        syncIdeaButton();
      }
    }
  }

  const capabilityTopics = {
    en: [
      'creative useful apps using phone shake',
      'creative useful apps using phone motion and accelerometer',
      'creative useful apps using current location',
      'creative useful apps using clipboard copy',
      'creative useful apps using vibration feedback',
      'creative useful apps built around sharing results'
    ],
    'zh-TW': [
      '用搖一搖做有趣又實用的手機工具',
      '用手機動作感測做有趣又實用的工具',
      '用目前位置做旅行或生活工具',
      '用剪貼簿快速複製做實用工具',
      '用震動回饋做計時、提醒或遊戲工具',
      '用分享結果做實用的小工具'
    ]
  };

  document.addEventListener('click', event => {
    const build = event.target?.closest?.('#forgeBtn');
    if (build) {
      showPlanningCard(el('promptInput')?.value || '');
      return;
    }

    const generate = event.target?.closest?.('#ideaGenerate');
    if (generate) {
      event.preventDefault();
      event.stopImmediatePropagation();
      generateIdeas();
      return;
    }

    const capability = event.target?.closest?.('#phoneCapabilityGrid [data-cap]');
    if (capability) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const index = Number(capability.dataset.cap || 0);
      const topics = capabilityTopics[language()] || capabilityTopics.en;
      const topic = topics[index] || topics[0];
      const input = el('ideaPrompt');
      if (input) input.value = topic;
      generateIdeas(topic);
      el('exploreSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, true);

  document.addEventListener('keydown', event => {
    if (event.target === el('ideaPrompt') && event.key === 'Enter') {
      event.preventDefault();
      event.stopImmediatePropagation();
      generateIdeas();
      return;
    }
    if (event.target === el('promptInput') && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      showPlanningCard(el('promptInput')?.value || '');
    }
  }, true);

  el('uiLanguageSelect')?.addEventListener('change', () => setTimeout(() => {
    syncIdeaButton();
    paintBuildCard();
  }, 0));
  syncIdeaButton();
  syncBuildMode();
})();
