// Kiros web — thin client. All scoring comes from the server (kiros.py). This file
// only fetches, renders, and fires the two write actions (capture, complete).
"use strict";

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function cookie(name) {
  const m = document.cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : "";
}
async function api(path, opts) {
  opts = opts || {};
  if (opts.method && opts.method.toUpperCase() === "POST") {
    // Double-submit CSRF: echo the kiros_csrf cookie in a header the server checks.
    opts.headers = Object.assign({ "X-Kiros-CSRF": cookie("kiros_csrf") }, opts.headers || {});
  }
  const res = await fetch(path, opts);
  if (res.status === 401) { location.href = "/login"; throw new Error("auth required"); }
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

let nowChoice = { energy: null, time: "" };

// --- Rendering --------------------------------------------------------------
function renderWip(wip) {
  const box = $("#wip");
  box.className = "wip" + (wip.ok ? "" : " over");
  box.innerHTML = "";
  for (let i = 0; i < wip.cap; i++) {
    box.appendChild(el("i", i < wip.active ? "on" : ""));
  }
}

function circleChip(t) {
  if (!t.avoidance || t.avoidance <= 0.3) return "";
  const days = t.ageDays != null ? `${t.ageDays} days` : "a while";
  return `<div class="circle-chip">you've circled this ${days} — that's the signal, not a reason to wait</div>`;
}

function metaLine(t) {
  const bits = [];
  if (t.frontName) bits.push(t.frontName);
  if (t.est) bits.push({ S: "small", M: "medium", L: "big", XL: "huge" }[t.est] || t.est);
  if (t.due) bits.push("due " + t.due);
  return bits.join(" · ");
}

function focusCard(t, eyebrow) {
  const card = el("div", "card");
  const section = (t.frontName || t.front || "").split("—")[0].trim();
  const crumbs = [t.company, section].filter(Boolean).map(esc).join(" · ");
  const proj = t.group ? `<span class="frog-proj">${esc(t.group)}</span><span class="frog-sep">|</span>` : "";
  card.innerHTML = `
    <div class="eyebrow">${esc(eyebrow)}</div>
    ${crumbs ? `<div class="frog-crumbs">${crumbs}</div>` : ""}
    <h1 class="frog-title">${proj}<span class="frog-task">${esc(t.title)}</span></h1>
    ${circleChip(t)}
    <p class="frog-why">Start with just 2 minutes — open it and make the first move. That's the whole commitment.</p>
    <div class="frog-actions"></div>`;
  const actions = card.querySelector(".frog-actions");
  const start = el("button", "primary", "Start · 2 min");
  const done = el("button", "ghost done", "Done ✓");
  start.onclick = (e) => { e.stopPropagation(); startTimer(actions, start); };
  done.onclick = (e) => { e.stopPropagation(); complete(t.raw); };
  actions.append(start, done);
  card.style.cursor = "pointer";
  card.onclick = () => openEditor(t);                         // tap card to edit (its buttons stop propagation)
  return card;
}

function startTimer(actions, startBtn) {
  let left = 120;
  const clock = el("span", "primary");
  clock.style.pointerEvents = "none";
  startBtn.replaceWith(clock);
  const tick = () => {
    const m = Math.floor(left / 60), s = String(left % 60).padStart(2, "0");
    clock.textContent = `${m}:${s}`;
    if (left-- <= 0) {
      clearInterval(id);
      clock.textContent = "2 min up — momentum's yours";
      clock.style.background = "var(--done)";
    }
  };
  tick();
  const id = setInterval(tick, 1000);
}

function renderProgress(p, hours) {
  const box = $("#day-progress");
  if (!p || !p.planned) { box.innerHTML = ""; return; }
  const dots = Array.from({ length: p.planned },
    (_, i) => `<i class="${i < p.done ? "on" : ""}"></i>`).join("");
  let label;
  if (p.dayComplete) label = "That's the day. ✓ Plan's done — rest counts as productive.";
  else if (p.done === 0) label = `Today's plan: ${p.planned} ${p.planned === 1 ? "thing" : "things"} — a right-sized day.`;
  else label = `${p.done} of ${p.planned} done. Keep the thread.`;
  const hoursTag = hours ? ` · <span class="dp-hours ${hours > DAY_CAP_HOURS ? "over" : ""}">${fmtHours(hours)}</span>` : "";
  box.innerHTML = `<div class="dp-dots">${dots}</div><div class="dp-label">${label}${hoursTag}</div>`;
}

// Day effort: total hours of Today-status tasks; 8h fills the bar, over 8h turns red.
const DAY_CAP_HOURS = 8;
function fmtHours(h) { return (Number.isInteger(h) ? h : Number(h.toFixed(1))) + "h"; }
function renderDayEffort(hours) {
  const box = $("#day-effort");
  if (!hours) { box.innerHTML = ""; return; }
  const over = hours > DAY_CAP_HOURS;
  const pct = Math.min(100, (hours / DAY_CAP_HOURS) * 100);
  box.innerHTML = `<div class="de-track"><span class="de-fill ${over ? "over" : ""}" style="width:${pct}%"></span></div>`;
}

// Today screen — the tasks you put in the Today status, top 5 by priority.
function renderToday(data) {
  renderDayEffort(data.todayEffort || 0);
  renderProgress(data.todayProgress, data.todayEffort || 0);
  const frog = $("#frog");
  frog.innerHTML = "";
  const items = data.todayLane || [];
  const total = data.todayLaneTotal || 0;
  if (data.todayProgress && data.todayProgress.dayComplete) {
    frog.appendChild(el("div", "clean",
      `<div class="big">That's the day. ✓</div>
       <div>You cleared everything in Today. Closing the laptop is the productive move now.</div>`));
    $("#more").innerHTML = "";
    $("#hidden-note").textContent = "";
    return;
  }
  if (!items.length) {
    frog.appendChild(el("div", "clean",
      `<div class="big">Nothing set for today.</div>
       <div>Drop a task into the <strong>Today</strong> column on the Board to line up your day.</div>`));
    $("#more").innerHTML = "";
    $("#hidden-note").textContent = "";
    return;
  }
  frog.appendChild(focusCard(items[0], "Your one thing today"));

  const more = $("#more");
  more.innerHTML = "";
  items.slice(1).forEach((t, i) => {
    const row = el("div", "more-row");
    row.innerHTML = `
      <span class="more-rank">${i + 2}</span>
      <div class="more-body">
        <div class="more-title">${esc(t.title)}</div>
        <div class="more-meta">${esc(metaLine(t))}</div>
      </div>`;
    const tick = el("button", "tick", "✓");
    tick.title = "Done";
    tick.onclick = (e) => { e.stopPropagation(); complete(t.raw); };
    row.appendChild(tick);
    row.style.cursor = "pointer";
    row.onclick = () => openEditor(t);                        // tap a row to edit (tick stops propagation)
    more.appendChild(row);
  });

  const hidden = total - items.length;
  $("#hidden-note").innerHTML = hidden > 0
    ? `${hidden} more in Today — the top ${items.length} are up. Do #1 first.`
    : `Do #1 before anything new.`;
}

// --- Manage (the dense workhorse) ------------------------------------------
const LANE_LABEL = { inbox: "Inbox", active: "Active", today: "Today", delegated: "Delegated", parking: "Parked", done: "Done" };
let mg = { tasks: [], fronts: [], companies: [], lanes: [], inbox: [], date: "" };
const mgFilter = { q: "", company: "", lanes: new Set(), sort: "score", dir: -1 };
let edRows = [];   // the list the editor's ◂ ▸ step through — set per view (table / board / matrix)
let edIndex = -1;  // index of the open task within edRows (-1 = new/intake task)

function fillDatalist(elm, values) {
  elm.innerHTML = values.map((v) => `<option value="${esc(v)}"></option>`).join("");
}
function fillSelect(sel, pairs, current) {
  sel.innerHTML = "";
  pairs.forEach(([value, label]) => {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    if (current != null && value === current) o.selected = true;
    sel.appendChild(o);
  });
}

// --- Company filter: icon toggle (Board + Matrix) --------------------------
// Companies with a shipped icon in /icons. Others fall back to a text label.
const COMPANY_ICONS = new Set(["all", "atmosa", "personal", "studiosolay", "trueself"]);
function companySlug(name) { return (name || "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
function companyGlyph(slug, label) {
  return COMPANY_ICONS.has(slug)
    ? `<img src="/icons/icon_company_${slug}.svg" alt="${esc(label)}" draggable="false" />`
    : `<span class="co-text">${esc(label)}</span>`;
}
// Render an "All" + per-company icon toggle into `sel`, wired to mutate `state.company`.
function buildCompanyToggle(sel, state, onChange) {
  const box = $(sel);
  if (!box) return;
  const opts = [["", "All"], ...mg.companies.map((c) => [c, c])];
  box.innerHTML = opts.map(([val, label]) => {
    const slug = val === "" ? "all" : companySlug(val);
    const active = state.company === val;
    return `<button type="button" class="co-btn${active ? " is-active" : ""}" data-co="${esc(val)}" title="${esc(label)}" aria-pressed="${active}">${companyGlyph(slug, label)}</button>`;
  }).join("");
  box.onclick = (e) => {
    const btn = e.target.closest(".co-btn");
    if (!btn) return;
    state.company = btn.dataset.co;
    box.querySelectorAll(".co-btn").forEach((b) => {
      const on = b.dataset.co === state.company;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", on);
    });
    onChange();
  };
}

// --- Status filter: multi-select checkbox dropdown --------------------------
function buildLaneMenu() {
  const menu = $("#mg-lane .mg-dd-menu");
  const opts = [["", "All statuses"], ...mg.lanes.filter((l) => l !== "delegated").map((l) => [l, LANE_LABEL[l] || l])];
  menu.innerHTML = opts.map(([val, label]) => {
    const checked = val === "" ? mgFilter.lanes.size === 0 : mgFilter.lanes.has(val);
    return `<button type="button" class="mg-dd-opt${checked ? " on" : ""}" role="option" aria-selected="${checked}" data-val="${esc(val)}"><span class="mg-check" aria-hidden="true"></span><span>${esc(label)}</span></button>`;
  }).join("");
}
function toggleLane(val) {
  if (val === "") mgFilter.lanes.clear();
  else if (mgFilter.lanes.has(val)) mgFilter.lanes.delete(val);
  else mgFilter.lanes.add(val);
  buildLaneMenu();
  updateLaneLabel();
  renderTable();
}
function updateLaneLabel() {
  const n = mgFilter.lanes.size;
  const text = n === 0 ? "All statuses"
    : n === 1 ? (LANE_LABEL[[...mgFilter.lanes][0]] || [...mgFilter.lanes][0])
    : `${n} statuses`;
  $("#mg-lane .mg-dd-label").textContent = text;
}
// generic dropdown open/close (shared by the status filter and the sort control)
function closeDD(dd) {
  dd.querySelector(".mg-dd-menu").hidden = true;
  dd.classList.remove("open");
  dd.querySelector(".mg-dd-toggle").setAttribute("aria-expanded", "false");
}
function openDD(dd, open) {
  const menu = dd.querySelector(".mg-dd-menu");
  const willOpen = open != null ? open : menu.hidden;
  if (willOpen) document.querySelectorAll(".mg-dd").forEach((d) => { if (d !== dd) closeDD(d); });
  menu.hidden = !willOpen;
  dd.classList.toggle("open", willOpen);
  dd.querySelector(".mg-dd-toggle").setAttribute("aria-expanded", String(willOpen));
}

// --- Sort control (icon dropdown — replaces header-click sorting) -----------
const SORT_OPTIONS = [
  ["score", "Priority"], ["due", "Deadline"], ["title", "Task"],
  ["company", "Company"], ["est", "Effort"], ["importance", "Importance"], ["urgency", "Urgency"],
];
function buildSortMenu() {
  const menu = $("#mg-sort .mg-dd-menu");
  menu.innerHTML = SORT_OPTIONS.map(([key, label]) => {
    const on = mgFilter.sort === key;
    const arrow = on ? (mgFilter.dir === -1 ? " ↓" : " ↑") : "";
    return `<button type="button" class="mg-dd-opt${on ? " on" : ""}" role="option" aria-selected="${on}" data-sort="${key}"><span class="mg-check" aria-hidden="true"></span><span>${label}${arrow}</span></button>`;
  }).join("");
}
function updateSortLabel() {
  const opt = SORT_OPTIONS.find(([k]) => k === mgFilter.sort);
  $("#mg-sort .mg-dd-label").textContent = (opt ? opt[1] : "Sort") + (mgFilter.dir === -1 ? " ↓" : " ↑");
}
function setSort(key) {
  if (mgFilter.sort === key) mgFilter.dir *= -1;      // same field → flip direction
  else { mgFilter.sort = key; mgFilter.dir = DEFAULT_DIR[key] || 1; }
  buildSortMenu();
  updateSortLabel();
  renderTable();
}

async function loadManage() {
  mg = await api("/api/tasks");
  fillSelect($("#mg-company"), [["", "All companies"], ...mg.companies.map((c) => [c, c])], mgFilter.company);
  buildLaneMenu();
  updateLaneLabel();
  buildSortMenu();
  updateSortLabel();
  fillDatalist($("#groups"), [...new Set(mg.tasks.map((t) => t.group).filter(Boolean))].sort());
  renderIntake();
  renderTable();
}

function renderIntake() {
  const box = $("#intake");
  box.innerHTML = "";
  if (!mg.inbox.length) return;
  box.appendChild(el("span", "intake-label", `Intake · ${mg.inbox.length} to refine`));
  mg.inbox.forEach((text) => {
    const chip = el("button", "intake-chip", esc(text));
    chip.type = "button";
    chip.title = "Refine into a real task";
    chip.onclick = () => openEditor(null, text);
    box.appendChild(chip);
  });
}

const EST_ORDER = { "30m": 1, "1h": 2, "90m": 2, "2h": 3, "4h": 4, "6h": 4, "8h": 5, "Split": 6, S: 1, M: 2, L: 4, XL: 6 };
const DEFAULT_DIR = { score: -1, urgency: -1, importance: -1 };  // numbers high-first; text/date A→Z

function sortValue(t, key) {
  switch (key) {
    case "company": return (t.company || "").toLowerCase();
    case "project": return (t.frontName || "").toLowerCase();
    case "group": return (t.group || "~~~").toLowerCase();
    case "title": return (t.title || "").toLowerCase();
    case "lane": return mg.lanes.indexOf(t.lane);
    case "score": return t.score || 0;
    case "urgency": return t.urgency || 0;
    case "importance": return t.importance || 0;
    case "due": return t.due || "9999-99-99";
    case "est": return EST_ORDER[t.est] || 2;
    case "delegate": return (t.delegate || "~~~").toLowerCase();  // blanks sort last
    default: return 0;
  }
}
function renderTable() {
  const list = $("#mg-list");
  list.innerHTML = "";
  // "done" is a pseudo-status: when selected it surfaces completed tasks (hidden otherwise)
  let rows = mgFilter.lanes.size
    ? mg.tasks.filter((t) => (t.done ? mgFilter.lanes.has("done") : mgFilter.lanes.has(t.lane)))
    : mg.tasks.filter((t) => !t.done);
  if (mgFilter.company) rows = rows.filter((t) => t.company === mgFilter.company);
  if (mgFilter.q) {
    const q = mgFilter.q.toLowerCase();
    rows = rows.filter((t) => `${t.title} ${t.frontName} ${t.delegate || ""}`.toLowerCase().includes(q));
  }
  rows.sort((a, b) => {
    const va = sortValue(a, mgFilter.sort), vb = sortValue(b, mgFilter.sort);
    return (va < vb ? -1 : va > vb ? 1 : 0) * mgFilter.dir;
  });
  edRows = rows;
  updateSortLabel();
  if (!rows.length) {
    list.appendChild(el("div", "mg-empty", "No tasks match. Try clearing a filter."));
    return;
  }
  rows.forEach((t) => list.appendChild(taskCard(t)));
}

// Shared card body. Left: row1 Company · Section, row2 Project | Task Name (same size/weight).
// Right (stacked): Status · Priority · Deadline. Status is omitted on the board (column = status).
function cardBody(t, showStatus) {
  const overdue = t.due && t.due < mg.date ? "due-over" : "";
  const section = (t.frontName || t.front || "").split("—")[0].trim();
  const crumbs = [t.company, section].filter(Boolean).map(esc).join(" · ");
  const flag = t.avoidance > 0.3 ? ` <span class="t-flag" title="circling back">↻</span>` : "";
  const link = t.url ? ` <a class="t-link" href="${esc(t.url)}" target="_blank" rel="noopener" title="Open source ↗" onclick="event.stopPropagation()">↗</a>` : "";
  const proj = t.group ? `<span class="t-proj">${esc(t.group)}</span><span class="t-sep">|</span>` : "";
  const due = t.due ? `<span class="t-due ${overdue}">${esc(relativeDue(t.due, mg.date))}</span>` : "";
  const status = showStatus ? `<span class="lane lane-${t.lane}">${LANE_LABEL[t.lane] || t.lane}</span>` : "";
  return `
    <div class="t-main">
      ${crumbs ? `<div class="t-crumbs">${crumbs}</div>` : ""}
      <div class="t-line">${proj}<span class="t-task">${esc(t.title)}</span>${flag}${link}</div>
    </div>
    <div class="t-side">${status}<span class="t-prio" title="Priority score">${t.score ?? "·"}</span>${due}</div>`;
}
function taskCard(t) {
  const card = el("div", "t-card");
  card.innerHTML = cardBody(t, true);
  card.onclick = () => openEditor(t);
  return card;
}

function relativeDue(due, todayStr) {
  if (!due) return "—";
  const days = Math.round((new Date(due + "T00:00:00") - new Date(todayStr + "T00:00:00")) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 0) return Math.abs(days) + "d ago";
  if (days <= 6) return days + " days";
  if (days <= 13) return "Next week";
  return new Date(due + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

// --- Edit / refine slide-over ----------------------------------------------
const SEG = { num5: ["1", "2", "3", "4", "5"], est: ["30m", "1h", "2h", "4h", "8h", "Split"], energy: ["low", "med", "high"] };
const SEG_CLEARABLE = { num5: true, energy: true, est: false };
const SVG = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

/* ════════════════════════════════════════════════════════════════════════════
 * DELEGATE FEATURE — HIDDEN 2026-06-07 ("not using for now"). To RE-ENABLE,
 * undo these (engine is untouched: LANES/SECTION_KEYS still have "delegated",
 * the `## 🤝 Delegated` section, and focusable() still excludes it):
 *   1. STATUS (just below) — re-add after "today":
 *      { lane: "delegated", label: "Delegated", icon: SVG('<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>') },
 *   2. BOARD_LANES — re-add "delegated" before "done".
 *   3. buildLaneMenu — remove the `.filter(l => l !== "delegated")`.
 *   4. taskCard — restore the delegate detail (`const deleg` + `${deleg}` in .t-foot).
 *   5. renderMatrix — remove the `&& t.lane !== "delegated"` filter.
 *   6. styles.css — remove `#ed-delegate-fld { display: none }`.
 * ════════════════════════════════════════════════════════════════════════════ */
const STATUS = [
  { lane: "parking", label: "Parked", icon: SVG('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>') },
  { lane: "inbox", label: "Inbox", icon: SVG('<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>') },
  { lane: "active", label: "Active", icon: SVG('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>') },
  { lane: "today", label: "Today", icon: SVG('<circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/>') },
  { lane: "done", label: "Mark done", action: "complete", icon: SVG('<polyline points="20 6 9 17 4 12"/>') },
];
function buildStatusToggle(current) {
  const box = $("#ed-status");
  box.innerHTML = "";
  STATUS.forEach((s) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "seg-b seg-stat" + (s.action ? " seg-done" : "") + (s.lane === current ? " on" : "");
    b.title = s.label;
    b.setAttribute("aria-label", s.label);
    b.innerHTML = s.icon;
    b.onclick = () => {
      if (s.action === "complete") return completeFromEditor();
      const ef = $("#editor-panel").elements;
      ef.lane.value = s.lane;
      if (s.lane !== "delegated") ef.delegate.value = "";  // an assignee forces the delegated lane
      updateDelegateField(s.lane);
      box.querySelectorAll(".seg-b").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      if (s.lane === "delegated") setTimeout(() => ef.delegate.focus(), 30);
      scheduleSave(true, 200);  // lane change = a move
    };
    box.appendChild(b);
  });
}
let saveTimer, delTimer;
let pendingMoved = false;          // 'moved' flag for a debounced save not yet fired
let lastSave = Promise.resolve();  // settles when the most recent save finishes

const segEl = (field) => document.querySelector(`#ed-toggles .seg[data-field="${field}"]`);
function segValue(field) {
  const on = segEl(field).querySelector(".seg-b.on");
  return on ? on.dataset.val : "";
}
function buildSegments(field, kind, value) {
  const box = segEl(field);
  box.innerHTML = "";
  SEG[kind].forEach((val) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "seg-b" + (String(value) === val ? " on" : "");
    b.textContent = val;
    b.dataset.val = val;
    b.onclick = () => {
      const cur = box.querySelector(".seg-b.on")?.dataset.val;
      const next = (SEG_CLEARABLE[kind] && cur === val) ? "" : val;
      box.querySelectorAll(".seg-b").forEach((x) => x.classList.toggle("on", x.dataset.val === next));
      scheduleSave(false, 250);
    };
    box.appendChild(b);
  });
}

function todayPlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + Number(days));
  return d.toISOString().slice(0, 10);
}
function fmtNoYear(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function updateDateChips(due) {
  let matched = false;
  document.querySelectorAll("#ed-dates .dchip[data-days]").forEach((c) => {
    const on = !!due && todayPlus(c.dataset.days) === due;
    c.classList.toggle("on", on);
    if (on) matched = true;
  });
  // the date button shows a custom (non-preset) deadline, year omitted
  const btn = $("#ed-date-btn");
  if (btn) {
    const custom = !!due && !matched;
    btn.classList.toggle("on", custom);
    btn.textContent = custom ? fmtNoYear(due) : "Date";
  }
}

// the "Delegate to" field only matters when the task is delegated — hide it otherwise
function updateDelegateField(lane) {
  const fld = $("#ed-delegate-fld");
  if (fld) fld.style.display = lane === "delegated" ? "" : "none";
}
// prev/next pager: step through the currently-shown task list without leaving the dialog
function updateEdNav() {
  const prev = $("#ed-prev"), next = $("#ed-next");
  if (!prev || !next) return;
  const usable = edIndex >= 0 && edRows.length > 1;
  prev.hidden = next.hidden = !usable;
  if (usable) {
    prev.disabled = edIndex <= 0;
    next.disabled = edIndex >= edRows.length - 1;
  }
}
function edStep(delta) {
  const i = edIndex + delta;
  if (i >= 0 && i < edRows.length) openEditor(edRows[i]);
}
function frontsForCompany(company) { return mg.fronts.filter((f) => f.surface === company); }
function populateFronts(company, selected) {
  fillSelect($("#ed-front"), frontsForCompany(company).map((f) => [f.code, f.name]), selected);
}

function openEditor(t, rawText) {
  const f = $("#editor-panel").elements;
  const company = t ? (t.company || mg.companies[0] || "") : (mg.companies[0] || "");
  fillSelect($("#ed-company"), mg.companies.map((c) => [c, c]), company);
  populateFronts(company, t ? t.front : undefined);
  f.title.value = t ? t.title : (rawText || "");
  f.lane.value = t ? (t.lane || "active") : "inbox";   // new tasks land in Inbox
  buildStatusToggle(f.lane.value);
  f.group.value = t ? (t.group || "") : "";
  f.due.value = t && t.due ? t.due : "";
  buildSegments("importance", "num5", t ? (t.importance ?? "") : "");
  buildSegments("urgency", "num5", t ? (t.urgency ?? "") : "");
  buildSegments("est", "est", t ? (t.est || "1h") : "1h");
  f.energy.value = t ? (t.energy || "") : "";  // hidden — preserved, not edited
  f.description.value = t ? (t.description || "") : "";
  f.delegate.value = t ? (t.delegate || "") : "";
  updateDelegateField(f.lane.value);
  edIndex = t ? edRows.indexOf(t) : -1;
  updateEdNav();
  f.url.value = t ? (t.url || "") : "";
  f.added.value = t ? (t.added || "") : "";
  f.avoid.value = t && t.avoid ? "true" : "";
  f.originalRaw.value = t ? t.raw : (rawText ? "- " + rawText : "");
  const src = $("#ed-source");
  if (t && t.url) { src.hidden = false; src.href = t.url; } else { src.hidden = true; }
  updateDateChips(f.due.value);
  resetDelete();
  $("#ed-saved").textContent = "";
  $("#ed-tips").classList.remove("show");
  $("#editor").hidden = false;
  setTimeout(() => f.title.focus(), 40);
}

// Refresh whatever screen is open (plus the header WIP meter) so edits show immediately.
function refreshAfterEdit() {
  load().catch(() => {});   // WIP meter + Today
  const v = viewFromHash();
  if (v === "board") loadBoard().catch(() => {});
  else if (v === "matrix") loadMatrix().catch(() => {});
  else if (v === "manage") loadManage().catch(() => {});
  else if (v === "stats") loadStats().catch(() => {});
}

// Run any queued/in-flight save to completion before we read the board back.
function flushSave() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; return autoSave(pendingMoved); }
  return lastSave;
}

