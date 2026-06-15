#!/usr/bin/env python3
"""Kiros web — multi-user. A thin, calm UI over the same engine.

ALL prioritization logic stays in kiros.py. This file serves the SPA + auth
screens, authenticates via cookie sessions (store.py / auth.py), and resolves
every board/sidecar path PER REQUEST from the logged-in user's id — never from
anything the client sends. That single rule is the tenant-isolation guarantee.

No build step, stdlib only:
    KIROS_DEV=1 python3 kiros_web.py        # http://localhost:8765
"""
from __future__ import annotations

import base64
import contextlib
import dataclasses
import hashlib
import json
import os
import re
import shutil
import sys
import threading
import webbrowser
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import auth
import kiros
from store import Store

ROOT = Path(__file__).parent


def _load_dotenv(path: Path) -> None:
    """Load KEY=VALUE pairs from a .env into os.environ (existing env always wins)."""
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


_load_dotenv(ROOT / ".env")

DATA = Path(os.environ.get("KIROS_DATA", str(ROOT / "data")))   # holds kiros.db + users/<uid>/
DB_PATH = Path(os.environ.get("KIROS_DB") or (DATA / "kiros.db"))
USERS_DIR = DATA / "users"
WEB_DIR = ROOT / "web"
HOST = os.environ.get("KIROS_HOST", "127.0.0.1")
PORT = int(os.environ.get("KIROS_PORT", "8765"))
DEV = bool(os.environ.get("KIROS_DEV"))          # local http: drop Secure cookie + expose reset link
TODAY_DEFAULT_N = 3
TODAY_SCREEN_N = 5
SESSION_MAX_AGE = 60 * 60 * 24 * 30
MAX_BODY = 1 << 20                                # reject request bodies larger than 1 MiB

# Per-user starter board, written on first login if the user has no board yet.
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
                 ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon",
                 ".webmanifest": "application/manifest+json", ".json": "application/json"}
PUBLIC_ASSET_EXT = {".css", ".js", ".png", ".svg", ".ico", ".webmanifest", ".woff", ".woff2"}
PUBLIC_PAGES = {"/login": "login.html", "/signup": "signup.html",
                "/forgot": "forgot.html", "/reset": "reset.html"}

STORE = Store(DB_PATH)
RATE = auth.RateLimiter()


# --- Per-user paths (the isolation backbone: derived only from a verified uid) -
def user_dir(uid: str) -> Path:
    return USERS_DIR / uid


def board_file(uid: str) -> Path:
    return user_dir(uid) / "KIROS.md"


def desc_file(uid: str) -> Path:
    return user_dir(uid) / "descriptions.json"


def done_file(uid: str) -> Path:
    return user_dir(uid) / "completions.jsonl"


def prefs_file(uid: str) -> Path:
    return user_dir(uid) / "prefs.json"


def ensure_user_data(uid: str) -> Path:
    d = user_dir(uid)
    d.mkdir(parents=True, exist_ok=True)
    board = board_file(uid)
    if not board.exists():
        board.write_text(STARTER_BOARD, encoding="utf-8")
    return board


_BOARD_LOCKS: dict = defaultdict(threading.Lock)   # one lock per uid; serializes that user's writes


@contextlib.contextmanager
def board_guard(uid: str):
    """Serialize writes to one user's board and snapshot it to <board>.bak first,
    so concurrent requests (multi-tab / PWA + calendar refresh) can't clobber or
    truncate KIROS.md. Per-uid, so distinct users never contend."""
    with _BOARD_LOCKS[uid]:
        board = board_file(uid)
        if board.exists():
            try:
                shutil.copy2(board, board.parent / (board.name + ".bak"))
            except OSError:
                pass
        yield


# --- Descriptions sidecar (rich imported notes; keyed by source url) ----------
def load_descriptions(path: Path) -> dict:
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        return {}


def save_description(path: Path, url: str, text: str) -> None:
    if not url:
        return
    data = load_descriptions(path)
    if text.strip():
        data[url] = text
    else:
        data.pop(url, None)
    Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def normalize_est(v) -> str:
    v = str(v or "").strip()
    if v in kiros.EST_EFFORT:
        return v
    if v.upper() in kiros.EST_EFFORT:
        return v.upper()
    return kiros.EFFORT_DEFAULT


