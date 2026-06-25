// Unit tests for the offline write logic (offline-support Phase 1).
// Pure pieces only — no IndexedDB/fetch. Run:  node --test web/offline.test.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const off = require("./offline.js");

function fixture() {
  return {
    date: "2026-06-23",
    companies: ["Acme", "Personal"],
    lanes: ["inbox", "active", "today", "delegated", "parking"],
    fronts: [
      { code: "AC-DES", name: "Design", surface: "Acme", importance: 4, urgency: 3 },
      { code: "PR-HOME", name: "Home", surface: "Personal", importance: 2, urgency: 2 },
    ],
    tasks: [
      { title: "Logo", front: "AC-DES", frontName: "Design", company: "Acme", group: "Bluebird", lane: "active", done: false, importance: 5, urgency: 4, est: "2h", due: null, delegate: "", url: "", added: "2026-06-20", avoid: false, score: 10.3, raw: "- [ ] (AC-DES) Logo group:Bluebird imp:5" },
      { title: "Dishes", front: "PR-HOME", frontName: "Home", company: "Personal", group: "", lane: "inbox", done: false, est: "30m", score: 2, raw: "- [ ] (PR-HOME) Dishes est:30m" },
      { title: "Taxes", front: "PR-HOME", frontName: "Home", company: "Personal", group: "", lane: "active", done: false, est: "4h", score: 5, raw: "- [ ] (PR-HOME) Taxes est:4h" },
    ],
  };
}
const byTitle = (snap, t) => snap.tasks.find((x) => x.title === t);

test("complete marks the matching task done, leaves the snapshot immutable", () => {
  const snap = fixture();
  const { snap: out } = off.applyOp(snap, "/api/complete", { raw: "- [ ] (AC-DES) Logo group:Bluebird imp:5", done: true });
  assert.equal(byTitle(out, "Logo").done, true);
  assert.equal(byTitle(out, "Taxes").done, false);
  assert.equal(snap.tasks[0].done, false, "original snapshot must not mutate");
});

test("complete done:false un-completes", () => {
  const snap = fixture();
  snap.tasks[0].done = true;
  const { snap: out } = off.applyOp(snap, "/api/complete", { raw: snap.tasks[0].raw, done: false });
  assert.equal(byTitle(out, "Logo").done, false);
});

test("save edit updates fields in place and re-derives company/frontName from the front code", () => {
  const snap = fixture();
  const body = {
    originalRaw: "- [ ] (AC-DES) Logo group:Bluebird imp:5", lane: "active", moved: false,
    fields: { title: "Logo v2", front: "PR-HOME", group: "", importance: "3", urgency: "", est: "1h", energy: "", due: "2026-07-01", delegate: "", description: "", url: "", added: "2026-06-20", avoid: "" },
  };
  const { snap: out, createdRaw } = off.applyOp(snap, "/api/task/save", body);
  const t = byTitle(out, "Logo v2");
  assert.equal(createdRaw, null);
  assert.equal(t.front, "PR-HOME");
  assert.equal(t.company, "Personal", "company derived from the new front");
  assert.equal(t.frontName, "Home");
  assert.equal(t.importance, 3);
  assert.equal(t.urgency, null, "blank urgency → null");
  assert.equal(t.due, "2026-07-01");
  assert.equal(t.raw, body.originalRaw, "raw unchanged offline (threading fixes it on replay)");
});

test("save with a delegate routes to the delegated lane", () => {
  const snap = fixture();
  const body = { originalRaw: snap.tasks[2].raw, lane: "active", fields: { title: "Taxes", front: "PR-HOME", group: "", est: "4h", delegate: "Sam", importance: "", urgency: "", energy: "", due: "", description: "", url: "", added: "", avoid: "" } };
  const { snap: out } = off.applyOp(snap, "/api/task/save", body);
  assert.equal(byTitle(out, "Taxes").lane, "delegated");
  assert.equal(byTitle(out, "Taxes").delegate, "Sam");
});

test("save create (no originalRaw) appends a task with a pending placeholder raw", () => {
  const snap = fixture();
  const before = snap.tasks.length;
  const body = { lane: "active", fields: { title: "New thing", front: "AC-DES", group: "X", est: "1h", importance: "4", urgency: "2", energy: "", due: "", delegate: "", description: "", url: "", added: "", avoid: "" } };
  const { snap: out, createdRaw } = off.applyOp(snap, "/api/task/save", body);
  assert.equal(out.tasks.length, before + 1);
  assert.match(createdRaw, /^kiros:pending:/);
  const t = byTitle(out, "New thing");
  assert.equal(t.raw, createdRaw);
  assert.equal(t.company, "Acme");
  assert.equal(t.score, null, "no offline score → renders as ·");
});