function closeEditor() {
  $("#editor").hidden = true;
  flushSave().then(refreshAfterEdit, refreshAfterEdit);
}

function collectFields() {
  const f = $("#editor-panel").elements;
  return {
    title: f.title.value, front: f.front.value, group: f.group.value,
    importance: segValue("importance"), urgency: segValue("urgency"),
    est: segValue("est") || "1h", energy: f.energy.value,
    due: f.due.value, delegate: f.delegate.value, description: f.description.value,
    url: f.url.value, added: f.added.value, avoid: f.avoid.value,
  };
}
function autoSave(moved) {
  clearTimeout(saveTimer);
  saveTimer = null;
  const f = $("#editor-panel").elements;
  const fields = collectFields();
  if (!fields.title.trim()) { $("#ed-saved").textContent = "needs a name"; return Promise.resolve(); }
  $("#ed-saved").textContent = "saving…";
  lastSave = api("/api/task/save", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields, lane: f.lane.value, originalRaw: f.originalRaw.value || null, moved: !!moved }),
  }).then((r) => { if (r && r.raw) f.originalRaw.value = r.raw; $("#ed-saved").textContent = "saved ✓"; })
    .catch(() => { $("#ed-saved").textContent = "save failed"; });
  return lastSave;
}
function scheduleSave(moved, delay) {
  clearTimeout(saveTimer);
  pendingMoved = moved;
  $("#ed-saved").textContent = "…";
  saveTimer = setTimeout(() => autoSave(moved), delay);
}