def effort_of(est) -> float:
    return kiros.EST_EFFORT[normalize_est(est)]


# --- Completions log ----------------------------------------------------------
def read_completions(path: Path) -> list:
    try:
        lines = Path(path).read_text(encoding="utf-8").splitlines()
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


def log_completion(path: Path, entry: dict) -> None:
    with Path(path).open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")


def _task_company(board, t) -> str:
    f = board.fronts.get(t.front)
    return (f.surface if f else "") or "—"


def _open_tasks(board) -> list:
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

    counts: dict[str, int] = {}
    for c in in_range:
        counts[c.get("company") or "—"] = counts.get(c.get("company") or "—", 0) + 1
    by_company = sorted(({"company": k, "count": v} for k, v in counts.items()), key=lambda x: -x["count"])
    companies = [r["company"] for r in by_company]

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

    open_counts: dict[str, int] = {}
    for t in opens:
        k = _task_company(board, t)
        open_counts[k] = open_counts.get(k, 0) + 1
    open_by_company = sorted(({"company": k, "count": v} for k, v in open_counts.items()), key=lambda x: -x["count"])
    ages = [(today - t.added).days for t in opens if t.added]

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
        "range": rng, "total": len(in_range),
        "activeDays": len({c["date"] for c in in_range if c.get("date")}),
        "byDay": by_day, "byCompany": by_company, "companies": companies,
        "open": {"total": len(opens), "byCompany": open_by_company,
                 "overdue": sum(1 for t in opens if t.due and t.due < today),
                 "oldestDays": max(ages) if ages else 0,
                 "avoid": sum(1 for t in opens if t.avoid)},
        "effortDone": round(sum(d["effort"] for d in by_day), 1),
        "streak": streak, "best": {"date": best_date, "count": best_count},
        "recent": sorted(in_range, key=lambda c: c.get("ts", ""), reverse=True)[:8],
    }


# --- Serialization (board -> JSON) --------------------------------------------
def task_dict(task, board, today: date, score=None, lane: str = "", descriptions=None) -> dict:
    front = board.fronts.get(task.front)
    d = {
        "title": task.title, "front": task.front, "frontName": front.name if front else "",
        "group": task.group, "company": front.surface if front else "",
        "importance": task.importance, "urgency": task.urgency, "est": task.est,
        "due": task.due.isoformat() if task.due else None, "energy": task.energy,
        "avoid": task.avoid, "delegate": task.delegate, "url": task.url,
        "description": (descriptions or {}).get(task.url, "") if task.url else "",
        "done": task.done, "lane": lane,
        "added": task.added.isoformat() if task.added else None,
        "raw": task.raw, "ageDays": (today - task.added).days if task.added else None,
    }
    if score is not None:
        d["score"] = round(score.value, 1)
        d["avoidance"] = round(score.avoidance, 2)
        d["breakdown"] = score.breakdown()
    return d


def board_payload(board, today: date, energy=None, minutes=None, n=TODAY_DEFAULT_N,
                  descs=None, comps=None) -> dict:
    descs = descs or {}
    comps = comps if comps is not None else []
    active = [t for t in board.sections.get("active", []) if kiros.focusable(t)]
    ranked = kiros.rank(active, board, today, energy, minutes)
    cap = int(board.weights["wip_cap"])

    capacity = float(board.weights["day_capacity"])
    done_today = [c for c in comps if c.get("date") == today.isoformat()]
    effort_done = sum(effort_of(c.get("est")) for c in done_today)
    plan = kiros.fill_day_plan([t for t, _ in ranked], capacity, effort_done)
    today_pairs, more_pairs = ranked[:len(plan)], ranked[len(plan):]

    today_lane_pool = [t for t in board.sections.get("today", []) if kiros.focusable(t)]
    today_lane_ranked = kiros.rank(today_lane_pool, board, today, energy, minutes)

    front_counts: dict[str, int] = {}
    for t in active:
        front_counts[t.front] = front_counts.get(t.front, 0) + 1

    aging = sorted(((t, kiros.avoidance_boost(t, today, board.weights)) for t in active),
                   key=lambda p: p[1], reverse=True)

    return {
        "date": today.isoformat(), "todaySource": "active",
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
        "fronts": [{"code": c, "name": f.name, "importance": f.importance, "open": front_counts.get(c, 0)}
                   for c, f in board.fronts.items()],
        "aging": [task_dict(t, board, today, None, descriptions=descs) | {"avoidance": round(b, 2)}
                  for t, b in aging if b > 0.3][:8],
        "inbox": list(board.inbox_raw),
    }


