#!/usr/bin/env python3
"""Kiros — a brutally minimal anti-freeze prioritization engine.

It reads ONE file (KIROS.md), computes a transparent urgency score per task,
and shows you only the few things that matter. The daily loop never touches the
graveyard (Asana / Airtable / Gmail) — only KIROS.md. Curation happens weekly,
on purpose, so the moment of choosing is never the moment of overwhelm.

No dependencies. Examples:
    python3 kiros.py today                 # the <=3 that matter, frog-first
    python3 kiros.py now --energy low --time 30   # one pick for right now
    python3 kiros.py review                 # weekly triage view
    python3 kiros.py capture "thing in my head"

The scoring is deliberately legible. Run any command with -v to see the math.
Tune the weights in the "Tuning" section of KIROS.md — same input, same output.
"""
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

BOARD_FILE = "KIROS.md"

# --- Defaults (overridable in the Tuning section of KIROS.md) -----------------
DEFAULT_WEIGHTS = {
    "imp_mult": 2.0,        # importance is double-weighted so urgency can't bury strategy
    "urg_mult": 1.5,        # manual urgency (1-5) — the Eisenhower lever, separate from deadline
    "deadline_max": 12.0,   # pressure for something due today
    "overdue_bonus": 6.0,   # extra scream for anything already overdue
    "deadline_horizon": 14, # days out at which deadline pressure reaches ~0
    "stale_days": 3,        # grace before "you've been avoiding this" kicks in
    "stale_boost": 0.12,    # avoidance boost added per stale day (capped)
    "stale_cap": 1.5,       # max avoidance boost from staleness alone
    "avoid_flag_boost": 0.6,  # extra boost for an explicitly flagged dread task
    "energy_bonus": 1.2,    # task energy matches the energy you have now
    "energy_penalty": 0.8,  # task energy fights the energy you have now
    "wip_cap": 3,           # how many things may be "in flight" at once
    "day_capacity": 6.0,    # effort points you can realistically finish in a day (S1 M2 L4)
}

# Effort divides the score → quick wins surface. Time-bucket codes (new) + legacy S/M/L/XL fallback.
EST_EFFORT = {"30m": 1.0, "1h": 1.5, "2h": 2.5, "4h": 4.0, "8h": 7.0, "Split": 8.0,
              "90m": 2.0, "6h": 5.0,                    # legacy buckets, still scored
              "S": 1.0, "M": 2.0, "L": 4.0, "XL": 8.0}  # legacy codes
EST_MINUTES = {"30m": 30, "1h": 60, "2h": 120, "4h": 240, "8h": 480, "Split": 480,
               "90m": 90, "6h": 360,
               "S": 20, "M": 90, "L": 240, "XL": 480}
MAX_DAY_ITEMS = 5    # never put more than this in a day's plan, even if every task is tiny
EFFORT_DEFAULT = "1h"
IMPORTANCE_DEFAULT = 3


@dataclass(frozen=True)
class Front:
    code: str
    name: str
    importance: int = IMPORTANCE_DEFAULT
    surface: str = ""
    urgency: int | None = None      # project-level urgency (Eisenhower X-axis); tasks inherit it


@dataclass(frozen=True)
class Task:
    title: str
    front: str = ""                 # the Section (front code)
    group: str = ""                 # the Project (sub-level: client / sub-project)
    importance: int | None = None   # None => inherit from front
    urgency: int | None = None      # 1-5, manual (Eisenhower); separate from deadline
    est: str = EFFORT_DEFAULT
    due: date | None = None
    energy: str = ""                # low / med / high
    added: date | None = None
    avoid: bool = False
    delegate: str = ""              # person it's handed to; drops it out of your focus view
    url: str = ""                   # source link (e.g. Asana permalink) if imported
    done: bool = False
    raw: str = ""


@dataclass(frozen=True)
class Score:
    value: float
    importance: float
    deadline: float
    effort: float
    energy_match: float
    avoidance: float
    urgency: float = 0.0

    def breakdown(self) -> str:
        return (
            f"(imp {self.importance:g} + due {self.deadline:g} + urg {self.urgency:g})"
            f" / eff {self.effort:g} x energy {self.energy_match:g}"
            f" x avoid {1 + self.avoidance:g} = {self.value:.2f}"
        )


