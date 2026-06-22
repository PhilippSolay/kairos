# PLAN — Offline support + sync

**Status (2026-06-22):** **Phase 0 BUILT + verified locally** (offline READ — manifest + service worker + IndexedDB board snapshot). Not yet committed/deployed. Phases 1–2 pending.
**Decisions locked (Philipp):** offline scope = **Everything** (capture, complete, edit, move, *and* drag-reorder); conflict policy = **silent last-write-wins** (offline change wins, no prompt); rollout = **Phase 0 first**; offline scores = **frozen until resync** (no JS scoring port).

**Phase 0 verification (local, port 8766):** SW registered + activated + controlling; shell cache `kiros-shell-<md5>` holds all 9 versioned assets + the runtime-cached serif font; GETs (`/api/board`, `/api/tasks`, `/api/me`, `/api/prefs`) snapshotted to IndexedDB; with `fetch` forced to fail, Board + Today re-render from cache (7 cards) and a tappable multi-state status chip (● Offline + ⟳) shows; tapping it (or the browser's `online` event) probes, refreshes the screen, and hides it. `/sw.js` token-injection unit-tested (`test_offline_sw.py`); 113 tests green; no console errors.

---

## 1. Goal

Let Philipp keep working when offline — on the iOS home-screen PWA especially — then sync automatically when back online. "Out of sync" (a task changed on another device while offline) resolves silently in favour of the offline edit.

## 2. Why this stays small (guardrail check)

Real-demand-driven (he hits actual offline moments) → passes the [[kiros-project]] anti-expansion guardrail. We keep it minimal by **not** building the things that make offline hard *in general* but are unneeded *here*:

- **No CRDTs / Yjs / Automerge / Replicache / ElectricSQL / PouchDB.** Those solve *multi-writer collaborative* editing. Kiros is **single-writer-per-account** — last-write-wins is correct and trivial.
- **No dependence on Background Sync API.** It's Chromium-only; iOS Safari doesn't support it. We drain the queue on the `online` event + app foreground. (Background Sync added later only as optional enhancement on Android/desktop.)
- **No new runtime dependencies.** Hand-rolled Service Worker + a ~100-line IndexedDB wrapper. Honors the zero-dep ethos.
- **No stable task IDs in `KIROS.md`.** Keeps the board file clean (his repeated preference — custom-sort deliberately avoided an `order:` field). Cost: cross-device same-task conflicts resolve by *fingerprint* match, not ID (see §6, accepted edge).
- **Server is ~unchanged.** The hard half already shipped: line-level optimistic concurrency (`originalRaw` → `409 {stale}`), tested in `test_conflict.py`.

## 3. What we already have (leverage)

- **Single network choke-point:** every write goes through `api()` at `web/app.js:19`. Outbox interception lives there.
- **OCC conflict primitive:** `_task_save` / `_complete` in `kiros_web.py` reject a stale `originalRaw` with `409 {ok:false,stale}`. That *is* the out-of-sync detector.
- **PWA meta tags already present** (`web/index.html:9-15`) — only missing manifest + service worker.
- **Public static serving + cache-bust:** `_serve_static` serves `.js`/`.webmanifest` publicly; `_serve_web_html` rewrites shell refs to `?v=<md5>` (`kiros_web.py:862`). We reuse both.

## 4. Architecture (3 layers)

```
WRITE (offline)   api() intercepts ─┬─> IndexedDB outbox (durable, ordered)
                                    └─> mutate in-memory task + re-render   (optimistic UI)
READ  (offline)   load() fetch fails ──> render from cached board snapshot + "offline" pill
RECONNECT         online event / app foreground / startup ──> drainOutbox()
                     replay each op in order via real api()
                     success → thread echoed `raw` forward to later ops on same task
                     409/stale → silent LWW: re-fetch, fingerprint-match, re-issue (offline wins)
                     then re-fetch board to reconcile
```

- **Service Worker** (`web/sw.js`): caches the **app shell only** (HTML/CSS/JS/icons/font). Deliberately *bypasses `/api/`* — data offline is handled in app.js where it's testable. Keeps the SW dumb (~60 lines).
- **app.js**: board snapshot cache, outbox enqueue, optimistic in-memory updates, replay engine, offline/syncing indicator.
- **server**: serve `sw.js` + `manifest.webmanifest`, inject SW version. No logic/data change.

### The threading trick (why no porting, no stable IDs needed)

`originalRaw` is the OCC token. Offline edits chain (edit A: raw0→raw1, edit B: raw1→raw2), but **offline we never compute raw** — cards render from *fields*, not the raw line. Instead we assign each in-memory task a session id `_cid` and key outbox ops by it. At **replay time (online)** the server echoes the new `raw` on each save (`{ok:true, raw}`); before sending a later op for the same `_cid`, we patch its `originalRaw`/`raw` to that echoed value. Chains rebuild from server truth — no client-side line serialization, no `id:` meta field.

**Worked example** (offline: rename task, then complete it):
1. Enqueue `save{_cid:7, fields, originalRaw: raw0}`; enqueue `complete{_cid:7, raw: raw0}`. Update task in memory; re-render.
2. Reconnect. Replay `save` → server `replace_line(raw0)` → echoes `raw1`. Record `_cid:7 → raw1`.
3. Replay `complete` → patch its `raw` from `raw0` to `raw1` → server `remove_line(raw1)` succeeds. Done.

**Reorder** (`/api/reorder {lane, order:[raws]}`) threads the same way: store `order` as `_cid`s; at replay, map each `_cid` → its latest echoed raw → send. If the server lane changed underneath (permutation refused), re-fetch + re-issue best-effort (order is the least-critical field to preserve).

## 5. Phases

### Phase 0 — PWA shell + offline READ (ship first, standalone value)
- `web/manifest.webmanifest` (name/short_name, icons reuse `logo.png`+`apple-touch-icon.png`, `theme_color #1A1815`, `display: standalone`, `start_url: /`).
- `web/sw.js`: install→precache shell; activate→drop old caches + `clients.claim`; fetch→cache-first for shell (serve cached `index.html` for offline navigations), runtime cache-first for the Google font, **pass through `/api/`**.
- `web/index.html`: `<link rel="manifest">` + SW registration (in the existing inline boot script).
- `kiros_web.py`: serve `/sw.js` + `/manifest.webmanifest`; **`_serve_sw`** injects the combined shell md5 as `SW_VERSION` so the SW bytes change every deploy → browser auto-reinstalls → fresh precache (reuses the existing md5 mechanism; resolves the Cloudflare stale-asset trap noted in [[kiros-project]]).
- `web/offline.js` (new, small): IndexedDB wrapper. On board load, cache `/api/board` + `/api/tasks` JSON; if the fetch throws (offline), render from cache.
- **Header status chip** (`#net-pill`, a `<button>`): one multi-state element, `data-state` ∈ `synced` (hidden — no noise) · `offline` (amber, tap = retry/refresh) · `syncing` (spinner) · `pending` ("N to sync", coral). Phase 0 wires `synced`/`offline` + tap-to-retry; `syncing`/`pending` are styled-but-dormant so Phase 1 just lights them up (no redesign). Rationale: "sync" implies pushing queued writes, which don't exist until Phase 1 — so in Phase 0 the control is honestly a *retry*; same button, richer job later.
- **Outcome:** open the installed app offline → see your board. No writes yet. Low risk. Shippable alone.

### Phase 1 — Offline WRITES + outbox + replay (incl. reorder)
- `web/offline.js`: add `outbox` store; `enqueue()`, `drain()`, `_cid` threading, fingerprint-match LWW resolver.
- Wrap `api()`: POST while `!navigator.onLine` or on network error → enqueue + optimistic in-memory update + return synthetic `{ok:true, offline:true}`. (Callers already re-render.)
- Optimistic updates per action (field-level only — no markdown logic): `complete` (set `done`/lane), `task/save` (apply editor fields / new lane), `capture` (push new inbox task w/ `_cid`), `reorder` (reorder in-memory array), `updateTaskImpUrg`.
- Replay engine: FIFO drain on `online` + `visibilitychange→visible` + startup; serialize (no concurrent drains); thread echoed raws; on `409` do silent-LWW re-issue; on `401` pause + redirect `/login`, resume after re-auth (outbox persists); reconcile with a board re-fetch after drain.
- Header status chip: light up the `syncing` (spinner during drain) and `pending` ("N to sync", tap to flush) states already scaffolded in Phase 0; the tap handler gains the outbox-flush job on top of retry.
- `navigator.storage.persist()` on first write to resist iOS IndexedDB eviction.

### Phase 2 — polish
- Self-host the Cormorant font (true-offline serif; currently external → falls back offline).
- Optional Background Sync registration as enhancement (Android/desktop only).

## 6. Known limitations (accepted for v1, documented)

1. **Scores/day-plan freeze offline.** Priority is computed server-side (`kiros.py`); offline edits don't re-rank until resync. Porting scoring to JS = big + DRY violation → **out of scope**. Offline = execute/triage with last-synced order; reconnect re-ranks.
2. **Cross-device same-task conflict = fingerprint match.** With no stable IDs, a replay `409` resolves by matching `title+section+project`. Collision needs two tasks identical on all three — rare on a personal board. Worst case: a near-duplicate line, recoverable from board backups (commit `e50db9b`). If this ever bites, the fix is opt-in `id:` meta (deferred).
3. **Lost-response retry** (server applied the op but the response dropped): retry sees `409` → LWW re-issues identical content → no-op. Harmless.

## 7. Files

| File | Change |
|------|--------|
| `web/manifest.webmanifest` | **new** |
| `web/sw.js` | **new** — shell cache, version-injected |
| `web/offline.js` | **new** — IndexedDB snapshot + outbox + replay + LWW |
| `web/offline.test.mjs` | **new** — `node:test` (zero-dep) unit tests for threading/LWW/collapse |
| `web/index.html` | manifest link + SW register + load `offline.js` |
| `web/app.js` | wrap `api()`, `_cid` assignment, optimistic updates, indicator, drain triggers |
| `web/styles.css` | offline/syncing pill |
| `kiros_web.py` | serve `/sw.js`+`/manifest.webmanifest`, `_serve_sw` version inject (no logic/data change) |
| `test_replay.py` | **new** — Python integration: sequential replay + concurrent-edit → 409 path |

## 8. Testing

- **Phase 0 (shipped):** `test_offline_sw.py` (Python, fits the existing suite) covers `/sw.js` version injection; offline read path verified manually via the preview with `fetch` forced to fail. Phase 0's `offline.js` is pure IndexedDB I/O (no logic worth a fake-indexeddb dep) so it gets no JS unit test — the JS test arrives in Phase 1 where the logic (threading/LWW) is pure and worth it.
- **Phase 1 — pure JS logic** (outbox threading, LWW resolver, op collapse) → `node:test` (built into Node, zero-dep) → 80%+ on `offline.js` logic.
- **Server replay** → `test_replay.py` drives endpoints in sequence (existing `test_conflict.py` already covers raw OCC).
- **Manual offline E2E** → preview/`/browse` daemon with network toggled: load offline, queue writes, reconnect, verify drain + reconcile. (Avoids adding Playwright as a dep.)

## 9. Deploy notes

- SW version = combined shell md5 → every `git push` (auto-deploy via cron-pull, [[kiros-multiuser-plan]]) ships a new SW → clients reinstall → fresh shell. No manual cache purge.
- First load after deploy: SW updates in background, takes control next navigation (`clients.claim`). Aligns with the existing `?v=<md5>` busting — they don't fight (SW matches shell with `ignoreSearch`).