function resetDelete() { const b = $("#ed-delete"); b.classList.remove("armed"); b.textContent = "Delete"; }
function armDelete() {
  const b = $("#ed-delete");
  if (b.classList.contains("armed")) return doDelete();
  b.classList.add("armed");
  b.textContent = "Confirm Delete";
  clearTimeout(delTimer);
  delTimer = setTimeout(resetDelete, 3000);
}
function doDelete() {
  const raw = $("#editor-panel").elements.originalRaw.value;
  const done = () => { $("#editor").hidden = true; refreshAfterEdit(); toast("Deleted."); };
  if (!raw) return done();
  api("/api/task/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raw }) }).then(done);
}
function doIt() {
  clearTimeout(saveTimer);
  $("#editor-panel").elements.lane.value = "active";
  autoSave(true).then(() => { $("#editor").hidden = true; refreshAfterEdit(); toast("On it — moved to Active."); });
}
// Done is a terminal status: flush any pending edits, then mark the task complete.
function completeFromEditor() {
  clearTimeout(saveTimer);
  const f = $("#editor-panel").elements;
  if (!f.title.value.trim()) { $("#ed-saved").textContent = "needs a name first"; return; }
  autoSave(false).then(() => {
    const raw = f.originalRaw.value;
    const finish = () => { $("#editor").hidden = true; refreshAfterEdit(); toast("Done. One less open loop."); };
    if (!raw) return finish();
    return api("/api/complete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw, done: true }),
    }).then(finish);
  });
}