def task_from_fields(f: dict):
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
        title=str(f.get("title", "")).strip(), front=str(f.get("front", "")).strip(),
        group=str(f.get("group") or "").strip(), importance=as_int(f.get("importance")),
        urgency=as_int(f.get("urgency")), est=normalize_est(f.get("est")), due=as_date(f.get("due")),
        energy=str(f.get("energy") or "").lower(), delegate=str(f.get("delegate") or "").strip(),
        url=str(f.get("url") or "").strip(), added=as_date(f.get("added")) or date.today(),
        avoid=bool(f.get("avoid")), done=bool(f.get("done")),
    )


def companies_list(board) -> list:
    surfaces = {f.surface for f in board.fronts.values() if f.surface}
    return list(board.companies) + sorted(s for s in surfaces if s not in board.companies)


def gen_front_code(board, company: str, name: str) -> str:
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


def tasks_payload(board, today: date, descs: dict) -> dict:
    rows = []
    open_by_front = {}
    for lane in kiros.LANES:
        for t in board.sections.get(lane, []):
            score = kiros.score_task(t, board.fronts.get(t.front), board.weights, today)
            rows.append(task_dict(t, board, today, score, lane, descs))
            if not t.done:
                open_by_front[t.front] = open_by_front.get(t.front, 0) + 1
    active_open = len([t for t in board.sections.get("active", []) if kiros.focusable(t)])
    return {
        "date": today.isoformat(), "tasks": rows, "inbox": list(board.inbox_raw),
        "fronts": [{"code": c, "name": f.name, "surface": f.surface, "importance": f.importance,
                    "urgency": f.urgency, "open": open_by_front.get(c, 0)}
                   for c, f in board.fronts.items()],
        "companies": companies_list(board), "lanes": kiros.LANES,
        "wip": {"cap": int(board.weights["wip_cap"]), "active": active_open},
    }


