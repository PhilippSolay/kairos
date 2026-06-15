# 03 — Tools Survey: Task-Management Systems for the Overwhelm-Freeze Operator

**Date:** 2026-06-06
**Author:** Research pass for Kiros
**Brief:** Survey existing task-management tools (OSS first, commercial for inspiration) for a systems-thinker / architect / designer running **two companies** with many concurrent projects. Failure mode: overwhelmed → freezes → avoids important work → builds easy distractions. He wants a system that **ingests all his tasks** and helps **assess priority / importance / deadlines** and **keeps him on top of things WITHOUT adding overwhelm.**

**Already-connected stack (integration matters):** Asana, Obsidian, Google Calendar, Gmail, Airtable, Google Drive. He is technical and could self-host or build.

---

## 0. TL;DR

- **The dedicated "AI task prioritizer" repos on GitHub are not worth forking.** Every match (`Task-Prioritizer`, `octofocus`, `ai-task-prioritizer`, `Eisenhower-Matrix-AI`, etc.) is a 0-star solo/hackathon project. There is no battle-tested open-source "AI prioritization brain" to adopt.
- **The valuable open-source IP is the *scoring algorithms*, not the apps.** Taskwarrior's urgency polynomial and Amplenote's Task Score are the two clearest, most stealable models of "rank everything automatically so the human doesn't have to."
- **Amazing Marvin is the design bible** for this exact user: it is explicitly built around procrastination psychology and a modular, opt-in "strategies" catalog. Mine it heavily; don't buy it (closed-source, can't be the brain over his stack).
- **Recommendation (preview):** Don't fork a PM app and don't build a full task app. **Orchestrate his existing stack** — Asana as the task store, Calendar as the schedule, Obsidian as the thinking/planning surface — with **Claude (via MCP) as the prioritization brain**, implementing a Taskwarrior-style transparent urgency score and Marvin-style daily-list ritual. Borrow Leantime's neurodivergent-design philosophy as the UX north star. Full reasoning in §6.

---

## 1. Open-Source Task / PM Tools

Stars and `updatedAt` pulled live from GitHub on 2026-06-06.