test("capture appends an inbox task", () => {
  const snap = fixture();
  const { snap: out, createdRaw } = off.applyOp(snap, "/api/capture", { text: "Buy milk" });
  const t = byTitle(out, "Buy milk");
  assert.ok(t);
  assert.equal(t.lane, "inbox");
  assert.equal(t.raw, createdRaw);
});

test("delete removes the matching task", () => {
  const snap = fixture();
  const { snap: out } = off.applyOp(snap, "/api/task/delete", { raw: "- [ ] (PR-HOME) Dishes est:30m" });
  assert.equal(out.tasks.length, 2);
  assert.equal(byTitle(out, "Dishes"), undefined);
});

test("reorder permutes a lane's tasks to match the given order", () => {
  const snap = fixture();
  const body = { lane: "active", order: ["- [ ] (PR-HOME) Taxes est:4h", "- [ ] (AC-DES) Logo group:Bluebird imp:5"] };
  const { snap: out } = off.applyOp(snap, "/api/reorder", body);
  const active = out.tasks.filter((t) => t.lane === "active" && !t.done);
  assert.deepEqual(active.map((t) => t.title), ["Taxes", "Logo"]);
  assert.equal(out.tasks.find((t) => t.lane === "inbox").title, "Dishes", "other lanes untouched");
});

test("resolveChain follows a multi-hop raw chain", () => {
  assert.equal(off.resolveChain("a", { a: "b", b: "c" }), "c");
  assert.equal(off.resolveChain("x", {}), "x");
});

test("chained edits thread the server-echoed raw forward", () => {
  const rawMap = {};
  const op1 = { path: "/api/task/save", body: { originalRaw: "raw0", fields: { title: "T", front: "AC-DES" } } };
  const sent1 = off.threadBody(op1, rawMap);
  assert.equal(sent1.originalRaw, "raw0");
  off.recordEcho(op1, sent1, { ok: true, raw: "raw1" }, rawMap);

  const op2 = { path: "/api/task/save", body: { originalRaw: "raw0", fields: { title: "T2", front: "AC-DES" } } };
  const sent2 = off.threadBody(op2, rawMap);
  assert.equal(sent2.originalRaw, "raw1", "second edit targets the line the first edit produced");
  off.recordEcho(op2, sent2, { ok: true, raw: "raw2" }, rawMap);

  const op3 = { path: "/api/complete", body: { raw: "raw0", done: true } };
  const sent3 = off.threadBody(op3, rawMap);
  assert.equal(sent3.raw, "raw2", "completing the same task targets the latest line");
});

test("edit-then-complete: the complete threads onto the edited line", () => {
  const rawMap = {};
  const edit = { path: "/api/task/save", body: { originalRaw: "- [ ] (A) Old" } };
  const sentEdit = off.threadBody(edit, rawMap);
  off.recordEcho(edit, sentEdit, { ok: true, raw: "- [ ] (A) New" }, rawMap);
  const done = { path: "/api/complete", body: { raw: "- [ ] (A) Old", done: true } };
  assert.equal(off.threadBody(done, rawMap).raw, "- [ ] (A) New");
});

test("recordEcho flips the checkbox for a completed line so undo can thread", () => {
  const rawMap = {};
  off.recordEcho({ path: "/api/complete" }, { raw: "- [ ] (A) T", done: true }, { ok: true }, rawMap);
  assert.equal(rawMap["- [ ] (A) T"], "- [x] (A) T");
});

test("created task can be created then immediately edited (placeholder threads to the real raw)", () => {
  const rawMap = {};
  const create = { path: "/api/task/save", createdRaw: "kiros:pending:abc", body: { fields: { title: "N", front: "AC-DES" } } };
  const sentCreate = off.threadBody(create, rawMap);
  assert.equal(sentCreate.originalRaw, undefined);
  off.recordEcho(create, sentCreate, { ok: true, raw: "- [ ] (AC-DES) N" }, rawMap);
  const edit = { path: "/api/task/save", body: { originalRaw: "kiros:pending:abc", fields: { title: "N2", front: "AC-DES" } } };
  assert.equal(off.threadBody(edit, rawMap).originalRaw, "- [ ] (AC-DES) N");
});
