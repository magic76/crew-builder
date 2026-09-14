const STORAGE_KEY = 'crew-forge.apps.v1';
const LEGACY_STORAGE_KEY = 'crew-forge.apps.v0';
const ACTIVE_KEY = 'crew-forge.active.v0';
const RUNTIME_PREFIX = 'crew-forge.runtime.';
const MODEL_KEY = 'crew-forge.gemini-model';
const MAX_VERSIONS = 20;

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
const settingsSheet = el('settingsSheet');
const modelSelect = el('modelSelect');
const apiKeyInput = el('apiKeyInput');
const modelPill = el('modelPill');
const keyState = el('keyState');
const toast = el('toast');

let apps = loadApps();
let activeAppId = localStorage.getItem(ACTIVE_KEY) || null;
let busy = false;

setTimeout(init, 0);

function init() {
  bindUi();
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
  versionBtn.addEventListener('click', showVersionInfo);
  el('settingsBtn').addEventListener('click', openSettings);
  modelPill.addEventListener('click', openSettings);
  el('settingsCloseBtn').addEventListener('click', closeSettings);
  el('saveSettingsBtn').addEventListener('click', saveSettings);
  el('clearKeyBtn').addEventListener('click', clearApiKey);
  modifySheet.addEventListener('click', (event) => { if (event.target === modifySheet) closeModify(); });
  settingsSheet.addEventListener('click', (event) => { if (event.target === settingsSheet) closeSettings(); });
  window.addEventListener('message', handleRuntimeMessage);
}

function loadApps() {
  try {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (Array.isArray(current)) return current;
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '[]');
    if (Array.isArray(legacy)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
      return legacy;
    }
  } catch (_) {}
  return [];
}

