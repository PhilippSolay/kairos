# Kiros — Product Brief

**An anti-freeze task manager.** It doesn't help you *organize* work — it gets you to *start* it.

---

## The problem

Most productivity tools assume the bottleneck is organizing tasks. For a large group of people, it isn't — the bottleneck is **starting** them.

- A long list triggers **decision paralysis**: every visible task is a choice, and a screen of 20 tasks is 20 choices to make before doing anything. The brain responds by doing nothing.
- Avoidance compounds into a **shame loop** — skipped tasks pile up, guilt grows, and the guilt makes you avoid them more.
- Tools like Asana, Todoist, and Notion are excellent at *capture* and *structure*, but for freeze-prone users they can make it worse: more lists, more fields, more places to look, more to decide.

The result is a familiar failure mode: a perfectly organized backlog you can't make yourself move on.

## The insight

**For freeze-prone work, starting is the entire battle.** So the whole system is engineered to remove the four things that cause freeze: the *deciding*, the *cost of starting*, the *ambiguity of the first move*, and the *shame* that feeds avoidance.

## How Kiros solves it

- **One thing today.** The Today screen shows a single next action — *"your one thing today"* — chosen for you by the scoring engine. Nothing to decide, only to begin.
- **A 2-minute start.** The commitment is framed as trivially small ("start with just 2 minutes — that's the whole commitment"), backed by a live timer. The barrier to entry collapses.
- **The first move, named.** It says *"open it and make the first move"* — a concrete first action (an implementation intention), not a vague "work on this."
- **Avoidance as a signal, not a failure.** A task you keep circling gets surfaced and prioritized with a gentle nudge — *"you've circled this N days — that's the signal, not a reason to wait"* — never a guilt trip.
- **A right-sized day.** A daily capacity plus an effort meter (hours against an ~8h cap, red when you overcommit) keeps the day realistic and "done" actually reachable.
- **One source of truth.** A single board, with frictionless capture to an Inbox, so open loops leave your head and stop generating background anxiety.
- **A mirror, not a scoreboard.** Stats reflect what you actually finished; quiet days are allowed. Nothing punishes a slow day, so the system stays safe to return to.

## The surfaces

- **Board** — kanban by status (Parked · Inbox · Active · Today · Done); drag to move.
- **Matrix** — the Eisenhower grid, Importance ↑ × Urgency →; drag to re-weight.
- **Today** — your one thing, a 2-minute start, the day's effort bar, and progress.
- **Next** — "give me one thing" filtered by your energy and available time.
- **Stats** — finished vs. left-open (by company), streak, hours done, and where work is piling up.

## What makes it different

- Built around **starting**, not organizing.
- **Opinionated constraints** (one thing at a time, WIP ≤ 3, a right-sized day) instead of infinite flexibility that reintroduces choice overload.
- A **calm, shame-free tone** by design — the anti-anxiety stance is a feature, not decoration.
- Grounded in **behavioral science**: paradox of choice, eat-the-frog, the 2-minute rule, implementation intentions, the Zeigarnik effect, and the progress principle.

## Under the hood

- The board is a single **human-readable markdown file** — portable, inspectable, no lock-in.
- A **deterministic scoring engine** ranks tasks by importance × urgency × deadline pressure, with boosts for avoidance and staleness.
- **Python standard-library** backend + **vanilla JS/HTML/CSS** frontend — no framework, no build step, fast and durable.
- **Self-hosted, single-user, private.**

---

> **In one line:** Kiros turns *"I have 40 things and can't move"* into *"here's the one thing — start for 2 minutes."*
