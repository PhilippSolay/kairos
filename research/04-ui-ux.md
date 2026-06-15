# The Visual & Interaction Design Layer for Kiros

**A craft-level brief for the screen Kiros eventually becomes — written for a senior UX/UI
designer who already knows the psychology, and now needs concrete tokens, layouts, and copy.**

---

## What this layer has to do (and why it's different from the engine)

The functional research already settled *what to decide for the user* (top-3 frog-first, WIP ≤ 3,
frictionless capture, avoidance boost, compassionate framing). This document is about the **last
six inches** — the pixels between the scoring engine and the frozen prefrontal cortex.

The job of the UI is narrow and unusual. Most task apps are designed to hold *more* — more views,
more filters, more capability surfaced. Kiros' UI has the opposite mandate: **it is a privacy
filter for your own obligations.** Its success metric is how little it shows and how little it
asks. The interface is not a dashboard; it is a single sentence delivered at the right moment.

Three constraints flow directly from the diagnosis in `research/01-psychology.md`:

1. **The screen cannot require the frozen PFC to do work.** No sorting, no "which of these 12,"
   no decisions at the moment of overwhelm. The UI presents an already-made decision.
2. **The screen itself must not be a trigger.** Density, badges, counts, and visible backlogs are
   the 24-jam table. The default state shows one to three pre-decided items and nothing else.
3. **The screen must never reward the avoidance move.** No dopamine for "I organized my tasks." The
   UI should feel slightly *boring* to fiddle with and satisfying only to *act* from. This is the
   one place where good UX deliberately withholds engagement.

Everything below serves those three.

---

## 1. Calm technology / low-arousal UI

### Amber Case's 8 principles, mapped to Kiros

