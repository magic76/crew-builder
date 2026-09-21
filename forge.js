const STORAGE_KEY = 'crew-builder.apps.v1';
const LEGACY_STORAGE_KEYS = ['crew-forge.apps.v1', 'crew-forge.apps.v0'];
const ACTIVE_KEY = 'crew-builder.active.v1';
const LEGACY_ACTIVE_KEYS = ['crew-forge.active.v0'];
const RUNTIME_PREFIX = 'crew-builder.runtime.';
const LEGACY_RUNTIME_PREFIX = 'crew-forge.runtime.';
const MODEL_KEY = 'crew-builder.gemini-model';
const LEGACY_MODEL_KEY = 'crew-forge.gemini-model';
const MAX_VERSIONS = 20;
const MAX_HTML_BYTES = 500_000;

const MODEL_LABELS = {
  auto: 'Auto',
  'gemini-3.6-flash': '3.6 Flash',
  'gemini-3.5-flash': '3.5 Flash',
  'gemini-3.5-flash-lite': '3.5 Flash-Lite',
  'gemini-3.1-pro-preview': '3.1 Pro'
};

const el = (id) => document.getElementById(id);
const homeView = el('homeView');
const appView = el('appView');
const libraryEl = el('library');
const promptInput = el('promptInput');
const forgeBtn = el('forgeBtn');
const statusOverlay = el('statusOverlay');
const statusTitle = el('statusTitle');
const statusDetail = el('statusDetail');
const preview = el('preview');
const appTitle = el('appTitle');
const modifySheet = el('modifySheet');
const modifyInput = el('modifyInput');
const modifyBtn = el('modifyBtn');
const undoBtn = el('undoBtn');
const versionBtn = el('versionBtn');
const appMenuSheet = el('appMenuSheet');
const versionHistorySheet = el('versionHistorySheet');
const settingsSheet = el('settingsSheet');
const modelSelect = el('modelSelect');
const apiKeyInput = el('apiKeyInput');
const modelPill = el('modelPill');
const keyState = el('keyState');
const toast = el('toast');

migrateLocalStorage();
let apps = [];
let activeAppId = localStorage.getItem(ACTIVE_KEY) || null;
let busy = false;
let initialized = false;

async function init() {
  if (initialized) return;
  initialized = true;
  bindUi();
  try {
    apps = window.CrewStorage?.loadApps ? await window.CrewStorage.loadApps() : [];
    apps = apps.map(normalizeAppRecord);
    await recoverInterruptedBuilds();
  } catch (error) {
    initialized = false;
    showToast(error.message || 'Could not open Crew Builder storage', true);
    return;
  }
  const selected = localStorage.getItem(MODEL_KEY) || 'auto';
  modelSelect.value = MODEL_LABELS[selected] ? selected : 'auto';
  updateModelUi();
  refreshKeyState();
  renderLibrary();
  if (activeAppId && apps.some((app) => app.id === activeAppId)) openApp(activeAppId);
}

function bindUi() {
  forgeBtn.addEventListener('click', () => createApp(promptInput.value));
  promptInput.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') createApp(promptInput.value);
  });
  document.querySelectorAll('[data-starter]').forEach((button) => {
    button.addEventListener('click', () => {
      promptInput.value = button.dataset.starter || '';
      promptInput.focus();
    });
  });
  el('backBtn').addEventListener('click', showHome);
  el('modifyOpenBtn').addEventListener('click', openModify);
  el('modifyCloseBtn').addEventListener('click', closeModify);
  modifyBtn.addEventListener('click', () => modifyApp(modifyInput.value));
  undoBtn.addEventListener('click', undoActiveApp);
  versionBtn.addEventListener('click', openAppMenu);
  el('appMenuCloseBtn')?.addEventListener('click', closeAppMenu);
  appMenuSheet?.addEventListener('click', (event) => { if (event.target === appMenuSheet) closeAppMenu(); });
  el('renameAppBtn')?.addEventListener('click', renameActiveApp);
  el('duplicateAppBtn')?.addEventListener('click', duplicateActiveApp);
  el('deleteAppBtn')?.addEventListener('click', deleteActiveApp);
  el('historyAppBtn')?.addEventListener('click', openVersionHistory);
  el('versionHistoryCloseBtn')?.addEventListener('click', closeVersionHistory);
  versionHistorySheet?.addEventListener('click', (event) => { if (event.target === versionHistorySheet) closeVersionHistory(); });
  const pinButton = el('pinAppBtn');
  if (pinButton) pinButton.onclick = toggleActivePin;
  el('settingsBtn').addEventListener('click', openSettings);
  modelPill.addEventListener('click', openSettings);
  el('settingsCloseBtn').addEventListener('click', closeSettings);
  el('saveSettingsBtn').addEventListener('click', saveSettings);
  el('clearKeyBtn').addEventListener('click', clearApiKey);
  modifySheet.addEventListener('click', (event) => { if (event.target === modifySheet) closeModify(); });
  settingsSheet.addEventListener('click', (event) => { if (event.target === settingsSheet) closeSettings(); });
  window.addEventListener('message', handleRuntimeMessage);
  window.addEventListener('crew-key-state', refreshKeyState);
}