### Taskwarrior — `GothenburgBitFactory/taskwarrior`
- **Stars / activity:** 5.8k ★, actively maintained (commit 2026-06-05). TUI front-end `kdheepak/taskwarrior-tui` (2.0k ★).
- **What it is:** CLI task manager. Plain-text/SQLite store, scriptable, huge plugin ecosystem (Taskserver sync, vit, taskwarrior-tui, hooks).
- **License:** MIT. **Self-hostable:** yes (local-first; optional sync server). **AI:** none native.
- **Killer feature for us — the urgency algorithm.** Urgency is a **transparent, tunable polynomial**: a sum of weighted terms, e.g. `next=15.0`, `due=12.0`, `blocking=8.0`, `priority=6.0`, `scheduled=5.0`, `active=4.0`, `age=2.0` (capped at 365 days), `blocked=-5.0`, `waiting=-3.0`. Tags/annotations are dampened by count (0.8 for one, 0.9 for two, 1.0 for 3+). Every coefficient is user-editable. ([urgency docs](https://taskwarrior.org/docs/urgency/))
- **Strengths:** The single best open, explainable model of automatic ranking. Local-first, hackable, durable.
- **Weaknesses:** CLI-only (a designer will not live here); no calendar/Asana/Obsidian integration out of the box; no "daily list / reduce-overwhelm" UX; date-only urgency (`due` ignores time of day).
- **Fit / adaptability:** **High as an algorithm to port, low as an app to adopt.** Steal the polynomial; don't make him learn `task add`.

### Vikunja — `go-vikunja/vikunja`
- **Stars / activity:** 4.5k ★, very active (2026-06-05). Go backend + Vue frontend, mobile app (MIT).
- **What it is:** Self-hosted to-do / PM app. List, Gantt, Table, Kanban, Calendar views; labels, priorities, reminders, saved filters; CalDAV; webhooks + REST API.
- **License:** AGPL-3.0 (frontend + backend). **Self-hostable:** yes (Docker). **AI:** none.
- **Strengths:** Clean modern UI, strong API, CalDAV sync to Google Calendar, multi-view. The most "product-grade" self-hostable generic to-do.
- **Weaknesses:** AGPL (matters if he ever wants to wrap/redistribute commercially). No prioritization intelligence — priority is a manual field. No Asana/Obsidian bridges.
- **Fit:** Good *task store* candidate if he wanted to replace Asana with OSS. But he already has Asana; adding Vikunja adds a tool, not intelligence.

### Super Productivity — `super-productivity/super-productivity`
- **Stars / activity:** **19.9k ★**, extremely active (2026-06-06). MIT.
- **What it is:** Local-first desktop/web to-do with **integrated time-boxing + time tracking**, Pomodoro, and sync/import from Jira, GitLab, GitHub, OpenProject, Gitea.
- **License:** MIT (permissive — fork-friendly). **Self-hostable:** local-first (data is yours); optional WebDAV/Dropbox sync. **AI:** none native.
- **Strengths:** MIT + huge community + active dev = the **most forkable serious app** here. Time-boxing and "schedule" view, focus mode, anti-burnout breaks. Plugin system added recently.
- **Weaknesses:** No Asana/Calendar two-way (issue-tracker oriented), no Obsidian, no prioritization brain. UI is feature-dense (could *add* overwhelm).
- **Fit:** Best fork base **if** building a desktop app is the path. Time-boxing aligns with the Calendar-as-truth idea.

### AppFlowy — `AppFlowy-IO/AppFlowy`
- **Stars / activity:** **71.9k ★**, daily commits. AGPL-3.0. Rust + Flutter. `AppFlowy-Cloud` for self-host sync.
- **What it is:** Open-source Notion alternative — docs, databases, kanban, "AI collaborative workspace."
- **License:** AGPL-3.0. **Self-hostable:** yes (AppFlowy Cloud). **AI:** yes — built-in AI (local Ollama or cloud models) for writing/Q&A.
- **Strengths:** Most mature OSS Notion clone, local-first, native AI, big momentum.
- **Weaknesses:** It's a *workspace*, not a prioritization engine. Adopting it = migrating off Notion/Obsidian, large surface area, more to manage. AGPL.
- **Fit:** Overkill. He doesn't need another second-brain workspace; he has Obsidian.

### Focalboard — `mattermost-community/focalboard`
- **Stars / activity:** 26.2k ★ but **effectively in maintenance** — folded into Mattermost; the community repo is the surviving thread. Custom license.
- **What it is:** Self-hosted Trello/Notion/Asana alternative; boards, cards, properties, views.
- **Self-hostable:** yes. **AI:** none.
- **Strengths:** Solid kanban data model.
- **Weaknesses:** Stalled momentum, license friction, no intelligence. **Skip** — Planka is the livelier kanban choice.

### Planka — `plankanban/planka`
- **Stars / activity:** 12.1k ★, very active. License: AGPL-3.0 (docs) / custom (core).
- **What it is:** Self-hosted Trello clone (boards, cards, labels, due dates, real-time).
- **AI:** none. **Self-hostable:** yes.
- **Fit:** Clean kanban, but a board is the *wrong* primary surface for this user — boards show everything at once (overwhelm). Not a prioritizer.

### Kanboard — `kanboard/kanboard`
- **Stars / activity:** 9.6k ★, active. **MIT.** PHP.
- **What it is:** Minimalist kanban with WIP limits, automation rules, a plugin API.
- **Strengths:** MIT, lightweight, WIP limits (good anti-overwhelm primitive), automations.
- **Weaknesses:** Dated UX; PHP; no prioritization/AI; no Obsidian/Asana.
- **Fit:** WIP-limit idea is worth stealing; the app itself is not the move.

### Leantime — `Leantime/leantime`
- **Stars / activity:** ~10k ★, very active (2026-06-06). AGPL-3.0. PHP.
- **What it is:** Goals-focused PM **explicitly built for non-PMs and neurodivergent minds (ADHD, autism, dyslexia).**
- **License:** AGPL-3.0. **Self-hostable:** yes (≈1 hr on-prem). **AI:** some AI assist features in newer releases.
- **Killer angle for us:** This is the only mainstream OSS PM tool designed around *executive dysfunction*. Strategy → goals → milestones cascade ("what am I doing and *why*"); iCal import to **time-block tasks between meetings**; and a **dopamine-aware prioritization** where tasks are rated on an emoji interest scale (angry face → unicorn) and the system *pairs* boring tasks with interesting ones to make them tackle-able.
- **Strengths:** Philosophy is a near-perfect match for the overwhelm-freeze user; goals cascade fights "lost in the weeds"; self-hostable.
- **Weaknesses:** Team/PM-shaped (heavier than a personal system); PHP/AGPL; another tool to run alongside Asana.
- **Fit:** **Adopt the *philosophy and feature ideas* even if not the app.** Strongest single source of neurodivergent-design patterns in OSS.

### Tracks (GTD) — `eyecreate/tracks` (Docker of TracksApp)
- **Stars / activity:** essentially dead (last meaningful activity ~2018). GPL-2.0. Ruby on Rails.
- **What it is:** Classic GTD web app (contexts, next actions, projects).
- **Fit:** **Skip.** Historically important GTD reference; abandoned. Steal the *GTD model* (contexts, next-action) conceptually, not the code.

### Nextcloud Tasks / Deck
- **What they are:** Tasks = CalDAV to-do app inside Nextcloud; Deck = kanban (with Android client `stefan-niedermann/nextcloud-deck`, 558 ★). GPL/AGPL.
- **Self-hostable:** yes (whole point). **AI:** none core.
- **Strengths:** CalDAV means native Google-Calendar-style sync; good if already running Nextcloud.
- **Weaknesses:** Only compelling inside a Nextcloud deployment; no intelligence; he isn't on Nextcloud. **Low fit.**

### Org-mode / org-agenda / org-roam — `org-roam/org-roam` (6.0k ★) + Emacs Org
- **What it is:** Emacs plain-text powerhouse. `org-agenda` aggregates TODOs across files with deadlines/scheduled/priority; org-roam adds Zettelkasten links; `org-super-agenda` groups the agenda intelligently.
- **License:** GPL. **Self-hostable:** local files. **AI:** via packages (gptel etc.).
- **Strengths:** The most powerful *text-native* task+knowledge system in existence; agenda views, priority cookies `[#A]`, effort estimates, clocking. Plain-text = forever-yours.
- **Weaknesses:** **Emacs.** Steep, idiosyncratic; poor mobile; no Asana/Calendar/Gmail without glue. A designer is unlikely to adopt Emacs.
- **Fit:** Philosophically aligned (plain-text, aggregation, agenda), practically a hard sell. Obsidian + Tasks is the "org-agenda for normal humans."

### Logseq — `logseq/logseq`
- **Stars / activity:** 43.2k ★, active (DB version rewrite ongoing). AGPL-3.0.
- **What it is:** Outliner PKM (Roam-like) with native `TODO/DOING/NOW`, scheduled/deadline, and a **built-in query language** for agenda-style task rollups.
- **Self-hostable:** local files. **AI:** plugins.
- **Strengths:** Tasks + knowledge in one outliner; queries can build a prioritized agenda.
- **Weaknesses:** It's a *second* Obsidian — he already has Obsidian. No reason to split.
- **Fit:** Redundant with his Obsidian investment.

### SilverBullet — `silverbulletmd/silverbullet`
- **Stars / activity:** 5.4k ★, active. **MIT.**
- **What it is:** Self-hosted, Markdown-based "personal productivity platform" with **Lua scripting** and live queries over your notes (incl. tasks).
- **Self-hostable:** yes (server). **AI:** plugin ("SilverBullet AI").
- **Strengths:** MIT + scriptable + web-based (works on phone) + query engine over Markdown. A genuinely interesting **"programmable Obsidian on a server"** — you can script a prioritization view in Lua.
- **Weaknesses:** Smaller ecosystem; would be a parallel to Obsidian unless he migrates.
- **Fit:** Interesting dark-horse if he wanted a *server-side, scriptable* surface for the prioritization dashboard. Otherwise secondary to Obsidian.

### Markwhen — `mark-when/markwhen`
- **Stars / activity:** 4.8k ★, active. MIT. Obsidian plugin exists (434 ★).
- **What it is:** Markdown-like text → cascading **timeline / Gantt**.
- **Fit:** A *visualization* primitive, not a task system. Useful if he wants a "deadlines on a timeline" view *inside Obsidian*. Steal as a view, not a system.

---

## 2. Obsidian Ecosystem — Can the whole workflow live in Obsidian?

He already uses Obsidian, so this is the highest-leverage "build thin" surface.

| Plugin | Repo | ★ | What it gives | Role in a prioritization workflow |
|---|---|---|---|---|
| **Tasks** | `obsidian-tasks-group/obsidian-tasks` (MIT) | 3.8k | Inline `- [ ]` tasks with due/scheduled/start/priority/recurrence, global queries across vault | The **task layer**. Priority emojis (🔺⏫🔼🔽⏬), due 📅, scheduled ⏳, start 🛫 — enough metadata to compute urgency |
| **Dataview** | `blacksmithgu/obsidian-dataview` (MIT) | 9.0k | SQL-like + JS query engine over notes/tasks | The **agenda/dashboard engine** — build "Today," "Overdue," "Top 5 by score" views |
| **Datacore** | `blacksmithgu/datacore` (MIT) | 2.2k | Faster, React-based Dataview successor (WIP) | Future-proof, interactive dashboards (sortable/clickable) |
| **Projects** | `obsmd-projects/obsidian-projects` (Apache-2.0) | 1.9k | Notion-style Table/Board/Calendar/Gallery over notes | Multi-view over projects/tasks without leaving Obsidian |
| **Kanban** | `obsidian-community/obsidian-kanban` (GPL-3.0) | 4.3k | Markdown-backed boards | Optional board view of the same tasks |
| **Day Planner** | `ivan-lednev/obsidian-day-planner` (MIT) | 2.6k | Timeline/time-blocking from tasks, **Google Calendar (ICS) overlay** | The **time-boxing surface** — drag tasks onto a day, see them next to calendar events |
| **Tasks Calendar / Timeline** | `702573N/Obsidian-Tasks-Calendar` (941★) & `-Timeline` (513★) | — | Pretty calendar/timeline views fed by Tasks + Dataview | Low-overwhelm visual surfaces |
| **Reminder** | `obsidian reminder` | — | Notifications for dated tasks | Nudges (the "keeps me on top of things" piece) |
| **Khoj** (see §3) | `khoj-ai/khoj` | 34.9k | AI over the vault, scheduled automations | The **AI brain inside Obsidian** |

**Verdict:** **Yes — a prioritization workflow can live almost entirely in Obsidian.** `Tasks` (capture + metadata) + `Dataview/Datacore` (compute a score, render "Today / Top 5 / Overdue") + `Day Planner` (time-box against Google Calendar via ICS) + `Reminder` (nudges) is a complete, MIT-licensed, local-first stack. What Obsidian *cannot* natively do well: pull tasks **out of Asana/Gmail** and run a **language-model judgment** of importance. That gap is exactly where Claude-over-MCP fits (§6).

---

## 3. AI-Assisted / AI-Prioritization & PKM Projects

### The dedicated "AI task prioritizer" repos — surveyed, not recommended
GitHub search for "AI task prioritization", "LLM task manager", "Eisenhower matrix AI" returns **only tiny solo/hackathon projects**, all ~0 ★, mostly no license:
- `m2felix/Task-Prioritizer`, `Eddiejoe33/octofocus`, `adnan-amjad26/ai-task-prioritizer` (Laravel + OpenAI), `MohammedAlith1312/ai-powered-todo-list-app`, `yatinbhalla/Task-Prioritizer` (RN/Expo, 3-layer scoring engine), `psych0der/llm-task-manager` (Google Calendar + Notion).
- **Takeaway:** There is **no credible, maintained, forkable AI-prioritization project.** This validates *building* the brain rather than adopting one. `yatinbhalla/Task-Prioritizer`'s "3-layer scoring (manual priority + deadline escalation + impact/effort ratio)" is a decent reference *design*, not a dependency.

### Khoj — `khoj-ai/khoj`
- **Stars:** **34.9k ★**, daily activity. AGPL-3.0. **Self-hostable:** yes.
- **What it is:** Self-hostable "AI second brain." Custom **agents** (persona + tools + model), **scheduled automations** ("run this query every morning, email me the result"), deep research, web search via SearXNG, any LLM (Claude/GPT/Gemini/local Ollama). **First-class Obsidian plugin.**
- **Fit:** **Very high as a component.** It already does two things Kiros needs: AI over the Obsidian vault, and *scheduled automations that proactively report to you* (the "keep me on top of things" loop). A Khoj automation could run a daily "what should I do today" digest. Strong build-on candidate.

### Reor — `reorproject/reor`
- **Stars:** 8.6k ★. AGPL-3.0. Electron. **Private & local** AI note-taking ("for high-entropy people").
- **What it is:** Notes app with automatic semantic linking + local RAG chat over your notes.
- **Fit:** Tangential — it's a *note* tool, not a task/priority engine, and overlaps Obsidian. Useful only as inspiration for "auto-surface related context."

### Honorable mentions found in search
- **`elie222/inbox-zero`** (11.1k ★) — open-source AI email assistant. Directly relevant to the **Gmail** leg: could triage/extract tasks from email. Worth noting for the ingestion pipeline.
- **`zeroclaw-labs/zeroclaw`** (31.8k ★, Apache-2.0) — autonomous personal-assistant infra. Heavyweight; reference only.

---

## 4. Commercial Products — mine for design ideas, do NOT buy

### Amazing Marvin — THE reference (study deeply)
Closed-source, ~$12/mo. Explicitly built around **behavioral psychology and procrastination**, marketed as "the customizable task manager for ADHD / executive dysfunction." **300+ settings**, modular: you enable only the "strategies" that fit *your* brain. ([why-marvin](https://amazingmarvin.com/why-marvin/), [features](https://amazingmarvin.com/features/))

**The Strategies catalog (the gold to mine):**
- **Daily-list-not-master-list** — the Master List is *hidden by default*; you plan a small "Today" list each day. **Working off a daily list instead of the entire backlog is the core anti-overwhelm mechanic.** ([day planning](https://help.amazingmarvin.com/en/articles/5066364-day-planning))
- **Procrastination Wizard** — walks you step-by-step through a stuck task to break resistance.
- **Procrastination Count / Staleness Warning / Bug Me** — surfaces how many days you've avoided a task; flags stale tasks; nags.
- **Focus Sessions / Super Focus Mode** — show only 1 task at a time; curate a 1–3 hr session or let Marvin pick.
- **Eat the Frog / Suggested Task / Random Task / This-or-That / The Task Jar** — different ways to *defeat choice paralysis* (the freeze) by reducing the decision to one comparison or one pick.
- **Smart Lists** — saved filters (e.g. "priority-3 AND due ≤30d"); the engine for custom views. ([smart lists](https://help.amazingmarvin.com/en/articles/1950204-smart-lists))
- **Time Blocking / Week Scheduler / Auto-schedule due Tasks / Backburner / Day Progress Bar / Time Targets**.
- **Email-to-Marvin, Zapier, Fast-Add** — ingestion.
- **Gamification / Reward Tasks / Beat the Clock / Accountability Pledge** — dopamine.

> **Why it matters for Kiros:** This is a complete, validated taxonomy of *anti-freeze* mechanics. The single most important steal: **hide the backlog, present a tiny daily list, and provide a one-button "just tell me what to do next."**

### Motion (`usemotion.com`)
- AI **auto-scheduler**: ingest tasks + deadlines + priorities, it **builds your entire day on the calendar and silently rebuilds when things shift.** Wants tasks in *its* app.
- **Steal:** the "tasks → calendar automatically, reflow on change" loop. **Caution for this user:** full autopilot can feel like loss of control and hides *why* — pair auto-schedule with transparency.

### Reclaim.ai
- Auto-defends time: schedules tasks, **habits** (meals/workout/family), and focus blocks around meetings; auto-reschedules. Free tier; calendar-native (doesn't demand you move your tasks).
- **Steal:** **defend recurring personal/deep-work blocks**, not just deadlines. Treat "focus time" as a first-class schedulable entity.

### Sunsama
- The **anti-Motion**: a **guided morning + evening ritual** — pull from Asana/Todoist/Gmail/etc., *intentionally* choose today's tasks, estimate time, time-box; shutdown review at night. Pulls from many sources rather than owning tasks.
- **Steal — this is huge for the freeze user:** the **daily planning ritual** + **evening reflection**. A human-in-the-loop ceremony beats silent automation for someone who freezes; it rebuilds agency. Sunsama's "aggregate from your existing tools" model is exactly the orchestration thesis.

### Akiflow
- **Universal inbox**: consolidates 10+ sources (Gmail, Asana, Todoist, Slack, Notion, Linear, Jira…) into one place, then drag to calendar. Keyboard-first, keeps you "in the driver's seat." Recently added AI (Aki).
- **Steal:** the **single-inbox ingestion** pattern — all tasks land in one triage surface. Directly relevant to "ingest all his tasks."

### TickTick
- Mainstream to-do with priorities, **Eisenhower Matrix view**, calendar, Pomodoro, habits.
- **Steal:** Eisenhower quadrant as an *optional* view; habit tracking adjacent to tasks.

### Todoist
- Best-in-class **filters + priority + natural-language quick-add**. P1–P4 priorities; saved filter queries are a power-user prioritization language.
- **Steal:** the **filter query language** (compose views like "p1 & overdue & #CompanyA") and NL quick capture.

### Amplenote — the other transparent scoring model (study alongside Taskwarrior)
- Note-app + tasks with a **Task Score**: an Eisenhower-derived heuristic that auto-sorts your whole list. Observed behavior ([help](https://www.amplenote.com/help/tasks_and_todos_task_score)):
  - **Important** tasks accumulate score ~**3×** faster than non-important.
  - **Urgent** tasks **increment aggressively each day**.
  - **Every day you open the task's note, score increments** (recency-of-engagement signal).
  - **Due today = +10**, **on/after deadline = +10 more**.
  - **Quick/short-duration** tasks get nudged up (quick wins).
  - **Blocking** tasks inherit score from what they block.
  - Color buckets: **Red ≥10, Gold ≥5, Blue ≥2, Gray ≥1.**
- **Steal:** a **time-decaying, escalating score** so neglected-but-important tasks *climb* until they can't be ignored — directly counters the freeze-avoid loop. And the **color-bucket** presentation (don't show a raw number; show a calm 4-color signal).

### Sorted (Sorted³)
- iOS/Mac "hyper-scheduling": tasks + events on one timeline; one tap **auto-schedules** the day's tasks into free slots.
- **Steal:** the **unified task+event timeline** and one-tap "fit my tasks into today's gaps."

---

## 5. Comparison Table

| Tool | Type | ★ | License | Self-host | AI | Prioritization intelligence | Adapt/Fork | Fit for overwhelm-freeze |
|---|---|---|---|---|---|---|---|---|
| **Taskwarrior** | OSS CLI | 5.8k | MIT | ✅ local | ✗ | ⭐ transparent urgency polynomial | Port algorithm | Algo: high / App: low (CLI) |
| **Vikunja** | OSS app | 4.5k | AGPL-3.0 | ✅ | ✗ | manual priority | Forkable | Med (clean, but adds a tool) |
| **Super Productivity** | OSS app | 19.9k | **MIT** | local | ✗ | manual + timebox | **Best fork base** | Med-High (timeboxing, dense UI) |
| **AppFlowy** | OSS workspace | 71.9k | AGPL-3.0 | ✅ | ✅ | ✗ | Heavy | Low (overkill) |
| **Focalboard** | OSS kanban | 26.2k | custom | ✅ | ✗ | ✗ | Stalled | Low |
| **Planka** | OSS kanban | 12.1k | AGPL/custom | ✅ | ✗ | ✗ | Forkable | Low (board = overwhelm) |
| **Kanboard** | OSS kanban | 9.6k | MIT | ✅ | ✗ | WIP limits | Forkable | Low-Med (steal WIP limits) |
| **Leantime** | OSS PM | 10k | AGPL-3.0 | ✅ | partial | ⭐ neurodivergent design, goals cascade, dopamine pairing | Philosophy | **High (closest philosophy)** |
| **Tracks** | OSS GTD | dead | GPL-2.0 | ✅ | ✗ | GTD model | Abandoned | Skip |
| **Nextcloud Tasks/Deck** | OSS | — | (A)GPL | ✅ | ✗ | ✗ | — | Low (needs Nextcloud) |
| **Org-mode/roam** | OSS text | 6.0k | GPL | local | plugins | ⭐ agenda + priorities | Emacs-only | Concept: high / Practice: low |
| **Logseq** | OSS PKM | 43.2k | AGPL-3.0 | local | plugins | queries | — | Low (redundant w/ Obsidian) |
| **SilverBullet** | OSS PKM | 5.4k | **MIT** | ✅ server | plugin | scriptable queries | Scriptable | Med (server-side dashboard) |
| **Markwhen** | OSS timeline | 4.8k | MIT | ✅ | ✗ | ✗ (viz only) | As a view | Low (just a view) |
| **Obsidian Tasks+Dataview+DayPlanner** | Plugins | 3.8k/9.0k/2.6k | MIT | local | via Khoj | computable score | **Build thin here** | **High (he's already here)** |
| **Khoj** | OSS AI | 34.9k | AGPL-3.0 | ✅ | ✅ | agents + scheduled digests | **Build-on** | High (AI brain + nudges) |
| **Reor** | OSS AI notes | 8.6k | AGPL-3.0 | local | ✅ | ✗ | Reference | Low |
| **inbox-zero** | OSS AI email | 11.1k | custom | ✅ | ✅ | email→task triage | Component | Med (Gmail ingestion) |
| Amazing Marvin | Commercial | — | closed | ✗ | some | ⭐⭐ psychology strategies | **Inspiration** | Reference gold |
| Motion | Commercial | — | closed | ✗ | ✅ | auto-schedule | Inspiration | Caution (autopilot) |
| Reclaim.ai | Commercial | — | closed | ✗ | ✅ | defend time/habits | Inspiration | Good (focus blocks) |
| Sunsama | Commercial | — | closed | ✗ | some | guided ritual | Inspiration | **High (ritual + aggregate)** |
| Akiflow | Commercial | — | closed | ✗ | some | universal inbox | Inspiration | High (ingestion) |
| TickTick | Commercial | — | closed | ✗ | ✗ | Eisenhower view | Inspiration | Med |
| Todoist | Commercial | — | closed | ✗ | some | filters + priorities | Inspiration | Med (filter language) |
| Amplenote | Commercial | — | closed | partial | some | ⭐⭐ Task Score (decay/escalate) | **Inspiration** | Reference gold |
| Sorted³ | Commercial | — | closed | ✗ | ✗ | auto-fit timeline | Inspiration | Med |

---

## 6. Synthesis & Recommendation

### Top 3 open-source projects worth forking/adapting vs. building thin

1. **Obsidian (Tasks + Dataview/Datacore + Day Planner + Reminder) — build thin on top.** MIT, local-first, *already his daily surface*. This is where the "Today" dashboard, computed urgency, and time-boxing should render. Lowest friction, highest adoption odds. **This is the front-end.**
2. **Khoj — build on / integrate.** AGPL but self-hostable; gives AI-over-vault **and scheduled automations that proactively email a digest**. This is the cheapest path to the "keeps me on top of things without me asking" loop. Strong complement to the Claude-MCP brain (or an alternative host for it).
3. **Super Productivity (MIT)** *if* he ever wants a standalone app instead of living in Obsidian — the most forkable serious to-do with time-boxing baked in. Keep as Plan B.

**Algorithm to port (not an app):** **Taskwarrior's urgency polynomial**, blended with **Amplenote's decay/escalation**. This is the heart of Kiros and should be its own small, testable module.

### What to STEAL from Amazing Marvin + the AI tools
- **From Marvin:** Hide the backlog by default; present a **small daily list**. Ship a one-button **"what should I do next?"** (Suggested Task / This-or-That / Task Jar) to defeat choice-paralysis. **Procrastination Count + Staleness Warning** so avoided-important work *visibly escalates*. **Focus Session** (1–3 hrs, one task at a time). **Modular, opt-in strategies** — start minimal, let him turn things on; never present 300 settings at once.
- **From Amplenote + Taskwarrior:** A **transparent, tunable, time-decaying urgency score** (important escalates ~3×, urgency increments daily, due/overdue add fixed jumps, quick wins get a nudge, neglect *raises* score). Render as **calm color buckets (red/gold/blue/gray)**, not a raw number.
- **From Sunsama:** A **morning planning ritual + evening reflection** — human-in-the-loop, not silent autopilot. Critical: a freezer needs restored *agency*, not a machine that decides for him.
- **From Akiflow:** A **single universal inbox** that ingests Asana + Gmail + Obsidian + Airtable into one triage surface.
- **From Motion/Reclaim/Sorted:** **Auto-fit tasks into calendar gaps** and **defend recurring deep-work/focus blocks** — but always show *why* and let him override.
- **From Leantime:** **Goals → projects → tasks cascade** ("why am I doing this") and **dopamine pairing** of boring tasks with engaging ones. Frame the whole product around *cognitive accessibility*.

### Build-new vs. adopt-OSS vs. orchestrate-existing — RECOMMENDATION

**Orchestrate his existing stack, with Claude (via MCP) as the prioritization brain and Obsidian as the calm front-end. Do NOT fork a PM app; do NOT build a full task app.**

Reasoning:
1. **His tools are the constraint and the opportunity.** Tasks already live in **Asana, Gmail, Obsidian, Airtable** with **Google Calendar** as the schedule. Adopting Vikunja/Leantime/Super Productivity means *migration + yet another tool* — which *adds* overwhelm, the exact failure mode. The integrations the brief flags as "mattering" are MCP servers he *already has connected* (Asana, Obsidian, Calendar, Gmail, Airtable, Drive all appear as available MCP tools).
2. **No OSS AI-prioritizer is worth adopting.** The category is all 0-star hobby projects. The *intelligence* must be built — and an LLM is uniquely suited to the judgment calls ("is this important?", "which of these two matters more this week?") that a fixed polynomial can't make alone.
3. **The two hard parts are exactly what Claude+MCP is good at:** (a) **ingesting** scattered tasks across Asana/Gmail/Obsidian/Airtable into one model, and (b) **language-level prioritization** — reasoning about importance, deadlines, and his two-company context. Wrap that in a **deterministic urgency score** (Taskwarrior/Amplenote) so output is explainable and tunable, not a black box.
4. **The anti-overwhelm UX is a thin layer, not a new app.** "Today list + Top-5 + color buckets + morning ritual + evening review + proactive daily digest" renders fine in **Obsidian (Dataview/Datacore)** and is *pushed* by a **scheduled Claude/Khoj automation**. Small surface, high leverage, fully forkable/MIT where it counts.

**Concrete shape of Kiros (the build):**
- **Ingestion:** scheduled MCP pulls — Asana tasks, Gmail action-items, Obsidian `Tasks`, Airtable rows — normalized into one task model (Akiflow-style universal inbox).
- **Scoring:** a small, tested module — Taskwarrior-style weighted polynomial (due, priority, blocking, age) **+** Amplenote-style decay/escalation, **+** an LLM "importance/effort" judgment per task. Output = color bucket + one-line rationale.
- **Surfaces:** Obsidian "Today" + "Top 5" + "Overdue/Stale" dashboards (Dataview/Datacore); optional Day-Planner time-boxing against Google Calendar.
- **Rituals & nudges:** a scheduled Claude (or Khoj) automation that runs a **morning digest** ("here are your 5; here's the one frog") and an **evening review**, plus **staleness/procrastination escalation** so avoided-important work climbs until surfaced.
- **Anti-freeze button:** "What should I do right now?" → one task, with the *why*.
- **North star:** Leantime's cognitive-accessibility philosophy + Marvin's hide-the-backlog daily-list + Sunsama's human-in-the-loop ritual.

**Net:** Adopt **Obsidian + Khoj** as components, **port** Taskwarrior/Amplenote scoring, **steal** Marvin/Sunsama/Leantime UX, and **build** only the thin orchestration brain (Claude over the MCP stack he already has). Lowest overwhelm, highest fit, fully within his skills.

---

## Sources
- Taskwarrior urgency: https://taskwarrior.org/docs/urgency/ · https://taskwarrior.org/docs/priority/
- Amazing Marvin: https://amazingmarvin.com/ · https://amazingmarvin.com/why-marvin/ · https://amazingmarvin.com/features/ · https://help.amazingmarvin.com/en/collections/1139197-strategies · https://help.amazingmarvin.com/en/articles/1950204-smart-lists · https://help.amazingmarvin.com/en/articles/5066364-day-planning
- Amplenote Task Score: https://www.amplenote.com/help/tasks_and_todos_task_score · https://www.amplenote.com/blog/todo_list_auto_sorts_with_eisenhower_matrix
- Motion/Reclaim/Sunsama/Akiflow comparison: https://reclaim.ai/blog/motion-alternatives · https://temporal.day/blog/motion-vs-reclaim-vs-clockwise-vs-akiflow-vs-sunsama · https://www.sunsama.com/compare · https://akiflow.com/blog/motion-vs-sunsama
- Leantime: https://leantime.io/ · https://leantime.io/work-management-for-adhd-and-add/ · https://github.com/Leantime/leantime
- Khoj: https://github.com/khoj-ai/khoj · https://docs.khoj.dev/category/features/
- GitHub repos (live 2026-06-06): go-vikunja/vikunja · super-productivity/super-productivity · AppFlowy-IO/AppFlowy · mattermost-community/focalboard · plankanban/planka · kanboard/kanboard · GothenburgBitFactory/taskwarrior · logseq/logseq · silverbulletmd/silverbullet · reorproject/reor · mark-when/markwhen · org-roam/org-roam · obsidian-tasks-group/obsidian-tasks · blacksmithgu/obsidian-dataview · blacksmithgu/datacore · obsmd-projects/obsidian-projects · obsidian-community/obsidian-kanban · ivan-lednev/obsidian-day-planner · elie222/inbox-zero
