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
const isWebUrl = (u) => /^https?:\/\//i.test(u || "");   // a real, clickable source link — not a local description key

let nowChoice = { energy: null, time: "" };

// --- Rendering --------------------------------------------------------------
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

// Today screen — the tasks you put in the Today status, top 5 by priority (or your
// arranged order under Custom). The order is shared with the Board's Today column.
let todaySort = localStorage.getItem("kiros.todaySort") || "score";
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
  const arranged = todaySort === "manual" ? "Your arranged order — drag to reorder on the Board. " : "";
  $("#hidden-note").innerHTML = hidden > 0
    ? `${arranged}${hidden} more in Today — the top ${items.length} are up. Do #1 first.`
    : `${arranged}Do #1 before anything new.`;
}

// --- Manage (the dense workhorse) ------------------------------------------
const LANE_LABEL = { inbox: "Inbox", active: "Next Up", today: "Today", delegated: "Delegated", parking: "Parked", done: "Done" };
function laneLabel(lane) { return (uiPrefs.laneLabels && uiPrefs.laneLabels[lane]) || LANE_LABEL[lane] || lane; }
let mg = { tasks: [], fronts: [], companies: [], lanes: [], inbox: [], date: "" };
const mgFilter = { q: "", company: "", lanes: new Set(), sort: "score", dir: -1 };
let edRows = [];   // the list the editor's ◂ ▸ step through — set per view (table / board / matrix)
let edIndex = -1;  // index of the open task within edRows (-1 = new/intake task)

