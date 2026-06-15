#!/usr/bin/env python3
"""Kiros web — a thin, calm UI over the same engine.

It imports kiros.py and serves a single-page app. ALL prioritization logic lives in
kiros.py; this file only reads the board, serializes it to JSON, and applies the two
write actions (capture, complete). Do not fork scoring logic here.

No dependencies, no build step:
    python3 kiros_web.py        # serves on http://localhost:8765 and opens your browser
"""
from __future__ import annotations

import base64
import dataclasses
import hashlib
import hmac
import json
import os
import sys
import threading
import webbrowser
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import kiros

ROOT = Path(__file__).parent


def _load_dotenv(path: Path) -> None:
    """Load KEY=VALUE pairs from a .env file into os.environ — no deps, no override.

    Existing environment variables always win, so shell exports and Docker's
    env_file still take precedence. A missing file is fine; blank lines, comments
    (# ...), and lines without '=' are skipped. Surrounding quotes are stripped.
    """
    try:
        raw_lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    for raw in raw_lines:
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in ("'", '"'):
            val = val[1:-1]
        if key:
            os.environ.setdefault(key, val)


_load_dotenv(ROOT / ".env")   # auto-pick-up KIROS_AUTH_* etc. from a local .env

DATA = Path(os.environ.get("KIROS_DATA", str(ROOT)))   # board + sidecars (mount a volume here in Docker)
BOARD = os.environ.get("KIROS_BOARD") or str(DATA / "KIROS.md")
DESC_FILE = DATA / "descriptions.json"   # rich imported notes, keyed by source url
DONE_FILE = DATA / "completions.jsonl"   # append-only completion history for stats
WEB_DIR = ROOT / "web"
HOST = os.environ.get("KIROS_HOST", "127.0.0.1")  # 0.0.0.0 inside Docker
PORT = int(os.environ.get("KIROS_PORT", "8765"))
TODAY_DEFAULT_N = 3
TODAY_SCREEN_N = 5   # Today screen shows the top N tasks from the Today status

# Optional HTTP Basic Auth — set BOTH to require a login. Mandatory for any public deploy.
AUTH_USER = os.environ.get("KIROS_AUTH_USER", "")
AUTH_PASS = os.environ.get("KIROS_AUTH_PASS", "")

# Minimal valid board written on first run if the data volume is empty (safety net only).
STARTER_BOARD = """# KIROS

## ⚙️ Tuning
- imp_mult = 2.0
- urg_mult = 1.5
- deadline_max = 12.0
- overdue_bonus = 6.0
- stale_days = 3
- stale_boost = 0.12
- stale_cap = 0.6
- avoid_flag_boost = 0.6
- wip_cap = 3
- day_capacity = 6

## 🏢 Companies
- Personal

## 🎯 Fronts

### Personal
- [PR-GEN] General · importance:3 · surface:Personal

## 🔥 Active set

## ✅ Today

## 🤝 Delegated

## 📥 Inbox

## 🅿️ Parking lot

## 🏁 Done
"""