window.addEventListener('load', init, { once: true });
if (document.readyState === 'complete') setTimeout(init, 0);

function migrateLocalStorage() {
  if (localStorage.getItem(STORAGE_KEY) == null) {
    for (const key of LEGACY_STORAGE_KEYS) {
      const value = localStorage.getItem(key);
      if (value != null) { localStorage.setItem(STORAGE_KEY, value); break; }
    }
  }
  if (localStorage.getItem(ACTIVE_KEY) == null) {
    for (const key of LEGACY_ACTIVE_KEYS) {
      const value = localStorage.getItem(key);
      if (value != null) { localStorage.setItem(ACTIVE_KEY, value); break; }
    }
  }
  if (localStorage.getItem(MODEL_KEY) == null && localStorage.getItem(LEGACY_MODEL_KEY) != null) {
    localStorage.setItem(MODEL_KEY, localStorage.getItem(LEGACY_MODEL_KEY));
  }
}

function normalizeAppRecord(app) {
  const value = app && typeof app === 'object' ? app : {};
  value.versions = Array.isArray(value.versions) ? value.versions : [];
  if (!value.versions.length && value.html) {
    value.versions.push({
      id: createId(),
      html: value.html,
      request: value.originalPrompt || value.summary || 'Imported app',
      model: value.model || 'auto',
      spec: value.spec || null,
      createdAt: value.updatedAt || value.createdAt || Date.now()
    });
  }
  value.versions = value.versions.map((version) => ({
    ...version,
    id: version?.id || createId(),
    spec: version?.spec || null
  }));
  let index = Number.isInteger(value.versionIndex) ? value.versionIndex : -1;
  if (index < 0 || index >= value.versions.length) {
    const matching = value.html ? value.versions.map(v => v.html).lastIndexOf(value.html) : -1;
    index = matching >= 0 ? matching : Math.max(0, value.versions.length - 1);
  }
  value.versionIndex = value.versions.length ? index : -1;
  const current = value.versions[value.versionIndex];
  if (current) {
    value.html = current.html || value.html || '';
    value.model = current.model || value.model;
    value.spec = current.spec || value.spec || null;
  }
  return value;
}