function fillDatalist(elm, values) {
  elm.innerHTML = values.map((v) => `<option value="${esc(v)}"></option>`).join("");
}
function fillSelect(sel, pairs, current, placeholder) {
  sel.innerHTML = "";
  const all = placeholder != null ? [["", placeholder], ...pairs] : pairs;
  all.forEach(([value, label]) => {
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
// Symbol library for company/context icons (Feather-style; inherit currentColor).
const ICON_PATHS = {
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  heart: '<path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21l8.8-8.3a5 5 0 0 0 0-7.1z"/>',
  star: '<polygon points="12 2 15 9 22 9.3 16.5 14 18.5 21 12 17 5.5 21 7.5 14 2 9.3 9 9"/>',
  zap: '<polygon points="13 2 4 14 11 14 10 22 20 9 13 9 13 2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  coffee: '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1.5" x2="6" y2="4.5"/><line x1="10" y1="1.5" x2="10" y2="4.5"/><line x1="14" y1="1.5" x2="14" y2="4.5"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.3 7 12 12 20.7 7"/><line x1="12" y1="22" x2="12" y2="12"/>',
  bag: '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  sun: '<circle cx="12" cy="12" r="4.5"/><line x1="12" y1="1.5" x2="12" y2="3.5"/><line x1="12" y1="20.5" x2="12" y2="22.5"/><line x1="4" y1="4" x2="5.5" y2="5.5"/><line x1="18.5" y1="18.5" x2="20" y2="20"/><line x1="1.5" y1="12" x2="3.5" y2="12"/><line x1="20.5" y1="12" x2="22.5" y2="12"/><line x1="4" y1="20" x2="5.5" y2="18.5"/><line x1="18.5" y1="5.5" x2="20" y2="4"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 4 13C4 7 9 4 20 3c-1 11-4 16-9 17z"/><path d="M4 21c4-6 8-9 13-10"/>',
  compass: '<circle cx="12" cy="12" r="10"/><polygon points="16.2 7.8 14 14 7.8 16.2 10 10 16.2 7.8"/>',
  feather: '<path d="M20.2 3.8a5.5 5.5 0 0 0-7.8 0L3 13.2V21h7.8l9.4-9.4a5.5 5.5 0 0 0 0-7.8z"/><line x1="16" y1="8" x2="2" y2="22"/>',
};
function icoSvg(key) {
  const p = ICON_PATHS[key];
  return p ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>` : "";
}
function companySlug(name) { return (name || "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }

// Custom (user-uploaded) icons are stored in companyIcons as "custom:<id>" and
// rendered via <img src="/api/icon/<id>"> — same safe path as the shipped icons.
function isCustomIcon(v) { return typeof v === "string" && v.startsWith("custom:"); }
function customIconUrl(v) { return "/api/icon/" + encodeURIComponent(v.slice(7)); }
// If a stored icon file is gone (e.g. reaped orphan), degrade to the label text rather than a blank slot.
function coIconFallback(img) {
  const span = document.createElement("span");
  span.className = "co-text";
  span.textContent = img.getAttribute("alt") || "";
  img.replaceWith(span);
}
function customImg(v, alt, cls) {
  return `<img class="co-custom${cls ? " " + cls : ""}" src="${customIconUrl(v)}" alt="${esc(alt || "")}" draggable="false" onerror="coIconFallback(this)" />`;
}
// Inner glyph markup for a small icon slot — built-in (inline svg) or custom (<img>).
function iconInner(v) { return isCustomIcon(v) ? customImg(v) : icoSvg(v); }
const UPLOAD_GLYPH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 9 12 4 17 9"/><line x1="12" y1="4" x2="12" y2="16"/></svg>';

function companyGlyph(slug, label) {
  const chosen = (uiPrefs.companyIcons || {})[label];     // user-chosen icon wins
  if (isCustomIcon(chosen)) return customImg(chosen, label);
  if (chosen && ICON_PATHS[chosen]) return `<span class="co-ico">${icoSvg(chosen)}</span>`;
  return COMPANY_ICONS.has(slug)
    ? `<img src="/icons/icon_company_${slug}.svg" alt="${esc(label)}" draggable="false" />`
    : `<span class="co-text">${esc(label)}</span>`;
}

// Upload an .svg File, returns its server-side id. Validates client-side first for fast feedback.
async function uploadCompanyIcon(file) {
  if (!file) throw new Error("No file chosen.");
  const fname = (file.name || "").toLowerCase();
  if (file.type !== "image/svg+xml" && !fname.endsWith(".svg")) throw new Error("Please choose an .svg file.");
  if (file.size > 64 * 1024) throw new Error("SVG too large (max 64 KB)."); // mirrors server ICON_MAX_BYTES (kiros_web.py)
  const svg = await file.text();
  const res = await fetch("/api/icon", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Kiros-CSRF": cookie("kiros_csrf") },
    body: JSON.stringify({ svg }),
  });
  if (res.status === 401) { location.href = "/login"; throw new Error("auth required"); }
  let data = {};
  try { data = await res.json(); } catch (e) { /* fall through to generic error */ }
  if (!res.ok || !data.ok) throw new Error(data.error || "Upload failed.");
  return data.id;
}

// Shared icon picker: built-in glyphs + an "upload SVG" tile (which also previews a chosen custom icon).
function buildIconPicker(pickEl, current, onPick) {
  pickEl.innerHTML = "";
  Object.keys(ICON_PATHS).forEach((k) => {
    const b = el("button", "onb-ico" + (k === current ? " on" : ""));
    b.type = "button"; b.innerHTML = icoSvg(k); b.title = k;
    b.onclick = () => onPick(k);
    pickEl.appendChild(b);
  });
  const isCustom = isCustomIcon(current);
  const up = el("button", "onb-ico onb-ico-up" + (isCustom ? " on" : ""));
  up.type = "button";
  up.title = isCustom ? "Change custom icon" : "Upload your own SVG";
  up.innerHTML = isCustom ? iconInner(current) : UPLOAD_GLYPH;
  const file = document.createElement("input");
  file.type = "file"; file.accept = ".svg,image/svg+xml"; file.hidden = true;
  up.onclick = () => file.click();
  file.onchange = async () => {
    const f = file.files && file.files[0];
    file.value = "";
    if (!f) return;
    try { onPick("custom:" + await uploadCompanyIcon(f)); }
    catch (e) { toast(e.message || "Upload failed."); }
  };
  up.appendChild(file);
  pickEl.appendChild(up);
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
  const opts = [["", "All statuses"], ...mg.lanes.filter((l) => l !== "delegated").map((l) => [l, laneLabel(l)])];
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
    : n === 1 ? (laneLabel([...mgFilter.lanes][0]))
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
  const link = isWebUrl(t.url) ? ` <a class="t-link" href="${esc(t.url)}" target="_blank" rel="noopener" title="Open source ↗" onclick="event.stopPropagation()">↗</a>` : "";
  const proj = t.group ? `<span class="t-proj">${esc(t.group)}</span><span class="t-sep">|</span>` : "";
  const due = t.due ? `<span class="t-due ${overdue}">${esc(relativeDue(t.due, mg.date))}</span>` : "";
  const status = showStatus ? `<span class="lane lane-${t.lane}">${esc(laneLabel(t.lane))}</span>` : "";
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
  { lane: "active", label: "Next Up", icon: SVG('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>') },
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
  fillSelect($("#ed-front"), frontsForCompany(company).map((f) => [f.code, f.name]), selected, "Select");
}

function openEditor(t, rawText) {
  const f = $("#editor-panel").elements;
  const company = t ? (t.company || "") : "";    // new task → no preselection (shows "Select")
  fillSelect($("#ed-company"), mg.companies.map((c) => [c, c]), company, "Select");
  populateFronts(company, t ? t.front : "");
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
  if (t && isWebUrl(t.url)) { src.hidden = false; src.href = t.url; } else { src.hidden = true; }
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
  }).then((r) => { if (r && r.raw) f.originalRaw.value = r.raw; if (r && r.url !== undefined) f.url.value = r.url; $("#ed-saved").textContent = "saved ✓"; })
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
  autoSave(true).then(() => { $("#editor").hidden = true; refreshAfterEdit(); toast("On it — moved to Next Up."); });
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
  const desc = [f.description.value, isWebUrl(f.url.value) ? f.url.value : ""].filter(Boolean).join("\n\n");
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
  const data = await api("/api/board?todaySort=" + encodeURIComponent(todaySort));
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
  t.classList.remove("toast-action");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}
// Toast carrying a single tap-action (e.g. Undo). Stays a little longer so the action is reachable.
function toastAction(msg, label, fn) {
  const t = $("#toast");
  t.innerHTML = "";
  t.appendChild(el("span", "toast-msg", esc(msg)));
  const btn = el("button", "toast-act", esc(label));
  btn.type = "button";
  btn.onclick = () => {
    t.classList.remove("show", "toast-action");
    clearTimeout(toastTimer);
    try { fn(); } catch (err) { toast("Couldn’t undo: " + err.message); }
  };
  t.appendChild(btn);
  t.classList.add("show", "toast-action");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show", "toast-action"), 5200);
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
    const cur = (uiPrefs.companyIcons || {})[company];
    const hasIco = isCustomIcon(cur) || (cur && !!ICON_PATHS[cur]);
    const head = el("div", "struct-co-head");
    const icoBtn = el("button", "struct-co-ico" + (hasIco ? "" : " empty"));
    icoBtn.type = "button";
    icoBtn.title = "Choose icon";
    icoBtn.innerHTML = hasIco ? iconInner(cur) : "+";
    const picker = el("div", "onb-iconpick struct-iconpick");
    picker.hidden = true;
    buildIconPicker(picker, cur, (val) => {
      const icons = { ...(uiPrefs.companyIcons || {}) };
      icons[company] = val;
      uiPrefs.companyIcons = icons;
      saveUiPrefs({ companyIcons: icons });
      renderStructure();
      refreshCompanyToggles();      // show the new icon in the nav
    });
    icoBtn.onclick = () => { picker.hidden = !picker.hidden; };
    const nameIn = document.createElement("input");
    nameIn.className = "struct-co-name-in";
    nameIn.value = company;
    nameIn.title = "Rename company";
    nameIn.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); nameIn.blur(); } };
    nameIn.onchange = () => { const v = nameIn.value.trim(); if (v && v !== company) renameCompany(company, v); else nameIn.value = company; };
    const coDel = el("button", "struct-co-del", "×");
    coDel.type = "button"; coDel.title = "Remove company";
    coDel.onclick = () => removeCompany(company);
    head.append(icoBtn, nameIn, coDel);
    sec.append(head, picker);
    groups[company].forEach((f) => {
      const row = el("div", "struct-proj");
      const nameIn = document.createElement("input");
      nameIn.className = "struct-pname-in";
      nameIn.value = f.name;
      nameIn.title = "Rename category";
      nameIn.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); nameIn.blur(); } };
      nameIn.onchange = () => {
        const v = nameIn.value.trim();
        if (v && v !== f.name) structurePost("/api/front/update", { code: f.code, name: v }, "Category renamed.");
        else nameIn.value = f.name;
      };
      const impSel = document.createElement("select");
      impSel.className = "struct-imp-sel";
      impSel.title = "Default importance for tasks in this category";
      impSel.innerHTML = [1, 2, 3, 4, 5].map((i) => `<option value="${i}"${i === f.importance ? " selected" : ""}>Importance ${i}</option>`).join("");
      impSel.onchange = () => structurePost("/api/front/update", { code: f.code, importance: impSel.value }, "Importance set.");
      const del = el("button", "struct-del", "×");
      del.title = "Delete category";
      del.onclick = () => deleteProject(f.code, f.name);
      row.append(nameIn, impSel, del);
      sec.appendChild(row);
    });
    const form = document.createElement("form");
    form.className = "struct-addproj";
    const opts = [1, 2, 3, 4, 5].map((i) => `<option value="${i}"${i === 3 ? " selected" : ""}>Importance ${i}</option>`).join("");
    form.innerHTML = `<input name="pname" class="in" type="text" autocomplete="off" placeholder="+ add category" />
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
  refreshCompanyToggles();   // reflect company add/rename/delete in the nav filters
}

function addCompany(name) {
  if (name.trim()) structurePost("/api/company/save", { name }, "Company added.");
}
function addProject(company, name, importance) {
  if (name.trim()) structurePost("/api/project/save", { company, name, importance }, "Category added.");
}
function deleteProject(code, name) {
  if (confirm(`Delete category "${name}"? Its tasks keep their code but lose their category mapping.`)) {
    structurePost("/api/project/delete", { code }, "Category removed.");
  }
}
function renameCompany(oldName, newName) {
  const icons = { ...(uiPrefs.companyIcons || {}) };
  if (icons[oldName]) { icons[newName] = icons[oldName]; delete icons[oldName]; uiPrefs.companyIcons = icons; saveUiPrefs({ companyIcons: icons }); }
  structurePost("/api/company/rename", { old: oldName, new: newName }, "Company renamed.");
}
// Promise-based replacement for window.confirm on irreversible actions: clear
// copy, a red action button, and Cancel focused by default — so a reflexive
// Enter or click can't fire the destructive path. Resolves true only on Remove.
function confirmDanger({ title, message, confirmLabel = "Remove" }) {
  return new Promise((resolve) => {
    const root = $("#confirm");
    const okBtn = $("#confirm-ok");
    const cancelBtn = $("#confirm-cancel");
    const scrim = root.querySelector(".editor-scrim");
    $("#confirm-title").textContent = title;
    $("#confirm-msg").innerHTML = message;            // caller escapes dynamic values via esc()
    okBtn.textContent = confirmLabel;
    let settled = false;
    const close = (val) => {
      if (settled) return;
      settled = true;
      root.hidden = true;
      okBtn.onclick = cancelBtn.onclick = scrim.onclick = null;
      document.removeEventListener("keydown", onKey);
      resolve(val);
    };
    const onKey = (e) => { if (e.key === "Escape") close(false); };
    okBtn.onclick = () => close(true);
    cancelBtn.onclick = () => close(false);
    scrim.onclick = () => close(false);
    document.addEventListener("keydown", onKey);
    root.hidden = false;
    cancelBtn.focus();                                // safe default — not the red button
  });
}

async function removeCompany(name) {
  // Cascading delete (company + all its categories). The styled red-button
  // confirm spells out the consequences; tasks keep their codes, backups recover.
  const projects = (mg.fronts || []).filter((f) => f.surface === name);
  const n = projects.length;
  const cats = n
    ? `<br><br>This also removes ${n} categor${n === 1 ? "y" : "ies"}: <strong>${projects.map((f) => esc(f.name)).join(", ")}</strong>.`
    : "";
  const ok = await confirmDanger({
    title: "Remove company?",
    message: `Remove the company <strong>${esc(name)}</strong> and all of its categories?${cats}`
      + `<br><br>Tasks keep their codes but lose their category mapping. This can't be undone from the app.`,
    confirmLabel: "Remove company",
  });
  if (!ok) return;
  const icons = { ...(uiPrefs.companyIcons || {}) };
  if (icons[name]) { delete icons[name]; uiPrefs.companyIcons = icons; saveUiPrefs({ companyIcons: icons }); }
  structurePost("/api/company/delete", { name }, "Company removed.");
}
function refreshCompanyToggles() {
  buildCompanyToggle("#bd-company", boardFilter, renderBoard);
  buildCompanyToggle("#mx-company", matrixFilter, renderMatrix);
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
  const opts = [["", "All statuses"], ...mg.lanes.filter((l) => l !== "delegated" && l !== "done").map((l) => [l, laneLabel(l)])];
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
    : n === 1 ? (laneLabel([...matrixFilter.lanes][0])) : `${n} statuses`;
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
    const lp = isTouch ? setTimeout(() => { armed = true; card.style.touchAction = "none"; if (navigator.vibrate) navigator.vibrate(12); }, 250) : 0;

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
    // iOS WebKit ignores preventDefault on pointermove (and honours touch-action only as set at
    // gesture start), so it scrolls and fires pointercancel mid-drag — "starts dragging then
    // drops". A non-passive touchmove that preventDefaults once armed is what actually holds it.
    const blockScroll = (ev) => { if (armed) ev.preventDefault(); };
    const end = (ev, bail) => {
      clearTimeout(lp);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("touchmove", blockScroll);
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
      card.style.touchAction = "";   // restore CSS pan-y (it was set to none once the drag armed)
      if (!wasDragging && !bail) openEditor(t);   // it was a tap
    };
    const up = (ev) => end(ev, false);
    const cancel = () => end(e, true);
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("touchmove", blockScroll, { passive: false });
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
const boardFilter = { company: "", sort: localStorage.getItem("kiros.boardSort") || "score", dir: -1, q: "" };
const BOARD_SORT = [["score", "Priority"], ["due", "Deadline"], ["company", "Company"], ["manual", "Custom"]];
const BOARD_LANES = ["parking", "inbox", "active", "today", "done"];  // column order; "done" is the [x] flag (Delegated hidden for now)

// Feather-style icon per sort dimension — the toggle shows the active one (icons only).
const SORT_ICONS = {
  score: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  due: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  company: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
  manual: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
};
// Icon-only sort control: toggle = active dimension's icon + direction; menu = icon + label per option.
function buildSortDD(sel, options, state) {
  const dir = state.dir === -1 ? "↓" : "↑";
  const hasDir = (key) => key !== "manual";   // Custom is file order — no asc/desc
  const menu = $(sel + " .mg-dd-menu");
  menu.innerHTML = options.map(([key, label]) => {
    const on = state.sort === key;
    return `<button type="button" class="mg-dd-opt sort-opt${on ? " on" : ""}" role="option" aria-selected="${on}" data-sort="${key}"><span class="sort-glyph" aria-hidden="true">${SORT_ICONS[key] || ""}</span><span class="sort-opt-label">${label}</span>${on && hasDir(key) ? `<span class="sort-dir">${dir}</span>` : ""}</button>`;
  }).join("");
  const cur = options.find(([k]) => k === state.sort);
  const tog = $(sel + " .mg-dd-toggle");
  const togDir = hasDir(state.sort) ? `<span class="sort-dir" aria-hidden="true">${dir}</span>` : "";
  tog.innerHTML = `<span class="sort-glyph" aria-hidden="true">${SORT_ICONS[state.sort] || ""}</span>${togDir}`;
  tog.title = "Sort: " + (cur ? cur[1] : "Sort") + (hasDir(state.sort) ? " " + dir : "");
}
function setBoardSort(key) {
  if (key === "manual") boardFilter.sort = "manual";       // Custom = file order, no direction
  else if (boardFilter.sort === key) boardFilter.dir *= -1;
  else { boardFilter.sort = key; boardFilter.dir = DEFAULT_DIR[key] || 1; }
  localStorage.setItem("kiros.boardSort", boardFilter.sort);  // remember the arrangement across reloads
  buildSortDD("#bd-sort", BOARD_SORT, boardFilter);
  renderBoard();
}
async function loadBoard() {
  mg = await api("/api/tasks");
  buildCompanyToggle("#bd-company", boardFilter, renderBoard);
  buildSortDD("#bd-sort", BOARD_SORT, boardFilter);
  renderBoard();
}
// --- Completing a board card (hover Done button + swipe-right) ---------------
// Swipe geometry: arm on a clear rightward intent, commit past the threshold.
const SWIPE_ARM_PX = 8;      // horizontal travel before we treat the gesture as a swipe (not scroll/drag)
const SWIPE_DONE_PX = 76;    // travel needed to commit the completion
const SWIPE_MAX_PX = 132;    // how far the card follows the finger
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const prefersReducedMotion = () =>
  !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

// The calm part: collapse the card's slot so neighbours close the gap. Resolves when settled.
function collapseCard(card) {
  return new Promise((resolve) => {
    if (prefersReducedMotion()) { resolve(); return; }
    const h = card.getBoundingClientRect().height;
    card.style.maxHeight = h + "px";
    card.classList.add("b-collapsing");
    void card.offsetHeight;                                   // commit the start height before transitioning
    requestAnimationFrame(() => { card.style.maxHeight = "0px"; card.style.opacity = "0"; });
    let settled = false;
    const finish = () => { if (settled) return; settled = true; resolve(); };
    card.addEventListener("transitionend", (e) => { if (e.propertyName === "max-height") finish(); }, { once: true });
    setTimeout(finish, 520);                                  // never hang if transitionend is missed
  });
}

// Complete a task from the board: animate the card out, hit the API, refresh, offer Undo.
// mode: "button" (check + settle) | "swipe" (flick right toward Done, then settle).
async function completeCard(card, t, mode) {
  if (card.dataset.completing === "1") return;               // guard against swipe + click double-fire
  card.dataset.completing = "1";
  if (navigator.vibrate) navigator.vibrate(18);
  if (!prefersReducedMotion()) {
    if (mode === "swipe") {
      card.classList.add("b-swipe-commit");
      card.style.transform = "translateX(115%)";   // fly right, toward the Done column
      await sleep(150);
    } else {
      await sleep(170);                                       // let the check-pop land before the card leaves
    }
  }
  try {
    await api("/api/complete", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: t.raw, done: true }) });
    await collapseCard(card);
    toastAction("Done. One less open loop.", "Undo", () => undoComplete(t));
    loadBoard();
    load();                                                   // Today mirrors the board's Today column
  } catch (err) {
    card.dataset.completing = "";
    card.classList.remove("b-swipe-commit");
    card.style.transform = "";
    toast("Couldn’t complete: " + err.message);
    loadBoard();
  }
}

// Reverse a just-completed task. Backend un-done returns it to "Next Up" (active lane).
async function undoComplete(t) {
  try {
    const doneRaw = t.raw.replace("[ ]", "[x]").replace("[X]", "[x]");
    await api("/api/complete", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: doneRaw, done: false }) });
    toast("Brought back.");
    loadBoard();
    load();
  } catch (err) {
    toast("Undo failed: " + err.message);
    loadBoard();
  }
}