// --- Add to Apple Calendar -------------------------------------------------
// Build a single-event .ics (today 02:00–02:30, floating local time) and
// download it. Opening the file on macOS/iOS hands it to Apple Calendar with
// a one-tap "Add". Floating time (no Z/TZID) = 2am wherever it's opened.
function icsEscape(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}
function icsFold(line) {
  if (line.length <= 74) return line;
  let out = line.slice(0, 74), i = 74;
  while (i < line.length) { out += "\r\n " + line.slice(i, i + 73); i += 73; }
  return out;
}
function calSlug(s) {
  return (s || "task").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "task";
}
function calSummary(f) {
  const front = mg.fronts.find((x) => x.code === f.front.value);
  const section = front ? front.name.split("—")[0].trim() : "";
  // Company: Section: Project: Task — empty parts dropped so it never reads "A: : C".
  return [f.company.value, section, f.group.value, f.title.value.trim()].filter(Boolean).join(": ");
}
function addToCalendar() {
  const f = $("#editor-panel").elements;
  const title = f.title.value.trim();
  if (!title) { $("#ed-saved").textContent = "needs a name first"; return; }
  const p2 = (n) => String(n).padStart(2, "0");
  const now = new Date();
  const ymd = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}`;
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const uid = `kiros-${ymd}-${calSlug(title)}@kiros.local`;
  const desc = [f.description.value, f.url.value].filter(Boolean).join("\n\n");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Kiros//Task//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp}`,
    `DTSTART:${ymd}T020000`, `DTEND:${ymd}T023000`,
    `SUMMARY:${icsEscape(calSummary(f))}`,
  ];
  if (desc) lines.push(`DESCRIPTION:${icsEscape(desc)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  const ics = lines.map(icsFold).join("\r\n") + "\r\n";
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${calSlug(title)}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const btn = $("#ed-cal"); btn.classList.add("ok");
  setTimeout(() => btn.classList.remove("ok"), 1500);
  toast("Calendar file ready — open it to add to Apple Calendar.");
}

// --- Stats (a mirror, not a scoreboard) ------------------------------------
let statsRange = "week";

// Earthy palette — company gets a stable color by its order in the legend.
const COMPANY_PALETTE = ["#D97757", "#8AAE7F", "#C79468", "#7E9CC2", "#B98AC7", "#D9B557"];
function companyColor(name, companies) {
  const i = companies.indexOf(name);
  return COMPANY_PALETTE[(i < 0 ? companies.length : i) % COMPANY_PALETTE.length];
}
function niceDate(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

async function loadStats() {
  const d = await api("/api/stats?range=" + statsRange);
  const companies = d.companies || [];
  const open = d.open || { total: 0, byCompany: [], overdue: 0, oldestDays: 0, avoid: 0 };
  $("#st-total").textContent = d.total;
  $("#st-streak").textContent = d.streak || 0;
  $("#st-effort").textContent = d.effortDone ?? 0;
  $("#st-avg").textContent = d.activeDays ? (d.total / d.activeDays).toFixed(1) : "0";
  $("#st-best").textContent = d.best && d.best.count
    ? `🔥 Best day so far: ${d.best.count} finished · ${niceDate(d.best.date)}`
    : "";
  renderChart(d.byDay, companies);
  renderLegend(companies);
  renderBars("#st-company", d.byCompany, (r) => companyColor(r.company, companies));
  renderBars("#st-open-company", open.byCompany, "var(--circle)");
  renderSignals(open);
  $("#st-note").textContent = d.total
    ? "Up is what you shipped, down is what's still open — a mirror, not a scoreboard."
    : "Nothing finished in this range yet. Completed tasks land here.";
}

function shortDay(iso) {
  const d = new Date(iso + "T00:00:00");
  return statsRange === "month" ? String(d.getDate()) : d.toLocaleDateString("en-US", { weekday: "short" })[0];
}

// Diverging chart: finished stacked-by-company above the line, still-open below it.
function renderChart(byDay, companies) {
  const box = $("#st-chart");
  box.innerHTML = "";
  const max = Math.max(1, ...byDay.map((d) => Math.max(d.count, d.opened || 0)));
  byDay.forEach((d) => {
    const col = el("div", "dcol");
    const up = el("div", "dcol-up");
    companies.forEach((co) => {
      const n = (d.byCompany && d.byCompany[co]) || 0;
      if (!n) return;
      const seg = el("div", "dseg");
      seg.style.height = (n / max) * 100 + "%";
      seg.style.background = companyColor(co, companies);
      seg.title = `${niceDate(d.date)} · ${co}: ${n}`;
      up.appendChild(seg);
    });
    const down = el("div", "dcol-down");
    if (d.opened) {
      const ob = el("div", "dbar-open");
      ob.style.height = (d.opened / max) * 100 + "%";
      ob.title = `${niceDate(d.date)} · opened, still open: ${d.opened}`;
      down.appendChild(ob);
    }
    col.appendChild(up);
    col.appendChild(down);
    col.appendChild(el("div", "dx", shortDay(d.date)));
    box.appendChild(col);
  });
}

function renderLegend(companies) {
  const box = $("#st-legend");
  box.innerHTML = "";
  companies.forEach((co) => {
    const item = el("div", "leg-item");
    item.innerHTML = `<span class="leg-dot" style="background:${companyColor(co, companies)}"></span>${esc(co)}`;
    box.appendChild(item);
  });
  if (companies.length) {
    const o = el("div", "leg-item");
    o.innerHTML = `<span class="leg-dot leg-open"></span>still open`;
    box.appendChild(o);
  }
}

function renderSignals(open) {
  const box = $("#st-signals");
  box.innerHTML = "";
  const chips = [
    { n: open.total, label: "open loops" },
    { n: open.overdue, label: "overdue", warn: open.overdue > 0 },
    { n: (open.oldestDays || 0) + "d", label: "oldest waiting", warn: (open.oldestDays || 0) >= 7 },
    { n: open.avoid, label: "avoiding", warn: open.avoid > 0 },
  ];
  chips.forEach((c) => {
    const chip = el("div", "signal" + (c.warn ? " warn" : ""));
    chip.innerHTML = `<div class="signal-num">${c.n}</div><div class="signal-label">${c.label}</div>`;
    box.appendChild(chip);
  });
}

// fill may be a CSS color string or a (row) => color function.
function renderBars(boxSel, rows, fill) {
  const box = $(boxSel);
  box.innerHTML = "";
  if (!rows || !rows.length) { box.appendChild(el("div", "bar-empty", "—")); return; }
  const max = Math.max(1, ...rows.map((r) => r.count));
  rows.forEach((r) => {
    const color = typeof fill === "function" ? fill(r) : fill;
    const row = el("div", "bar-row");
    row.innerHTML = `<span class="bar-label">${esc(r.company)}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.max(6, (r.count / max) * 100)}%;background:${color}"></span></span><span class="bar-count">${r.count}</span>`;
    box.appendChild(row);
  });
}

