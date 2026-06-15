# Kiros

A brutally minimal anti-freeze prioritization layer. Not a task app — a **filter** that shows you
the few things that matter and hides the other 99%, because the list itself is what triggers the
freeze.

Built for one specific failure loop: **overwhelm → freeze → avoidance → building easy things as a
distraction.** Every design choice below is aimed at that loop, not at "productivity" in general.

## Why this exists (the diagnosis)

Tasks were scattered across Asana, Airtable, Obsidian, and your head — 100+ assigned Asana tasks,
**almost none with a due date**, all stuck untriaged for up to two years. Three forces lock the
loop (full evidence in [`research/`](research/)):

1. **Freeze is physiological.** Under overload the prefrontal cortex — the part you'd use to
   prioritize — goes offline. So you can't be asked to calmly prioritize *in the overwhelmed
   moment*. The system pre-decides for you.
2. **Avoidance is mood repair**, and "building easy things" is its stickiest form because it pays
   out real dopamine. So the system has to make that move *lose*.
3. **The list is the trigger.** More visible undecided choices → more paralysis. So you see ≤3.

## The model: three altitudes

| Altitude | Problem | Mechanism | Cadence |
|---|---|---|---|
| **Portfolio** | too many commitments exist | Fronts, Buffett 5/25 (≤5 active) | quarterly |
| **Active set** | too much in flight now | Personal Kanban, **WIP ≤ 3** | weekly |
| **Moment** | too many visible choices | top-3 frog-first, pre-decided | daily |

A single method only ever covers one altitude — which is why nothing works alone.

## The scoring (transparent on purpose — run any command with `-v`)

```
Score = (Importance × imp_mult + DeadlinePressure) / Effort × EnergyMatch × (1 + AvoidanceBoost)
```

- **Importance** (1–5) is double-weighted so urgency can't bury strategy.
- **DeadlinePressure** ramps from "due today" up to a scream for overdue, and decays to 0 far out.
- **Effort** divides the score, so genuine quick wins surface for momentum.
- **EnergyMatch** rewards tasks that fit the energy you actually have right now.
- **AvoidanceBoost** is the keystone: anything you've dodged for days, or flagged as dread, gets
  pushed **up** — because for you, the avoided task is usually the important one hiding.

Spine borrowed from WSJF (cost-of-delay), tuned with ideas from Taskwarrior's urgency polynomial
and Amplenote's time-decaying score.

## Use it

```
python3 kiros.py today               # the ≤3 that matter, in order. Start with #1.
python3 kiros.py now --energy low --time 30   # one pick for right now
python3 kiros.py review              # weekly triage view
python3 kiros.py capture "thought"  # offload to Inbox
python3 kiros.py today -v            # show the math behind every score
```

Inside Claude Code, the same four as rituals with a coaching layer:
`/kiros-morning`, `/kiros-now`, `/kiros-review`, `/kiros-capture`.

### The web app

```
python3 kiros_web.py      # serves http://localhost:8765 and opens your browser
```

A UI over the *same* engine — no build step, no dependencies, no second source of truth. It
reads/writes `KIROS.md` through the same `kiros.py` functions the CLI uses. Three modes, on purpose:

- **Focus** — *Today* and *What now?*. *Today* shows a **right-sized daily plan**: it fills a
  `day_capacity` effort budget (S=1, M=2, L=4) so you commit to an amount you can actually finish,
  with a progress strip and a calm "That's the day ✓" state when the plan is done. *What now?*
  returns one pick by energy + time. Delegated and done tasks never appear here.
- **Manage** (the home screen) — the dense workhorse, for *triaging*: an editable table (Company,
  Project, Status, Urgency, Importance, Deadline, Effort, **Delegate-to**), an **Intake** lane to
  refine the half-formed tasks that arrive from every channel into proper ones, and a centered
  **auto-saving editor** (segmented Importance/Urgency/Effort toggles, relative-date chips,
  two-step delete, "get it done" → Active). Imported tasks carry their **description** and an **Open in Asana ↗** link
  (rich notes live in `descriptions.json`, keyed by source url; the board file stays clean). A
  **⚙ Structure** panel adds companies/contexts and adds/removes projects in-app (writes the
  `## 🏢 Companies` registry + Fronts in `KIROS.md`; contexts can exist before they have projects).
- **Stats** — day / week / month view of what you *finished* (completions logged to
  `completions.jsonl`): total, active days, a bar chart, and a by-company breakdown. Framed as a
  mirror, not a scoreboard — no streaks, no red, quiet days allowed (per the anti-shame research).
- **Matrix** — Eisenhower map of your projects: drag each onto an Importance × Urgency grid
  (Plan / Do now / Later / Delegate). A project's position sets its defaults, which flow into its
  tasks' priority scores.

Capture bar is always present. Setting a **Delegate-to** moves a task to the *Delegated* lane and
drops it out of your focus view — tracked, off your plate. Design rationale and tokens:
[research/04-ui-ux.md](research/04-ui-ux.md).

### Calendar (iCal)

Today's plan lands in Apple Calendar via a live feed at `/kiros.ics`:
- **Subscribe once** — the "＋ Add today to Calendar" button opens `webcal://localhost:8765/kiros.ics`;
  Calendar then refreshes hourly, so each day's plan (and any due-dated task on its deadline) appears
  automatically. Read-only; stable UIDs mean no duplicates. The server must be running for refreshes.
- **One-off** — "download .ics" imports today once.

Event name is **Company: Project: Task** (the middle collapses when project == company). All-day
events. For editable events in Google Calendar instead, the connected MCP can push them directly.

The daily loop reads **only** [`KIROS.md`](KIROS.md). The graveyard (Asana/Airtable) is touched
**only** during `/kiros-review`, on purpose — so choosing is never the moment of overwhelm.

## Tune it

Edit the numbers in the `⚙️ Tuning` section of `KIROS.md` and rerun — same input, same output.
`test_kiros.py` (`python3 -m unittest`) is your safety net when you change weights.

## The one rule

**v1 is done. Resist expanding it.** A task system is the most seductive meta-work there is —
clean, infinitely architectable, ships zero product. If Kiros starts getting more love than
Atmosa or Cosmic Guide, that's the 20/80 rule talking, and Kiros has become the distraction it
was built to kill. Use it. Don't rebuild it.

## The app (the "later" in hybrid, kept thin)

`kiros_web.py` + `web/` is the app stage — but deliberately a *thin shell*: the state file and
scoring engine are still the contract, and the UI only reads/writes `KIROS.md` via `kiros.py`.
There is no second brain. If a "real" framework version ever earns its keep, it's still just a
nicer skin over the same `score_task()` — let real use, not architecture, decide what it needs.