# --- iCalendar feed -----------------------------------------------------------
def _ics_escape(text: str) -> str:
    return (text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n"))


def _ics_fold(line: str) -> str:
    if len(line) <= 74:
        return line
    chunks, i = [line[:74]], 74
    while i < len(line):
        chunks.append(" " + line[i:i + 73])
        i += 73
    return "\r\n".join(chunks)


def _event_summary(task, front) -> str:
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


def ics_for(board, today, descs: dict, comps: list) -> str:
    active = [t for t in board.sections.get("active", []) if kiros.focusable(t)]
    ranked = kiros.rank(active, board, today, None, None)
    effort_done = sum(effort_of(c.get("est")) for c in comps if c.get("date") == today.isoformat())
    plan = kiros.fill_day_plan([t for t, _ in ranked], float(board.weights["day_capacity"]), effort_done)

    events, seen = [], set()
    for t in plan:
        events.append((today, t))
        seen.add((today.isoformat(), t.title))
    for lane in kiros.LANES:
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


# --- Per-user UI prefs (theme etc.) ------------------------------------------
DEFAULT_PREFS = {"theme": "system", "accent": "", "bgImage": None, "bgOpacity": 0.2, "onboarded": False}
BG_MAX_BYTES = 4 * 1024 * 1024
_BG_DATA_URL = re.compile(r"^data:image/(png|jpe?g|webp|gif);base64,(.+)$", re.DOTALL)


def load_prefs(uid: str) -> dict:
    try:
        return {**DEFAULT_PREFS, **json.loads(prefs_file(uid).read_text(encoding="utf-8"))}
    except (FileNotFoundError, ValueError):
        return dict(DEFAULT_PREFS)


def save_prefs(uid: str, data: dict) -> None:
    cur = load_prefs(uid)
    for k in ("theme", "accent", "bgImage", "bgOpacity", "onboarded"):
        if k in data:
            cur[k] = data[k]
    user_dir(uid).mkdir(parents=True, exist_ok=True)
    prefs_file(uid).write_text(json.dumps(cur, indent=2), encoding="utf-8")


def admin_users_payload() -> list:
    rows = []
    for u in STORE.list_users():
        m = {"companies": 0, "projects": 0, "tasks": 0}
        try:
            board = kiros.parse_board(board_file(u["id"]).read_text(encoding="utf-8"))
            m["companies"] = len(companies_list(board))
            m["projects"] = len(board.fronts)
            m["tasks"] = sum(1 for lane in kiros.LANES for t in board.sections.get(lane, []) if not t.done)
        except OSError:
            pass
        rows.append({"email": u["email"], "name": u["name"], "isAdmin": bool(u["is_admin"]),
                     "active": bool(u["is_active"]), "lastSeen": u["last_seen_at"],
                     "createdAt": u["created_at"], **m})
    return rows


# --- Cookies ------------------------------------------------------------------
def parse_cookies(header: str) -> dict:
    jar = SimpleCookie()
    try:
        jar.load(header or "")
    except Exception:
        return {}
    return {k: m.value for k, m in jar.items()}


def set_cookie(name: str, value: str, max_age: int, http_only: bool = True) -> str:
    parts = ["%s=%s" % (name, value), "Path=/", "SameSite=Lax", "Max-Age=%d" % max_age]
    if http_only:
        parts.append("HttpOnly")
    if not DEV:
        parts.append("Secure")
    return "; ".join(parts)


def clear_cookie(name: str) -> str:
    base = "%s=; Path=/; Max-Age=0; SameSite=Lax" % name
    return base if DEV else base + "; Secure"


# --- Request handling ---------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # keep the terminal calm
        pass

    # -- response helpers --
    def _send(self, status: int, body: bytes, content_type: str, cookies=None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache, must-revalidate")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        for c in (cookies or []):
            self.send_header("Set-Cookie", c)
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _json(self, payload, status: int = 200, cookies=None) -> None:
        self._send(status, json.dumps(payload).encode("utf-8"), "application/json", cookies)

    def _redirect(self, location: str, cookies=None) -> None:
        self.send_response(303)
        self.send_header("Location", location)
        self.send_header("Content-Length", "0")
        for c in (cookies or []):
            self.send_header("Set-Cookie", c)
        self.end_headers()

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", 0) or 0)
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return {}

    def _cookies(self) -> dict:
        return parse_cookies(self.headers.get("Cookie", ""))

    def _user(self):
        return auth.user_for_session(STORE, self._cookies().get(auth.SESSION_COOKIE))

    def _client_ip(self) -> str:
        # Behind Traefik the socket peer is the proxy; trust its X-Forwarded-For
        # so the rate limiter keys on the real client (paired with email keys below).
        xff = self.headers.get("X-Forwarded-For", "")
        if xff:
            return xff.split(",")[0].strip()
        return self.client_address[0] if self.client_address else "?"

    def _board(self, uid: str):
        return kiros.parse_board(board_file(uid).read_text(encoding="utf-8"))

    # -- GET --
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if Path(path).suffix in PUBLIC_ASSET_EXT:                 # static assets are public
            self._serve_static(path)
            return
        if path.startswith("/u/") and path.endswith("/kiros.ics"):  # tokenized per-user feed
            self._serve_ics(path.split("/")[2], parse_qs(parsed.query))
            return
        if path in PUBLIC_PAGES:
            if self._user():
                self._redirect("/")
            else:
                self._serve_web_html(PUBLIC_PAGES[path])
            return

        user = self._user()
        if not user:
            if path.startswith("/api/"):
                self._json({"error": "auth required"}, 401)
            else:
                self._redirect("/login")
            return

        uid = user["id"]
        ensure_user_data(uid)
        if path in ("/", "", "/index.html"):
            STORE.touch_last_seen(uid)
            self._serve_web_html("index.html")
        elif path == "/admin":
            if not user["is_admin"]:
                self._send(403, b"forbidden", "text/plain")
            else:
                self._serve_web_html("admin.html")
        elif path == "/api/me":
            self._json({"email": user["email"], "name": user["name"],
                        "isAdmin": bool(user["is_admin"]), "icsToken": user["ics_token"]})
        elif path == "/api/board":
            q = parse_qs(parsed.query)
            energy = (q.get("energy") or [None])[0]
            minutes = int(q["time"][0]) if q.get("time") else None
            self._json(board_payload(self._board(uid), date.today(), energy, minutes,
                                     descs=load_descriptions(desc_file(uid)),
                                     comps=read_completions(done_file(uid))))
        elif path == "/api/tasks":
            self._json(tasks_payload(self._board(uid), date.today(), load_descriptions(desc_file(uid))))
        elif path == "/api/stats":
            rng = (parse_qs(parsed.query).get("range") or ["week"])[0]
            self._json(stats_payload(read_completions(done_file(uid)), self._board(uid), date.today(), rng))
        elif path == "/api/prefs":
            self._json(load_prefs(uid))
        elif path == "/api/bg":
            self._serve_bg(uid)
        elif path == "/api/admin/users":
            if not user["is_admin"]:
                self._json({"error": "forbidden"}, 403)
            else:
                self._json({"users": admin_users_payload()})
        else:
            self._send(404, b"not found", "text/plain")

    def _serve_static(self, path: str) -> None:
        rel = path.lstrip("/")
        target = (WEB_DIR / rel).resolve()
        if WEB_DIR.resolve() not in target.parents or not target.is_file():
            self._send(404, b"not found", "text/plain")
            return
        ctype = CONTENT_TYPES.get(target.suffix, "application/octet-stream")
        self._send(200, target.read_bytes(), ctype)

    def _serve_web_html(self, name: str) -> None:
        target = (WEB_DIR / name).resolve()
        if WEB_DIR.resolve() not in target.parents or not target.is_file():
            self._send(404, b"not found", "text/plain")
            return
        html = target.read_text(encoding="utf-8")
        for asset in ("app.js", "styles.css", "auth.js", "auth.css", "logo.png", "logo-wt.svg", "apple-touch-icon.png"):
            ref = "/" + asset
            p = WEB_DIR / asset
            if p.exists() and ref in html:
                v = hashlib.md5(p.read_bytes()).hexdigest()[:8]
                html = html.replace(ref, "%s?v=%s" % (ref, v))
        self._send(200, html.encode("utf-8"), "text/html")

    def _serve_ics(self, token: str, query=None) -> None:
        u = STORE.get_user_by_ics_token(token)
        if not u or not u["is_active"]:
            self._send(404, b"not found", "text/plain")
            return
        uid = u["id"]
        ensure_user_data(uid)
        payload = ics_for(self._board(uid), date.today(),
                          load_descriptions(desc_file(uid)), read_completions(done_file(uid))).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/calendar; charset=utf-8")
        if (query or {}).get("download"):
            self.send_header("Content-Disposition", "attachment; filename=kiros-today.ics")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    _BG_CTYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                  ".webp": "image/webp", ".gif": "image/gif"}

    def _serve_bg(self, uid: str) -> None:
        name = load_prefs(uid).get("bgImage")
        target = (user_dir(uid) / name) if name else None
        if not target or not target.is_file():
            self._send(404, b"no background", "text/plain")
            return
        self._send(200, target.read_bytes(), self._BG_CTYPES.get(target.suffix.lower(), "image/jpeg"))

    def _bg_upload(self, uid: str, body: dict) -> None:
        if body.get("clear"):
            prev = load_prefs(uid).get("bgImage")
            if prev:
                try:
                    (user_dir(uid) / prev).unlink()
                except OSError:
                    pass
            save_prefs(uid, {"bgImage": None})
            self._json({"ok": True, "image": None})
            return
        m = _BG_DATA_URL.match(str(body.get("dataUrl", "")))
        if not m:
            self._json({"ok": False, "error": "invalid image"}, 400)
            return
        ext = "jpg" if m.group(1) in ("jpeg", "jpg") else m.group(1)
        try:
            raw = base64.b64decode(m.group(2), validate=True)
        except (ValueError, TypeError):
            self._json({"ok": False, "error": "invalid image"}, 400)
            return
        if len(raw) > BG_MAX_BYTES:
            self._json({"ok": False, "error": "image too large"}, 413)
            return
        ensure_user_data(uid)
        name = "bg." + ext
        (user_dir(uid) / name).write_bytes(raw)
        save_prefs(uid, {"bgImage": name})
        self._json({"ok": True, "image": name})

    # -- POST --
    def _rl(self, name: str) -> bool:
        return RATE.allow("%s:%s" % (self._client_ip(), name))

    def _auth_cookies(self, token: str) -> list:
        return [set_cookie(auth.SESSION_COOKIE, token, SESSION_MAX_AGE, http_only=True),
                set_cookie(auth.CSRF_COOKIE, auth.new_token(), SESSION_MAX_AGE, http_only=False)]

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if int(self.headers.get("Content-Length", 0) or 0) > MAX_BODY:
            self._json({"error": "request too large"}, 413)
            return
        body = self._read_json()

        if path == "/api/auth/signup":
            return self._signup(body)
        if path == "/api/auth/login":
            return self._login(body)
        if path == "/api/auth/forgot":
            return self._forgot(body)
        if path == "/api/auth/reset":
            return self._reset(body)

        user = self._user()
        if not user:
            self._json({"error": "auth required"}, 401)
            return

        # Every state change (logout included) requires a matching CSRF token.
        if not auth.csrf_ok(self._cookies().get(auth.CSRF_COOKIE), self.headers.get(auth.CSRF_HEADER, "")):
            self._json({"error": "bad csrf"}, 403)
            return

        if path == "/api/auth/logout":
            auth.end_session(STORE, self._cookies().get(auth.SESSION_COOKIE))
            self._json({"ok": True}, cookies=[clear_cookie(auth.SESSION_COOKIE), clear_cookie(auth.CSRF_COOKIE)])
            return

        uid = user["id"]
        ensure_user_data(uid)
        bp = str(board_file(uid))

        # Reads / non-board writes need no board snapshot.
        if path == "/api/now":
            payload = board_payload(self._board(uid), date.today(), body.get("energy") or None,
                                    body.get("time"), n=1, descs=load_descriptions(desc_file(uid)),
                                    comps=read_completions(done_file(uid)))
            self._json({"pick": (payload["today"] or [None])[0]})
            return
        if path == "/api/prefs":
            save_prefs(uid, body if isinstance(body, dict) else {})
            self._json({"ok": True})
            return
        if path == "/api/bg":
            self._bg_upload(uid, body)
            return

        # Board mutations: serialized per-user + snapshotted first (see board_guard).
        with board_guard(uid):
            if path == "/api/capture":
                self._json({"ok": kiros.add_capture(bp, str(body.get("text", "")))})
            elif path == "/api/complete":
                self._complete(uid, bp, body)
            elif path == "/api/task/save":
                self._task_save(uid, bp, body)
            elif path == "/api/task/delete":
                self._json({"ok": kiros.remove_line(bp, str(body.get("raw", "")))})
            elif path == "/api/company/save":
                name = str(body.get("name", "")).strip()
                self._json({"ok": bool(name) and kiros.add_company(bp, name)})
            elif path == "/api/project/save":
                self._project_save(uid, bp, body)
            elif path == "/api/project/delete":
                self._json({"ok": kiros.remove_front(bp, str(body.get("code", "")))})
            elif path == "/api/front/update":
                self._front_update(bp, body)
            else:
                self._send(404, b"not found", "text/plain")

    # -- auth endpoint handlers --
    def _signup(self, body: dict) -> None:
        if not self._rl("signup"):
            self._json({"error": "Too many attempts. Try again later."}, 429)
            return
        user, err = auth.signup(STORE, body.get("email", ""), body.get("name", ""), body.get("password", ""))
        if err:
            self._json({"error": err}, 400)
            return
        ensure_user_data(user["id"])
        token = auth.issue_session(STORE, user["id"])
        STORE.touch_last_seen(user["id"])
        self._json({"ok": True, "redirect": "/"}, cookies=self._auth_cookies(token))

    def _login(self, body: dict) -> None:
        email = str(body.get("email", "")).strip().lower()
        if not (self._rl("login") and RATE.allow("login-email:" + email)):
            self._json({"error": "Too many attempts. Try again later."}, 429)
            return
        user, err = auth.login(STORE, body.get("email", ""), body.get("password", ""))
        if err:
            self._json({"error": err}, 400)
            return
        ensure_user_data(user["id"])
        token = auth.issue_session(STORE, user["id"])
        STORE.touch_last_seen(user["id"])
        self._json({"ok": True, "redirect": "/"}, cookies=self._auth_cookies(token))

    def _forgot(self, body: dict) -> None:
        # Always respond identically so the endpoint can't enumerate accounts.
        token = auth.begin_reset(STORE, body.get("email", "")) if self._rl("forgot") else None
        resp = {"ok": True}
        if token:
            link = "/reset?token=%s" % token
            if DEV:                              # never log a live reset token in prod
                print("  [reset] %s -> %s" % (body.get("email", ""), link))
                resp["devResetLink"] = link
        self._json(resp)

    def _reset(self, body: dict) -> None:
        if not self._rl("reset"):
            self._json({"error": "Too many attempts. Try again later."}, 429)
            return
        uid, err = auth.complete_reset(STORE, str(body.get("token", "")), str(body.get("password", "")))
        if err:
            self._json({"error": err}, 400)
            return
        self._json({"ok": True, "redirect": "/login"})

    # -- per-user board mutations (engine calls, scoped to this user's file) --
    def _complete(self, uid: str, bp: str, body: dict) -> None:
        raw = str(body.get("raw", ""))
        done = bool(body.get("done", True))
        t = kiros.parse_task(raw)
        removed = kiros.remove_line(bp, raw)
        new_line = (raw.replace("[ ]", "[x]", 1) if done
                    else raw.replace("[x]", "[ ]", 1).replace("[X]", "[ ]", 1)).strip()
        kiros.add_task_line(bp, "done" if done else "active", new_line)
        if removed and done and t:
            front = self._board(uid).fronts.get(t.front)
            log_completion(done_file(uid), {
                "date": date.today().isoformat(),
                "ts": datetime.now().isoformat(timespec="seconds"),
                "title": t.title, "front": t.front,
                "company": front.surface if front else "", "est": t.est})
        self._json({"ok": removed})

    def _task_save(self, uid: str, bp: str, body: dict) -> None:
        task = task_from_fields(body.get("fields", {}))
        if not task.title:
            self._json({"ok": False, "error": "title required"}, 400)
            return
        lane = "delegated" if task.delegate else (body.get("lane") or "active")
        task = dataclasses.replace(task, done=(lane == "done"))
        line = kiros.format_task_line(task)
        original = body.get("originalRaw")
        moved = bool(body.get("moved")) or bool(task.delegate)
        if original and not moved and kiros.replace_line(bp, str(original), line):
            pass
        else:
            if original:
                kiros.remove_line(bp, str(original))
            kiros.add_task_line(bp, lane, line)
        save_description(desc_file(uid), task.url, str(body.get("fields", {}).get("description", "")))
        self._json({"ok": True, "raw": line})

    def _project_save(self, uid: str, bp: str, body: dict) -> None:
        name = str(body.get("name", "")).strip()
        company = str(body.get("company", "")).strip()
        if not name or not company:
            self._json({"ok": False, "error": "name and company required"}, 400)
            return
        board = self._board(uid)
        try:
            imp = int(body.get("importance", 3))
        except (TypeError, ValueError):
            imp = 3
        code = gen_front_code(board, company, name)
        kiros.add_front(bp, code, name, company, imp)
        self._json({"ok": True, "code": code})

    def _front_update(self, bp: str, body: dict) -> None:
        imp, urg, nm = body.get("importance"), body.get("urgency"), body.get("name")
        ok = kiros.update_front(bp, str(body.get("code", "")),
                                importance=int(imp) if imp is not None else None,
                                urgency=int(urg) if urg is not None else None,
                                name=str(nm).strip() if nm else None)
        self._json({"ok": ok})


def main() -> None:
    USERS_DIR.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"  Kiros (multi-user) listening on {HOST}:{PORT}  (Ctrl-C to stop)")
    if DEV:
        print("  ⚠ DEV mode: cookies not Secure + reset links exposed. Localhost only.")
    quiet = "--no-open" in sys.argv or os.environ.get("KIROS_NO_OPEN")
    if not quiet:
        threading.Timer(0.6, lambda: webbrowser.open(f"http://localhost:{PORT}")).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.")
        server.shutdown()


if __name__ == "__main__":
    main()