function boardCard(t) {
  const card = el("div", "b-card");
  card.innerHTML = cardBody(t, false);   // status hidden on the board — the column IS the status
  if (!t.done) addDoneButton(card, t);   // hover-reveal complete affordance (desktop); swipe covers touch
  makeCardDraggable(card, t);
  return card;
}

// A circular "mark done" control, revealed on card hover. Click → check + settle into Done.
function addDoneButton(card, t) {
  card.classList.add("has-done");
  const btn = el("button", "b-done-btn");
  btn.type = "button";
  btn.title = "Mark done";
  btn.setAttribute("aria-label", "Mark done");
  btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.4L19 7"/></svg>`;
  btn.addEventListener("pointerdown", (e) => e.stopPropagation());   // don't start a card drag / tap-to-edit
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    btn.classList.add("checked");
    completeCard(card, t, "button");
  });
  card.appendChild(btn);
}

// Move a task to another status by drag-drop. "done" column → complete (logs Stats);
// any lane → rebuild the task in that lane (clears assignee unless target is Delegated; un-dones if it was done).
// insertIdx (Custom sort only) drops the moved card into that exact slot of the target column.
async function moveTask(t, targetLane, insertIdx) {
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
      const res = await api("/api/task/save", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields, lane: targetLane, originalRaw: t.raw, moved: true }) });
      if (insertIdx != null) {   // place it where it was dropped (server may reformat → use the returned raw)
        const order = laneRaws(targetLane);   // target's tasks (the moved card isn't here yet)
        order.splice(insertIdx, 0, (res && res.raw) || t.raw);
        await api("/api/reorder", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lane: targetLane, order }) });
      }
    }
    toast("Moved to " + laneLabel(targetLane) + ".");
    loadBoard();
    load();
  } catch (err) {
    toast("Move failed: " + err.message);
  }
}