async function saveApps() {
  if (!window.CrewStorage?.saveApps) throw new Error('Crew Builder storage runtime is unavailable.');
  await window.CrewStorage.saveApps(apps);
}
function saveAppsSoon() {
  void saveApps().catch((error) => showToast(error.message || 'Could not save apps', true));
}
async function recoverInterruptedBuilds() {
  const hadBuildingApp = apps.some((app) => app.status === 'building');
  if (hadBuildingApp) {
    apps = apps.filter((app) => app.status !== 'building');
    await saveApps();
  }
  if (activeAppId && !apps.some((app) => app.id === activeAppId)) {
    activeAppId = null;
    localStorage.removeItem(ACTIVE_KEY);
  }
}
function getActiveApp() { return apps.find((app) => app.id === activeAppId) || null; }
function selectedModel() { return localStorage.getItem(MODEL_KEY) || 'auto'; }
function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `builder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function refreshKeyState() {
  const available = Boolean(window.CrewAI?.available?.());
  const hasKey = available && Boolean(window.CrewAI?.hasApiKey?.());
  keyState.textContent = hasKey ? 'API key ready' : (available ? 'API key required' : 'Android runtime required');
  keyState.classList.toggle('ready', hasKey);
}

function updateModelUi() {
  const model = selectedModel();
  modelPill.textContent = `Gemini · ${MODEL_LABELS[model] || model}`;
}

function openSettings() {
  modelSelect.value = selectedModel();
  apiKeyInput.value = '';
  apiKeyInput.placeholder = window.CrewAI?.hasApiKey?.() ? 'Key already saved · paste to replace' : 'Paste API key';
  settingsSheet.hidden = false;
}
function closeSettings() { settingsSheet.hidden = true; }

async function saveSettings() {
  const model = modelSelect.value || 'auto';
  localStorage.setItem(MODEL_KEY, model);
  const key = apiKeyInput.value.trim();
  try {
    if (key) await window.CrewAI?.setApiKey?.(key);
    apiKeyInput.value = '';
    updateModelUi();
    refreshKeyState();
    closeSettings();
    showToast('Gemini settings saved');
  } catch (error) {
    showToast(error.message || 'Could not save Gemini settings', true);
  }
}

async function clearApiKey() {
  try {
    await window.CrewAI?.clearApiKey?.();
    apiKeyInput.value = '';
    refreshKeyState();
    showToast('API key cleared');
  } catch (error) {
    showToast(error.message || 'Could not clear API key', true);
  }
}

function ensureGeminiReady() {
  if (!window.CrewAI?.available?.()) {
    showToast('Gemini runtime is available in the Android app', true);
    return false;
  }
  if (!window.CrewAI.hasApiKey()) {
    openSettings();
    showToast('Add your Gemini API key first', true);
    return false;
  }
  return true;
}

function renderLibrary() {
  const sorted = [...apps].sort((a, b) => {
    const aBuilding = a.status === 'building';
    const bBuilding = b.status === 'building';
    if (aBuilding !== bBuilding) return aBuilding ? -1 : 1;
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
  if (!sorted.length) {
    libraryEl.innerHTML = `<div class="empty-card"><div class="empty-icon">◇</div><strong>No built apps yet</strong><span>Your first mini app will appear here.</span></div>`;
    return;
  }
  const buildingLabel = document.documentElement.dataset.uiLanguage === 'en' ? 'Building' : '建立中';
  libraryEl.innerHTML = sorted.map((app) => {
    const building = app.status === 'building';
    const status = building ? `${buildingLabel} · 0s` : (app.summary || app.originalPrompt || 'Generated mini app');
    const pin = app.pinned ? ' · pinned' : '';
    return `
    <button class="app-card${building ? ' building' : ''}" data-app-id="${escapeAttr(app.id)}" data-status="${building ? 'building' : 'ready'}"${building ? ' disabled aria-disabled="true"' : ''}>
      <div class="app-card-icon">${escapeHtml(app.icon || '✦')}</div>
      <div class="app-card-copy"><strong>${escapeHtml(app.name || 'Untitled App')}</strong><span class="app-card-status"${building ? ` data-building-status="${escapeAttr(app.id)}"` : ''}>${escapeHtml(status)}</span></div>
      <div class="app-card-meta">${building ? '…' : `v${Math.max(1, app.versions?.length || 1)}${pin}`}</div>
    </button>`;
  }).join('');
  libraryEl.querySelectorAll('[data-app-id]').forEach((button) => {
    button.addEventListener('click', () => { if (button.dataset.status !== 'building') openApp(button.dataset.appId); });
  });
}

function showHome() {
  activeAppId = null;
  localStorage.removeItem(ACTIVE_KEY);
  closeAppMenu();
  closeVersionHistory();
  window.CrewAI?.clearSensors?.();
  appView.hidden = true;
  homeView.hidden = false;
  preview.srcdoc = '';
  renderLibrary();
}

function openApp(id) {
  const app = apps.find((item) => item.id === id);
  if (!app || app.status === 'building') return;
  activeAppId = id;
  localStorage.setItem(ACTIVE_KEY, id);
  homeView.hidden = true;
  appView.hidden = false;
  appTitle.textContent = app.name || 'Crew Builder';
  undoBtn.disabled = currentVersionIndex(app) <= 0;
  renderPreview(app);
}

function openModify() {
  const app = getActiveApp();
  if (!app || busy) return;
  modifyInput.value = '';
  modifySheet.hidden = false;
  setTimeout(() => modifyInput.focus(), 30);
}
function closeModify() { modifySheet.hidden = true; }

async function createApp(rawPrompt) {
  const request = String(rawPrompt || '').trim();
  if (!request || busy || !ensureGeminiReady()) return;
  setBusy(true, 'Planning your app', 'Turning your request into a focused AppSpec…');
  window.CrewBuilderUX?.setStep?.('prepare');
  const app = {
    id: createId(), name: deriveName(request), icon: '✦', summary: request, originalPrompt: request, status: 'building',
    model: selectedModel(), spec: null, html: '', versions: [], versionIndex: -1, createdAt: Date.now(), updatedAt: Date.now()
  };
  apps.unshift(app);
  try {
    await saveApps();
    renderLibrary();
    try {
      app.spec = await window.CrewAppSpec?.plan?.(request, app.model) || null;
    } catch (error) {
      console.warn('AppSpec planning fallback:', error);
      app.spec = null;
    }
    setBusy(true, 'Building your app', 'Gemini is building the first version…');
    window.CrewBuilderUX?.setStep?.('generate');
    const result = await runForgeTurn(buildCreatePrompt(request, app.spec), app.model);
    await applyForgeResult(app, result, request, app.spec);
    promptInput.value = '';
    openApp(app.id);
    showToast(`App built · ${shortModel(result.model)}`);
  } catch (error) {
    apps = apps.filter((item) => item.id !== app.id);
    try { await saveApps(); } catch (_) {}
    renderLibrary();
    showToast(error.message || 'Build failed', true);
  } finally { setBusy(false); }
}

async function modifyApp(rawRequest) {
  const request = String(rawRequest || '').trim();
  const app = getActiveApp();
  if (!request || !app || busy || !ensureGeminiReady()) return;
  closeModify();
  setBusy(true, 'Planning the change', 'Updating the AppSpec before editing code…');
  window.CrewBuilderUX?.setStep?.('prepare');
  try {
    let nextSpec = app.spec || null;
    try {
      if (window.CrewAppSpec?.revise && app.spec) nextSpec = await window.CrewAppSpec.revise(request, app.spec, selectedModel());
      else if (window.CrewAppSpec?.plan) nextSpec = await window.CrewAppSpec.plan(`${app.originalPrompt || app.summary || ''}\n\nRequested change: ${request}`, selectedModel());
    } catch (error) {
      console.warn('AppSpec revision fallback:', error);
    }
    setBusy(true, 'Updating your app', 'Gemini is applying the change…');
    window.CrewBuilderUX?.setStep?.('generate');
    const result = await runForgeTurn(buildModifyPrompt(request, app, nextSpec), selectedModel());
    await applyForgeResult(app, result, request, nextSpec);
    modifyInput.value = '';
    openApp(app.id);
    showToast(`Changes applied · ${shortModel(result.model)}`);
  } catch (error) {
    showToast(error.message || 'Update failed', true);
  } finally { setBusy(false); }
}

function menuLanguage() {
  return document.documentElement.dataset.uiLanguage || localStorage.getItem('crew-builder.ui-language') || 'zh-TW';
}

function menuCopy() {
  return menuLanguage() === 'en'
    ? { renamePrompt: 'New app name', deleteConfirm: 'Delete this app? This cannot be undone.', copied: 'App duplicated', renamed: 'App renamed', deleted: 'App deleted', pinned: 'App pinned', unpinned: 'App unpinned' }
    : { renamePrompt: '輸入新的工具名稱', deleteConfirm: '確定刪除這個工具？刪除後無法復原。', copied: '已建立副本', renamed: '已重新命名', deleted: '已刪除工具', pinned: '已釘選工具', unpinned: '已取消釘選' };
}

function syncAppMenu() {
  const app = getActiveApp();
  if (!app) return;
  const pinButton = el('pinAppBtn');
  const pinLabel = pinButton?.querySelector('span');
  if (pinLabel) pinLabel.textContent = app.pinned ? (menuLanguage() === 'en' ? 'Unpin app' : '取消釘選') : (menuLanguage() === 'en' ? 'Pin app' : '釘選工具');
  const eyebrow = el('appMenuEyebrow');
  if (eyebrow) eyebrow.textContent = app.name || 'APP';
}

function openAppMenu(event) {
  event?.preventDefault();
  const app = getActiveApp();
  if (!app || app.status === 'building') return;
  window.CrewBuilderUX?.syncMenuLanguage?.();
  syncAppMenu();
  if (appMenuSheet) appMenuSheet.hidden = false;
}

function closeAppMenu() {
  if (appMenuSheet) appMenuSheet.hidden = true;
}

async function renameActiveApp() {
  const app = getActiveApp();
  if (!app) return;
  const copy = menuCopy();
  const name = window.prompt(copy.renamePrompt, app.name || '');
  if (!name || !name.trim()) return;
  app.name = name.trim();
  app.updatedAt = Date.now();
  await saveApps();
  renderLibrary();
  appTitle.textContent = app.name;
  syncAppMenu();
  closeAppMenu();
  showToast(copy.renamed);
}

async function duplicateActiveApp() {
  const app = getActiveApp();
  if (!app) return;
  const now = Date.now();
  const clone = JSON.parse(JSON.stringify(app));
  clone.id = createId();
  clone.name = (app.name || 'App') + (menuLanguage() === 'en' ? ' Copy' : ' 副本');
  clone.createdAt = now;
  clone.updatedAt = now;
  clone.status = 'ready';
  clone.pinned = false;
  clone.versions = (clone.versions || []).map((version) => ({ ...version, id: createId() }));
  clone.versionIndex = Math.min(Math.max(0, clone.versionIndex ?? clone.versions.length - 1), Math.max(0, clone.versions.length - 1));
  apps.unshift(clone);
  await saveApps();
  renderLibrary();
  closeAppMenu();
  showToast(menuCopy().copied);
}

async function toggleActivePin() {
  const app = getActiveApp();
  if (!app) return;
  app.pinned = !app.pinned;
  app.updatedAt = Date.now();
  await saveApps();
  renderLibrary();
  syncAppMenu();
  showToast(app.pinned ? menuCopy().pinned : menuCopy().unpinned);
}

async function deleteActiveApp() {
  const app = getActiveApp();
  if (!app) return;
  const copy = menuCopy();
  if (!window.confirm(copy.deleteConfirm)) return;
  const id = app.id;
  apps = apps.filter((item) => item.id !== id);
  await saveApps();
  localStorage.removeItem(ACTIVE_KEY);
  await window.CrewStorage?.deleteRuntime?.(id);
  window.CrewAI?.clearSensors?.();
  closeAppMenu();
  if (activeAppId === id) showHome();
  else renderLibrary();
  showToast(copy.deleted);
}

function updateBuildingProgress(seconds, label, unit) {
  document.querySelectorAll('[data-building-status]').forEach((node) => {
    node.textContent = label + ' · ' + seconds + unit;
  });
}

window.CrewBuilder = {
  getActiveApp,
  renameActiveApp,
  duplicateActiveApp,
  toggleActivePin,
  deleteActiveApp,
  openVersionHistory,
  restoreVersion,
  currentVersionIndex,
  runtimeRequestCheck,
  capabilitiesForApp,
  updateBuildingProgress,
  syncAppMenu
};

async function runForgeTurn(prompt, model) {
  const first = await window.CrewAI.generate(prompt, model || 'auto');
  window.CrewBuilderUX?.setStep?.('validate');
  const firstHtml = extractHtml(first.text);
  const issues = validateGeneratedHtml(firstHtml);
  if (!issues.length) return first;

  setBusy(true, 'Repairing generated app', issues[0]);
  const repair = await window.CrewAI.generate(buildRepairPrompt(firstHtml || first.text, issues), first.model || model || 'auto');
  const repairedHtml = extractHtml(repair.text);
  const remaining = validateGeneratedHtml(repairedHtml);
  if (remaining.length) throw new Error(`Generated app failed validation: ${remaining[0]}`);
  return repair;
}

function validateGeneratedHtml(html) {
  const issues = [];
  const value = String(html || '').trim();
  if (!value) return ['No complete HTML document was returned'];
  if (value.length > MAX_HTML_BYTES) issues.push('Generated HTML is too large');
  if (!/<html[\s>]/i.test(value) || !/<\/html>/i.test(value)) issues.push('Missing complete <html> document');
  if (!/<title[\s>][\s\S]*?<\/title>/i.test(value)) issues.push('Missing <title>');

  const forbidden = [
    [/<script[^>]+src\s*=/i, 'External scripts are not allowed'],
    [/<link[^>]+(?:stylesheet|preload|modulepreload)/i, 'External styles/resources are not allowed'],
    [/\bfetch\s*\(/i, 'Network fetch is not allowed'],
    [/\bXMLHttpRequest\b/i, 'XMLHttpRequest is not allowed'],
    [/\bWebSocket\b/i, 'WebSocket is not allowed'],
    [/\blocalStorage\b|\bsessionStorage\b/i, 'Use crew.storage instead of browser storage'],
    [/\beval\s*\(|\bnew\s+Function\s*\(/i, 'Dynamic code execution is not allowed'],
    [/\bCrewNative\b|\bCrewDevice\b|\bCrewHost\b/i, 'Direct native bridge access is not allowed'],
  ];
  forbidden.forEach(([pattern, message]) => { if (pattern.test(value)) issues.push(message); });

  try {
    const doc = new DOMParser().parseFromString(value, 'text/html');
    const parserError = doc.querySelector('parsererror');
    if (parserError) issues.push('HTML parser error');
    const inlineScripts = [...doc.querySelectorAll('script:not([src])')]
      .map((script) => script.textContent || '')
      .join('\n');
    const crossFrameAccess = /\b(?:window|globalThis|self|frames)\s*\.\s*(?:parent|top)\b|\b(?:parent|top)\s*(?:\.|\[)/i;
    if (crossFrameAccess.test(inlineScripts)) issues.push('Parent/top access is not allowed');
    doc.querySelectorAll('script:not([src])').forEach((script) => {
      try { new Function(script.textContent || ''); } catch (error) { issues.push(`JavaScript syntax error: ${error.message}`); }
    });
  } catch (error) {
    issues.push(`Could not validate HTML: ${error.message}`);
  }
  return [...new Set(issues)].slice(0, 8);
}

async function applyForgeResult(app, result, request, spec = app.spec || null) {
  const html = extractHtml(result.text);
  if (!html) throw new Error('Gemini did not return a runnable HTML app.');
  app.html = html;
  app.status = 'ready';
  app.model = result.model || app.model || selectedModel();
  app.spec = spec || null;
  app.updatedAt = Date.now();
  app.name = extractAppName(html) || app.name;
  app.versions = Array.isArray(app.versions) ? app.versions : [];
  app.versions.push({
    id: createId(),
    html,
    request,
    model: app.model,
    spec: app.spec ? JSON.parse(JSON.stringify(app.spec)) : null,
    createdAt: Date.now()
  });
  if (app.versions.length > MAX_VERSIONS) app.versions.splice(0, app.versions.length - MAX_VERSIONS);
  app.versionIndex = app.versions.length - 1;
  await saveApps();
  window.CrewBuilderUX?.setStep?.('ready');
  renderLibrary();
}

function currentVersionIndex(app) {
  if (!app?.versions?.length) return -1;
  const index = Number.isInteger(app.versionIndex) ? app.versionIndex : app.versions.length - 1;
  return Math.min(Math.max(index, 0), app.versions.length - 1);
}

async function restoreVersion(app, index, toastMessage = '') {
  if (!app?.versions?.[index] || busy) return;
  const version = app.versions[index];
  app.versionIndex = index;
  app.html = version.html;
  app.model = version.model || app.model;
  app.spec = version.spec || app.spec || null;
  app.updatedAt = Date.now();
  await saveApps();
  openApp(app.id);
  renderVersionHistory();
  if (toastMessage) showToast(toastMessage);
}

async function undoActiveApp() {
  const app = getActiveApp();
  const index = currentVersionIndex(app);
  if (!app || index <= 0 || busy) return;
  await restoreVersion(app, index - 1, 'Restored previous version');
}

function openVersionHistory() {
  const app = getActiveApp();
  if (!app || !versionHistorySheet) return;
  closeAppMenu();
  renderVersionHistory();
  versionHistorySheet.hidden = false;
}

function closeVersionHistory() {
  if (versionHistorySheet) versionHistorySheet.hidden = true;
}

function renderVersionHistory() {
  const app = getActiveApp();
  const list = el('versionHistoryList');
  if (!app || !list) return;
  const current = currentVersionIndex(app);
  const versions = Array.isArray(app.versions) ? app.versions : [];
  list.innerHTML = versions.map((version, index) => {
    const selected = index === current;
    const date = new Date(version.createdAt || Date.now()).toLocaleString();
    const request = String(version.request || app.originalPrompt || '').replace(/\s+/g, ' ').trim();
    return `<button class="version-row${selected ? ' active' : ''}" data-version-index="${index}"${selected ? ' disabled' : ''}>
      <span><strong>v${index + 1}${selected ? ' · Current' : ''}</strong><small>${escapeHtml(date)}</small></span>
      <em>${escapeHtml(request.slice(0, 90) || 'Generated version')}</em>
    </button>`;
  }).reverse().join('');
  list.querySelectorAll('[data-version-index]').forEach((button) => {
    button.addEventListener('click', async () => {
      const index = Number(button.dataset.versionIndex);
      await restoreVersion(app, index, `Restored v${index + 1}`);
    });
  });
}

function showVersionInfo() {
  const app = getActiveApp();
  if (!app) return;
  const index = currentVersionIndex(app);
  showToast(`Version ${index + 1} of ${Math.max(1, app.versions?.length || 1)} · ${shortModel(app.model)}`);
}

function renderPreview(app) {
  window.CrewAI?.clearSensors?.();
  if (!app?.html) {
    preview.srcdoc = '<!doctype html><html><body style="font-family:system-ui;background:#0b1020;color:#fff;display:grid;place-items:center;height:100vh;margin:0">No preview yet</body></html>';
    return;
  }
  preview.srcdoc = injectRuntimeBridge(app.html, app.id);
}

const METHOD_CAPABILITY = {
  vibrate: 'vibration',
  share: 'share',
  location: 'location',
  clipboard: 'clipboard',
  'device.battery': 'battery',
  'tts.speak': 'tts',
  'tts.stop': 'tts'
};

function capabilitiesForApp(app) {
  const explicit = app?.spec?.nativeCapabilities;
  if (Array.isArray(explicit)) return new Set(explicit);
  const html = String(app?.html || '');
  const inferred = new Set();
  const patterns = {
    shake: /crew\.sensor\.onShake\b/,
    accelerometer: /crew\.sensor\.accelerometer\b/,
    gyroscope: /crew\.sensor\.gyroscope\b/,
    location: /crew\.location\.get\b/,
    vibration: /crew\.vibrate\b/,
    share: /crew\.share\b/,
    clipboard: /crew\.clipboard\.write\b/,
    battery: /crew\.device\.battery\b/,
    tts: /crew\.tts\.(?:speak|stop)\b/
  };
  Object.entries(patterns).forEach(([key, pattern]) => { if (pattern.test(html)) inferred.add(key); });
  return inferred;
}

function runtimeRequestCheck(event, msg) {
  if (!msg.__crewForge || msg.type !== 'request' || !msg.id || !msg.appId) return { handled: false };
  if (event.source !== preview?.contentWindow) return { handled: true, ok: false, error: 'Untrusted runtime frame' };
  const app = getActiveApp();
  if (!app || app.id !== msg.appId) return { handled: true, ok: false, error: 'App is not active' };
  const payload = msg.payload || {};
  const capability = (msg.method === 'sensor.subscribe' || msg.method === 'sensor.unsubscribe')
    ? String(payload.sensor || '')
    : METHOD_CAPABILITY[msg.method];
  if (capability && !capabilitiesForApp(app).has(capability)) {
    return { handled: true, ok: false, error: `Capability not granted: ${capability}`, app };
  }
  return { handled: true, ok: true, app };
}

function injectRuntimeBridge(html, appId) {
  const app = apps.find((item) => item.id === appId);
  const allowed = [...capabilitiesForApp(app)];
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'">`;
  const bridge = `<script>
(() => {
  const pending = new Map(); let seq = 0;
  const sensorListeners = { shake: new Set(), accelerometer: new Set(), gyroscope: new Set() };
  const allowedCapabilities = new Set(${JSON.stringify(allowed)});
  const call = (method, payload = {}) => new Promise((resolve, reject) => {
    const id = 'crew_' + Date.now() + '_' + (++seq);
    pending.set(id, { resolve, reject });
    parent.postMessage({ __crewForge: true, type: 'request', id, appId: ${JSON.stringify(appId)}, method, payload }, '*');
    setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      reject(new Error('Crew runtime request timed out'));
    }, 8000);
  });
  const subscribeSensor = (sensor, fn) => {
    if (typeof fn !== 'function') return () => {};
    if (!allowedCapabilities.has(sensor)) {
      console.warn('Crew capability not granted:', sensor);
      return () => {};
    }
    const listeners = sensorListeners[sensor];
    const first = listeners.size === 0;
    listeners.add(fn);
    if (first) call('sensor.subscribe', { sensor }).catch(error => console.warn(error.message));
    return () => {
      listeners.delete(fn);
      if (!listeners.size) call('sensor.unsubscribe', { sensor }).catch(() => {});
    };
  };
  addEventListener('message', (event) => {
    const msg = event.data || {};
    if (msg.__crewForge && msg.type === 'response') {
      const item = pending.get(msg.id);
      if (!item) return;
      pending.delete(msg.id);
      if (msg.error) item.reject(new Error(msg.error)); else item.resolve(msg.value);
      return;
    }
    if (msg.__crewForge && msg.type === 'native-sensor' && sensorListeners[msg.sensor]) {
      sensorListeners[msg.sensor].forEach(fn => { try { fn(msg.payload); } catch (_) {} });
    }
  });
  addEventListener('pagehide', () => {
    Object.entries(sensorListeners).forEach(([sensor, listeners]) => {
      if (listeners.size) call('sensor.unsubscribe', { sensor }).catch(() => {});
    });
  });
  window.crew = {
    capabilities: [...allowedCapabilities],
    storage: {
      get: (key, fallback = null) => call('storage.get', { key, fallback }),
      set: (key, value) => call('storage.set', { key, value }),
      remove: (key) => call('storage.remove', { key }),
      all: () => call('storage.all')
    },
    vibrate: (pattern = 60) => call('vibrate', { pattern }),
    share: (data = {}) => call('share', data),
    location: { get: () => call('location') },
    clipboard: { write: (text) => call('clipboard', { text: String(text || '') }) },
    sensor: {
      onShake: (fn) => subscribeSensor('shake', fn),
      accelerometer: (fn) => subscribeSensor('accelerometer', fn),
      gyroscope: (fn) => subscribeSensor('gyroscope', fn)
    },
    device: { battery: () => call('device.battery') },
    tts: {
      speak: (text, language = '') => call('tts.speak', { text: String(text || ''), language: String(language || '') }),
      stop: () => call('tts.stop')
    }
  };
})();
<\/script>`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${csp}${bridge}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html([^>]*)>/i, `<html$1><head>${csp}${bridge}</head>`);
  return `<!doctype html><html><head>${csp}${bridge}</head><body>${html}</body></html>`;
}