# --- Parsing ------------------------------------------------------------------
SECTION_KEYS = {  # keyword in a "## ..." heading -> canonical bucket
    # NB: "front" precedes "compan" (the Fronts heading contains the word "Company").
    "tuning": "tuning", "front": "fronts", "compan": "companies",
    "active": "active", "today": "today", "delegat": "delegated", "inbox": "inbox",
    "parking": "parking", "done": "done",
}
# Lanes that hold workable tasks, in the order the Manage table shows them.
# "done" is a real, exclusive status: completed tasks live in the `## 🏁 Done` section.
LANES = ["inbox", "active", "today", "delegated", "parking", "done"]
TASK_RE = re.compile(r"^- \[(?P<done>[ xX])\]\s*(?:\((?P<front>[^)]*)\)\s*)?(?P<body>.+)$")
FRONT_RE = re.compile(r"^- \[(?P<code>[A-Za-z0-9_-]+)\]\s*(?P<body>.+)$")


def _split_meta(body: str) -> tuple[str, dict[str, str]]:
    """Split 'Title · key:val · key:val' into (title, {key: val})."""
    parts = [p.strip() for p in body.split("·")]
    title = parts[0].strip()
    meta: dict[str, str] = {}
    for p in parts[1:]:
        if ":" in p:
            k, v = p.split(":", 1)
            meta[k.strip().lower()] = v.strip()
    return title, meta


def _to_date(value: str) -> date | None:
    try:
        return date.fromisoformat(value)
    except (ValueError, TypeError):
        return None


def _to_bool(value: str) -> bool:
    return value.strip().lower() in {"true", "yes", "1", "y"}


def parse_front(line: str) -> Front | None:
    m = FRONT_RE.match(line.strip())
    if not m:
        return None
    name, meta = _split_meta(m.group("body"))
    imp = meta.get("importance")
    urg = meta.get("urgency")
    return Front(
        code=m.group("code").strip(),
        name=name,
        importance=int(imp) if imp and imp.isdigit() else IMPORTANCE_DEFAULT,
        surface=meta.get("surface", ""),
        urgency=int(urg) if urg and urg.isdigit() else None,
    )


def parse_task(line: str) -> Task | None:
    m = TASK_RE.match(line.strip())
    if not m:
        return None
    title, meta = _split_meta(m.group("body"))
    imp = meta.get("importance")
    urg = meta.get("urgency")
    est = meta.get("est") or EFFORT_DEFAULT
    return Task(
        title=title,
        front=(m.group("front") or meta.get("front", "")).strip(),
        group=meta.get("group", ""),
        importance=int(imp) if imp and imp.isdigit() else None,
        urgency=int(urg) if urg and urg.isdigit() else None,
        est=est if est in EST_EFFORT else EFFORT_DEFAULT,
        due=_to_date(meta.get("due", "")),
        energy=meta.get("energy", "").lower(),
        added=_to_date(meta.get("added", "")),
        avoid=_to_bool(meta.get("avoid", "")),
        delegate=meta.get("delegate", ""),
        url=meta.get("url", ""),
        done=m.group("done") in "xX",
        raw=line.strip(),
    )


@dataclass
class Board:
    weights: dict = field(default_factory=lambda: dict(DEFAULT_WEIGHTS))
    fronts: dict = field(default_factory=dict)         # code -> Front
    sections: dict = field(default_factory=dict)       # bucket -> list[Task]
    inbox_raw: list = field(default_factory=list)      # raw capture lines (no checkbox)
    companies: list = field(default_factory=list)      # company/context registry (ordered)


