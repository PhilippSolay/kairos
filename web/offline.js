// Kiros offline cache (Phase 0 — offline READ).
//
// Zero-dep IndexedDB wrapper. Snapshots GET responses keyed by request path so
// the installed PWA can render the last-seen board when the network is gone.
// Exposes a tiny global; app.js calls it from inside api(). Phase 1 will add a
// write outbox to this same database (bump DB_VERSION + add the store then).
"use strict";

window.kirosOffline = (function () {
  const DB_NAME = "kiros";
  const DB_VERSION = 1;
  const SNAP_STORE = "snapshots";
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(SNAP_STORE)) db.createObjectStore(SNAP_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  // Run fn(store) inside a transaction; resolve with the request's result.
  function run(store, mode, fn) {
    return openDB().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const request = fn(t.objectStore(store));
      t.oncomplete = () => resolve(request ? request.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }

  // Persist a GET response under its request path. Best-effort — a storage error
  // must never break the live request, we just won't have an offline copy.
  function snapshotPut(path, data) {
    return run(SNAP_STORE, "readwrite", (os) => os.put(data, path)).catch(() => {});
  }

  // Last snapshot for a path, or null if none / IndexedDB unavailable.
  function snapshotGet(path) {
    return run(SNAP_STORE, "readonly", (os) => os.get(path))
      .then((v) => (v === undefined ? null : v))
      .catch(() => null);
  }

  // Ask the browser to keep our data (resists iOS ~7-day eviction). Best-effort.
  function requestPersist() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(() => {});
      }
    } catch (e) { /* no Storage API — fine */ }
  }

  return { snapshotGet, snapshotPut, requestPersist };
})();