async function handleRuntimeMessage(event) {
  const msg = event.data || {};
  const check = runtimeRequestCheck(event, msg);
  if (!check.handled) return;
  const respond = (value, error = null) => event.source?.postMessage({ __crewForge: true, type: 'response', id: msg.id, value, error }, '*');
  if (!check.ok) { respond(null, check.error); return; }
  try {
    const payload = msg.payload || {};
    if (msg.method === 'storage.get') {
      respond(await window.CrewStorage.runtimeGet(msg.appId, payload.key, payload.fallback));
    } else if (msg.method === 'storage.set') {
      respond(await window.CrewStorage.runtimeSet(msg.appId, payload.key, payload.value));
    } else if (msg.method === 'storage.remove') {
      respond(await window.CrewStorage.runtimeRemove(msg.appId, payload.key));
    } else if (msg.method === 'storage.all') {
      respond(await window.CrewStorage.runtimeAll(msg.appId));
    } else if (msg.method === 'vibrate') {
      if (navigator.vibrate) navigator.vibrate(payload.pattern ?? 60);
      respond(true);
    } else if (msg.method === 'share') {
      if (navigator.share) {
        await navigator.share({ title: payload.title || '', text: payload.text || '', url: payload.url || undefined });
        respond(true);
      } else respond(false);
    } else {
      respond(null, `Unsupported Crew runtime method: ${msg.method}`);
    }
  } catch (error) {
    respond(null, error.message || String(error));
  }
}
window.handleRuntimeMessage = handleRuntimeMessage;