def parse_board(text: str) -> Board:
    board = Board()
    bucket = None
    for raw in text.splitlines():
        line = raw.rstrip()
        if line.startswith("## "):
            heading = line[3:].lower()
            bucket = next((b for kw, b in SECTION_KEYS.items() if kw in heading), None)
            continue
        if not line.strip() or bucket is None:
            continue
        if bucket == "tuning":
            mt = re.match(r"^[-*]?\s*(?P<k>[a-z_]+)\s*=\s*(?P<v>[0-9.]+)", line.strip())
            if mt and mt.group("k") in board.weights:
                board.weights[mt.group("k")] = float(mt.group("v"))
        elif bucket == "fronts":
            front = parse_front(line)
            if front:
                board.fronts[front.code] = front
        elif bucket == "companies":
            stripped = line.strip()
            if stripped.startswith("- "):
                board.companies.append(stripped[2:].strip())
        else:
            task = parse_task(line)
            if task:
                board.sections.setdefault(bucket, []).append(task)
            elif bucket == "inbox" and line.strip().startswith("- "):
                board.inbox_raw.append(line.strip()[2:].strip())
    return board


# --- Scoring (pure; the heart of the system) ----------------------------------
def deadline_pressure(task: Task, today: date, w: dict) -> float:
    if task.due is None:
        return 0.0
    days = (task.due - today).days
    if days < 0:
        return w["deadline_max"] + w["overdue_bonus"]
    if days >= w["deadline_horizon"]:
        return 0.0
    # linear ramp from deadline_max (due today) down to 0 at the horizon
    return w["deadline_max"] * (1 - days / w["deadline_horizon"])


def avoidance_boost(task: Task, today: date, w: dict) -> float:
    boost = w["avoid_flag_boost"] if task.avoid else 0.0
    if task.added is not None:
        stale = max(0, (today - task.added).days - int(w["stale_days"]))
        boost += min(stale * w["stale_boost"], w["stale_cap"])
    return boost


def energy_match(task: Task, target: str | None, w: dict) -> float:
    if not target or not task.energy:
        return 1.0
    return w["energy_bonus"] if task.energy == target else w["energy_penalty"]


def score_task(task: Task, front: Front | None, w: dict, today: date,
               target_energy: str | None = None, with_avoidance: bool = True) -> Score:
    importance = task.importance if task.importance is not None else (
        front.importance if front else IMPORTANCE_DEFAULT)
    imp_component = importance * w["imp_mult"]
    urg_val = task.urgency if task.urgency is not None else (front.urgency if front and front.urgency is not None else 0)
    urgency = urg_val * w["urg_mult"]
    deadline = deadline_pressure(task, today, w)
    effort = EST_EFFORT.get(task.est, EST_EFFORT[EFFORT_DEFAULT])
    em = energy_match(task, target_energy, w)
    avoid = avoidance_boost(task, today, w) if with_avoidance else 0.0
    value = (imp_component + deadline + urgency) / effort * em * (1 + avoid)
    return Score(value, imp_component, deadline, effort, em, avoid, urgency)


def rank(tasks: list[Task], board: Board, today: date,
         target_energy: str | None, max_minutes: int | None) -> list[tuple[Task, Score]]:
    scored = []
    for t in tasks:
        if t.done:
            continue
        if max_minutes is not None and EST_MINUTES.get(t.est, 90) > max_minutes:
            continue
        scored.append((t, score_task(t, board.fronts.get(t.front), board.weights,
                                     today, target_energy)))
    scored.sort(key=lambda pair: pair[1].value, reverse=True)
    return scored


# --- Rendering ----------------------------------------------------------------
def front_label(board: Board, code: str) -> str:
    front = board.fronts.get(code)
    return f"{code}·{front.name}" if front else (code or "—")


def render_line(idx: int, task: Task, score: Score, board: Board, verbose: bool) -> str:
    flags = " ⚠avoided" if score.avoidance > 0.3 else ""
    line = f"  {idx}. [{front_label(board, task.front)}] {task.title}{flags}"
    if verbose:
        line += f"\n       {score.breakdown()}"
    return line


def focusable(task: Task) -> bool:
    """A task can appear in the focus view only if it's yours to do right now —
    not done, not handed to someone else."""
    return not task.done and not task.delegate


def pool_for_today(board: Board) -> tuple[list[Task], str]:
    working = [t for t in board.sections.get("active", []) if focusable(t)]
    return working, "active"