function saveApps() { localStorage.setItem(STORAGE_KEY, JSON.stringify(apps)); }
function getActiveApp() { return apps.find((app) => app.id === activeAppId) || null; }
function selectedModel() { return localStorage.getItem(MODEL_KEY) || 'auto'; }
function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `forge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

function saveSettings() {
  const model = modelSelect.value || 'auto';
  localStorage.setItem(MODEL_KEY, model);
  const key = apiKeyInput.value.trim();
  if (key) window.CrewAI?.setApiKey?.(key);
  apiKeyInput.value = '';
  updateModelUi();
  refreshKeyState();
  closeSettings();
  showToast('Gemini settings saved');
}

function clearApiKey() {
  window.CrewAI?.clearApiKey?.();
  apiKeyInput.value = '';
  refreshKeyState();
  showToast('API key cleared');
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
  const sorted = [...apps].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (!sorted.length) {
    libraryEl.innerHTML = `<div class="empty-card"><div class="empty-icon">◇</div><strong>No forged apps yet</strong><span>Your first mini app will appear here.</span></div>`;
    return;
  }
  libraryEl.innerHTML = sorted.map((app) => `
    <button class="app-card" data-app-id="${escapeAttr(app.id)}">
      <div class="app-card-icon">${escapeHtml(app.icon || '✦')}</div>
      <div class="app-card-copy"><strong>${escapeHtml(app.name || 'Untitled App')}</strong><span>${escapeHtml(app.summary || app.originalPrompt || 'Generated mini app')}</span></div>
      <div class="app-card-meta">v${Math.max(1, app.versions?.length || 1)}</div>
    </button>`).join('');
  libraryEl.querySelectorAll('[data-app-id]').forEach((button) => {
    button.addEventListener('click', () => openApp(button.dataset.appId));
  });
}

function showHome() {
  activeAppId = null;
  localStorage.removeItem(ACTIVE_KEY);
  appView.hidden = true;
  homeView.hidden = false;
  preview.srcdoc = '';
  renderLibrary();
}

function openApp(id) {
  const app = apps.find((item) => item.id === id);
  if (!app) return;
  activeAppId = id;
  localStorage.setItem(ACTIVE_KEY, id);
  homeView.hidden = true;
  appView.hidden = false;
  appTitle.textContent = app.name || 'Crew Forge';
  undoBtn.disabled = !app.versions || app.versions.length < 2;
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
  setBusy(true, 'Forging your app', 'Gemini is building the first version…');
  const app = {
    id: createId(), name: deriveName(request), icon: '✦', summary: request, originalPrompt: request,
    model: selectedModel(), html: '', versions: [], createdAt: Date.now(), updatedAt: Date.now()
  };
  apps.unshift(app);
  activeAppId = app.id;
  saveApps();
  try {
    const result = await runForgeTurn(buildCreatePrompt(request), app.model);
    applyForgeResult(app, result, request);
    promptInput.value = '';
    openApp(app.id);
    showToast(`App forged · ${shortModel(result.model)}`);
  } catch (error) {
    apps = apps.filter((item) => item.id !== app.id);
    saveApps();
    activeAppId = null;
    showToast(error.message || 'Forge failed', true);
  } finally { setBusy(false); }
}

async function modifyApp(rawRequest) {
  const request = String(rawRequest || '').trim();
  const app = getActiveApp();
  if (!request || !app || busy || !ensureGeminiReady()) return;
  closeModify();
  setBusy(true, 'Updating your app', 'Gemini is applying the change…');
  try {
    const result = await runForgeTurn(buildModifyPrompt(request, app), selectedModel());
    applyForgeResult(app, result, request);
    modifyInput.value = '';
    openApp(app.id);
    showToast(`Changes applied · ${shortModel(result.model)}`);
  } catch (error) {
    showToast(error.message || 'Update failed', true);
  } finally { setBusy(false); }
}

async function runForgeTurn(prompt, model) {
  return window.CrewAI.generate(prompt, model || 'auto');
}

function applyForgeResult(app, result, request) {
  const html = extractHtml(result.text);
  if (!html) throw new Error('Gemini did not return a runnable HTML app.');
  app.html = html;
  app.model = result.model || app.model || selectedModel();
  app.updatedAt = Date.now();
  app.name = extractAppName(html) || app.name;
  app.versions = Array.isArray(app.versions) ? app.versions : [];
  app.versions.push({ html, request, model: app.model, createdAt: Date.now() });
  if (app.versions.length > MAX_VERSIONS) app.versions.splice(0, app.versions.length - MAX_VERSIONS);
  saveApps();
}

function undoActiveApp() {
  const app = getActiveApp();
  if (!app || !app.versions || app.versions.length < 2 || busy) return;
  app.versions.pop();
  const previous = app.versions[app.versions.length - 1];
  app.html = previous.html;
  app.model = previous.model || app.model;
  app.updatedAt = Date.now();
  saveApps();
  openApp(app.id);
  showToast('Restored previous version');
}

function showVersionInfo() {
  const app = getActiveApp();
  if (!app) return;
  const count = Math.max(1, app.versions?.length || 1);
  showToast(`Version ${count} · ${shortModel(app.model)}`);
}

function renderPreview(app) {
  if (!app?.html) {
    preview.srcdoc = '<!doctype html><html><body style="font-family:system-ui;background:#0b1020;color:#fff;display:grid;place-items:center;height:100vh;margin:0">No preview yet</body></html>';
    return;
  }
  preview.srcdoc = injectRuntimeBridge(app.html, app.id);
}

function injectRuntimeBridge(html, appId) {
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'">`;
  const bridge = `<script>
(() => {
  const pending = new Map(); let seq = 0;
  const call = (method, payload = {}) => new Promise((resolve, reject) => {
    const id = 'crew_' + Date.now() + '_' + (++seq);
    pending.set(id, { resolve, reject });
    parent.postMessage({ __crewForge: true, type: 'request', id, appId: ${JSON.stringify(appId)}, method, payload }, '*');
    setTimeout(() => { if (!pending.has(id)) return; pending.delete(id); reject(new Error('Crew runtime request timed out')); }, 8000);
  });
  addEventListener('message', (event) => {
    const msg = event.data || {}; if (!msg.__crewForge || msg.type !== 'response') return;
    const item = pending.get(msg.id); if (!item) return; pending.delete(msg.id);
    if (msg.error) item.reject(new Error(msg.error)); else item.resolve(msg.value);
  });
  window.crew = {
    storage: {
      get: (key, fallback = null) => call('storage.get', { key, fallback }),
      set: (key, value) => call('storage.set', { key, value }),
      remove: (key) => call('storage.remove', { key }),
      all: () => call('storage.all')
    },
    vibrate: (pattern = 60) => call('vibrate', { pattern }),
    share: (data = {}) => call('share', data)
  };
})();
<\/script>`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${csp}${bridge}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html([^>]*)>/i, `<html$1><head>${csp}${bridge}</head>`);
  return `<!doctype html><html><head>${csp}${bridge}</head><body>${html}</body></html>`;
}