Amber Case's *Calm Technology* (2015), building on Weiser & Brown's Xerox PARC work, gives eight
principles. ([Calm Tech Institute](https://www.calmtech.institute/calm-tech-principles),
[principles.design](https://principles.design/examples/principles-of-calm-technology)) Here is each
one translated into a Kiros design decision rather than left abstract:

| # | Calm Tech principle | Kiros decision |
|---|---|---|
| 1 | **Require the smallest possible amount of attention** | The daily screen is one item, set in display type. No scanning, no parsing a list. Reading it costs one fixation. |
| 2 | **Inform and create calm** | The screen *answers a question* ("what now?") rather than *posing* questions. It resolves uncertainty instead of adding it. |
| 3 | **Make use of the periphery** | Counts, progress, and the backlog live in the periphery (a faint footer, a collapsed drawer) — available but never foreground. They move to center only on deliberate request. |
| 4 | **Amplify the best of technology and humanity** | The machine does the prioritizing (its strength); the human does the doing and the judging (theirs). The UI never asks the human to do machine work (sorting) or pretends to do human work (deciding what matters). |
| 5 | **Communicate, but doesn't need to speak** | State is shown through type weight, spacing, and one warm hue shift — not chatty notifications or modal dialogs. |
| 6 | **Work even when it fails** | It's markdown underneath. If the UI breaks, the data is a plain file you can open. Graceful degradation is built into the architecture (see README "graduating to an app"). |
| 7 | **The minimum tech to solve the problem** | No accounts, no sync service, no AI sidebar. A local web view over one file. Resist every feature (this is also the project's "one rule"). |
| 8 | **Respect social norms** | A personal, private, late-night tool — no streaks to perform for, no social leaderboard, nothing that turns inner life into a metric. |

### Concrete low-arousal rules

Anxiety amplifies sensitivity to complexity, clutter, and unpredictability — it overwhelms working
memory and raises stress. ([Zigpoll on anxiety
UX](https://www.zigpoll.com/content/how-can-a-user-experience-designer-create-interfaces-that-effectively-reduce-cognitive-load-and-promote-mental-wellbeing-for-users-with-anxiety)) The countermeasures, as implementable rules:

- **Information density: one decision per screen, max.** The daily view shows the frog. The "now"
  view shows one pick. The review is the *only* screen allowed density — and it's entered
  deliberately, never by default.
- **Contrast: no maximum contrast anywhere.** Avoid `#000` on `#fff`. Pure-white/pure-black is
  visually harsh and reads as tense even in a "correct" palette.
  ([muffingroup](https://muffingroup.com/blog/calm-color-palette/)) Use near-black on warm off-white
  (light) or warm off-white on near-black (dark). Keep primary text contrast strong (≥ 7:1) but
  step *secondary* text down to roughly 4.5:1 so hierarchy is felt, not shouted.
- **Motion restraint: motion confirms, never decorates.** No parallax, no shape-morphing, no
  attention-grabbing entrances. A completed task fades; a new "now" pick cross-fades. That's the
  whole motion vocabulary. Linear/eased motion reads as stable; complex curves read as tension.
  ([Zigpoll](https://www.zigpoll.com/content/how-do-you-ensure-that-the-user-interface-you-develop-supports-the-emotional-wellbeing-and-cognitive-load-management-of-our-users-particularly-those-who-may-be-experiencing-psychological-distress))
- **Predictability over delight.** Same input, same output (the engine already guarantees this).
  The UI should too: the frog is always in the same place, the same size, every morning. Calm
  comes from a screen you can predict with your eyes closed.
- **Build in "calm states."** After completing the day's items, the screen should *empty into
  stillness*, not refill with "what's next." A deliberate low-stimulus resting state is itself a
  feature.

---

## 2. Single-focus / "one thing at a time" screens

The pattern Kiros wants is well-established: hide the list, surface the one move. Mining the apps
for *interaction* (not features):

### Things 3 — the Today view and the discipline of whitespace

Things organizes the entire experience around a single **Today** view, a philosophy carried since
Things 1. Each morning you review what's planned and decide what to focus on; the structure pushes
you to keep the list short. ([Block81](https://block81.com/blog/organizing-my-life-with-things-3),
[Calmevo Things 3 review](https://calmevo.com/things-3-review/)) The craft lesson is **whitespace
as the primary organizing tool** — separation between groups is done with empty space, not lines or
boxes, so the eye lands on content, not chrome. ([Peter Akkies, OmniFocus vs
Things](https://www.peterakkies.net/omnifocus-vs-things))

*Take for Kiros:* the frog should sit in a field of emptiness. No card border, no surrounding
toolbar. The whitespace *is* the container.

### Sunsama — ritual, pacing, and the deliberate shutdown

Sunsama turns planning into a **timed ritual** (10–15 min) where you consciously choose a small set
and time-box it; at day's end a **shutdown ritual** prompts reflection and closes the day. Users
report the shutdown is the feature that most improves work-life balance because it discharges the
"unfinished work" anxiety that follows them into the evening.
([Sunsama daily planning & shutdown](https://www.sunsama.com/features/daily-planning-and-shutdown),
[Calmevo on Sunsama](https://calmevo.com/how-to-use-sunsama/)) The interaction craft is **calm
pacing** — smooth transitions between a "planning" mode and an "execution" mode, never both at once.

*Take for Kiros:* the morning ritual (`/kiros-morning`) and the weekly review are *modes you enter
and leave*, not panels always on screen. And a **shutdown / close-the-day** moment is worth
designing — for this user it directly targets the evening rumination loop (he works late).

### Amazing Marvin — customization as the anti-pattern to avoid

Marvin offers 50+ toggleable strategies so it can "match your brain."
([Akiflow: Marvin vs Things 3](https://akiflow.com/blog/amazing-marvin-vs-things-3)) For most users
that's a strength; **for this user it is a trap.** Configuration is meta-work — the seductive,
ships-nothing activity Kiros exists to kill. The lesson is *inverse*: Kiros must be opinionated and
nearly unconfigurable in the UI. (Tuning lives in a text file, behind friction, on purpose.)

### Akiflow / Sorted — the single "now" and hyper-scheduling

Akiflow is a command center that funnels everything into one place, then you drag items onto a
calendar one at a time. Sorted's **hyper-scheduling** auto-arranges tasks into a single timeline so
there's always an unambiguous "now." ([Akiflow: Sunsama vs
Sorted](https://akiflow.com/blog/sunsama-vs-sorted-3/)) The shared interaction primitive is **a
timeline that answers "what's now" with exactly one row highlighted.**

*Take for Kiros:* the `now` command already returns exactly one pick. The UI for it should be a
*single illuminated row* — everything else dimmed to near-invisibility, not hidden in a menu but
present and quiet, so the one lit thing has context without competition.

### The synthesized pattern: "one thing huge, the rest whispered"

```
DEFAULT DAILY SCREEN  (kiros today)

        ┌──────────────────────────────────────────────┐
        │                                                │
        │                                                │
        │              Today's one thing                 │   ← small, muted label (caption)
        │                                                │
        │   Write the Cosmic Guide launch plan —         │   ← DISPLAY SERIF, ~40–56px,
        │   just the one page.                            │     the only loud element on screen
        │                                                │
        │   ▸ Start: open the doc, write the title.       │   ← if-then start prompt, body size
        │                                                │
        │                                                │
        │              [  Done  ]   [ Too big? ]          │   ← two calm actions, generous hit area
        │                                                │
        │                                                │
        │   · · ·                                  2 more │   ← periphery: faint, tappable to expand
        └──────────────────────────────────────────────┘
```

Everything not the frog is in the periphery (Calm Tech #3). "2 more" is the *only* hint that a list
exists, and it's whisper-quiet. Tapping it reveals positions 2–3 — never the full backlog.

---

## 3. ADHD / executive-dysfunction-friendly UI

Even without an ADHD diagnosis, this user's failure loop is an executive-function loop, and the EF
design literature maps cleanly onto it. ([Medium: UX Design for
ADHD](https://medium.com/design-bootcamp/ux-design-for-adhd-when-focus-becomes-a-challenge-afe160804d94),
[Din Studio: UI/UX for ADHD](https://din-studio.com/ui-ux-for-adhd-designing-interfaces-that-actually-help-students/))

### Reduce choice → reduce friction to start

- **Spotlight one primary CTA; never disperse actions.** The hard part of EF isn't doing the task,
  it's *initiating*. So the single most prominent affordance on the daily screen is the start
  action, paired with the **if-then start prompt** ("open the doc, write the title"). This is
  shrink-the-step rendered as UI: the button doesn't say "Work on X," it says the literal first
  physical movement.
- **The "one button: what now?" pattern.** When the user is too frozen to even read three items,
  there must be a single affordance — `now` — that returns exactly one thing, pre-filtered by
  current energy and time. The UI for this is a *single full-bleed answer*, no list, no choosing.
  This is the panic button for the frozen state, and it's the most important screen in the app.

### Why the backlog must be hidden (and how)

Timeline-style ADHD planners (Structured, etc.) deliberately limit what's visible — showing only
*now* and *next*, hiding future tasks — because long lists re-trigger overwhelm.
([Din Studio](https://din-studio.com/ui-ux-for-adhd-designing-interfaces-that-actually-help-students/),
[Morgen: ADHD apps](https://www.morgen.so/blog-posts/adhd-productivity-apps)) Kiros already enforces
this in the engine (daily loop reads only the active set). The UI must **honor it visually**: the
backlog has *no navigation entry* on the daily screen. It exists only inside the weekly review mode.
There is no tab, no sidebar link, no "see all." Hiding it is not an oversight — it's the product.

### Body doubling / timer UIs

Body doubling — working in shared presence to lower activation energy — is a validated EF support.
([Morgen](https://www.morgen.so/blog-posts/adhd-productivity-apps); body-doubling science cited in
`research/01-psychology.md`) A full body-doubling feature would violate the "one rule" (scope
creep), but two *lightweight* gestures fit:

- **A focus/timer state** that takes over the full screen: the one task at top, a quiet countdown,
  everything else gone. Keep the reminder, the schedule, and the timer in one place so the task
  stays close to execution (the ADHD "reduce handoffs" principle).
  ([Morgen](https://www.morgen.so/blog-posts/adhd-productivity-apps))
- **An ambient "working on it" state** — a gentle, non-ticking visual (a slowly filling arc, no
  numbers screaming) that provides the *felt presence* of a session without the pressure of a
  visible clock counting against you.

### EF-friendly defaults summary

- Progressive disclosure with explicit position ("1 of 3"), never an open-ended scroll.
- Muted secondary items; bold only the one that's active.
- Pausing/resuming a task must never lose context or cost a "reset."
- Personalization limited to the things that reduce load (dark mode, font size) — *not* the things
  that become meta-work (custom workflows, 50 toggles).

---

## 4. Compassionate microcopy

This is the highest-leverage and most-overlooked layer. The psychology is unambiguous: a broken
streak or a shaming overdue label reads as personal failure, triggers a shame spiral, and **the
shame itself fuels the next avoidance** (Sirois/Neff, in `research/01-psychology.md`). Mental-health
UX research is explicit — "Reset to Zero" notifications cause shame-driven disengagement, and the
fix is to normalize pauses and returns as self-regulation, not failure.
([self-compassion app design / setbacks](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2024.1414948/full),
[Prose: empathy in UX writing](https://www.prosemedia.com/blog/empathy-in-ux-writing-crafting-microcopy-that-connects-guides-and-reassures))

### Voice principles for Kiros

1. **Name the next step, not the failure.** Always forward-looking.
2. **Attribute to circumstance, not character.** "This one's been hard to start," never "you keep
   avoiding this."
3. **Use plain warmth, not cheerleading.** No exclamation marks, no confetti, no "You crushed it!"
   Cheerleading reads as hollow to a creative director and rings false at 1am.
4. **Speak to a tired peer, not a child.** Adult, calm, slightly understated. The tone of a good
   friend who has also had this exact week.
5. **Never quantify shame.** No "avoided for 4 days" as a red number. If duration matters, phrase it
   as an invitation: "This has been waiting a while — want the 2-minute version?"

### The microcopy bank (copy-ready strings)

**The daily frog (the one thing, framed as a gift not a demand):**
- "Today, just this one." / `{task}`
- "If you do one thing today, this is the one."
- "Start here. Everything else can wait."
- "One thing. You've already decided it matters — I just held the decision for you."

**Start prompts (shrink-the-step, if-then):**
- "Start: {tiny first physical action}."
- "First 2 minutes: just open it."
- "You don't have to finish. Open the doc and write the title."

**An avoided-for-N-days task (the keystone — must never shame):**
- "This one's been hard to start. That usually means it matters. Smallest possible first step?"
- "Still here, no rush. Want the 2-minute version of it?"
- "You've walked past this a few times. No judgment — shall we shrink it until it's easy?"
- "Avoidance is information, not a verdict. Want to look at why this one feels heavy?"
- (Avoid: "Overdue 4 days", "You've been avoiding this", any red count.)

**Empty / clean state (the reward is stillness, not a prompt to do more):**
- "Nothing's on fire. You're clear for now."
- "That's the list. Genuinely — go be a person."
- "Clean. Nothing is being avoided, nothing is overdue. Rest counts as done."
- "Inbox empty, active set clear. This is the goal, not a gap to fill."

**A completed task (acknowledge, then get out of the way):**
- "Done. That was the hard one." (when the completed item had the avoidance flag)
- "That's the one that mattered today."
- "Marked done." *(then the screen quietly empties — no "next up!" pressure)*
- (Avoid: streak counts, "3 days in a row!", confetti, points.)

**The "you're over WIP" state (a gentle wall, not an error):**
- "Three things are already in flight. To start something new, let's finish or park one."
- "Your hands are full — and that's the point. What's one of these you can park for now?"
- "WIP is at 3 on purpose. Adding a fourth is how the freeze starts. Park one first?"
- (Avoid: "Error: WIP limit exceeded", red border, blocking modal with an X.)

**Busy-avoidance nudge (when easy building is masking the hard work):**
- "You've shipped a few small things — nice. The {front} work is still waiting, though. 2-minute
  first step on it?"
- "Productive day. One honest question: is {avoided task} the thing you're actually avoiding?"

**Weekly review entry (lowering the activation cost of triage):**
- "Once a week we look at the graveyard so you never have to during the week. 10 minutes. Let's go."

---

## 5. Calm visual language (concrete tokens)

This user works **late at night, on a Mac, in Bali** and prizes Japanese-refined aesthetics
(*ma* — negative space; *shibui* — restrained, understated beauty). The visual system below is
dark-first, warm, low-saturation, generously spaced, with one editorial serif carrying the focus.

### Color — the case for warm, low-saturation, dark-first

Calm palettes keep **background saturation below ~30%** and **accents rarely above ~55–60%**; pure
white and pure black create harshness and should be avoided.
([muffingroup](https://muffingroup.com/blog/calm-color-palette/)) Dark calm palettes use deep
*desaturated near-blacks* (e.g. `#121212`, `#16161a`) rather than `#000`, with small luminance steps
between surfaces so layers read as calm, not muddy.
([fourzerothree on dark mode](https://www.fourzerothree.in/p/scalable-accessible-dark-mode),
[Colorhero](https://colorhero.io/blog/dark-mode-color-palettes-2025)) The hard rule: **pick one
temperature and commit** — warm base demands warm accents; mixing warm and cool neutrals creates
persistent low-grade discomfort. ([muffingroup](https://muffingroup.com/blog/calm-color-palette/))
Kiros commits to **warm**.

**Dark theme (default — for late-night work):**

```
--bg          #16140F   /* warm near-black, faint amber undertone (NOT #000) */
--surface-1   #1E1B15   /* raised: drawer, review cards — +small luminance step */
--surface-2   #26221B   /* highest elevation, rarely used */
--text-hi     #F2EDE3   /* warm off-white, primary text  (~13:1 on bg) */
--text-mid    #B8B0A2   /* secondary / labels            (~6:1) */
--text-low    #6E685C   /* periphery: "2 more", timestamps (~3.5:1, intentionally quiet) */
--accent      #C9A26B   /* warm gold/clay — the ONE accent, ~55% sat. Frog underline, focus. */
--accent-soft #8A7A5A   /* muted accent for hover / secondary marks */
--success     #8FA876   /* desaturated sage — "done", calm, never neon green */
--attention   #C98A5E   /* warm terracotta — used for "avoided/over-WIP". NEVER red. */
```

**Light theme (for daytime / bright Bali rooms):**

```
--bg          #FAF8F3   /* warm off-white (NOT #fff) */
--surface-1   #F2EEE5
--text-hi     #2A271F   /* warm near-black (NOT #000), ~14:1 */
--text-mid    #6B6456
--text-low    #A39B89
--accent      #B08948   /* same gold family, darker for light-bg contrast */
--success     #6E8A52
--attention   #B06A3E   /* terracotta, never red */
```

**The deliberate omission: there is no red and no green badge in the system.** "Overdue" and
"avoided" use warm terracotta (`--attention`) — which signals *warmth and invitation*, not alarm.
This single choice does more anti-shame work than any microcopy (see §6).

### Typography — the case for a serif on the focus item

Humanist/old-style serifs carry calligraphic warmth and "personality" where geometric sans reads
"cold and sterile"; they remain legible at display sizes and give an editorial, human feel.
([Fontfabric: humanist fonts](https://www.fontfabric.com/blog/typography-knowledge-humanist-fonts/),
[Figma: best serif fonts](https://www.figma.com/resource-library/best-serif-fonts/)) For Kiros the
serif is doing emotional work: the day's one task, set in a warm serif at display size, reads less
like a *demand from a system* and more like *a line in your own notebook*. That reframing is the
whole point — it lowers the threat valence of the task.

- **Display / the one thing:** a warm humanist or transitional serif. Candidates:
  *Newsreader*, *Source Serif 4*, *Fraunces* (low optical-size setting for warmth, not the high-
  contrast display cut which adds tension), or macOS-native *New York*. Set the frog at 40–56px,
  line-height ~1.15, slightly tightened tracking.
- **Everything else:** a humanist sans for UI chrome, labels, body, and the review list — *Inter*
  is the safe default (low-contrast, uniform stroke → reads calm); on a Mac, the system *SF Pro*
  is also right. ([typography in calm palettes — lower-contrast, uniform strokes integrate as
  calm](https://designshack.net/articles/typography/dark-mode-typography/)) The serif appears
  **only** on the focus item, so it always means "this is the thing."
- In dark mode, drop body weight slightly (e.g. 300–400) — heavy weights bloom and feel heavier on
  dark. ([Design Shack: dark-mode typography](https://designshack.net/articles/typography/dark-mode-typography/))

**Type scale (1.25 / major-third, restrained — few sizes on purpose):**

```
--fs-frog     48px   serif      /* the one thing (clamp 40–56 responsive) */
--fs-h2       24px   sans 500   /* review section headers (review only) */
--fs-body     17px   sans 400   /* start prompts, task body */
--fs-label    13px   sans 500   /* "Today's one thing", uppercase, +0.06em tracking */
--fs-meta     13px   sans 400   /* periphery, timestamps — in --text-low */
```

### Spacing — generosity as a calming agent (*ma*)

Generous padding lowers perceived density and user stress; a calm palette on a tight layout still
reads as tense. ([muffingroup](https://muffingroup.com/blog/calm-color-palette/)) Use an 8px base
grid but bias **large**:

```
--space-1   4px    --space-4   24px
--space-2   8px    --space-5   40px
--space-3   16px   --space-6   64px   --space-7  96px
```

- Daily screen: the frog block centered, with `--space-7` (96px) of breathing room above it and
  generous margins so it floats in emptiness. Negative space is the design, not leftover.
- Max content width for the frog ~560px even on a wide monitor — measure stays readable and the
  emptiness around it does the calming.
- Review mode is the one place spacing tightens (to `--space-3`), because density there is
  acceptable and even useful — it's a deliberate, bounded mode.

### Motion — confirm, never decorate

Routine UI transitions 160–240ms; entrances/exits 240–360ms; anything over ~400ms feels slow;
under ~100ms goes unnoticed. ([Material 3 easing &
duration](https://m3.material.io/styles/motion/easing-and-duration),
[NN/g: animation duration](https://www.nngroup.com/articles/animation-duration/)) Calm motion is
*subtle and infrequent* — the more frequent the animation, the shorter and quieter it must be.

```
--motion-fast    160ms  ease-out      /* button press, toggle */
--motion-base    240ms  ease-in-out   /* task done → fade, now-pick cross-fade */
--motion-calm    320ms  ease-in-out   /* mode change: daily ↔ review ↔ focus */
```

- **Task completion:** the item fades and drifts down ~8px over `--motion-base`, then the screen
  settles into the empty/clean state. No checkmark animation theatrics.
- **New "now" pick:** old fades fully out, *then* new fades in (no overlapping translucency — that
  reads as messy). ([Material guidance](https://m3.material.io/styles/motion/transitions/applying-transitions))
- **Honor `prefers-reduced-motion`:** replace all transforms with plain opacity fades; disable any
  drift. ([reduced-motion guidance](https://m3.material.io/styles/motion/easing-and-duration))
- **Nothing pulses, bounces, breathes, or demands.** The only "alive" element permitted is the
  optional ambient working-state arc, and it moves slowly enough to ignore.

### The full dark daily screen, with tokens

```
┌────────────────────────────────────────────────────────┐  bg #16140F
│                                                          │
│                                                          │  --space-7 (96px)
│              TODAY'S ONE THING                           │  fs-label, text-low #6E685C
│                                                          │  --space-3
│   Write the Cosmic Guide launch plan —                   │  fs-frog 48px serif, text-hi #F2EDE3
│   just the one page.                                     │  underline tint: accent #C9A26B
│                                                          │  --space-4
│   ▸ Start: open the doc, write the title.                │  fs-body sans, text-mid #B8B0A2
│                                                          │  --space-6
│        ┌─────────┐      ┌────────────┐                   │
│        │  Done   │      │  Too big?  │                   │  generous hit areas, accent-soft borders
│        └─────────┘      └────────────┘                   │
│                                                          │  --space-7
│                                                          │
│   ·                                          2 more  ›   │  fs-meta, text-low — the only list hint
└────────────────────────────────────────────────────────┘
```

---

## 6. Anti-patterns to actively design against

Each of these is a documented backfire; for *this* user they are not just bad taste — they feed the
exact loop the tool exists to break.

- **Red badges / red counts.** Red is an alarm color; an "overdue 4" red badge is a shame counter
  the user sees on every glance. It raises arousal (the freeze trigger) and converts the app icon
  into a source of dread. **Kiros has no red and no numeric overdue badge anywhere.** Use warm
  terracotta and inviting language instead.
- **Streaks & consecutive-day metrics.** Streaks become punitive during hard periods and trigger
  shame spirals; inconsistent use is a *symptom*, not a failure. A founder removed all gamification
  from a wellbeing app and engagement *rose*, because streaks made people "perform tracking instead
  of tracking." ([DEV: why I removed gamification](https://dev.to/mishravi2270/why-i-dont-gamify-mental-health-394o),
  [self-compassion / broken-streak research](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2024.1414948/full))
  **No streaks. No "X days in a row."**
- **Guilt counts / "you've avoided this for N days" as a stat.** Quantified avoidance is
  quantified shame. Surface avoidance *only* as a gentle, forward-looking invitation (§4).
- **Notification spam / pushy reminders.** Duolingo is catalogued on deceptive.design partly for
  pushy reminders. ([gamification dark patterns](https://medium.com/@neil_62402/gamification-dark-patterns-light-patterns-and-psychology-9442d49f8b56))
  Kiros should default to **near-silence** — at most one gentle morning nudge and one optional
  evening shutdown prompt, both dismissible forever.
- **Dense dashboards.** A dashboard *is* the 24-jam table. The daily default must never be a grid of
  widgets, charts, or "all your projects at a glance." Density lives only inside the bounded review.
- **Gamification that backfires (points, badges, confetti).** Badges for trivial actions dilute
  meaning; extrinsic rewards distort why you act. ([gamification 2.0,
  UX Mag](https://uxmag.com/articles/gamification-2-0-beyond-points-and-badges-designing-for-players-not-metrics-chapter-1-the-problem))
  The only reward Kiros offers is the *intrinsic* one: the screen going quiet because the right
  thing got done. **Data/quiet as the reward, not dopamine hooks.**
  ([DEV: data as the reward](https://dev.to/mishravi2270/why-i-dont-gamify-mental-health-394o))
- **Configuration as a feature surface.** A settings screen with 50 toggles is meta-work bait — the
  precise distraction Kiros is built to defeat. Keep tuning in a text file, behind friction.
- **Blocking error modals.** "WIP limit exceeded" with a red X is a punishment. The WIP wall is a
  *gentle, in-flow conversation* (§4), never a dialog you must dismiss.
- **Confirmshaming.** Never word a decline option to induce guilt ("No, I don't want to be
  productive"). It's a known dark pattern and antithetical to the compassionate voice. ([dark
  patterns / confirmshaming](https://medium.com/@neil_62402/gamification-dark-patterns-light-patterns-and-psychology-9442d49f8b56))

---

## Implementation priority (what to build first if/when Kiros graduates to an app)

The README is right that v1 (CLI + markdown) is done and the app is a *later*. When that later
comes, build in this order — each step is the highest emotional-leverage move available:

1. **The single daily screen** (frog in serif, in emptiness, with a start prompt). One screen. This
   alone delivers ~80% of the value.
2. **The "what now?" one-button state** — the panic button for the frozen moment.
3. **The compassionate copy layer + the warm/no-red palette.** These are cheap and prevent the
   tool from ever becoming a shame source.
4. **The empty/clean resting state** (rest as the reward).
5. **The bounded weekly-review mode** (the only place density and the backlog are allowed).
6. *(Optional, resist scope creep)* the focus/ambient working state.

Everything not on this list is a candidate for the "one rule": if it's more fun to build than to
use, it's the distraction the tool was made to kill.

---

### Key sources

- Amber Case, *Calm Technology* — [Calm Tech Institute principles](https://www.calmtech.institute/calm-tech-principles) · [principles.design](https://principles.design/examples/principles-of-calm-technology) · [calmtech.com](https://calmtech.com/book)
- Low-arousal / anxiety UX — [Zigpoll: anxiety & cognitive load](https://www.zigpoll.com/content/how-can-a-user-experience-designer-create-interfaces-that-effectively-reduce-cognitive-load-and-promote-mental-wellbeing-for-users-with-anxiety) · [Zigpoll: distressed users](https://www.zigpoll.com/content/how-do-you-ensure-that-the-user-interface-you-develop-supports-the-emotional-wellbeing-and-cognitive-load-management-of-our-users-particularly-those-who-may-be-experiencing-psychological-distress)
- Single-focus apps — Things 3: [Block81](https://block81.com/blog/organizing-my-life-with-things-3) · [Calmevo](https://calmevo.com/things-3-review/) · [Peter Akkies](https://www.peterakkies.net/omnifocus-vs-things) · Sunsama: [daily planning & shutdown](https://www.sunsama.com/features/daily-planning-and-shutdown) · [Calmevo guide](https://calmevo.com/how-to-use-sunsama/) · Marvin: [Akiflow comparison](https://akiflow.com/blog/amazing-marvin-vs-things-3) · Sorted/Akiflow: [Akiflow: Sunsama vs Sorted](https://akiflow.com/blog/sunsama-vs-sorted-3/)
- ADHD / EF-friendly UI — [Medium: UX Design for ADHD](https://medium.com/design-bootcamp/ux-design-for-adhd-when-focus-becomes-a-challenge-afe160804d94) · [Din Studio: UI/UX for ADHD](https://din-studio.com/ui-ux-for-adhd-designing-interfaces-that-actually-help-students/) · [Morgen: ADHD apps](https://www.morgen.so/blog-posts/adhd-productivity-apps)
- Compassionate microcopy — [Prose: empathy in UX writing](https://www.prosemedia.com/blog/empathy-in-ux-writing-crafting-microcopy-that-connects-guides-and-reassures) · [self-compassion app study (Frontiers)](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2024.1414948/full) · [Setproduct: empty states](https://www.setproduct.com/blog/empty-state-ui-design)
- Calm visual language — color: [muffingroup: calm palette](https://muffingroup.com/blog/calm-color-palette/) · [Colorhero: dark palettes](https://colorhero.io/blog/dark-mode-color-palettes-2025) · [fourzerothree: accessible dark mode](https://www.fourzerothree.in/p/scalable-accessible-dark-mode) · type: [Fontfabric: humanist fonts](https://www.fontfabric.com/blog/typography-knowledge-humanist-fonts/) · [Design Shack: dark-mode typography](https://designshack.net/articles/typography/dark-mode-typography/) · [Figma: serif fonts](https://www.figma.com/resource-library/best-serif-fonts/) · motion: [Material 3: easing & duration](https://m3.material.io/styles/motion/easing-and-duration) · [NN/g: animation duration](https://www.nngroup.com/articles/animation-duration/)
- Anti-patterns — [DEV: why I removed gamification](https://dev.to/mishravi2270/why-i-dont-gamify-mental-health-394o) · [Medium: gamification dark patterns](https://medium.com/@neil_62402/gamification-dark-patterns-light-patterns-and-psychology-9442d49f8b56) · [UX Mag: gamification 2.0](https://uxmag.com/articles/gamification-2-0-beyond-points-and-badges-designing-for-players-not-metrics-chapter-1-the-problem) · [The Tech Trends: streaks & addiction](https://thetechtrends.tech/gamification-of-social-apps/)