def fill_day_plan(ordered_tasks: list[Task], capacity: float,
                  effort_done: float = 0.0, max_items: int = MAX_DAY_ITEMS) -> list[Task]:
    """Take ranked tasks, in order, until the day's effort budget is full — 'the right amount'.
    Always returns at least the first task (the frog), even if it alone exceeds capacity."""
    plan: list[Task] = []
    used = effort_done
    for task in ordered_tasks:
        effort = EST_EFFORT.get(task.est, EST_EFFORT[EFFORT_DEFAULT])
        if plan and (used + effort > capacity or len(plan) >= max_items):
            break
        plan.append(task)
        used += effort
    return plan


def cmd_today(board: Board, args, today: date) -> None:
    tasks, source = pool_for_today(board)
    ranked = rank(tasks, board, today, args.energy, args.time)
    n = args.n or 3
    print(f"\n  TODAY — from {source}. Do them in this order; start with #1.\n")
    if not ranked:
        print("  Nothing scored. Run a review and put a few next-actions in the active set.\n")
        return
    for i, (task, score) in enumerate(ranked[:n], 1):
        print(render_line(i, task, score, board, args.verbose))
    print(f"\n  Everything else is hidden on purpose. Frog first: do #1 before anything new.\n")


def cmd_now(board: Board, args, today: date) -> None:
    tasks, _ = pool_for_today(board)
    if not tasks:
        tasks = board.sections.get("backlog", [])
    ranked = rank(tasks, board, today, args.energy, args.time)
    print()
    if not ranked:
        print("  Nothing fits. If truly stuck: capture the noise, then pick the smallest real thing.\n")
        return
    task, score = ranked[0]
    print(f"  → {task.title}   [{front_label(board, task.front)}]")
    reasons = []
    if score.deadline >= board.weights["deadline_max"]:
        reasons.append("it's due now / overdue")
    if score.avoidance > 0.3:
        reasons.append("you've been avoiding it — that's the signal, not a reason to wait")
    if score.importance >= 4 * board.weights["imp_mult"]:
        reasons.append("it's high-importance")
    if task.est in ("S",):
        reasons.append("it's small — momentum")
    print(f"    why: {'; '.join(reasons) or 'highest score on the board right now'}.")
    print(f"    shrink it: do just the first 2 minutes. Then decide if you continue.")
    if args.verbose:
        print(f"    {score.breakdown()}")
    print()


def cmd_review(board: Board, args, today: date) -> None:
    w = board.weights
    active = [t for t in board.sections.get("active", []) if not t.done]
    backlog = [t for t in board.sections.get("backlog", []) if not t.done]
    inbox = board.sections.get("inbox", [])
    cap = int(w["wip_cap"])
    print("\n  WEEKLY REVIEW\n  " + "-" * 40)
    status = "OK" if len(active) <= cap else f"OVER by {len(active) - cap} — finish or park one"
    print(f"  WIP: {len(active)}/{cap} active  [{status}]")
    print(f"  Inbox to triage: {len(inbox)}   Backlog: {len(backlog)}")

    print("\n  Fronts (Buffett 5/25 — keep active battles to ~5):")
    counts: dict[str, int] = {}
    for t in active + backlog:
        counts[t.front] = counts.get(t.front, 0) + 1
    for code, front in board.fronts.items():
        print(f"    [{code}] {front.name}  (imp {front.importance}, {counts.get(code, 0)} open)")

    aging = sorted(
        ((t, avoidance_boost(t, today, w)) for t in active + backlog),
        key=lambda p: p[1], reverse=True)
    aging = [(t, b) for t, b in aging if b > 0.3]
    print("\n  ⚠ Aging / avoided — these are usually the important ones hiding:")
    if not aging:
        print("    (none — clean)")
    for t, b in aging[:7]:
        age = f"{(today - t.added).days}d" if t.added else "flagged"
        print(f"    · [{front_label(board, t.front)}] {t.title}  ({age})")
    print("\n  For each: do / delegate / defer / DELETE. Be ruthless. Then set the active 3.\n")


_ONELINE = re.compile(r"[\r\n\t]+")