// Persist a within-column reorder (Custom sort). `order` = the lane's task raws, new order.
async function reorderLane(lane, order) {
  try {
    await api("/api/reorder", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lane, order }) });
    loadBoard();
    load();   // Today mirrors the Board's Today column — keep it fresh
  } catch (err) {
    toast("Reorder failed: " + err.message);
  }
}

// A lane's task raws in current (file) order — the order cards render in under Custom sort.
function laneRaws(lane) {
  return mg.tasks.filter((x) => (lane === "done" ? x.done : x.lane === lane && !x.done)).map((x) => x.raw);
}
// Insertion index for a drop at vertical position y, among a column's cards (excluding the dragged one).
function dropIndexIn(col, y) {
  const cards = [...col.querySelectorAll(".b-card:not(.b-dragging)")];
  for (let i = 0; i < cards.length; i++) {
    const r = cards[i].getBoundingClientRect();
    if (y < r.top + r.height / 2) return i;
  }
  return cards.length;
}
// A thin accent line showing where the card will land (Custom sort drag).
let dropLine = null;
function hideDropLine() { if (dropLine) { dropLine.remove(); dropLine = null; } }
function showDropLine(col, y) {
  hideDropLine();   // remove first so card measurements below are line-free
  const body = col.querySelector(".board-col-body");
  if (!body) return;
  const cards = [...body.querySelectorAll(".b-card:not(.b-dragging)")];
  let ref = null;
  for (const c of cards) { const r = c.getBoundingClientRect(); if (y < r.top + r.height / 2) { ref = c; break; } }
  dropLine = el("div", "b-drop-line");
  body.insertBefore(dropLine, ref);   // ref null → appended at the end
}