// --- Actions ----------------------------------------------------------------
async function load() {
  const data = await api("/api/board");
  renderWip(data.wip);
  renderToday(data);
}

async function complete(raw) {
  await api("/api/complete", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw, done: true }),
  });
  toast("Done. One less open loop.");
  load();
}

async function capture(text) {
  const r = await api("/api/capture", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (r.ok) { toast("Captured. Back to it."); load(); }
}

async function runNow() {
  const r = await api("/api/now", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ energy: nowChoice.energy, time: nowChoice.time ? Number(nowChoice.time) : null }),
  });
  const box = $("#now-result");
  box.innerHTML = "";
  if (!r.pick) {
    box.appendChild(el("div", "clean",
      `<div class="big">Nothing fits that window.</div>
       <div>Capture the noise below, then pick the smallest real thing.</div>`));
    return;
  }
  box.appendChild(focusCard(r.pick, "Just this one"));
}

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// --- Wiring -----------------------------------------------------------------
// --- Structure (companies & projects) --------------------------------------
function openStructure() { renderStructure(); $("#structure").hidden = false; }
function closeStructure() { $("#structure").hidden = true; }

function renderStructure() {
  const box = $("#struct-list");
  box.innerHTML = "";
  const groups = {};
  mg.companies.forEach((c) => { groups[c] = []; });
  mg.fronts.forEach((f) => { (groups[f.surface] = groups[f.surface] || []).push(f); });
  Object.keys(groups).forEach((company) => {
    const sec = el("div", "struct-co");
    sec.appendChild(el("div", "struct-co-name", esc(company)));
    groups[company].forEach((f) => {
      const row = el("div", "struct-proj");
      const nameIn = document.createElement("input");
      nameIn.className = "struct-pname-in";
      nameIn.value = f.name;
      nameIn.title = "Rename section";
      nameIn.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); nameIn.blur(); } };
      nameIn.onchange = () => {
        const v = nameIn.value.trim();
        if (v && v !== f.name) structurePost("/api/front/update", { code: f.code, name: v }, "Section renamed.");
        else nameIn.value = f.name;
      };
      const impSel = document.createElement("select");
      impSel.className = "struct-imp-sel";
      impSel.title = "Default importance for tasks in this section";
      impSel.innerHTML = [1, 2, 3, 4, 5].map((i) => `<option value="${i}"${i === f.importance ? " selected" : ""}>Importance ${i}</option>`).join("");
      impSel.onchange = () => structurePost("/api/front/update", { code: f.code, importance: impSel.value }, "Importance set.");
      const del = el("button", "struct-del", "×");
      del.title = "Delete section";
      del.onclick = () => deleteProject(f.code, f.name);
      row.append(nameIn, impSel, del);
      sec.appendChild(row);
    });
    const form = document.createElement("form");
    form.className = "struct-addproj";
    const opts = [1, 2, 3, 4, 5].map((i) => `<option value="${i}"${i === 3 ? " selected" : ""}>Importance ${i}</option>`).join("");
    form.innerHTML = `<input name="pname" class="in" type="text" autocomplete="off" placeholder="+ add section" />
      <select name="pimp" class="in struct-impsel">${opts}</select>
      <button class="ghost" type="submit">Add</button>`;
    form.onsubmit = (e) => { e.preventDefault(); addProject(company, e.target.pname.value, e.target.pimp.value); };
    sec.appendChild(form);
    box.appendChild(sec);
  });
}

async function structurePost(path, payload, msg) {
  await api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  toast(msg);
  await loadManage();   // refresh companies, fronts, table, edit dropdown
  renderStructure();
}

function addCompany(name) {
  if (name.trim()) structurePost("/api/company/save", { name }, "Company added.");
}
function addProject(company, name, importance) {
  if (name.trim()) structurePost("/api/project/save", { company, name, importance }, "Section added.");
}
function deleteProject(code, name) {
  if (confirm(`Delete section "${name}"? Its tasks keep their code but lose their section mapping.`)) {
    structurePost("/api/project/delete", { code }, "Section removed.");
  }
}