def _oneline(s: str) -> str:
    """Collapse newlines/tabs/CR to a single space. The board is one task per line;
    an embedded newline would split a task into a corrupt fragment (losing its meta)
    and orphan the tail. This is the write-boundary guard against that — the UI's
    single-line <input> already strips newlines, but a crafted/buggy API call must
    not be able to corrupt the file either ("never trust external data")."""
    return _ONELINE.sub(" ", s or "")


def add_capture(path: str, text: str) -> bool:
    """Append a raw capture under the Inbox heading. Returns False if there's nothing to add.
    Shared by the CLI `capture` command and the web UI — the engine owns the file format."""
    text = _oneline(text).strip()
    if not text:
        return False
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    out, inserted = [], False
    for line in lines:
        out.append(line)
        if not inserted and line.startswith("## ") and "inbox" in line.lower():
            out.append(f"- {text}")
            inserted = True
    if not inserted:  # no inbox section yet — append one
        out += ["", "## 📥 Inbox", f"- {text}"]
    Path(path).write_text("\n".join(out) + "\n", encoding="utf-8")
    return True


def format_task_line(task: Task) -> str:
    """Inverse of parse_task — render a Task back to a KIROS.md line. Used by the web UI
    for create/edit so the file stays the single source of truth (round-trips with parse_task)."""
    box = "[x]" if task.done else "[ ]"
    # Keep every value single-line: '·' is the meta separator, and \n/\r/\t would
    # split the row. _oneline() is the corruption guard at the write boundary.
    title = _oneline(task.title).replace("·", "-").strip()
    front = _oneline(task.front).strip()
    head = f"- {box} ({front}) {title}" if front else f"- {box} {title}"
    meta: list[str] = []
    if task.importance is not None:
        meta.append(f"importance:{task.importance}")
    if task.urgency is not None:
        meta.append(f"urgency:{task.urgency}")
    meta.append(f"est:{task.est}")
    if task.due:
        meta.append(f"due:{task.due.isoformat()}")
    if task.energy:
        meta.append(f"energy:{task.energy}")
    if task.group:
        meta.append(f"group:{_oneline(task.group).replace('·', '-').strip()}")
    if task.delegate:
        meta.append(f"delegate:{_oneline(task.delegate).replace('·', '-').strip()}")
    if task.url:
        meta.append(f"url:{_oneline(task.url).replace('·', '-').strip()}")
    if task.added:
        meta.append(f"added:{task.added.isoformat()}")
    if task.avoid:
        meta.append("avoid:true")
    return head + (" · " + " · ".join(meta) if meta else "")


def add_task_line(path: str, bucket_keyword: str, line: str) -> bool:
    """Insert a task line right under the heading whose text contains bucket_keyword
    (e.g. 'active', 'backlog', 'delegated'). Appends a new section if none matches."""
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    out, inserted = [], False
    for ln in lines:
        out.append(ln)
        if not inserted and ln.startswith("## ") and bucket_keyword in ln.lower():
            out.append(line)
            inserted = True
    if not inserted:
        out += ["", f"## {bucket_keyword.title()}", line]
    Path(path).write_text("\n".join(out) + "\n", encoding="utf-8")
    return inserted


def replace_line(path: str, original_raw: str, new_line: str) -> bool:
    """Replace the first line exactly matching original_raw with new_line, in place (no reorder).
    Used by auto-save so editing a task doesn't shuffle the file on every keystroke."""
    target = original_raw.strip()
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    out, changed = [], False
    for ln in lines:
        if not changed and ln.strip() == target:
            out.append(new_line)
            changed = True
        else:
            out.append(ln)
    if changed:
        Path(path).write_text("\n".join(out) + "\n", encoding="utf-8")
    return changed


def remove_line(path: str, raw: str) -> bool:
    """Delete the first line that exactly matches raw (task line or '- capture'). Returns True if removed."""
    target = raw.strip()
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    out, removed = [], False
    for ln in lines:
        if not removed and ln.strip() == target:
            removed = True
            continue
        out.append(ln)
    if removed:
        Path(path).write_text("\n".join(out) + "\n", encoding="utf-8")
    return removed