// Pointer-based drag for a board card: mouse drags on move; touch needs a long-press
// (so a quick swipe still scrolls the board). A tap (no drag) opens the editor.
function makeCardDraggable(card, t) {
  card.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const isTouch = e.pointerType === "touch";
    const id = e.pointerId, sx = e.clientX, sy = e.clientY;
    let dragging = false, armed = !isTouch, ghost = null;
    let swiping = false, swiped = false;            // swipe-right-to-complete (touch, non-Done cards only)
    const canSwipe = isTouch && !t.done;
    const lp = isTouch ? setTimeout(() => { armed = true; card.style.touchAction = "none"; if (navigator.vibrate) navigator.vibrate(12); }, 250) : 0;
    const swipeTo = (dx) => {
      const d = Math.min(SWIPE_MAX_PX, Math.max(0, dx));
      card.style.transform = "translateX(" + d + "px)";
      const p = Math.min(1, d / SWIPE_DONE_PX);
      card.style.setProperty("--swipe-p", p.toFixed(3));
      const ready = d >= SWIPE_DONE_PX;
      if (ready !== swiped && navigator.vibrate) navigator.vibrate(ready ? 14 : 6);   // tick crossing the line
      swiped = ready;
      card.classList.toggle("b-swipe-ready", ready);
    };

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
      // Custom sort: show where the card will slot in within the hovered column.
      const source = t.done ? "done" : t.lane;
      if (boardFilter.sort === "manual" && col && col.dataset.lane !== "done" && source !== "done")
        showDropLine(col, ev.clientY);
      else hideDropLine();
    };
    const move = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      // Swipe-right to complete (toward the Done column): a clear rightward flick, before the long-press arms.
      if (canSwipe && !dragging && !armed && !swiping &&
          dx > SWIPE_ARM_PX && Math.abs(dx) > Math.abs(dy) * 1.3) {
        swiping = true;
        clearTimeout(lp);                 // this gesture is a swipe, never a drag
        card.style.touchAction = "none";
        card.classList.add("b-swiping");
      }
      if (swiping) { ev.preventDefault(); swipeTo(dx); return; }
      const far = Math.hypot(dx, dy) > 6;
      if (!dragging) {
        if (!armed) {
          const swipeIntent = canSwipe && dx > 0 && Math.abs(dx) > Math.abs(dy);   // may still become a swipe
          if (far && !swipeIntent) end(ev, true);   // pre-long-press move on touch = scroll → bail
          return;
        }
        if (!far && !isTouch) return;
        begin(ev);
      }
      ev.preventDefault();
      paint(ev);
    };
    // iOS WebKit ignores preventDefault on pointermove (and honours touch-action only as set at
    // gesture start), so it scrolls and fires pointercancel mid-drag — "starts dragging then
    // drops". A non-passive touchmove that preventDefaults once armed (or swiping) is what holds it.
    const blockScroll = (ev) => { if (armed || swiping) ev.preventDefault(); };
    const end = (ev, bail) => {
      clearTimeout(lp);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("touchmove", blockScroll);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancel);
      if (swiping) {
        card.classList.remove("b-swiping", "b-swipe-ready");
        try { card.releasePointerCapture(id); } catch (_) {}
        if (!bail && swiped) {
          completeCard(card, t, "swipe");                 // commit → flick out + collapse + complete
        } else {
          card.classList.add("b-swipe-snap");             // under threshold → spring back
          card.style.transform = "";
          card.style.removeProperty("--swipe-p");
          const reset = () => { card.classList.remove("b-swipe-snap"); card.style.touchAction = ""; };
          card.addEventListener("transitionend", reset, { once: true });
          setTimeout(reset, 320);
        }
        return;
      }
      const wasDragging = dragging;
      if (dragging && !bail) {
        const col = colAt(ev.clientX, ev.clientY);
        const target = col && col.dataset.lane;
        const source = t.done ? "done" : t.lane;
        const manual = boardFilter.sort === "manual";
        if (target && manual && target !== "done" && source !== "done") {
          const idx = dropIndexIn(col, ev.clientY);
          if (target === source) {                 // reorder within the column
            const order = laneRaws(target).filter((r) => r !== t.raw);
            order.splice(idx, 0, t.raw);
            reorderLane(target, order);
          } else {                                  // move lanes, landing at the dropped slot
            moveTask(t, target, idx);
          }
        } else if (target && target !== source) {
          moveTask(t, target);
        }
      }
      hideDropLine();
      if (ghost) ghost.remove();
      card.classList.remove("b-dragging");
      document.querySelectorAll(".board-col").forEach((c) => c.classList.remove("drop-on"));
      try { card.releasePointerCapture(id); } catch (_) {}
      card.style.touchAction = "";   // restore CSS pan-y (it was set to none once the drag armed)
      if (!wasDragging && !bail) openEditor(t);   // it was a tap
    };
    const up = (ev) => end(ev, false);
    const cancel = () => end(e, true);
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("touchmove", blockScroll, { passive: false });
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", cancel);
  });
}
function startLaneRename(span, lane) {
  const wrap = el("div", "lane-rename");
  const input = el("input", "lane-rename-in");
  input.value = laneLabel(lane);
  const save = el("button", "lane-rename-save", "✓");
  save.title = "Save name";
  let done = false;
  const onDoc = (e) => { if (!wrap.contains(e.target)) finish(false); };   // click away → cancel
  const finish = (saveIt) => {
    if (done) return;
    done = true;
    document.removeEventListener("mousedown", onDoc, true);
    if (saveIt) {
      const v = input.value.trim();
      const labels = { ...(uiPrefs.laneLabels || {}) };
      if (v && v !== (LANE_LABEL[lane] || lane)) labels[lane] = v; else delete labels[lane];   // back-to-default clears
      uiPrefs.laneLabels = labels;
      saveUiPrefs({ laneLabels: labels });
    }
    renderBoard();   // re-render with the saved name, or revert on cancel
  };
  save.onclick = (e) => { e.stopPropagation(); finish(true); };
  input.onkeydown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); finish(true); }
    else if (e.key === "Escape") { e.preventDefault(); finish(false); }
  };
  wrap.append(input, save);
  span.replaceWith(wrap);
  input.focus(); input.select();
  setTimeout(() => document.addEventListener("mousedown", onDoc, true), 0);
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
  const manual = boardFilter.sort === "manual";   // Custom: keep KIROS.md file order (the arranged order)
  const cmp = (a, b) => {
    const va = sortValue(a, boardFilter.sort), vb = sortValue(b, boardFilter.sort);
    return (va < vb ? -1 : va > vb ? 1 : 0) * boardFilter.dir;
  };
  edRows = [];   // editor ◂ ▸ steps through the board in column order
  BOARD_LANES.forEach((lane) => {
    const col = el("div", "board-col");
    col.dataset.lane = lane;
    const items = lane === "done"
      ? tasks.filter((t) => t.done)
      : tasks.filter((t) => t.lane === lane && !t.done);
    if (!manual) items.sort(cmp);
    const head = el("div", "board-head");
    const labelSpan = el("span", `lane lane-${lane}`, esc(laneLabel(lane)));
    labelSpan.title = "Click to rename";
    labelSpan.onclick = () => startLaneRename(labelSpan, lane);
    head.append(labelSpan, el("span", "board-count", String(items.length)));
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

// Today: Priority ⇄ Custom. Custom shows the Today list in the order arranged on the Board.
document.querySelectorAll("#today-sort .seg-btn").forEach((b) => {
  b.classList.toggle("is-active", b.dataset.tsort === todaySort);
  b.onclick = () => {
    todaySort = b.dataset.tsort;
    localStorage.setItem("kiros.todaySort", todaySort);
    document.querySelectorAll("#today-sort .seg-btn").forEach((x) => x.classList.toggle("is-active", x === b));
    load().catch((e) => toast("Today failed: " + e.message));
  };
});

$("#account-structure").onclick = openStructure;
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

// --- Appearance: theme / accent / background image -------------------------
const ACCENTS = ["#D97757", "#E0A458", "#8AAE7F", "#6C8EBF", "#9B7EBD", "#C97B91"];
let uiPrefs = { theme: "system", accent: "", bgColor: "", bgImage: null, bgOpacity: 0.2, companyIcons: {}, laneLabels: {} };

function resolveTheme(pref) {
  return pref === "system"
    ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : pref;
}
function applyTheme(pref) {
  document.documentElement.dataset.theme = resolveTheme(pref);
  try { localStorage.setItem("kiros-theme", pref); } catch (e) {}
}
function applyAccent(color) {
  const root = document.documentElement.style;
  if (color) root.setProperty("--accent", color); else root.removeProperty("--accent");
  try { color ? localStorage.setItem("kiros-accent", color) : localStorage.removeItem("kiros-accent"); } catch (e) {}
}
function applyBg(image, opacity) {
  const layer = $("#bg-layer");
  if (!layer) return;
  if (image) {
    layer.style.backgroundImage = `url(/api/bg?t=${Date.now()})`;
    layer.style.opacity = String(opacity != null ? opacity : 0.2);
  } else {
    layer.style.backgroundImage = "";
    layer.style.opacity = "0";
  }
}
function saveUiPrefs(patch) {
  uiPrefs = { ...uiPrefs, ...patch };
  return api("/api/prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).catch(() => {});
}
function isAppearanceCustomized() {
  const customAccent = uiPrefs.accent && uiPrefs.accent.toLowerCase() !== ACCENTS[0].toLowerCase();
  return !!(customAccent || uiPrefs.bgColor || uiPrefs.bgImage);
}
function syncAppearanceUI() {
  const activePref = isAppearanceCustomized() ? "custom" : (uiPrefs.theme || "system");
  document.querySelectorAll("#theme-seg button").forEach((b) =>
    b.classList.toggle("on", b.dataset.themePref === activePref));
  document.querySelectorAll("#accent-swatches .swatch[data-color]").forEach((s) =>
    s.classList.toggle("on", s.dataset.color === (uiPrefs.accent || ACCENTS[0])));
  document.querySelectorAll("#bgcolor-swatches .swatch[data-bgcolor]").forEach((s) =>
    s.classList.toggle("on", s.dataset.bgcolor === uiPrefs.bgColor));
  const op = $("#bg-opacity");
  if (op) op.value = String(Math.round((uiPrefs.bgOpacity != null ? uiPrefs.bgOpacity : 0.2) * 100));
  const clear = $("#bg-clear-btn"); if (clear) clear.hidden = !uiPrefs.bgImage;
  const row = $("#bg-opacity-row"); if (row) row.hidden = !uiPrefs.bgImage;
  const reset = $("#appearance-reset"); if (reset) reset.hidden = !isAppearanceCustomized();
}
function buildSwatches() {
  const wrap = $("#accent-swatches");
  if (!wrap || wrap.childElementCount) return;
  ACCENTS.forEach((c) => {
    const b = el("button", "swatch");
    b.type = "button"; b.dataset.color = c; b.style.background = c; b.title = c;
    b.onclick = () => { applyAccent(c); saveUiPrefs({ accent: c }); syncAppearanceUI(); };
    wrap.appendChild(b);
  });
  const custom = el("button", "swatch swatch-custom");
  custom.type = "button"; custom.title = "Custom color";
  const inp = el("input"); inp.type = "color"; inp.value = uiPrefs.accent || ACCENTS[0];
  inp.oninput = () => applyAccent(inp.value);
  inp.onchange = () => { saveUiPrefs({ accent: inp.value }); syncAppearanceUI(); };
  custom.appendChild(inp); wrap.appendChild(custom);
}

// Background color → derive a cohesive, readable palette from one color.
const BG_COLORS = ["#1A1815", "#14161B", "#211A15", "#1C1620", "#F6F3EC", "#ECE7DC", "#E9EEF2"];
const BGVARS = ["--bg", "--glow", "--surface", "--surface-2", "--text", "--muted", "--border", "--logo-filter"];
function hexToRgb(hex) {
  hex = String(hex || "").replace("#", "");
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  const n = parseInt(hex || "0", 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function relLum([r, g, b]) { return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; }
function mixHex(hex, target, t) {
  const a = hexToRgb(hex), b = hexToRgb(target);
  return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
function bgColorVars(color) {
  const light = relLum(hexToRgb(color)) > 0.55;   // light bg → dark text, and vice versa
  return {
    "--bg": color,
    "--glow": mixHex(color, "#ffffff", 0.04),
    "--surface": mixHex(color, "#ffffff", light ? 0.5 : 0.06),
    "--surface-2": mixHex(color, light ? "#000000" : "#ffffff", light ? 0.05 : 0.13),
    "--text": light ? "#1c1a17" : "#ECEAE3",
    "--muted": light ? "rgba(28,26,23,0.62)" : "rgba(236,234,227,0.6)",
    "--border": light ? "rgba(28,26,23,0.13)" : "rgba(236,234,227,0.1)",
    "--logo-filter": light ? "brightness(0) opacity(0.7)" : "none",
  };
}
function applyBgColor(color) {
  const root = document.documentElement.style;
  if (!color) {
    BGVARS.forEach((p) => root.removeProperty(p));
    try { localStorage.removeItem("kiros-bgcolor"); localStorage.removeItem("kiros-bgvars"); } catch (e) {}
  } else {
    const vars = bgColorVars(color);
    Object.keys(vars).forEach((k) => root.setProperty(k, vars[k]));
    try { localStorage.setItem("kiros-bgcolor", color); localStorage.setItem("kiros-bgvars", JSON.stringify(vars)); } catch (e) {}
  }
}
function buildBgColorSwatches() {
  const wrap = $("#bgcolor-swatches");
  if (!wrap || wrap.childElementCount) return;
  BG_COLORS.forEach((c) => {
    const b = el("button", "swatch");
    b.type = "button"; b.dataset.bgcolor = c; b.style.background = c; b.title = c;
    b.onclick = () => { applyBgColor(c); saveUiPrefs({ bgColor: c }); syncAppearanceUI(); };
    wrap.appendChild(b);
  });
  const custom = el("button", "swatch swatch-custom");
  custom.type = "button"; custom.title = "Custom background color";
  const inp = el("input"); inp.type = "color"; inp.value = uiPrefs.bgColor || BG_COLORS[0];
  inp.oninput = () => applyBgColor(inp.value);
  inp.onchange = () => { applyBgColor(inp.value); saveUiPrefs({ bgColor: inp.value }); syncAppearanceUI(); };
  custom.appendChild(inp); wrap.appendChild(custom);
}
function resizeImage(file, maxDim, cb) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(url);
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    const canvas = el("canvas"); canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    cb(canvas.toDataURL("image/jpeg", 0.82));
  };
  img.onerror = () => { URL.revokeObjectURL(url); cb(null); };
  img.src = url;
}
function applyUiPrefs(p) {
  uiPrefs = { ...uiPrefs, ...(p || {}) };
  applyTheme(uiPrefs.theme || "system");
  applyAccent(uiPrefs.accent || "");
  applyBgColor(uiPrefs.bgColor || "");
  applyBg(uiPrefs.bgImage, uiPrefs.bgOpacity);
  syncAppearanceUI();
}
// Profile (name / password / deactivate). Raw fetch so we can surface the server's error text.
async function profPost(path, data) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Kiros-CSRF": cookie("kiros_csrf") },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok && !body.error, body };
}
function initProfile() {
  const setMsg = (id, text, ok) => { const m = $(id); if (m) { m.textContent = text; m.classList.toggle("ok", !!ok); } };
  const openBtn = $("#account-profile");
  if (openBtn) openBtn.onclick = () => {
    ["#prof-name-msg", "#prof-pw-msg", "#prof-deact-msg"].forEach((i) => setMsg(i, "", false));
    api("/api/me").then((me) => {
      if ($("#prof-name")) $("#prof-name").value = me.name || "";
      if ($("#prof-email")) $("#prof-email").value = me.email || "";
    }).catch(() => {});
    $("#profile").hidden = false;
  };
  document.querySelectorAll("#profile [data-pclose]").forEach((b) => b.onclick = () => { $("#profile").hidden = true; });

  const nameSave = $("#prof-name-save");
  if (nameSave) nameSave.onclick = async () => {
    const r = await profPost("/api/profile/name", { name: $("#prof-name").value });
    setMsg("#prof-name-msg", r.ok ? "Saved." : (r.body.error || "Could not save."), r.ok);
  };
  const pwSave = $("#prof-pw-save");
  if (pwSave) pwSave.onclick = async () => {
    const r = await profPost("/api/profile/password", {
      currentPassword: $("#prof-pw-cur").value, newPassword: $("#prof-pw-new").value });
    if (r.ok) { $("#prof-pw-cur").value = ""; $("#prof-pw-new").value = ""; }
    setMsg("#prof-pw-msg", r.ok ? "Password updated." : (r.body.error || "Could not update."), r.ok);
  };
  const deactBtn = $("#prof-deact-btn");
  if (deactBtn) deactBtn.onclick = () => { $("#prof-deact-confirm").hidden = false; deactBtn.hidden = true; };
  const deactGo = $("#prof-deact-go");
  if (deactGo) deactGo.onclick = async () => {
    const r = await profPost("/api/profile/deactivate", { password: $("#prof-deact-pw").value });
    if (r.ok) location.href = r.body.redirect || "/login";
    else setMsg("#prof-deact-msg", r.body.error || "Could not deactivate.", false);
  };
}

// --- Onboarding (first run) -------------------------------------------------
let onbStep = 0;
let onbCompanies = [];          // [{ name, icon }] contexts added during onboarding
let onbSections = [];           // [{ name, company }] first sections added during onboarding
let onbDraftIcon = null;        // icon chosen for the in-progress context row (null → show "+")
const ONB_STEPS = ["welcome", "companies", "sections", "appearance", "learn"];

function showOnboarding() {
  const m = $("#onboarding");
  if (!m) return;
  onbStep = 0; onbCompanies = []; onbSections = []; onbDraftIcon = null;
  m.hidden = false;
  renderOnbStep();
}
async function finishOnboarding() {
  // Create contexts then sections (a section needs its company to exist first), then store icons.
  // Everything is collected locally until here so rows stay freely editable during onboarding.
  for (const c of onbCompanies) {
    await api("/api/company/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: c.name }) }).catch(() => {});
  }
  for (const s of onbSections) {
    await api("/api/project/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company: s.company, name: s.name, importance: 3 }) }).catch(() => {});
  }
  const icons = { ...(uiPrefs.companyIcons || {}) };
  onbCompanies.forEach((c) => { icons[c.name] = c.icon; });
  uiPrefs.companyIcons = icons;
  // Full reload so the board + company filter rebuild with the new contexts, sections, and icons.
  await saveUiPrefs({ onboarded: true, companyIcons: icons });
  location.reload();
}
function onbNext() {
  if (onbStep >= ONB_STEPS.length - 1) { finishOnboarding(); return; }
  onbStep++; renderOnbStep();
}
function renderOnbStep() {
  const dots = $("#onb-steps");
  if (dots) dots.innerHTML = ONB_STEPS.map((_, i) => `<i class="${i === onbStep ? "on" : ""}"></i>`).join("");
  const next = $("#onb-next"); if (next) next.textContent = onbStep === ONB_STEPS.length - 1 ? "Get started" : "Next";
  const skip = $("#onb-skip"); if (skip) skip.style.visibility = onbStep === ONB_STEPS.length - 1 ? "hidden" : "visible";
  const body = $("#onb-body");
  if (body) { body.innerHTML = ""; body.appendChild(ONB_RENDER[ONB_STEPS[onbStep]]()); }
}
// --- Onboarding row builders (contexts + sections) -------------------------
function renderCompanyRows(box) {
  box.innerHTML = "";
  onbCompanies.forEach((c) => box.appendChild(companyRow(c, box)));
  box.appendChild(companyDraftRow(box));
}
function companyRow(c, box) {
  const row = el("div", "onb-row");
  const ico = el("button", "onb-row-ico"); ico.type = "button"; ico.title = "Change icon";
  ico.innerHTML = iconInner(c.icon);
  const pick = el("div", "onb-iconpick onb-row-pick"); pick.hidden = true;
  buildIconPicker(pick, c.icon, (val) => { c.icon = val; ico.innerHTML = iconInner(val); pick.hidden = true; });
  ico.onclick = () => { pick.hidden = !pick.hidden; };
  const inp = el("input", "onb-row-in"); inp.value = c.name; inp.title = "Rename";
  inp.onchange = () => {
    const v = inp.value.trim();
    if (v && v !== c.name) { onbSections.forEach((s) => { if (s.company === c.name) s.company = v; }); c.name = v; }
    else inp.value = c.name;
  };
  const del = el("button", "onb-row-del", "✕"); del.type = "button"; del.title = "Remove";
  del.onclick = () => { onbCompanies = onbCompanies.filter((x) => x !== c); onbSections = onbSections.filter((s) => s.company !== c.name); renderCompanyRows(box); };
  row.append(ico, inp, del, pick);
  return row;
}
function companyDraftRow(box) {
  const row = el("div", "onb-row");
  const ico = el("button", "onb-row-ico" + (onbDraftIcon ? "" : " empty")); ico.type = "button"; ico.title = "Pick an icon";
  ico.innerHTML = onbDraftIcon ? iconInner(onbDraftIcon) : "+";
  const pick = el("div", "onb-iconpick onb-row-pick"); pick.hidden = true;
  buildIconPicker(pick, onbDraftIcon, (val) => { onbDraftIcon = val; ico.innerHTML = iconInner(val); ico.classList.remove("empty"); pick.hidden = true; });
  ico.onclick = () => { pick.hidden = !pick.hidden; };
  const inp = el("input", "onb-row-in"); inp.placeholder = "Add Companies or Context";
  const add = el("button", "primary onb-row-add", "Add"); add.type = "button";
  const commit = () => {
    const name = inp.value.trim();
    if (!name || onbCompanies.some((c) => c.name.toLowerCase() === name.toLowerCase())) { inp.focus(); return; }
    onbCompanies.push({ name, icon: onbDraftIcon || "briefcase" });
    onbDraftIcon = null;
    renderCompanyRows(box);
    const next = box.querySelector(".onb-row:last-child .onb-row-in"); if (next) next.focus();
  };
  add.onclick = commit;
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } });
  row.append(ico, inp, add, pick);
  return row;
}
function renderSectionRows(box) {
  box.innerHTML = "";
  if (!onbCompanies.length) {
    box.appendChild(el("p", "onb-empty", "Add a context on the previous step first — sections live inside one."));
    return;
  }
  onbSections.forEach((s) => box.appendChild(sectionRow(s, box)));
  box.appendChild(sectionDraftRow(box));
}
function sectionRow(s, box) {
  const row = el("div", "onb-row");
  if (onbCompanies.length > 1) row.appendChild(el("span", "onb-row-tag", esc(s.company)));
  const inp = el("input", "onb-row-in"); inp.value = s.name; inp.title = "Rename";
  inp.onchange = () => { const v = inp.value.trim(); if (v) s.name = v; else inp.value = s.name; };
  const del = el("button", "onb-row-del", "✕"); del.type = "button"; del.title = "Remove";
  del.onclick = () => { onbSections = onbSections.filter((x) => x !== s); renderSectionRows(box); };
  row.append(inp, del);
  return row;
}
function sectionDraftRow(box) {
  const row = el("div", "onb-row");
  let sel = null;
  if (onbCompanies.length > 1) {
    sel = el("select", "onb-row-sel");
    sel.innerHTML = onbCompanies.map((c) => `<option>${esc(c.name)}</option>`).join("");
    row.appendChild(sel);
  }
  const inp = el("input", "onb-row-in"); inp.placeholder = "Add Category";
  const add = el("button", "primary onb-row-add", "Add"); add.type = "button";
  const commit = () => {
    const name = inp.value.trim();
    const company = sel ? sel.value : onbCompanies[0].name;
    if (!name || onbSections.some((s) => s.company === company && s.name.toLowerCase() === name.toLowerCase())) { inp.focus(); return; }
    onbSections.push({ name, company });
    renderSectionRows(box);
    const next = box.querySelector(".onb-row:last-child .onb-row-in"); if (next) next.focus();
  };
  add.onclick = commit;
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } });
  row.append(inp, add);
  return row;
}

