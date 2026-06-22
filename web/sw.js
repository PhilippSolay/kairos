// Kiros service worker — app-shell cache only (offline READ).
//
// Deliberately dumb: it caches the static shell so the installed PWA opens
// offline, and PASSES /api/ straight through — data offline is handled in
// app.js (offline.js snapshot cache) where it's testable.
//
// VERSION + ASSETS are filled by kiros_web.py `_serve_sw` with the current
// deploy's combined md5, so every deploy ships a new SW → the browser
// reinstalls → the shell precache refreshes (no stale-asset trap behind
// Cloudflare). The raw file below is only ever served through that injector.
const VERSION = "__SW_VERSION__";
const ASSETS = __SW_ASSETS__;
const SHELL = "kiros-shell-" + VERSION;
const FONT_HOST = /^fonts\.(googleapis|gstatic)\.com$/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;                 // writes are never the SW's job
  const url = new URL(req.url);

  // Data: let it reach the network; app.js falls back to the IndexedDB snapshot.
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return;

  // App shell: cache-first (ignore ?v= cache-bust query so versioned refs match).
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then((hit) =>
        hit || fetch(req).catch(() => caches.match("/index.html", { ignoreSearch: true }))
      )
    );
    return;
  }

  // Google Fonts: runtime cache-first so the serif survives offline.
  if (FONT_HOST.test(url.host)) {
    event.respondWith(
      caches.open(SHELL).then((cache) =>
        cache.match(req).then((hit) =>
          hit || fetch(req).then((res) => { cache.put(req, res.clone()); return res; })
        )
      )
    );
  }
});