// --- Matrix (projects on Importance × Urgency) -----------------------------
const matrixFilter = { company: "", lanes: new Set() };
async function loadMatrix() {
  mg = await api("/api/tasks");
  buildCompanyToggle("#mx-company", matrixFilter, renderMatrix);
  buildMxStatusMenu();
  updateMxStatusLabel();
  renderMatrix();
}
// Matrix status filter — same multi-select checkbox dropdown as Manage (excludes delegated/done)
function buildMxStatusMenu() {
  const menu = $("#mx-status .mg-dd-menu");
  const opts = [["", "All statuses"], ...mg.lanes.filter((l) => l !== "delegated" && l !== "done").map((l) => [l, LANE_LABEL[l] || l])];
  menu.innerHTML = opts.map(([val, label]) => {
    const checked = val === "" ? matrixFilter.lanes.size === 0 : matrixFilter.lanes.has(val);
    return `<button type="button" class="mg-dd-opt${checked ? " on" : ""}" role="option" aria-selected="${checked}" data-val="${esc(val)}"><span class="mg-check" aria-hidden="true"></span><span>${esc(label)}</span></button>`;
  }).join("");
}
function toggleMxStatus(val) {
  if (val === "") matrixFilter.lanes.clear();
  else if (matrixFilter.lanes.has(val)) matrixFilter.lanes.delete(val);
  else matrixFilter.lanes.add(val);
  buildMxStatusMenu();
  updateMxStatusLabel();
  renderMatrix();
}
function updateMxStatusLabel() {
  const n = matrixFilter.lanes.size;
  $("#mx-status .mg-dd-label").textContent = n === 0 ? "All statuses"
    : n === 1 ? (LANE_LABEL[[...matrixFilter.lanes][0]] || [...matrixFilter.lanes][0]) : `${n} statuses`;
}
const MX_IMP_ROWS = [5, 4, 3, 2, 1];   // top → bottom
const MX_URG_COLS = [1, 2, 3, 4, 5];   // left → right
const clamp5 = (n) => Math.max(1, Math.min(5, Math.round(Number(n) || 3)));

// 5×5 grid: bucket each task into its Importance×Urgency cell, list cells top-down / left-right.
function renderMatrix() {
  const matrix = $("#matrix");
  matrix.innerHTML = "";
  const frontBy = {};
  mg.fronts.forEach((f) => { frontBy[f.code] = f; });
  let tasks = mg.tasks.filter((t) => !t.done && t.lane !== "delegated");
  if (matrixFilter.company) tasks = tasks.filter((t) => t.company === matrixFilter.company);
  if (matrixFilter.lanes.size) tasks = tasks.filter((t) => matrixFilter.lanes.has(t.lane));

  const impOf = (t) => { const f = frontBy[t.front]; return clamp5(t.importance ?? (f && f.importance) ?? 3); };
  const urgOf = (t) => { const f = frontBy[t.front]; return clamp5(t.urgency ?? (f && f.urgency != null ? f.urgency : 3)); };
  const bucket = {};
  tasks.forEach((t) => { const k = impOf(t) + "-" + urgOf(t); (bucket[k] = bucket[k] || []).push(t); });

  edRows = [];   // editor ◂ ▸ steps through cells in reading order
  MX_IMP_ROWS.forEach((imp) => {
    MX_URG_COLS.forEach((urg) => {
      const cell = el("div", "m-cell");
      cell.dataset.imp = imp; cell.dataset.urg = urg;
      const items = (bucket[imp + "-" + urg] || []).sort((a, b) => (b.score || 0) - (a.score || 0));
      items.forEach((t) => { edRows.push(t); cell.appendChild(matrixItem(t)); });
      matrix.appendChild(cell);
    });
  });
}
function matrixItem(t) {
  const proj = t.group || t.frontName || t.company || "";
  const card = el("div", "m-item");
  card.title = proj ? `${proj} — ${t.title}` : t.title;   // full text on native hover-tooltip
  card.innerHTML = `<span class="mi-proj">${esc(proj)}</span><span class="mi-name">${esc(t.title)}</span>`;
  makeMatrixDraggable(card, t);
  return card;
}
// Drag a chip into another cell to re-bin its Importance×Urgency; a tap opens the editor.
// Mouse drags on move; touch needs a long-press (so a swipe still scrolls the cell).
function makeMatrixDraggable(card, t) {
  card.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const isTouch = e.pointerType === "touch";
    const id = e.pointerId, sx = e.clientX, sy = e.clientY;
    const srcCell = card.closest(".m-cell");
    let dragging = false, armed = !isTouch, ghost = null;
    const lp = isTouch ? setTimeout(() => { armed = true; if (navigator.vibrate) navigator.vibrate(12); }, 250) : 0;

    const cellAt = (x, y) => {
      const vis = ghost && ghost.style.display;
      if (ghost) ghost.style.display = "none";
      const node = document.elementFromPoint(x, y);
      if (ghost) ghost.style.display = vis;
      return node && node.closest(".m-cell");
    };
    const begin = (ev) => {
      dragging = true;
      try { card.setPointerCapture(id); } catch (_) {}
      ghost = card.cloneNode(true);
      ghost.className = "m-item m-ghost";
      ghost.style.width = card.getBoundingClientRect().width + "px";
      document.body.appendChild(ghost);
      card.classList.add("dragging");
      paint(ev);
    };
    const paint = (ev) => {
      ghost.style.left = ev.clientX + "px";
      ghost.style.top = ev.clientY + "px";
      const cell = cellAt(ev.clientX, ev.clientY);
      document.querySelectorAll(".m-cell").forEach((c) => c.classList.toggle("drop-on", c === cell && c !== srcCell));
    };
    const move = (ev) => {
      const far = Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6;
      if (!dragging) {
        if (!armed) { if (far) end(ev, true); return; }   // pre-long-press move on touch = scroll → bail
        if (!far && !isTouch) return;
        begin(ev);
      }
      ev.preventDefault();
      paint(ev);
    };
    const end = (ev, bail) => {
      clearTimeout(lp);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancel);
      const wasDragging = dragging;
      if (dragging && !bail) {
        const cell = cellAt(ev.clientX, ev.clientY);
        if (cell && cell !== srcCell) updateTaskImpUrg(t, Number(cell.dataset.imp), Number(cell.dataset.urg));
      }
      if (ghost) ghost.remove();
      card.classList.remove("dragging");
      document.querySelectorAll(".m-cell").forEach((c) => c.classList.remove("drop-on"));
      try { card.releasePointerCapture(id); } catch (_) {}
      if (!wasDragging && !bail) openEditor(t);   // it was a tap
    };
    const up = (ev) => end(ev, false);
    const cancel = () => end(e, true);
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", cancel);
  });
}
async function updateTaskImpUrg(t, importance, urgency) {
  const fields = {
    title: t.title, front: t.front, group: t.group || "",
    importance, urgency, est: t.est || "1h", energy: t.energy || "", due: t.due || "",
    delegate: t.delegate || "", description: t.description || "",
    url: t.url || "", added: t.added || "", avoid: t.avoid ? "true" : "",
  };
  try {
    await api("/api/task/save", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields, lane: t.lane, originalRaw: t.raw, moved: false }) });
    toast("Set.");
    loadMatrix();
    load();
  } catch (err) {
    toast("Update failed: " + err.message);
  }
}

// --- Board (kanban by status) ----------------------------------------------
const boardFilter = { company: "", sort: "score", dir: -1, q: "" };
const BOARD_SORT = [["score", "Priority"], ["due", "Deadline"], ["company", "Company"]];
const BOARD_LANES = ["parking", "inbox", "active", "today", "done"];  // column order; "done" is the [x] flag (Delegated hidden for now)