def reorder_section(path: str, bucket_keyword: str, ordered_raws: list[str]) -> bool:
    """Reorder the task lines inside the section whose heading contains bucket_keyword
    (e.g. 'active', 'today') so they match ordered_raws — that section's tasks in their
    new top-to-bottom order. This is how a manual / custom sort is persisted: the file's
    line order *is* the custom order. Non-task lines (comments, blanks) keep their place;
    the task lines just permute among their existing slots.

    Only OPEN ('- [ ]') task lines are reordered — completed ('- [x]') lines that linger
    in a lane keep their slot (the board shows them in the Done column, not the lane, so a
    column reorder must not move them). Returns False without writing if ordered_raws isn't
    an exact permutation of the section's open task lines (guards against dropping or
    duplicating a task) or the section is missing; returns True (no write) when already
    in that order."""
    targets = [r.strip() for r in ordered_raws]
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    start = next((i for i, ln in enumerate(lines)
                  if ln.startswith("## ") and bucket_keyword in ln.lower()), None)
    if start is None:
        return False
    end = next((j for j in range(start + 1, len(lines)) if lines[j].startswith("## ")),
               len(lines))
    slots = []
    for k in range(start + 1, end):
        m = TASK_RE.match(lines[k].strip())
        if m and m.group("done") == " ":        # open tasks only; '[x]' lines stay put
            slots.append(k)
    current = [lines[k].strip() for k in slots]
    if sorted(current) != sorted(targets):       # same task set, just reordered — or refuse
        return False
    if current == targets:                        # already arranged — nothing to write
        return True
    for k, raw in zip(slots, targets):
        lines[k] = raw
    Path(path).write_text("\n".join(lines) + "\n", encoding="utf-8")
    return True


def add_company(path: str, name: str) -> bool:
    """Add a company/context to the registry section. Returns False if blank or duplicate."""
    name = name.strip()
    if not name:
        return False
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    bucket = None
    for ln in lines:                       # dedupe within the Companies section only
        if ln.startswith("## "):
            bucket = "companies" if ("compan" in ln.lower() and "front" not in ln.lower()) else None
        elif bucket == "companies" and ln.strip().startswith("- ") \
                and ln.strip()[2:].strip().lower() == name.lower():
            return False
    out, inserted = [], False
    for ln in lines:
        out.append(ln)
        if not inserted and ln.startswith("## ") and "compan" in ln.lower() and "front" not in ln.lower():
            out.append(f"- {name}")
            inserted = True
    if not inserted:                       # no registry yet — create one just before Fronts
        out, inserted = [], False
        for ln in lines:
            if ln.startswith("## ") and "front" in ln.lower() and not inserted:
                out.extend(["## 🏢 Companies", f"- {name}", ""])
                inserted = True
            out.append(ln)
        if not inserted:
            out.extend(["", "## 🏢 Companies", f"- {name}"])
    Path(path).write_text("\n".join(out) + "\n", encoding="utf-8")
    return True


def format_front_line(code: str, name: str, surface: str, importance: int, urgency=None) -> str:
    parts = [f"importance:{int(importance)}"]
    if urgency is not None:
        parts.append(f"urgency:{int(urgency)}")
    parts.append(f"surface:{surface}")
    return f"- [{code}] {name} · " + " · ".join(parts)


def add_front(path: str, code: str, name: str, surface: str, importance: int) -> bool:
    """Add a project (front) under its company's '### {surface}' group, creating the group if new."""
    line = format_front_line(code, name, surface, importance)
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    sub = f"### {surface}"
    out, inserted = [], False
    for ln in lines:
        out.append(ln)
        if not inserted and ln.strip() == sub:
            out.append(line)
            inserted = True
    if not inserted:                       # new company group — add at the end of the Fronts section
        out, inserted, in_fronts = [], False, False
        for ln in lines:
            if ln.startswith("## ") and in_fronts and not inserted:
                out.extend([sub, line, ""])
                inserted = True
            out.append(ln)
            if ln.startswith("## "):
                in_fronts = "front" in ln.lower()
        if not inserted:                   # Fronts is the last section
            out.extend([sub, line])
    Path(path).write_text("\n".join(out) + "\n", encoding="utf-8")
    return True