function buildCreatePrompt(request, spec = null) {
  const specText = spec
    ? `\n\nAPP SPEC (authoritative product plan):\n${JSON.stringify(spec, null, 2)}\n\nCAPABILITY SELECTION:\n${window.CrewAppSpec?.capabilityPrompt?.(spec) || '- No native capability is required.'}\n\nImplement this AppSpec faithfully. Do not use Crew capabilities that are not selected above.`
    : '\n\nNo AppSpec was available. Keep the app focused and use no native capabilities unless the user explicitly requested one.';
  return `You are Crew Builder, a consumer AI mini-app builder. Build one polished, immediately usable mobile mini app for this request:

USER REQUEST:
${request}${specText}

OUTPUT CONTRACT:
- Return one COMPLETE self-contained HTML document inside exactly one \`\`\`html fenced block.
- Use inline CSS and JavaScript only. No external libraries, fonts, images, APIs, network requests, downloads, eval(), or dynamic script loading.
- Mobile-first. Touch targets >= 44px. Make it feel like a real product, not a demo.
- Do not create login, password, credential, payment, financial trading, medical diagnosis, or other sensitive-data collection flows.
- Do NOT use localStorage/sessionStorage directly. Persistent state uses await crew.storage.get(key, fallback), await crew.storage.set(key, value), await crew.storage.remove(key), await crew.storage.all().
- Use only Crew APIs explicitly selected by the AppSpec. Available APIs include crew.vibrate, crew.share, crew.sensor, crew.location, crew.clipboard, crew.device and crew.tts.
- Never access CrewNative, CrewDevice, CrewHost, or any native bridge directly.
- Do not access parent/top DOM. Do not navigate.
- Include a meaningful <title>.
- Handle empty/error states.
- Prefer simple, reliable interactions over ambitious features.

LIVE VOICE CONTRACT:
- Every interactive app MUST register semantic voice actions after initialization with crew.live.registerActions(actions, handler).
- Actions must describe user intent, not screen coordinates. Example names: add_score, reset_game, start_timer, set_duration, add_item, remove_item.
- Each action object must include name, description, and a simple parameters object describing expected arguments.
- The handler receives (name, args), performs the same state change as the UI, updates the rendered UI, persists when needed, and returns a small useful result.
- Call crew.live.updateState(state) after initial load and whenever meaningful app state changes. Keep state compact and factual so voice can answer questions such as who is leading or how much time remains.
- Do not expose destructive or sensitive actions without a clear user-facing UI equivalent.${window.CrewLanguagePrompts?.outputLanguageRule?.() || ''}`;
}