// Feather-style icon per sort dimension — the toggle shows the active one (icons only).
const SORT_ICONS = {
  score: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  due: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  company: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
};
// Icon-only sort control: toggle = active dimension's icon + direction; menu = icon + label per option.
function buildSortDD(sel, options, state) {
  const dir = state.dir === -1 ? "↓" : "↑";
  const menu = $(sel + " .mg-dd-menu");
  menu.innerHTML = options.map(([key, label]) => {
    const on = state.sort === key;
    return `<button type="button" class="mg-dd-opt sort-opt${on ? " on" : ""}" role="option" aria-selected="${on}" data-sort="${key}"><span class="sort-glyph" aria-hidden="true">${SORT_ICONS[key] || ""}</span><span class="sort-opt-label">${label}</span>${on ? `<span class="sort-dir">${dir}</span>` : ""}</button>`;
  }).join("");
  const cur = options.find(([k]) => k === state.sort);
  const tog = $(sel + " .mg-dd-toggle");
  tog.innerHTML = `<span class="sort-glyph" aria-hidden="true">${SORT_ICONS[state.sort] || ""}</span><span class="sort-dir" aria-hidden="true">${dir}</span>`;
  tog.title = "Sort: " + (cur ? cur[1] : "Sort") + " " + dir;
}
function setBoardSort(key) {
  if (boardFilter.sort === key) boardFilter.dir *= -1;
  else { boardFilter.sort = key; boardFilter.dir = DEFAULT_DIR[key] || 1; }
  buildSortDD("#bd-sort", BOARD_SORT, boardFilter);
  renderBoard();
}
async function loadBoard() {
  mg = await api("/api/tasks");
  buildCompanyToggle("#bd-company", boardFilter, renderBoard);
  buildSortDD("#bd-sort", BOARD_SORT, boardFilter);
  renderBoard();
}
function boardCard(t) {
  const card = el("div", "b-card");
  card.innerHTML = cardBody(t, false);   // status hidden on the board — the column IS the status
  makeCardDraggable(card, t);
  return card;
}

// Move a task to another status by drag-drop. "done" column → complete (logs Stats);
// any lane → rebuild the task in that lane (clears assignee unless target is Delegated; un-dones if it was done).
async function moveTask(t, targetLane) {
  try {
    if (targetLane === "done") {
      await api("/api/complete", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw: t.raw, done: true }) });
    } else {
      const fields = {
        title: t.title, front: t.front, group: t.group || "",
        importance: t.importance ?? "", urgency: t.urgency ?? "",
        est: t.est || "1h", energy: t.energy || "", due: t.due || "",
        delegate: targetLane === "delegated" ? (t.delegate || "") : "",
        description: t.description || "", url: t.url || "", added: t.added || "", avoid: t.avoid ? "true" : "",
      };
      await api("/api/task/save", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields, lane: targetLane, originalRaw: t.raw, moved: true }) });
    }
    toast("Moved to " + (LANE_LABEL[targetLane] || targetLane) + ".");
    loadBoard();
    load();
  } catch (err) {
    toast("Move failed: " + err.message);
  }
}

// Pointer-based drag for a board card: mouse drags on move; touch needs a long-press
// (so a quick swipe still scrolls the board). A tap (no drag) opens the editor.
function makeCardDraggable(card, t) {
  card.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const isTouch = e.pointerType === "touch";
    const id = e.pointerId, sx = e.clientX, sy = e.clientY;
    let dragging = false, armed = !isTouch, ghost = null;
    const lp = isTouch ? setTimeout(() => { armed = true; if (navigator.vibrate) navigator.vibrate(12); }, 250) : 0;

    const colAt = (x, y) => {
      const vis = ghost && ghost.style.display;
      if (ghost) ghost.style.display = "none";
      const node = document.elementFromPoint(x, y);
      if (ghost) ghost.style.display = vis;
      return node && node.closest(".board-col");
    };
    const begin = (ev) => {
      dragging = true;
      try { card.setPointerCapture(id); } catch (_) {}
      ghost = card.cloneNode(true);
      ghost.className = "b-card b-ghost";
      ghost.style.width = card.getBoundingClientRect().width + "px";
      document.body.appendChild(ghost);
      card.classList.add("b-dragging");
      paint(ev);
    };
    const paint = (ev) => {
      ghost.style.left = ev.clientX + "px";
      ghost.style.top = ev.clientY + "px";
      const col = colAt(ev.clientX, ev.clientY);
      document.querySelectorAll(".board-col").forEach((c) => c.classList.toggle("drop-on", c === col));
    };
    const move = (ev) => {
      const far = Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6;
      if (!dragging) {
        if (!armed) { if (far) end(ev, true); return; }   // pre-long-press move on touch = scroll → bail
        if (!far && !isTouch) return;
        begin(ev);
      }
      ev.preventDefault();
      paint(ev);
    };
    const end = (ev, bail) => {
      clearTimeout(lp);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancel);
      const wasDragging = dragging;
      if (dragging && !bail) {
        const col = colAt(ev.clientX, ev.clientY);
        const target = col && col.dataset.lane;
        const source = t.done ? "done" : t.lane;
        if (target && target !== source) moveTask(t, target);
      }
      if (ghost) ghost.remove();
      card.classList.remove("b-dragging");
      document.querySelectorAll(".board-col").forEach((c) => c.classList.remove("drop-on"));
      try { card.releasePointerCapture(id); } catch (_) {}
      if (!wasDragging && !bail) openEditor(t);   // it was a tap
    };
    const up = (ev) => end(ev, false);
    const cancel = () => end(e, true);
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", cancel);
  });
}
function renderBoard() {
  const board = $("#board");
  board.innerHTML = "";
  let tasks = mg.tasks;
  if (boardFilter.company) tasks = tasks.filter((t) => t.company === boardFilter.company);
  if (boardFilter.q) {
    const q = boardFilter.q.toLowerCase();
    tasks = tasks.filter((t) => `${t.title} ${t.frontName || ""} ${t.company || ""} ${t.group || ""} ${t.delegate || ""}`.toLowerCase().includes(q));
  }
  const cmp = (a, b) => {
    const va = sortValue(a, boardFilter.sort), vb = sortValue(b, boardFilter.sort);
    return (va < vb ? -1 : va > vb ? 1 : 0) * boardFilter.dir;
  };
  edRows = [];   // editor ◂ ▸ steps through the board in column order
  BOARD_LANES.forEach((lane) => {
    const col = el("div", "board-col");
    col.dataset.lane = lane;
    const items = (lane === "done"
      ? tasks.filter((t) => t.done)
      : tasks.filter((t) => t.lane === lane && !t.done)).sort(cmp);
    const head = el("div", "board-head");
    head.innerHTML = `<span class="lane lane-${lane}">${LANE_LABEL[lane] || lane}</span><span class="board-count">${items.length}</span>`;
    col.appendChild(head);
    const body = el("div", "board-col-body");
    if (!items.length) body.appendChild(el("div", "board-empty", "—"));
    else items.forEach((t) => { edRows.push(t); body.appendChild(boardCard(t)); });
    col.appendChild(body);
    board.appendChild(col);
  });
}

function switchView(name) {
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("is-active", b.dataset.view === name));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-active", v.id === "view-" + name));
  document.querySelectorAll(".vtools").forEach((v) => v.classList.toggle("is-active", v.dataset.view === name));  // header filter/sort follows the active view
  if (name !== "board") { clearBoardSearch(); setSearchOpen(false); }  // collapse + clear board search when leaving it
  document.body.classList.toggle("wide", name === "matrix");
  document.body.classList.toggle("full", name === "board");  // board spans the whole width
  document.getElementById("fab-new").style.display = name === "matrix" ? "none" : "";
  if (name === "manage") loadManage().catch((err) => toast("Manage failed: " + err.message));
  if (name === "board") loadBoard().catch((err) => toast("Board failed: " + err.message));
  if (name === "today") load().catch((err) => toast("Today failed: " + err.message));  // refresh Today-status list
  if (name === "stats") loadStats().catch((err) => toast("Stats failed: " + err.message));
  if (name === "matrix") loadMatrix().catch((err) => toast("Matrix failed: " + err.message));
}

// --- URL routing: each view gets a hash slug so a reload reopens the same screen ---
const VIEWS = ["board", "matrix", "today", "now", "stats", "manage"];
const DEFAULT_VIEW = "board";
function viewFromHash() {
  const h = location.hash.replace(/^#\/?/, "");
  return VIEWS.includes(h) ? h : DEFAULT_VIEW;
}
window.addEventListener("hashchange", () => switchView(viewFromHash()));

let resizeTimer;
window.addEventListener("resize", () => {
  if (!document.getElementById("view-matrix").classList.contains("is-active")) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderMatrix, 150);
});