def remove_front(path: str, code: str) -> bool:
    """Delete a project (front) line by its code."""
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    out, removed = [], False
    for ln in lines:
        m = FRONT_RE.match(ln.strip())
        if not removed and m and m.group("code") == code:
            removed = True
            continue
        out.append(ln)
    if removed:
        Path(path).write_text("\n".join(out) + "\n", encoding="utf-8")
    return removed


def update_front(path: str, code: str, importance=None, urgency=None, name=None) -> bool:
    """Update a front (section) in place — importance, urgency, and/or name (keeps surface).
    Any arg left None is preserved. Used by the Matrix (imp/urg) and the Structure panel (name/imp)."""
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    out, changed = [], False
    for ln in lines:
        front = parse_front(ln.strip())
        if not changed and front and front.code == code:
            new_imp = front.importance if importance is None else int(importance)
            new_urg = front.urgency if urgency is None else int(urgency)
            new_name = front.name if name is None else str(name).strip()
            out.append(format_front_line(code, new_name, front.surface, new_imp, new_urg))
            changed = True
        else:
            out.append(ln)
    if changed:
        Path(path).write_text("\n".join(out) + "\n", encoding="utf-8")
    return changed


def rename_company(path: str, old: str, new: str) -> bool:
    """Rename a company everywhere: its registry entry, its '### {surface}' front group,
    and every front's surface. Returns False on blank input or a no-op rename."""
    old, new = old.strip(), new.strip()
    if not old or not new or old == new:
        return False
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    out, bucket, changed = [], None, False
    for ln in lines:
        stripped = ln.strip()
        if ln.startswith("## "):
            bucket = "companies" if ("compan" in ln.lower() and "front" not in ln.lower()) else None
        if bucket == "companies" and stripped.startswith("- ") and stripped[2:].strip() == old:
            out.append(f"- {new}")
            changed = True
            continue
        if stripped == f"### {old}":
            out.append(f"### {new}")
            changed = True
            continue
        front = parse_front(stripped)
        if front and front.surface == old:
            out.append(format_front_line(front.code, front.name, new, front.importance, front.urgency))
            changed = True
            continue
        out.append(ln)
    if changed:
        Path(path).write_text("\n".join(out) + "\n", encoding="utf-8")
    return changed


def remove_company(path: str, name: str) -> bool:
    """Remove a company: its registry entry, its '### {surface}' heading, and every front
    under it. Tasks keep their code but lose the section mapping. False if name is blank."""
    name = name.strip()
    if not name:
        return False
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    out, bucket, changed = [], None, False
    for ln in lines:
        stripped = ln.strip()
        if ln.startswith("## "):
            bucket = "companies" if ("compan" in ln.lower() and "front" not in ln.lower()) else None
        if bucket == "companies" and stripped.startswith("- ") and stripped[2:].strip() == name:
            changed = True
            continue
        if stripped == f"### {name}":
            changed = True
            continue
        front = parse_front(stripped)
        if front and front.surface == name:
            changed = True
            continue
        out.append(ln)
    if changed:
        Path(path).write_text("\n".join(out) + "\n", encoding="utf-8")
    return changed