function buildModifyPrompt(request, app, spec = app.spec || null) {
  const specText = spec
    ? `\n\nUPDATED APP SPEC (authoritative):\n${JSON.stringify(spec, null, 2)}\n\nCAPABILITY SELECTION:\n${window.CrewAppSpec?.capabilityPrompt?.(spec) || '- No native capability is required.'}`
    : '';
  return `You are Crew Builder. Modify the mini app below according to the user's change.

USER CHANGE:
${request}${specText}

CURRENT APP (authoritative — this may be an older version after Undo):
---BEGIN CURRENT HTML---
${app.html}
---END CURRENT HTML---

RULES:
- Preserve existing behavior, visual identity, user data, semantic Live actions, and Live state reporting unless the request requires changing them.
- If this older app does not yet use crew.live.registerActions and crew.live.updateState, add a compact semantic Live contract for its important interactions.
- Make the smallest coherent change that fully satisfies the request.
- Return the UPDATED COMPLETE self-contained HTML document inside exactly one \`\`\`html fenced block.
- Never return a diff or partial snippet.
- Keep using crew.storage instead of localStorage/sessionStorage.
- Use only Crew APIs selected by the updated AppSpec. Never access CrewNative, CrewDevice, CrewHost, or any native bridge directly.
- No external libraries, network requests, downloads, eval(), dynamic script loading, credential collection, or top/parent DOM access.${window.CrewLanguagePrompts?.outputLanguageRule?.() || ''}`;
}