const ONB_RENDER = {
  welcome() {
    return el("div", "onb-step",
      `<img class="onb-logo" src="/logo-wt.svg" alt="" />
       <h1>Welcome to Kiros</h1>
       <p class="onb-lead">A calm filter for the few things that matter — not another endless list. Let's set yours up in under a minute.</p>`);
  },
  companies() {
    const wrap = el("div", "onb-step");
    wrap.innerHTML =
      `<h1>Your contexts</h1>
       <p class="onb-lead">Add the areas of your life or work, and pick an icon for each.</p>
       <div class="onb-rows" id="onb-corows"></div>`;
    renderCompanyRows(wrap.querySelector("#onb-corows"));
    return wrap;
  },
  sections() {
    const wrap = el("div", "onb-step");
    wrap.innerHTML =
      `<h1>Your categories</h1>
       <p class="onb-lead">This is for categorizing — like Sales, Design, or Personal.</p>
       <div class="onb-rows" id="onb-secrows"></div>`;
    renderSectionRows(wrap.querySelector("#onb-secrows"));
    return wrap;
  },
  appearance() {
    const wrap = el("div", "onb-step");
    wrap.innerHTML =
      `<h1>Make it yours</h1>
       <p class="onb-lead">Pick a theme and accent — change them anytime under Appearance.</p>
       <div class="appear-seg onb-themeseg">
         <button type="button" data-t="system">System</button>
         <button type="button" data-t="light">Light</button>
         <button type="button" data-t="dark">Dark</button>
       </div>
       <div class="swatches onb-accents"></div>`;
    const seg = wrap.querySelector(".onb-themeseg");
    const syncSeg = () => seg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.t === (uiPrefs.theme || "system")));
    seg.querySelectorAll("button").forEach((b) => b.onclick = () => { applyTheme(b.dataset.t); saveUiPrefs({ theme: b.dataset.t }); syncSeg(); });
    syncSeg();
    const accents = wrap.querySelector(".onb-accents");
    ACCENTS.forEach((c) => {
      const b = el("button", "swatch" + ((uiPrefs.accent || ACCENTS[0]) === c ? " on" : ""));
      b.type = "button"; b.style.background = c;
      b.onclick = () => { applyAccent(c); saveUiPrefs({ accent: c }); accents.querySelectorAll(".swatch").forEach((x) => x.classList.remove("on")); b.classList.add("on"); };
      accents.appendChild(b);
    });
    return wrap;
  },
  learn() {
    return el("div", "onb-step",
      `<h1>How priority works</h1>
       <p class="onb-lead">Kiros ranks for you from three levers — spread the numbers, or nothing ranks.</p>
       <div class="onb-levers">
         <div><b>Importance</b><span>1–5 · does this move something that matters?</span></div>
         <div><b>Urgency</b><span>1–5 · the clock &amp; other people — not your stress.</span></div>
         <div><b>Effort</b><span>30m–8h · the size of the next action. Small + important floats up.</span></div>
       </div>
       <p class="onb-formula">Score = (Imp×2 + Urg×1.5 + deadline) ÷ Effort</p>`);
  },
};
function initOnboarding() {
  const next = $("#onb-next"); if (next) next.onclick = onbNext;
  const skip = $("#onb-skip"); if (skip) skip.onclick = finishOnboarding;
}