CONTENT_TYPES = {".html": "text/html", ".css": "text/css", ".js": "text/javascript",
                 ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon"}


# --- Descriptions sidecar (rich imported notes; keyed by source url) ----------
def load_descriptions() -> dict:
    try:
        return json.loads(DESC_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        return {}


def save_description(url: str, text: str) -> None:
    if not url:
        return
    data = load_descriptions()
    if text.strip():
        data[url] = text
    else:
        data.pop(url, None)
    DESC_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def normalize_est(v) -> str:
    """Map an effort value to a canonical EST_EFFORT key.
    Time buckets are case-sensitive (30m/90m/2h/6h/8h/Split); legacy codes
    (S/M/L/XL) are uppercase. Try as-is, then uppercased, else the default.
    (Uppercasing blindly broke the lowercase-h buckets, e.g. 2h -> 2H.)"""
    v = str(v or "").strip()
    if v in kiros.EST_EFFORT:
        return v
    if v.upper() in kiros.EST_EFFORT:
        return v.upper()
    return kiros.EFFORT_DEFAULT


# --- Completions log (append-only history -> stats + day progress) ------------
def effort_of(est) -> float:
    return kiros.EST_EFFORT[normalize_est(est)]


def read_completions() -> list:
    try:
        lines = DONE_FILE.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return []
    out = []
    for ln in lines:
        ln = ln.strip()
        if ln:
            try:
                out.append(json.loads(ln))
            except ValueError:
                continue
    return out


def log_completion(entry: dict) -> None:
    with DONE_FILE.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")


def _task_company(board, t) -> str:
    f = board.fronts.get(t.front)
    return (f.surface if f else "") or "—"


def _open_tasks(board) -> list:
    """Open loops that are yours to do — not done, not delegated."""
    out = []
    for lane in ("inbox", "active", "today", "parking"):
        for t in board.sections.get(lane, []):
            if not t.done:
                out.append(t)
    return out


def stats_payload(comps: list, board, today: date, rng: str) -> dict:
    days = {"day": 1, "week": 7, "month": 30}.get(rng, 7)
    start = today - timedelta(days=days - 1)

    def cdate(c):
        try:
            return date.fromisoformat(c.get("date", ""))
        except ValueError:
            return None

    in_range = [c for c in comps if (cdate(c) and cdate(c) >= start)]

    # Finished by company (whole range) — order drives the stacked colors + legend
    counts: dict[str, int] = {}
    for c in in_range:
        counts[c.get("company") or "—"] = counts.get(c.get("company") or "—", 0) + 1
    by_company = sorted(({"company": k, "count": v} for k, v in counts.items()),
                        key=lambda x: -x["count"])
    companies = [r["company"] for r in by_company]

    # Open ("left") loops from the board — by the day they were opened, for the mirror
    opens = _open_tasks(board)
    opened_by_date: dict[str, int] = {}
    for t in opens:
        if t.added:
            opened_by_date[t.added.isoformat()] = opened_by_date.get(t.added.isoformat(), 0) + 1

    by_day = []
    for i in range(days):
        d = (start + timedelta(days=i)).isoformat()
        same = [c for c in in_range if c.get("date") == d]
        dc: dict[str, int] = {}
        for c in same:
            dc[c.get("company") or "—"] = dc.get(c.get("company") or "—", 0) + 1
        by_day.append({"date": d, "count": len(same),
                       "effort": sum(effort_of(c.get("est")) for c in same),
                       "byCompany": dc, "opened": opened_by_date.get(d, 0)})

    # Backlog lens (the weakness view)
    open_counts: dict[str, int] = {}
    for t in opens:
        k = _task_company(board, t)
        open_counts[k] = open_counts.get(k, 0) + 1
    open_by_company = sorted(({"company": k, "count": v} for k, v in open_counts.items()),
                             key=lambda x: -x["count"])
    ages = [(today - t.added).days for t in opens if t.added]

    # Accomplishment signals
    active_set = {c["date"] for c in comps if c.get("date")}
    cur = today if today.isoformat() in active_set else today - timedelta(days=1)
    streak = 0
    while cur.isoformat() in active_set:
        streak += 1
        cur -= timedelta(days=1)
    all_counts: dict[str, int] = {}
    for c in comps:
        if c.get("date"):
            all_counts[c["date"]] = all_counts.get(c["date"], 0) + 1
    best_date, best_count = max(all_counts.items(), key=lambda kv: kv[1], default=("", 0))

    return {
        "range": rng,
        "total": len(in_range),
        "activeDays": len({c["date"] for c in in_range if c.get("date")}),
        "byDay": by_day,
        "byCompany": by_company,
        "companies": companies,
        "open": {
            "total": len(opens),
            "byCompany": open_by_company,
            "overdue": sum(1 for t in opens if t.due and t.due < today),
            "oldestDays": max(ages) if ages else 0,
            "avoid": sum(1 for t in opens if t.avoid),
        },
        "effortDone": round(sum(d["effort"] for d in by_day), 1),
        "streak": streak,
        "best": {"date": best_date, "count": best_count},
        "recent": sorted(in_range, key=lambda c: c.get("ts", ""), reverse=True)[:8],
    }


# --- Serialization (board -> JSON the frontend can render) --------------------
def task_dict(task, board, today: date, score=None, lane: str = "", descriptions=None) -> dict:
    front = board.fronts.get(task.front)
    d = {
        "title": task.title,
        "front": task.front,
        "frontName": front.name if front else "",
        "group": task.group,
        "company": front.surface if front else "",
        "importance": task.importance,
        "urgency": task.urgency,
        "est": task.est,
        "due": task.due.isoformat() if task.due else None,
        "energy": task.energy,
        "avoid": task.avoid,
        "delegate": task.delegate,
        "url": task.url,
        "description": (descriptions or {}).get(task.url, "") if task.url else "",
        "done": task.done,
        "lane": lane,
        "added": task.added.isoformat() if task.added else None,
        "raw": task.raw,
        "ageDays": (today - task.added).days if task.added else None,
    }
    if score is not None:
        d["score"] = round(score.value, 1)
        d["avoidance"] = round(score.avoidance, 2)
        d["breakdown"] = score.breakdown()
    return d


def board_payload(board, today: date, energy=None, minutes=None, n=TODAY_DEFAULT_N) -> dict:
    active = [t for t in board.sections.get("active", []) if kiros.focusable(t)]
    pool = active
    ranked = kiros.rank(pool, board, today, energy, minutes)
    cap = int(board.weights["wip_cap"])
    descs = load_descriptions()

    capacity = float(board.weights["day_capacity"])
    done_today = [c for c in read_completions() if c.get("date") == today.isoformat()]
    effort_done = sum(effort_of(c.get("est")) for c in done_today)
    plan = kiros.fill_day_plan([t for t, _ in ranked], capacity, effort_done)
    today_pairs, more_pairs = ranked[:len(plan)], ranked[len(plan):]

    # Today screen: the tasks you put in the Today status, ranked, top N.
    today_lane_pool = [t for t in board.sections.get("today", []) if kiros.focusable(t)]
    today_lane_ranked = kiros.rank(today_lane_pool, board, today, energy, minutes)

    front_counts: dict[str, int] = {}
    for t in pool:
        front_counts[t.front] = front_counts.get(t.front, 0) + 1

    aging = sorted(
        ((t, kiros.avoidance_boost(t, today, board.weights)) for t in pool),
        key=lambda p: p[1], reverse=True)

    return {
        "date": today.isoformat(),
        "todaySource": "active",
        "wip": {"active": len(active), "cap": cap, "ok": len(active) <= cap},
        "today": [task_dict(t, board, today, s, descriptions=descs) for t, s in today_pairs],
        "more": [task_dict(t, board, today, s, descriptions=descs) for t, s in more_pairs],
        "progress": {"done": len(done_today), "planned": len(done_today) + len(plan),
                     "effortDone": effort_done, "capacity": capacity,
                     "dayComplete": len(plan) == 0 and len(done_today) > 0},
        "todayLane": [task_dict(t, board, today, s, descriptions=descs)
                      for t, s in today_lane_ranked[:TODAY_SCREEN_N]],
        "todayLaneTotal": len(today_lane_ranked),
        "todayEffort": round(sum(effort_of(t.est) for t in today_lane_pool), 1),
        "todayProgress": {"done": len(done_today),
                          "planned": len(done_today) + len(today_lane_ranked),
                          "dayComplete": len(today_lane_ranked) == 0 and len(done_today) > 0},
        "fronts": [
            {"code": c, "name": f.name, "importance": f.importance, "open": front_counts.get(c, 0)}
            for c, f in board.fronts.items()
        ],
        "aging": [task_dict(t, board, today, None, descriptions=descs) | {"avoidance": round(b, 2)}
                  for t, b in aging if b > 0.3][:8],
        "inbox": list(board.inbox_raw),
    }


def task_from_fields(f: dict):
    """Build a Task from the edit-panel JSON. Tolerant of missing/blank fields."""
    def as_int(v):
        try:
            return int(v)
        except (TypeError, ValueError):
            return None

    def as_date(v):
        try:
            return date.fromisoformat(v) if v else None
        except (TypeError, ValueError):
            return None

    return kiros.Task(
        title=str(f.get("title", "")).strip(),
        front=str(f.get("front", "")).strip(),
        group=str(f.get("group") or "").strip(),
        importance=as_int(f.get("importance")),
        urgency=as_int(f.get("urgency")),
        est=normalize_est(f.get("est")),
        due=as_date(f.get("due")),
        energy=str(f.get("energy") or "").lower(),
        delegate=str(f.get("delegate") or "").strip(),
        url=str(f.get("url") or "").strip(),
        added=as_date(f.get("added")) or date.today(),
        avoid=bool(f.get("avoid")),
        done=bool(f.get("done")),
    )


def companies_list(board) -> list:
    """Registry order first, then any company implied by a front but not yet registered."""
    surfaces = {f.surface for f in board.fronts.values() if f.surface}
    return list(board.companies) + sorted(s for s in surfaces if s not in board.companies)


def gen_front_code(board, company: str, name: str) -> str:
    """Stable, unique short code for a new project: <COMPANY-PREFIX>-<NAME-PREFIX>."""
    existing = set(board.fronts.keys())
    prefix = next((f.code.split("-", 1)[0] for f in board.fronts.values()
                   if f.surface == company and "-" in f.code), None)
    if not prefix:
        prefix = ("".join(c for c in company if c.isalnum())[:2] or "XX").upper()
    namepart = ("".join(c for c in name if c.isalnum())[:4] or "PRJ").upper()
    code, n = f"{prefix}-{namepart}", 2
    while code in existing:
        code = f"{prefix}-{namepart}{n}"
        n += 1
    return code


def tasks_payload(board, today: date) -> dict:
    rows = []
    descs = load_descriptions()
    open_by_front = {}
    for lane in kiros.LANES:
        for t in board.sections.get(lane, []):
            score = kiros.score_task(t, board.fronts.get(t.front), board.weights, today)
            rows.append(task_dict(t, board, today, score, lane, descs))
            if not t.done:
                open_by_front[t.front] = open_by_front.get(t.front, 0) + 1
    active_open = len([t for t in board.sections.get("active", []) if kiros.focusable(t)])
    return {
        "date": today.isoformat(),
        "tasks": rows,
        "inbox": list(board.inbox_raw),
        "fronts": [{"code": c, "name": f.name, "surface": f.surface,
                    "importance": f.importance, "urgency": f.urgency, "open": open_by_front.get(c, 0)}
                   for c, f in board.fronts.items()],
        "companies": companies_list(board),
        "lanes": kiros.LANES,
        "wip": {"cap": int(board.weights["wip_cap"]), "active": active_open},
    }


# --- iCalendar feed (today's plan + deadlines -> Apple/Google Calendar) -------
def _ics_escape(text: str) -> str:
    return (text.replace("\\", "\\\\").replace(";", "\\;")
            .replace(",", "\\,").replace("\n", "\\n"))


def _ics_fold(line: str) -> str:
    """RFC 5545 line folding (~75 chars). Apple Calendar is strict-ish; keep it valid."""
    if len(line) <= 74:
        return line
    chunks, i = [line[:74]], 74
    while i < len(line):
        chunks.append(" " + line[i:i + 73])
        i += 73
    return "\r\n".join(chunks)


def _event_summary(task, front) -> str:
    """Event name = Company: Project: Task — collapsing the redundant middle when equal."""
    company = (front.surface if front else "") or ""
    project = front.name.split("—")[0].strip() if front else ""
    if project and project != company:
        return f"{company}: {project}: {task.title}"
    if company:
        return f"{company}: {task.title}"
    return task.title


def _vevent(day, task, front, descs) -> list:
    ymd, nxt = day.strftime("%Y%m%d"), (day + timedelta(days=1)).strftime("%Y%m%d")
    uid = "kiros-%s-%s@kiros.local" % (ymd, hashlib.md5(task.title.encode("utf-8")).hexdigest()[:8])
    eff = {"S": "small", "M": "medium", "L": "big", "XL": "huge"}.get(task.est, task.est)
    parts = ["Effort: %s%s" % (eff, "" if task.importance is None else " · Importance: %d" % task.importance)]
    note = descs.get(task.url, "") if task.url else ""
    if note:
        parts.append(note)
    if task.url:
        parts.append(task.url)
    company = (front.surface if front else "") or "Kiros"
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return ["BEGIN:VEVENT", "UID:%s" % uid, "DTSTAMP:%s" % stamp,
            "DTSTART;VALUE=DATE:%s" % ymd, "DTEND;VALUE=DATE:%s" % nxt,
            "SUMMARY:%s" % _ics_escape(_event_summary(task, front)),
            "DESCRIPTION:%s" % _ics_escape("\n\n".join(parts)),
            "CATEGORIES:%s" % _ics_escape(company), "TRANSP:TRANSPARENT", "END:VEVENT"]


def ics_for(board, today) -> str:
    """Today's right-sized plan as all-day events, plus any task with a due date on its day."""
    descs = load_descriptions()
    active = [t for t in board.sections.get("active", []) if kiros.focusable(t)]
    pool = active or [t for t in board.sections.get("backlog", []) if kiros.focusable(t)]
    ranked = kiros.rank(pool, board, today, None, None)
    effort_done = sum(effort_of(c.get("est")) for c in read_completions()
                      if c.get("date") == today.isoformat())
    plan = kiros.fill_day_plan([t for t, _ in ranked],
                               float(board.weights["day_capacity"]), effort_done)

    events, seen = [], set()
    for t in plan:
        events.append((today, t))
        seen.add((today.isoformat(), t.title))
    for lane in kiros.LANES:                       # deadlines: any due-dated task on its due date
        for t in board.sections.get(lane, []):
            if t.done or t.delegate or not t.due:
                continue
            key = (t.due.isoformat(), t.title)
            if key not in seen:
                events.append((t.due, t))
                seen.add(key)

    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Kiros//Day Plan//EN",
             "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Kiros", "NAME:Kiros",
             "X-WR-CALDESC:Your right-sized day + deadlines",
             "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"]
    for day, task in events:
        lines += _vevent(day, task, board.fronts.get(task.front), descs)
    lines.append("END:VCALENDAR")
    return "\r\n".join(_ics_fold(ln) for ln in lines) + "\r\n"


# --- Request handling ---------------------------------------------------------
def _basic_auth_ok(header: str) -> bool:
    """Constant-time check of an HTTP Basic Authorization header. True if auth is disabled."""
    if not (AUTH_USER and AUTH_PASS):
        return True
    if not header.startswith("Basic "):
        return False
    try:
        user, _, pw = base64.b64decode(header[6:]).decode("utf-8").partition(":")
    except (ValueError, UnicodeDecodeError):
        return False
    return hmac.compare_digest(user, AUTH_USER) and hmac.compare_digest(pw, AUTH_PASS)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # keep the terminal calm
        pass

    def _authorized(self) -> bool:
        if _basic_auth_ok(self.headers.get("Authorization", "")):
            return True
        self.send_response(401)
        self.send_header("WWW-Authenticate", 'Basic realm="Kiros"')
        self.send_header("Content-Length", "0")
        self.end_headers()
        return False

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        # Tiny single-user app — always revalidate so a deploy never leaves a stale
        # app.js/index.html mismatch in the browser cache.
        self.send_header("Cache-Control", "no-cache, must-revalidate")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, payload, status: int = 200) -> None:
        self._send(status, json.dumps(payload).encode("utf-8"), "application/json")

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return {}

    def _board(self):
        return kiros.parse_board(Path(BOARD).read_text(encoding="utf-8"))

    # -- GET: static files + /api/board --
    def do_GET(self) -> None:
        if not self._authorized():
            return
        parsed = urlparse(self.path)
        if parsed.path == "/api/board":
            q = parse_qs(parsed.query)
            energy = (q.get("energy") or [None])[0]
            minutes = int(q["time"][0]) if q.get("time") else None
            self._json(board_payload(self._board(), date.today(), energy, minutes))
            return
        if parsed.path == "/api/tasks":
            self._json(tasks_payload(self._board(), date.today()))
            return
        if parsed.path == "/api/stats":
            rng = (parse_qs(parsed.query).get("range") or ["week"])[0]
            self._json(stats_payload(read_completions(), self._board(), date.today(), rng))
            return
        if parsed.path == "/kiros.ics":
            payload = ics_for(self._board(), date.today()).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/calendar; charset=utf-8")
            if parse_qs(parsed.query).get("download"):
                self.send_header("Content-Disposition", "attachment; filename=kiros-today.ics")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        self._serve_static(parsed.path)

    def _serve_static(self, path: str) -> None:
        rel = "index.html" if path in ("/", "") else path.lstrip("/")
        target = (WEB_DIR / rel).resolve()
        if WEB_DIR not in target.parents or not target.is_file():
            self._send(404, b"not found", "text/plain")
            return
        ctype = CONTENT_TYPES.get(target.suffix, "application/octet-stream")
        if target.name == "index.html":
            # Cache-bust app.js/styles.css with a content hash so a deploy never serves
            # a stale asset (Cloudflare caches .js by extension regardless of our headers).
            html = target.read_text(encoding="utf-8")
            for asset in ("app.js", "styles.css", "logo.png", "logo-wt.svg", "apple-touch-icon.png"):
                p = WEB_DIR / asset
                if p.exists():
                    v = hashlib.md5(p.read_bytes()).hexdigest()[:8]
                    html = html.replace(f"/{asset}", f"/{asset}?v={v}")
            self._send(200, html.encode("utf-8"), ctype)
            return
        self._send(200, target.read_bytes(), ctype)

    # -- POST: capture, complete, now --
    def do_POST(self) -> None:
        if not self._authorized():
            return
        path = urlparse(self.path).path
        body = self._read_json()
        if path == "/api/capture":
            ok = kiros.add_capture(BOARD, str(body.get("text", "")))
            self._json({"ok": ok})
        elif path == "/api/complete":
            # Done is an exclusive status: move the task INTO the `## 🏁 Done` section
            # (done=true) or back to Active (done=false), flipping its checkbox.
            raw = str(body.get("raw", ""))
            done = bool(body.get("done", True))
            t = kiros.parse_task(raw)
            removed = kiros.remove_line(BOARD, raw)
            new_line = (raw.replace("[ ]", "[x]", 1) if done
                        else raw.replace("[x]", "[ ]", 1).replace("[X]", "[ ]", 1)).strip()
            kiros.add_task_line(BOARD, "done" if done else "active", new_line)
            if removed and done and t:
                front = self._board().fronts.get(t.front)
                log_completion({
                    "date": date.today().isoformat(),
                    "ts": datetime.now().isoformat(timespec="seconds"),
                    "title": t.title, "front": t.front,
                    "company": front.surface if front else "", "est": t.est,
                })
            self._json({"ok": removed})
        elif path == "/api/now":
            board = self._board()
            energy = body.get("energy") or None
            minutes = body.get("time")
            payload = board_payload(board, date.today(), energy, minutes, n=1)
            self._json({"pick": (payload["today"] or [None])[0]})
        elif path == "/api/task/save":
            # create (no originalRaw), in-place edit (auto-save), lane move, or intake-refine.
            task = task_from_fields(body.get("fields", {}))
            if not task.title:
                self._json({"ok": False, "error": "title required"}, 400)
                return
            lane = "delegated" if task.delegate else (body.get("lane") or "active")
            # Task is a frozen dataclass — replace, don't mutate. Keeps [x] in sync with the done lane.
            task = dataclasses.replace(task, done=(lane == "done"))
            line = kiros.format_task_line(task)
            original = body.get("originalRaw")
            moved = bool(body.get("moved")) or bool(task.delegate)  # lane/delegate change relocates
            if original and not moved and kiros.replace_line(BOARD, str(original), line):
                pass  # edited in place — no reorder
            else:
                if original:
                    kiros.remove_line(BOARD, str(original))
                kiros.add_task_line(BOARD, lane, line)
            save_description(task.url, str(body.get("fields", {}).get("description", "")))
            self._json({"ok": True, "raw": line})
        elif path == "/api/task/delete":
            self._json({"ok": kiros.remove_line(BOARD, str(body.get("raw", "")))})
        elif path == "/api/company/save":
            name = str(body.get("name", "")).strip()
            self._json({"ok": bool(name) and kiros.add_company(BOARD, name)})
        elif path == "/api/project/save":
            name = str(body.get("name", "")).strip()
            company = str(body.get("company", "")).strip()
            if not name or not company:
                self._json({"ok": False, "error": "name and company required"}, 400)
                return
            board = self._board()
            try:
                imp = int(body.get("importance", 3))
            except (TypeError, ValueError):
                imp = 3
            code = gen_front_code(board, company, name)
            kiros.add_front(BOARD, code, name, company, imp)
            self._json({"ok": True, "code": code})
        elif path == "/api/project/delete":
            self._json({"ok": kiros.remove_front(BOARD, str(body.get("code", "")))})
        elif path == "/api/front/update":
            imp, urg, nm = body.get("importance"), body.get("urgency"), body.get("name")
            ok = kiros.update_front(BOARD, str(body.get("code", "")),
                                    importance=int(imp) if imp is not None else None,
                                    urgency=int(urg) if urg is not None else None,
                                    name=str(nm).strip() if nm else None)
            self._json({"ok": ok})
        else:
            self._send(404, b"not found", "text/plain")


def main() -> None:
    board = Path(BOARD)
    if not board.exists():
        # Safety net so a fresh deploy (empty data volume) boots instead of crash-looping.
        # Replace data/KIROS.md with your real board, then restart.
        board.parent.mkdir(parents=True, exist_ok=True)
        board.write_text(STARTER_BOARD, encoding="utf-8")
        print(f"  No board found — wrote a starter to {BOARD} (replace it with your real board)")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://localhost:{PORT}"
    print(f"  Kiros is calm and listening on {HOST}:{PORT}  (Ctrl-C to stop)")
    if not (AUTH_USER and AUTH_PASS):
        print("  ⚠ No KIROS_AUTH_USER/KIROS_AUTH_PASS set — running WITHOUT auth. Fine for localhost, NOT for a public deploy.")
    quiet = "--no-open" in sys.argv or os.environ.get("KIROS_NO_OPEN")
    if not quiet:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.")
        server.shutdown()


if __name__ == "__main__":
    main()
