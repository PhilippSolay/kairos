// Kiros offline cache + write outbox (offline READ + WRITE).
//
// Phase 0 gave us a snapshot of GET responses so the app opens offline.
// Phase 1 adds a durable write outbox: mutations made offline are queued AND
// applied optimistically to the cached /api/tasks snapshot (so the board reflects
// them immediately — the existing loaders re-render from that snapshot). On
// reconnect the queue is replayed against the real endpoints, threading the
// server-echoed `raw` forward across chained ops, with silent last-write-wins on
// conflict. No server changes — replay reuses the existing 409/stale OCC.
//
// UMD shape: the browser gets `window.kirosOffline`; Node (node:test) can require
// the same file to unit-test the pure logic (applyOp / threadBody / resolveChain).
// Load-time code never touches window/indexedDB/fetch — only the functions do.
"use strict";

(function (factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;   // node:test
  if (typeof window !== "undefined") window.kirosOffline = api;                 // browser
})(function () {
  const DB_NAME = "kiros";
  const DB_VERSION = 2;                 // v1: snapshots only. v2: + outbox.
  const SNAP = "snapshots";
  const OUTBOX = "outbox";
  const TASKS_PATH = "/api/tasks";
  const PENDING_PREFIX = "kiros:pending:";   // placeholder raw for an offline-created task

  let dbPromise = null;
  let draining = false;
  let onChange = function () {};        // app sets this to refresh the status chip

  // ---- IndexedDB plumbing --------------------------------------------------
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { reject(e); return; }
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(SNAP)) db.createObjectStore(SNAP);
        if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, { keyPath: "seq", autoIncrement: true });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function run(store, mode, fn) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const t = db.transaction(store, mode);
        const request = fn(t.objectStore(store));
        t.oncomplete = function () { resolve(request ? request.result : undefined); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  // ---- snapshots (offline read) -------------------------------------------
  function snapshotPut(path, data) {
    return run(SNAP, "readwrite", function (os) { return os.put(data, path); }).catch(function () {});
  }
  function snapshotGet(path) {
    return run(SNAP, "readonly", function (os) { return os.get(path); })
      .then(function (v) { return v === undefined ? null : v; })
      .catch(function () { return null; });
  }

  // ---- outbox --------------------------------------------------------------
  function addOp(op) { return run(OUTBOX, "readwrite", function (os) { return os.add(op); }); }
  function allOps() { return run(OUTBOX, "readonly", function (os) { return os.getAll(); }).catch(function () { return []; }); }
  function delOp(seq) { return run(OUTBOX, "readwrite", function (os) { return os.delete(seq); }); }
  function countOps() { return run(OUTBOX, "readonly", function (os) { return os.count(); }).then(function (n) { return n || 0; }).catch(function () { return 0; }); }

  // ---- optimistic apply (PURE) --------------------------------------------
  function uid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }
  function placeholderRaw() { return PENDING_PREFIX + uid(); }
  function frontByCode(snap, code) { return (snap.fronts || []).find(function (f) { return f.code === code; }); }
  const numOrNull = function (v) { return v === "" || v === null || v === undefined ? null : Number(v); };
  const isTruthyFlag = function (v) { return v === true || v === "true"; };

  // Build/merge a task object from editor fields, deriving company/frontName from the
  // front code (the snapshot carries `fronts`). Score is left null → renders as "·".
  function taskFromFields(snap, fields, lane, base) {
    const f = frontByCode(snap, fields.front);
    const t = base ? Object.assign({}, base) : { raw: placeholderRaw(), score: null };
    return Object.assign(t, {
      title: fields.title, front: fields.front,
      frontName: f ? f.name : (base ? base.frontName : ""),
      company: f ? f.surface : (base ? base.company : ""),
      group: fields.group || "",
      importance: numOrNull(fields.importance), urgency: numOrNull(fields.urgency),
      est: fields.est || (base && base.est) || "1h", energy: fields.energy || "",
      due: fields.due || null,
      delegate: lane === "delegated" ? (fields.delegate || "") : "",
      description: fields.description || "", url: fields.url || (base ? base.url : ""),
      added: fields.added || (base ? base.added : null), avoid: isTruthyFlag(fields.avoid),
      lane: lane, done: lane === "done" ? true : (base ? base.done : false),
    });
  }

  function laneOf(body) {
    return (body.fields && body.fields.delegate) ? "delegated" : (body.lane || "active");
  }

  function applyReorder(snap, tasks, body) {
    const inLane = function (t) { return body.lane === "done" ? t.done : (t.lane === body.lane && !t.done); };
    const order = body.order || [];
    const byRaw = {};
    tasks.forEach(function (t) { if (inLane(t)) byRaw[t.raw] = t; });
    const reordered = order.map(function (r) { return byRaw[r]; }).filter(Boolean);
    tasks.forEach(function (t) { if (inLane(t) && order.indexOf(t.raw) === -1) reordered.push(t); });
    let k = 0;
    const out = tasks.map(function (t) { return inLane(t) ? reordered[k++] : t; });
    return Object.assign({}, snap, { tasks: out });
  }

  // Apply one op to a tasks-snapshot. Returns { snap, createdRaw }. Pure — no I/O.
  function applyOp(snap, path, body) {
    const tasks = (snap.tasks || []).slice();
    let createdRaw = null;
    if (path === "/api/complete") {
      const i = tasks.findIndex(function (t) { return t.raw === body.raw; });
      if (i >= 0) tasks[i] = Object.assign({}, tasks[i], { done: !!body.done });
    } else if (path === "/api/task/save") {
      const lane = laneOf(body);
      if (body.originalRaw) {
        const i = tasks.findIndex(function (t) { return t.raw === body.originalRaw; });
        if (i >= 0) {
          tasks[i] = taskFromFields(snap, body.fields, lane, tasks[i]);
        } else {                                   // target line gone → keep the edit as a new task
          const nt = taskFromFields(snap, body.fields, lane); createdRaw = nt.raw; tasks.push(nt);
        }
      } else {
        const nt = taskFromFields(snap, body.fields, lane); createdRaw = nt.raw; tasks.push(nt);
      }
    } else if (path === "/api/capture") {
      const nt = {
        title: body.text, front: "", frontName: "", company: "", group: "",
        importance: null, urgency: null, est: "1h", energy: "", due: null, delegate: "",
        description: "", url: "", added: null, avoid: false, done: false, lane: "inbox",
        score: null, raw: placeholderRaw(),
      };
      createdRaw = nt.raw; tasks.push(nt);
    } else if (path === "/api/task/delete") {
      const i = tasks.findIndex(function (t) { return t.raw === body.raw; });
      if (i >= 0) tasks.splice(i, 1);
    } else if (path === "/api/reorder") {
      return { snap: applyReorder(snap, tasks, body), createdRaw: null };
    }
    return { snap: Object.assign({}, snap, { tasks: tasks }), createdRaw: createdRaw };
  }

  // A stable, human identity for conflict matching when the raw line has moved.
  function fingerprintOf(snap, path, body) {
    if (path === "/api/task/save") {
      return { title: body.fields.title, front: body.fields.front, group: body.fields.group || "" };
    }
    const ref = body.raw;
    const t = (snap && snap.tasks || []).find(function (x) { return x.raw === ref; });
    return t ? { title: t.title, front: t.front, group: t.group || "" } : null;
  }

  // ---- raw-chain threading (PURE) -----------------------------------------
  // After an op succeeds, the server's line for that task changes; rawMap records
  // old→new so a later op on the same task targets the right (current) line.
  function resolveChain(raw, rawMap) {
    let r = raw, guard = 0;
    while (rawMap[r] && guard++ < 10000) r = rawMap[r];
    return r;
  }
  function threadBody(op, rawMap) {
    const body = Object.assign({}, op.body);
    if (op.path === "/api/complete" || op.path === "/api/task/delete") {
      if (body.raw) body.raw = resolveChain(body.raw, rawMap);
    } else if (op.path === "/api/task/save") {
      if (body.originalRaw) body.originalRaw = resolveChain(body.originalRaw, rawMap);
    } else if (op.path === "/api/reorder") {
      body.order = (body.order || []).map(function (r) { return resolveChain(r, rawMap); });
    }
    return body;
  }
  // Record the line change a successful op produced, so the chain stays current.
  function recordEcho(op, sentBody, res, rawMap) {
    if (op.path === "/api/task/save" && res && res.raw) {
      const from = sentBody.originalRaw || op.createdRaw;
      if (from) rawMap[from] = res.raw;
    } else if (op.path === "/api/complete" && sentBody.raw) {
      const flipped = sentBody.done
        ? sentBody.raw.replace("[ ]", "[x]")
        : sentBody.raw.replace("[x]", "[ ]").replace("[X]", "[ ]");
      rawMap[sentBody.raw] = flipped;
    } else if (op.path === "/api/capture" && res && res.raw && op.createdRaw) {
      rawMap[op.createdRaw] = res.raw;
    }
  }

  // ---- real network (replay only; bypasses the offline interception) -------
  function cookie(name) {
    const m = document.cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
    return m ? decodeURIComponent(m[1]) : "";
  }
  function postReal(path, body) {
    return fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Kiros-CSRF": cookie("kiros_csrf") },
      body: JSON.stringify(body),
    }).then(function (res) {
      if (res.status === 204) return { status: res.status, json: { ok: true } };
      return res.json().catch(function () { return {}; }).then(function (json) { return { status: res.status, json: json }; });
    });
  }
  function getTasksReal() {
    return fetch(TASKS_PATH, { headers: { "Accept": "application/json" } })
      .then(function (res) { return res.ok ? res.json() : null; }).catch(function () { return null; });
  }

  // ---- the offline write entry point --------------------------------------
  // Apply optimistically to the cached snapshot, enqueue for replay, return a
  // synthetic response shaped like the server's so existing callers keep working.
  function queueWrite(path, body) {
    return snapshotGet(TASKS_PATH).then(function (snap) {
      let createdRaw = null;
      const op = { path: path, body: body };
      if (snap && snap.tasks) {
        const fp = fingerprintOf(snap, path, body);
        if (fp) op.fp = fp;
        const r = applyOp(snap, path, body);
        createdRaw = r.createdRaw;
        if (createdRaw) op.createdRaw = createdRaw;
        return snapshotPut(TASKS_PATH, r.snap).then(function () { return addOp(op); }).then(function () { return createdRaw; });
      }
      return addOp(op).then(function () { return null; });
    }).then(function (createdRaw) {
      onChange();
      const res = { ok: true, offline: true };
      if (path === "/api/task/save") {
        res.raw = createdRaw || body.originalRaw || null;
        res.url = body.fields ? body.fields.url : undefined;
      }
      return res;
    });
  }

  // ---- replay --------------------------------------------------------------
  // Silent last-write-wins: a 409/stale means the line moved on the server. Re-fetch,
  // match the task by fingerprint, and re-issue against its current raw (offline wins).
  function lwwResolve(op, sentBody, rawMap) {
    if (!op.fp || op.path === "/api/reorder") return Promise.resolve();   // order is least-critical; skip
    return getTasksReal().then(function (snap) {
      const match = snap && (snap.tasks || []).find(function (t) {
        return t.title === op.fp.title && t.front === op.fp.front && (t.group || "") === (op.fp.group || "");
      });
      let body2 = Object.assign({}, sentBody);
      if (match) {
        if (op.path === "/api/task/save") body2.originalRaw = match.raw;
        else body2.raw = match.raw;                                       // complete / delete
      } else if (op.path === "/api/task/save") {
        body2.originalRaw = null;                                         // gone → re-create the edit
      } else {
        return;                                                          // complete/delete of a vanished task → same end state
      }
      return postReal(op.path, body2).then(function (r) {
        if (r.status < 400 && !(r.json && r.json.stale)) recordEcho(op, body2, r.json, rawMap);
      });
    });
  }

  // Drain the outbox in order. Returns { drained, remaining, authFailed }.
  function drain() {
    if (draining) return Promise.resolve({ drained: 0, remaining: null, busy: true });
    draining = true; onChange();
    const rawMap = {};
    let drained = 0, authFailed = false, stop = false;
    return allOps().then(function (ops) {
      let chain = Promise.resolve();
      ops.forEach(function (op) {
        chain = chain.then(function () {
          if (stop) return;
          const sentBody = threadBody(op, rawMap);
          return postReal(op.path, sentBody).then(function (r) {
            if (r.status === 401) { authFailed = true; stop = true; return; }
            if (r.status === 409 || (r.json && r.json.stale)) {
              return lwwResolve(op, sentBody, rawMap).then(function () { return delOp(op.seq); }).then(function () { drained++; onChange(); });
            }
            if (r.status >= 400) { stop = true; return; }                // server error → keep op, retry later
            recordEcho(op, sentBody, r.json, rawMap);
            return delOp(op.seq).then(function () { drained++; onChange(); });
          }, function () { stop = true; });                              // network gone → stop, keep remaining
        });
      });
      return chain;
    }).then(function () {
      return countOps();
    }).then(function (remaining) {
      draining = false; onChange();
      return { drained: drained, remaining: remaining, authFailed: authFailed };
    }, function () {
      draining = false; onChange();
      return { drained: drained, remaining: null, error: true };
    });
  }

  function requestPersist() {
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    } catch (e) { /* no Storage API — fine */ }
  }

  return {
    TASKS_PATH: TASKS_PATH,
    snapshotGet: snapshotGet, snapshotPut: snapshotPut, requestPersist: requestPersist,
    queueWrite: queueWrite, drain: drain, countOps: countOps,
    isDraining: function () { return draining; },
    setOnChange: function (fn) { onChange = fn || function () {}; },
    // exposed for unit tests (pure):
    applyOp: applyOp, threadBody: threadBody, resolveChain: resolveChain,
    recordEcho: recordEcho, fingerprintOf: fingerprintOf,
  };
});
