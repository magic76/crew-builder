(() => {
  const DB_NAME = 'crew-builder.db';
  const DB_VERSION = 1;
  const META_STORE = 'meta';
  const RUNTIME_STORE = 'runtime';
  const APPS_KEY = 'apps';
  const LEGACY_APP_KEYS = ['crew-builder.apps.v1', 'crew-forge.apps.v1', 'crew-forge.apps.v0'];
  const LEGACY_RUNTIME_PREFIXES = ['crew-builder.runtime.', 'crew-forge.runtime.'];
  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB is unavailable on this device.'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
        if (!db.objectStoreNames.contains(RUNTIME_STORE)) db.createObjectStore(RUNTIME_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open Crew Builder storage.'));
      request.onblocked = () => reject(new Error('Crew Builder storage upgrade is blocked.'));
    });
    return dbPromise;
  }

  async function transact(storeName, mode, operation) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let request;
      try { request = operation(store); } catch (error) { reject(error); return; }
      if (request) {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Crew Builder storage request failed.'));
      } else {
        tx.oncomplete = () => resolve(undefined);
      }
      tx.onerror = () => reject(tx.error || new Error('Crew Builder storage transaction failed.'));
      tx.onabort = () => reject(tx.error || new Error('Crew Builder storage transaction was aborted.'));
    });
  }

  const getValue = (store, key) => transact(store, 'readonly', s => s.get(key));
  const putValue = (store, key, value) => transact(store, 'readwrite', s => s.put(value, key));
  const deleteValue = (store, key) => transact(store, 'readwrite', s => s.delete(key));

  function parseApps(raw) {
    try {
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  async function loadApps() {
    const stored = await getValue(META_STORE, APPS_KEY);
    if (Array.isArray(stored)) return stored;

    let migrated = [];
    for (const key of LEGACY_APP_KEYS) {
      const raw = localStorage.getItem(key);
      if (raw == null) continue;
      migrated = parseApps(raw);
      if (migrated.length || raw.trim() === '[]') break;
    }
    await putValue(META_STORE, APPS_KEY, migrated);
    LEGACY_APP_KEYS.forEach(key => {
      try { localStorage.removeItem(key); } catch (_) {}
    });
    return migrated;
  }

  async function saveApps(apps) {
    try {
      await putValue(META_STORE, APPS_KEY, Array.isArray(apps) ? apps : []);
      return true;
    } catch (error) {
      const message = error?.name === 'QuotaExceededError'
        ? 'Crew Builder storage is full. Delete unused apps or versions and try again.'
        : (error?.message || 'Could not save Crew Builder apps.');
      throw new Error(message);
    }
  }

  async function loadRuntime(appId) {
    let state = await getValue(RUNTIME_STORE, appId);
    if (state && typeof state === 'object') return state;

    state = {};
    for (const prefix of LEGACY_RUNTIME_PREFIXES) {
      const key = prefix + appId;
      const raw = localStorage.getItem(key);
      if (raw == null) continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') state = parsed;
      } catch (_) {}
      break;
    }
    await putValue(RUNTIME_STORE, appId, state);
    LEGACY_RUNTIME_PREFIXES.forEach(prefix => {
      try { localStorage.removeItem(prefix + appId); } catch (_) {}
    });
    return state;
  }

  async function runtimeGet(appId, key, fallback = null) {
    const state = await loadRuntime(appId);
    return Object.prototype.hasOwnProperty.call(state, key) ? state[key] : fallback;
  }

  async function runtimeSet(appId, key, value) {
    const state = await loadRuntime(appId);
    state[key] = value;
    await putValue(RUNTIME_STORE, appId, state);
    return true;
  }

  async function runtimeRemove(appId, key) {
    const state = await loadRuntime(appId);
    delete state[key];
    await putValue(RUNTIME_STORE, appId, state);
    return true;
  }

  async function runtimeAll(appId) {
    return { ...(await loadRuntime(appId)) };
  }

  async function deleteRuntime(appId) {
    await deleteValue(RUNTIME_STORE, appId);
    LEGACY_RUNTIME_PREFIXES.forEach(prefix => {
      try { localStorage.removeItem(prefix + appId); } catch (_) {}
    });
  }

  async function estimate() {
    try { return await navigator.storage?.estimate?.(); } catch (_) { return null; }
  }

  window.CrewStorage = {
    loadApps,
    saveApps,
    runtimeGet,
    runtimeSet,
    runtimeRemove,
    runtimeAll,
    deleteRuntime,
    estimate
  };
})();