document.querySelectorAll(".tab").forEach((b) => b.onclick = () => { location.hash = b.dataset.view; });

// Manage wiring
$("#editor-panel").onsubmit = (e) => e.preventDefault();
$("#fab-new").onclick = () => openEditor(null);
document.querySelectorAll("[data-close]").forEach((b) => b.onclick = closeEditor);
$("#ed-delete").onclick = armDelete;
$("#ed-doit").onclick = doIt;
$("#ed-cal").onclick = addToCalendar;
$("#ed-prev").onclick = () => edStep(-1);
$("#ed-next").onclick = () => edStep(1);
$("#ed-info").onclick = () => $("#ed-tips").classList.add("show");
$("#ed-tips-x").onclick = () => $("#ed-tips").classList.remove("show");
$("#ed-company").onchange = (e) => { populateFronts(e.target.value); scheduleSave(false, 250); };
$("#ed-front").onchange = () => scheduleSave(false, 250);
{
  const ef = $("#editor-panel").elements;
  ef.title.oninput = () => scheduleSave(false, 700);
  ef.group.oninput = () => scheduleSave(false, 700);
  ef.description.oninput = () => scheduleSave(false, 700);
  ef.delegate.oninput = () => scheduleSave(false, 700);
  ef.due.onchange = () => { updateDateChips(ef.due.value); scheduleSave(false, 250); };
}
document.querySelectorAll("#ed-dates .dchip[data-days]").forEach((c) => c.onclick = () => {
  const ef = $("#editor-panel").elements;
  ef.due.value = todayPlus(c.dataset.days);
  updateDateChips(ef.due.value);
  scheduleSave(false, 250);
});
$("#ed-date-btn").onclick = () => {
  const input = $("#ed-dateinput");
  if (input.showPicker) input.showPicker();
  else input.focus();
};
$("#mg-search").oninput = (e) => { mgFilter.q = e.target.value; renderTable(); };
$("#mg-company").onchange = (e) => { mgFilter.company = e.target.value; renderTable(); };
$("#mg-lane .mg-dd-toggle").onclick = (e) => { e.stopPropagation(); openDD($("#mg-lane")); };
$("#mg-lane .mg-dd-menu").onclick = (e) => {
  e.stopPropagation();  // clicks inside the menu are "inside" — don't let the outside-click handler close it
  const opt = e.target.closest(".mg-dd-opt");
  if (opt) { toggleLane(opt.dataset.val); openDD($("#mg-lane"), false); }
};
$("#mg-sort .mg-dd-toggle").onclick = (e) => { e.stopPropagation(); openDD($("#mg-sort")); };
$("#mg-sort .mg-dd-menu").onclick = (e) => {
  e.stopPropagation();
  const opt = e.target.closest(".mg-dd-opt");
  if (opt) { setSort(opt.dataset.sort); openDD($("#mg-sort"), false); }
};
// #bd-company / #mx-company are icon toggles now — their click handlers are wired in buildCompanyToggle().
$("#mx-status .mg-dd-toggle").onclick = (e) => { e.stopPropagation(); openDD($("#mx-status")); };
$("#mx-status .mg-dd-menu").onclick = (e) => {
  e.stopPropagation();
  const opt = e.target.closest(".mg-dd-opt");
  if (opt) { toggleMxStatus(opt.dataset.val); openDD($("#mx-status"), false); }
};
$("#bd-sort .mg-dd-toggle").onclick = (e) => { e.stopPropagation(); openDD($("#bd-sort")); };
$("#bd-sort .mg-dd-menu").onclick = (e) => {
  e.stopPropagation();
  const opt = e.target.closest(".mg-dd-opt");
  if (opt) { setBoardSort(opt.dataset.sort); openDD($("#bd-sort"), false); }
};
// Board search — icon expands into a 250px field; collapses when emptied.
const bdSearch = $("#bd-search");
const bdSearchInput = bdSearch.querySelector(".srch-input");
function setSearchOpen(open) {
  bdSearch.classList.toggle("open", open);
  if (open) bdSearchInput.focus();
}
function clearBoardSearch() {
  bdSearchInput.value = "";
  if (boardFilter.q) { boardFilter.q = ""; renderBoard(); }
}
bdSearch.querySelector(".srch-btn").onclick = () => {
  const willOpen = !bdSearch.classList.contains("open");
  setSearchOpen(willOpen);
  if (!willOpen) clearBoardSearch();
};
bdSearch.querySelector(".srch-clear").onclick = () => { clearBoardSearch(); bdSearchInput.focus(); };
bdSearchInput.oninput = (e) => { boardFilter.q = e.target.value; renderBoard(); };
bdSearchInput.onkeydown = (e) => { if (e.key === "Escape") { clearBoardSearch(); setSearchOpen(false); bdSearchInput.blur(); } };
bdSearchInput.onblur = () => { if (!bdSearchInput.value) setSearchOpen(false); };
document.addEventListener("click", () => document.querySelectorAll(".mg-dd").forEach(closeDD));
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const tips = $("#ed-tips");
  if (tips.classList.contains("show")) { tips.classList.remove("show"); return; }
  document.querySelectorAll(".mg-dd").forEach(closeDD);
});

document.querySelectorAll("#stats-range .seg-btn").forEach((b) => b.onclick = () => {
  statsRange = b.dataset.range;
  document.querySelectorAll("#stats-range .seg-btn").forEach((x) => x.classList.toggle("is-active", x === b));
  loadStats().catch((e) => toast("Stats failed: " + e.message));
});

$("#open-structure").onclick = openStructure;
$("#company-form").onsubmit = (e) => { e.preventDefault(); addCompany(e.target.coname.value); e.target.coname.value = ""; };
document.querySelectorAll("[data-sclose]").forEach((b) => b.onclick = closeStructure);

document.querySelectorAll(".picker-row").forEach((row) => {
  row.querySelectorAll(".chip").forEach((chip) => {
    chip.onclick = () => {
      row.querySelectorAll(".chip").forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");
      if (row.dataset.group === "energy") nowChoice.energy = chip.dataset.energy;
      else nowChoice.time = chip.dataset.time;
    };
  });
});

$("#now-go").onclick = runNow;

$("#capture").onsubmit = (e) => {
  e.preventDefault();
  const input = $("#capture-input");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  capture(text);
};

// Account menu + per-user calendar feed (needs this user's private ics token).
async function initAccount() {
  let me;
  try { me = await api("/api/me"); } catch (e) { return; }
  const emailEl = $("#account-email");
  if (emailEl) emailEl.textContent = me.email || "";
  const adminLink = $("#account-admin");
  if (adminLink) adminLink.hidden = !me.isAdmin;
  const calSub = $("#cal-sub");
  if (calSub && me.icsToken) calSub.href = "webcal://" + location.host + "/u/" + me.icsToken + "/kiros.ics";
  const calDl = document.querySelector(".cal-dl");
  if (calDl && me.icsToken) calDl.href = "/u/" + me.icsToken + "/kiros.ics?download=1";
}
const accountBtn = $("#account-btn");
if (accountBtn) accountBtn.onclick = (e) => { e.stopPropagation(); $("#account-menu").classList.toggle("open"); };
const logoutBtn = $("#account-logout");
if (logoutBtn) logoutBtn.onclick = async () => {
  try { await api("/api/auth/logout", { method: "POST" }); } catch (e) { /* fall through to login */ }
  location.href = "/login";
};
document.addEventListener("click", () => { const m = $("#account-menu"); if (m) m.classList.remove("open"); });
initAccount();

load().catch((err) => toast("Could not reach Kiros: " + err.message));
loadManage().catch((err) => toast("Manage failed: " + err.message));  // populates mg (for the FAB/editor on any view)
switchView(viewFromHash());  // open the screen named in the URL hash (defaults to Board)