def purge_companies(path: str, names) -> int:
    """Remove the given companies wholesale — registry entries, '### {surface}'
    headings, their fronts, AND every task that lives under those fronts — in a
    single rewrite. Used to retire the starter EXAMPLE board once a user sets up
    their own contexts in onboarding. Unlike remove_company (which keeps tasks
    but drops their section mapping, orphaning them), this leaves no dangling
    task lines behind. Returns the number of lines removed.

    `names` is any iterable of company (surface) names; matching is exact after
    strip. Section headings ('## …') and companies not named are left intact."""
    targets = {n.strip() for n in names if n and n.strip()}
    if not targets:
        return 0
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    # Pass 1: map each front code to its company so task lines — which name only
    # their code, never the company — can still be matched to a target company.
    code_company = {}
    for ln in lines:
        front = parse_front(ln.strip())
        if front and front.code:
            code_company[front.code] = front.surface
    # Pass 2: drop the targets' registry entries, headings, fronts, and tasks.
    out, bucket, removed = [], None, 0
    for ln in lines:
        stripped = ln.strip()
        if ln.startswith("## "):
            bucket = "companies" if ("compan" in ln.lower() and "front" not in ln.lower()) else None
        if bucket == "companies" and stripped.startswith("- ") and stripped[2:].strip() in targets:
            removed += 1
            continue
        if stripped.startswith("### ") and stripped[4:].strip() in targets:
            removed += 1
            continue
        front = parse_front(stripped)
        if front and front.surface in targets:
            removed += 1
            continue
        task = parse_task(stripped)
        if task and code_company.get(task.front) in targets:
            removed += 1
            continue
        out.append(ln)
    if removed:
        Path(path).write_text("\n".join(out) + "\n", encoding="utf-8")
    return removed


def toggle_task_done(path: str, raw: str, done: bool = True) -> bool:
    """Flip a task line's checkbox by exact raw-line match. Returns True if it changed."""
    target = raw.strip()
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    out, changed = [], False
    for line in lines:
        if not changed and line.strip() == target:
            line = (line.replace("[ ]", "[x]", 1) if done
                    else line.replace("[x]", "[ ]", 1).replace("[X]", "[ ]", 1))
            changed = True
        out.append(line)
    if changed:
        Path(path).write_text("\n".join(out) + "\n", encoding="utf-8")
    return changed


def cmd_capture(board: Board, args, today: date, path: str) -> None:
    text = " ".join(args.text).strip()
    if add_capture(path, text):
        print(f"  Captured → Inbox: {text}")
    else:
        print("  Nothing to capture.")


def cmd_list(board: Board, args, today: date) -> None:
    for bucket in ("active", "backlog"):
        tasks = board.sections.get(bucket, [])
        if not tasks:
            continue
        print(f"\n  {bucket.upper()}")
        for i, (task, score) in enumerate(rank(tasks, board, today, args.energy, args.time), 1):
            print(render_line(i, task, score, board, args.verbose))
    print()


def build_parser() -> argparse.ArgumentParser:
    # Shared flags live on a parent so they work before OR after the subcommand.
    # default=SUPPRESS is load-bearing: without it, a subparser's default would
    # silently clobber a value the parent already parsed (the argparse gotcha).
    # Real defaults are applied once, post-parse, in main().
    s = argparse.SUPPRESS
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("-f", "--file", default=s, help="board file (default KIROS.md)")
    common.add_argument("-v", "--verbose", action="store_true", default=s, help="show the math")
    common.add_argument("--energy", choices=["low", "med", "high"], default=s, help="energy now")
    common.add_argument("--time", type=int, default=s, help="minutes available (filters effort)")
    common.add_argument("-n", type=int, default=s, help="how many to show (today)")

    p = argparse.ArgumentParser(parents=[common],
                                description="Kiros — minimal anti-freeze prioritization.")
    sub = p.add_subparsers(dest="cmd")
    for name in ("today", "now", "review", "list"):
        sub.add_parser(name, parents=[common])
    cap = sub.add_parser("capture", parents=[common])
    cap.add_argument("text", nargs="+")
    return p


def main(argv: list[str]) -> int:
    args = build_parser().parse_args(argv)
    # Apply real defaults for any shared flag not supplied at either parser level.
    for key, val in (("file", BOARD_FILE), ("verbose", False),
                     ("energy", None), ("time", None), ("n", None)):
        if not hasattr(args, key):
            setattr(args, key, val)
    today = date.today()
    try:
        with open(args.file, "r", encoding="utf-8") as fh:
            board = parse_board(fh.read())
    except FileNotFoundError:
        print(f"  No board at {args.file}. Create it (see README) and try again.")
        return 1
    cmd = args.cmd or "today"
    if cmd == "capture":
        cmd_capture(board, args, today, args.file)
    else:
        {"today": cmd_today, "now": cmd_now, "review": cmd_review, "list": cmd_list}[cmd](
            board, args, today)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