function buildRepairPrompt(htmlOrText, issues) {
  return `You are Crew Builder's repair pass. Fix ONLY the deterministic runtime/contract problems below while preserving the intended app behavior and appearance.\n\nVALIDATION ISSUES:\n${issues.map((issue) => `- ${issue}`).join('\n')}\n\nCURRENT OUTPUT:\n---BEGIN OUTPUT---\n${String(htmlOrText || '').slice(0, MAX_HTML_BYTES)}\n---END OUTPUT---\n\nReturn one corrected COMPLETE self-contained HTML document inside exactly one \`\`\`html fenced block. Do not explain. Keep the app offline and sandbox-safe. Use crew.storage instead of browser storage. Preserve or add semantic crew.live.registerActions(...) and crew.live.updateState(...) support.${window.CrewLanguagePrompts?.outputLanguageRule?.() || ''}`;
}

function extractHtml(text) {
  const value = String(text || '');
  const fenced = value.match(/```html\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const doc = value.match(/(<!doctype html[\s\S]*<\/html>)/i) || value.match(/(<html[\s\S]*<\/html>)/i);
  return doc?.[1]?.trim() || '';
}

function extractAppName(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(match[1]).trim().slice(0, 60) : '';
}
function deriveName(prompt) {
  const clean = String(prompt || '').replace(/\s+/g, ' ').trim();
  return clean.length > 38 ? `${clean.slice(0, 38)}…` : clean || 'New App';
}
function shortModel(model) {
  if (!model) return 'Gemini';
  return MODEL_LABELS[model] || String(model).replace(/^gemini-/, 'Gemini ');
}
function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? value : fallback;
  } catch (_) { return fallback; }
}
function setBusy(value, title = '', detail = '') {
  busy = value;
  statusOverlay.hidden = !value;
  if (title) statusTitle.textContent = title;
  if (detail) statusDetail.textContent = detail;
  forgeBtn.disabled = value;
  modifyBtn.disabled = value;
  el('modifyOpenBtn').disabled = value;
}
let toastTimer = null;
function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2800);
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function escapeAttr(value) { return escapeHtml(value); }
function decodeEntities(value) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
}