function initAppearance() {
  buildSwatches();
  buildBgColorSwatches();
  const reset = $("#appearance-reset");
  if (reset) reset.onclick = () => {
    applyAccent(""); applyBgColor("");
    uiPrefs.bgImage = null; applyBg(null, 0);
    api("/api/bg", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clear: true }) }).catch(() => {});
    saveUiPrefs({ accent: "", bgColor: "" });
    syncAppearanceUI();
  };
  document.querySelectorAll("#theme-seg button").forEach((b) =>
    b.onclick = () => {
      const pref = b.dataset.themePref;
      if (pref === "custom") return;                            // "Custom" reflects state; it isn't a setting
      applyTheme(pref);
      const patch = { theme: pref };
      if (uiPrefs.bgColor) { applyBgColor(""); patch.bgColor = ""; }   // reveal the preset theme
      saveUiPrefs(patch);
      syncAppearanceUI();
    });
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if ((uiPrefs.theme || "system") === "system") applyTheme("system");
  });
  const open = $("#account-appearance");
  if (open) open.onclick = () => { $("#appearance").hidden = false; };   // let the click bubble so the menu closes
  document.querySelectorAll("#appearance [data-aclose]").forEach((b) =>
    b.onclick = () => { $("#appearance").hidden = true; });
  const up = $("#bg-upload-btn"), file = $("#bg-file"), clear = $("#bg-clear-btn"), op = $("#bg-opacity");
  if (up && file) up.onclick = () => file.click();
  if (file) file.onchange = (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    resizeImage(f, 1600, (dataUrl) => {
      if (!dataUrl) return toast("Could not read that image.");
      api("/api/bg", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl }) })
        .then((r) => { if (r && r.image) { uiPrefs.bgImage = r.image; applyBg(r.image, uiPrefs.bgOpacity); syncAppearanceUI(); } })
        .catch(() => toast("Upload failed."));
    });
  };
  if (clear) clear.onclick = () => {
    api("/api/bg", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clear: true }) }).catch(() => {});
    uiPrefs.bgImage = null; applyBg(null, 0); syncAppearanceUI();
  };
  if (op) {
    op.oninput = (e) => { uiPrefs.bgOpacity = Number(e.target.value) / 100; applyBg(uiPrefs.bgImage, uiPrefs.bgOpacity); };
    op.onchange = (e) => saveUiPrefs({ bgOpacity: Number(e.target.value) / 100 });
  }
  api("/api/prefs").then((p) => { applyUiPrefs(p); if (!uiPrefs.onboarded) showOnboarding(); }).catch(() => {});
}

// Account menu + per-user calendar feed (needs this user's private ics token).
async function initAccount() {
  let me;
  try { me = await api("/api/me"); } catch (e) { return; }
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
initAppearance();
initProfile();
initOnboarding();

load().catch((err) => toast("Could not reach Kiros: " + err.message));
loadManage().catch((err) => toast("Manage failed: " + err.message));  // populates mg (for the FAB/editor on any view)
switchView(viewFromHash());  // open the screen named in the URL hash (defaults to Board)