async function handleRuntimeMessage(event) {
  const msg = event.data || {};
  if (!msg.__crewForge || msg.type !== 'request' || !msg.id || !msg.appId) return;
  const respond = (value, error = null) => event.source?.postMessage({ __crewForge: true, type: 'response', id: msg.id, value, error }, '*');
  try {
    const key = `${RUNTIME_PREFIX}${msg.appId}`;
    const state = readJson(key, {});
    const payload = msg.payload || {};
    if (msg.method === 'storage.get') {
      respond(Object.prototype.hasOwnProperty.call(state, payload.key) ? state[payload.key] : payload.fallback);
    } else if (msg.method === 'storage.set') {
      state[payload.key] = payload.value; localStorage.setItem(key, JSON.stringify(state)); respond(true);
    } else if (msg.method === 'storage.remove') {
      delete state[payload.key]; localStorage.setItem(key, JSON.stringify(state)); respond(true);
    } else if (msg.method === 'storage.all') {
      respond(state);
    } else if (msg.method === 'vibrate') {
      if (navigator.vibrate) navigator.vibrate(payload.pattern ?? 60); respond(true);
    } else if (msg.method === 'share') {
      if (navigator.share) {
        await navigator.share({ title: payload.title || '', text: payload.text || '', url: payload.url || undefined });
        respond(true);
      } else respond(false);
    } else respond(null, `Unsupported Crew runtime method: ${msg.method}`);
  } catch (error) {
    respond(null, error.message || String(error));
  }
}
window.handleRuntimeMessage = handleRuntimeMessage;

function buildCreatePrompt(request) {
  return `You are Crew Forge, a consumer AI mini-app builder. Build one polished, immediately usable mobile mini app for this request:\n\nUSER REQUEST:\n${request}\n\nOUTPUT CONTRACT:\n- Return one COMPLETE self-contained HTML document inside exactly one \`\`\`html fenced block.\n- Use inline CSS and JavaScript only. No external libraries, fonts, images, APIs, network requests, downloads, eval(), or dynamic script loading.\n- Mobile-first. Touch targets >= 44px. Make it feel like a real product, not a demo.\n- Do not create login, password, credential, payment, financial trading, medical diagnosis, or other sensitive-data collection flows.\n- Do NOT use localStorage/sessionStorage directly. Persistent state uses await crew.storage.get(key, fallback), await crew.storage.set(key, value), await crew.storage.remove(key), await crew.storage.all().\n- Optional helpers: await crew.vibrate(pattern), await crew.share({ title, text, url }).\n- Do not access parent/top DOM. Do not navigate.\n- Include a meaningful <title>.\n- Handle empty/error states.\n- Prefer simple, reliable interactions over ambitious features.`;
}

function buildModifyPrompt(request, app) {
  return `You are Crew Forge. Modify the mini app below according to the user's change.\n\nUSER CHANGE:\n${request}\n\nCURRENT APP (authoritative — this may be an older version after Undo):\n---BEGIN CURRENT HTML---\n${app.html}\n---END CURRENT HTML---\n\nRULES:\n- Preserve existing behavior, visual identity, and user data unless the request requires changing them.\n- Make the smallest coherent change that fully satisfies the request.\n- Return the UPDATED COMPLETE self-contained HTML document inside exactly one \`\`\`html fenced block.\n- Never return a diff or partial snippet.\n- Keep using crew.storage instead of localStorage/sessionStorage.\n- No external libraries, network requests, downloads, eval(), dynamic script loading, credential collection, or top/parent DOM access.`;
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
  try { const value = JSON.parse(localStorage.getItem(key)); return value && typeof value === 'object' ? value : fallback; }
  catch (_) { return fallback; }
}
function setBusy(value, title = '', detail = '') {
  busy = value;
  statusOverlay.hidden = !value;
  if (title) statusTitle.textContent = title;
  if (detail) statusDetail.textContent = detail;
  forgeBtn.disabled = value;
  modifyBtn.disabled = value;
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
