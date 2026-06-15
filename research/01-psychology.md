# The Psychology of Overwhelm, Freeze, and Productive Procrastination

**A cited literature review for a systems-thinker running two companies with many concurrent projects.**

---

## The problem we are solving for

The user describes a specific, recurring failure loop, in their own words:

> "When I get overwhelmed with too many things on my shoulders, I freeze and I don't address the things I need to do, and I start building things that feel easy as a distraction."

Decomposed, the loop is:

1. **OVERWHELM** — too many concurrent obligations exceed cognitive/emotional capacity.
2. **FREEZE** — a stress/threat response that takes the planning brain offline.
3. **AVOIDANCE** — the important, hard, ambiguous work goes untouched.
4. **PRODUCTIVE PROCRASTINATION** — energy is redirected into easy, concrete, "feels-productive" building, which provides relief and reinforces the loop.

This review traces the psychology and neuroscience behind each stage, surveys the evidence-based interventions that break the loop, and ends with concrete design principles for a tool/workflow tuned to this exact person.

---

## 1. Why too much input causes paralysis: overwhelm, choice overload, and the freeze response

### Choice overload and analysis paralysis

When the number of options or open obligations grows past a threshold (commonly cited as ~6–12), people get *less* able to act, not more. The canonical evidence is **Iyengar & Lepper's (2000) "jam study"** ("When Choice Is Demotivating: Can One Desire Too Much of a Good Thing?"): a tasting table with 24 jams drew more browsers (60%) than one with 6 jams (40%), but shoppers were **roughly 10x more likely to actually buy** from the limited display. More options increased interest but collapsed action. ([Iyengar & Lepper jam study overview](https://digitalwellbeing.org/the-jam-study-strikes-back-when-less-choice-does-mean-more-sales/), [Paradox of Choice / jam experiment](https://cigdemgizemokkaoglu.substack.com/p/the-paradox-of-choice-jam-experiment))

The mechanism is partly **Hick's Law (the Hick–Hyman law)**: decision time rises *logarithmically* with the number of equally probable, distinct options. More choices literally cost more time and cognitive effort to resolve, and past a point the cost of deciding exceeds the perceived benefit of any single choice, so people defer or avoid the decision entirely. ([Hick's law and choice overload](https://thedailyexplainer.com/decision-fatigue-choice-overload-psychology-2026/))

**Why this matters for the user:** a person running two companies is staring at the equivalent of a 24-jam table every morning. The list itself is the trigger. The number of visible, undecided obligations is a direct input to paralysis.

### The Yerkes–Dodson curve: a little stress helps, too much shuts you down

The **Yerkes–Dodson law (1908)** describes an inverted-U relationship between arousal/stress and performance: too little arousal produces boredom and low output; a moderate amount sharpens focus; too much tips performance off a cliff. Critically, **the optimum is lower for complex, novel tasks than for simple, well-practiced ones** — hard cognitive work is fragile under stress, while easy rote work is more robust. ([Yerkes–Dodson, SimplyPsychology](https://www.simplypsychology.org/what-is-the-yerkes-dodson-law.html), [Wikipedia](https://en.wikipedia.org/wiki/Yerkes%E2%80%93Dodson_law), [stress-performance curve, Neurosity](https://neurosity.co/guides/stress-performance-curve-applied))

This explains a subtle part of the user's loop: when overwhelmed (high arousal), performance on the *hard, novel* work degrades first, while performance on *easy, familiar building* stays intact. Drifting toward easy work is, in a sense, the only place where the overwhelmed brain still functions well — which is exactly why it's so seductive.

> A useful caveat for rigor: some researchers argue the inverted-U is over-generalized "lore" rather than a precise law, and that the curve's shape varies by task and individual ([The Learning Scientists critique](https://www.learningscientists.org/blog/2024/2/29-1)). The directional claim — extreme stress degrades complex performance — is, however, well supported neurobiologically (below).

### The neuroscience: stress takes the prefrontal cortex offline

Under acute stress/threat, the **amygdala** (threat detection) gains control and the **prefrontal cortex (PFC)** — the seat of planning, prioritization, and self-control — is suppressed. This is popularly called the "amygdala hijack." The PFC literally goes offline; higher-order, deliberate thinking is exactly what you lose. ([PFC shutdown under stress, Neurosity](https://neurosity.co/guides/yerkes-dodson-law-arousal-performance))

The neurochemistry is elegant and explains the inverted-U at a receptor level: **norepinephrine** produces both effects depending on concentration. At moderate levels it engages alpha-2A receptors that *strengthen* prefrontal function; at high levels it spills onto alpha-1 and beta receptors that *weaken* it. ([Yerkes–Dodson neurotransmitter mechanism](https://neurosity.co/guides/yerkes-dodson-law-arousal-performance); see also [temporal dynamics of stress and memory, NIH/PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1906714/))

**The takeaway:** "freeze" is not a character flaw or laziness — it's a predictable physiological state in which the very brain region needed to triage the overwhelming list has been throttled. Any intervention must therefore *not* require the frozen PFC to do the heavy lifting. The system must do the prioritizing **for** the user, not demand it **from** them.

---

## 2. Procrastination science: it's emotion regulation, and the equation that predicts it

### Procrastination is mood repair, not poor time management

**Timothy Pychyl** and **Fuschia Sirois** reframed procrastination as an **emotion-regulation** strategy, not a time-management defect. We procrastinate to escape the *negative feelings* a task evokes (anxiety, boredom, frustration, resentment, self-doubt). Avoiding the task delivers immediate mood repair — Pychyl's phrase is that we **"give in to feel good."** The relief is real and immediate; the cost lands on the "future self." ([Pychyl, Fast Company](https://www.fastcompany.com/90357248/procrastination-is-an-emotional-problem), [Procrastination & short-term mood regulation, Sirois & Pychyl](https://www.researchgate.net/publication/234130829_Procrastination_and_the_Priority_of_Short-Term_Mood_Regulation_Consequences_for_Future_Self), [Procrastination, Emotion Regulation & Well-Being](https://www.sciencedirect.com/science/article/abs/pii/B9780128028629000086))

### "Productive procrastination" / busy avoidance

The user's specific pattern — **building easy things as a distraction** — is the most insidious form, because it is camouflaged as work. It is *busy avoidance*: you discharge the negative emotion of the hard task **and** earn the dopamine of completing something concrete. The feedback ("I shipped something today") masks the avoidance. Every cycle pairs relief with a feeling of accomplishment, making it **profoundly habit-forming** while the important work's consequences silently compound. ([Pychyl: giving in to feel good, mood repair](https://chriscordry.substack.com/p/procrastination-is-about-emotion))

This is why generic "just do it" / discipline advice fails here: the behavior is being *positively reinforced*. You can't willpower your way out of a habit that feels good and looks productive.

### Steel's Procrastination Equation — the lever map

**Piers Steel & Cornelius König's Temporal Motivation Theory (2006)**, popularized in Steel's *The Procrastination Equation* (2011), gives a predictive formula. Steel's 2007 meta-analysis (691 correlations across 216 studies) validated its components against procrastination (≈ r = .45). ([Temporal Motivation Theory, Wikipedia](https://en.wikipedia.org/wiki/Temporal_motivation_theory), [Steel & König 2006, "Integrating Theories of Motivation"](https://goal-lab.psych.umn.edu/orgpsych/readings/12.%20Judgment%20&%20Decision%20Making/Steel%20&%20Konig%20(2006).pdf), [book summary](https://www.njlifehacks.com/the-procrastination-equation-piers-steel-summary/))

$$ \text{Motivation} = \frac{\text{Expectancy} \times \text{Value}}{1 + (\text{Impulsiveness} \times \text{Delay})} $$

- **Expectancy** — perceived probability of success. *Low when a task is ambiguous, huge, or ill-defined.*
- **Value** — how rewarding/aversive the task feels. *Hard strategic work is high-value but emotionally aversive; easy building is low-value but pleasant.*
- **Impulsiveness** — sensitivity to immediate gratification / distractibility.
- **Delay** — temporal distance to the payoff. *Important work for two companies often pays off months out.*

**How to attack each variable (this is the action map for the tool):**

| Variable | Why it's bad for this user | Intervention |
|---|---|---|
| **Expectancy ↑** | Big ambiguous projects feel un-winnable → freeze | Shrink to a tiny, obviously-doable next action; define "done"; surface progress so success feels likely ([shrink the change](https://readingraphics.com/book-summary-switch/)) |
| **Value ↑** | Hard work is aversive in the moment | Reduce aversiveness (self-compassion, ritual, body double), connect to autonomous "why," make it concrete |
| **Impulsiveness ↓** | Easy-building is the impulsive escape hatch | Reduce friction-to-start on the *right* task; remove/ delay friction on the wrong one; pre-commitment |
| **Delay ↓** | Strategic payoffs are distant | Create near-term feedback: micro-deadlines, visible streaks, timeboxes, "done today" surfaces |

---

## 3. Executive-function strategies (ADHD-adjacent, diagnosis-independent)

The freeze-and-avoid pattern overlaps heavily with **executive-function** load — task initiation, working memory, inhibition — which are mediated by frontostriatal systems that go underactive under stress (and in ADHD). The central, evidence-aligned recommendation across this literature is **externalization**: move regulatory demands *out of the head and into the environment* so a depleted PFC doesn't have to carry them. ([Externalizing executive function](https://neurodivergentinsights.com/executive-function-helpers/), [task initiation in ADHD](https://positivereseteatontown.com/task-initiation-adhd-understanding-the-science-behind-why-starting-feels-impossible/))

Key techniques:

- **Task initiation via "next smallest step."** Starting feels impossible because the activation energy is too high. Breaking the task down to an almost absurdly small first action removes the activation barrier and lets momentum take over. ([Tiimo: task initiation tactics](https://www.tiimoapp.com/resource-hub/task-initiation-adhd))
- **Working-memory offloading.** Timers, lists, visual reminders act as "external executive function," holding state the brain otherwise must (and can't, under load) maintain. ([external executive function](https://neurodivergentinsights.com/executive-function-helpers/))
- **Body doubling.** Working alongside another person (even silently/virtually) provides an *external starting cue*, lowers activation energy, and interrupts avoidance before it entrenches. It works by offloading regulation onto a low-stakes social scaffold, lightening the PFC. Some practitioners report it outperforms other ADHD strategies for follow-through. ([Science of body doubling](https://midtownpsychotherapy.org/blog/the-science-behind-body-doubling-why-it-helps-adhd-brains-regulate-and-focus), [body doubling at work](https://www.inspiredergonomics.com/blog/body-doubling-at-work-why-it-consistently-outperforms-other-adhd-strategies/))
- **Reduce friction to start the right thing.** Activation energy is the gatekeeper; the lower it is for the important task (and the higher for the escape-hatch task), the more likely the right behavior happens (this is the bridge to Fogg's B=MAP, §5).

---

## 4. Motivation theory for self-directed knowledge workers

A founder is almost entirely **self-directed** — there's no boss assigning the next task. Motivation must be generated internally, which makes the following theories load-bearing.

### Self-Determination Theory (Deci & Ryan): autonomy, competence, relatedness

SDT holds that intrinsic motivation flourishes when three innate needs are met, and collapses (shifting to brittle external regulation or vanishing) when any one is undermined. They are not interchangeable. ([Ryan & Deci 2000, SDT primary](https://selfdeterminationtheory.org/SDT/documents/2000_RyanDeci_SDT.pdf), [SDT, Wikipedia](https://en.wikipedia.org/wiki/Self-determination_theory), [APA on SDT](https://www.apa.org/research-practice/conduct-research/self-determination-theory.html))

- **Autonomy** — *volition*, not independence: the sense that the action flows from your own values, even when chosen for you. The tool should let the user feel they *chose* the next action, not that it was imposed.
- **Competence** — the need to feel effective and grow mastery. Wins must be visible. (This is *also* why easy-building is so tempting: it's a cheap competence hit. The tool should redirect that hunger toward small wins on the *important* work.)
- **Relatedness** — belonging/connectedness. Pure solo work starves this; body doubling and accountability feed it.

Crucially: **you cannot fix a competence problem with more choice, or a relatedness deficit with more autonomy.** Each is independently necessary. ([SDT three needs](https://www.suebehaviouraldesign.com/en/blog/self-determination-theory-explained/))

### Perceived control reduces overwhelm

A recurring SDT/stress finding is that **perceived control** is a primary buffer against the stress of a heavy load. Overwhelm is not strictly a function of *how much* there is to do, but of how *in control* one feels of it. A single trusted system that makes the load legible and bounded restores perceived control even when the absolute workload is unchanged. ([SDT & autonomy/control](https://positivepsychology.com/self-determination-theory/))

### Flow (Csikszentmihályi): the antidote state

**Flow** is the deep-engagement state that is the opposite of both freeze and shallow busy-work. Its three core preconditions are directly actionable: ([Flow theory, Wikipedia](https://en.wikipedia.org/wiki/Flow_(psychology)), [Father of Flow, PositivePsychology](https://positivepsychology.com/mihaly-csikszentmihalyi-father-of-flow/))

1. **Clear, proximal goals** — short-term, specific, important.
2. **Immediate, actionable feedback** — so you can adjust and feel progress.
3. **Challenge–skill balance** — challenge slightly above skill. Too hard → **anxiety** (the freeze trigger); too easy → **boredom** (which, note, describes the easy-building escape hatch — it's *below* the flow channel, not in it).

The design implication is sharp: the easy-building distraction is *boredom-zone* activity dressed as productivity. The tool's job is to keep the user in the flow channel — clear next goal, immediate feedback, right-sized challenge — on the *important* work.

---

## 5. Evidence-based interventions that measurably reduce freeze and improve follow-through

This is the intervention toolbox, ordered roughly by strength of evidence.

### Implementation intentions / if-then planning (Gollwitzer) — the strongest single lever

An **implementation intention** is a pre-formed "**if [situation], then I will [action]**" plan that specifies *when, where, and how* you'll act. **Gollwitzer & Sheeran's meta-analysis (94 tests) found a medium-to-large effect, d = .65, on goal attainment**; a 2024 mega-meta-analysis (642 tests) confirmed effectiveness across cognitive, affective, and behavioral outcomes (.27 ≤ d ≤ .66) and long-term follow-ups. They work by **automating initiation** — handing the start decision to a pre-set environmental cue so the depleted PFC doesn't have to decide in the moment. Effects are largest when the plan is genuinely *if-then* formatted, motivation is high, and the plan is rehearsed at least once. ([Gollwitzer & Sheeran meta-analysis](https://cancercontrol.cancer.gov/sites/default/files/2020-06/goal_intent_attain.pdf), [If-then planning review](https://www.tandfonline.com/doi/full/10.1080/10463283.2020.1808936), [2024 642-test meta-analysis](https://www.tandfonline.com/doi/abs/10.1080/10463283.2024.2334563))

### The Zeigarnik effect and closing open loops by *planning* (not finishing)

**Zeigarnik (1927):** unfinished tasks stay active in memory (~90% better recalled than finished ones), generating intrusive thoughts and draining working-memory bandwidth — the felt experience of "too many tabs open." ([Zeigarnik effect overview](https://blog.cognifit.com/stuck-on-unfinished-tasks-how-the-zeigarnik-effect-drives-memory-attention-and-productivity/))

The breakthrough finding: **Masicampo & Baumeister (2011), "Consider It Done! Plan Making Can Eliminate the Cognitive Effects of Unfulfilled Goals"** (*J. Personality & Social Psychology*, 101(4), 667–683). Unfinished goals caused intrusive thoughts and degraded performance on unrelated tasks — but simply **making a specific plan for the unfinished task eliminated those effects, without doing any of the work.** It is the *absence of a plan*, not the unfinished work itself, that occupies the mind. ([Masicampo & Baumeister, PubMed](https://pubmed.ncbi.nlm.nih.gov/21688924/), [overview](https://www.psychologytoday.com/us/blog/natural-order/202209/how-the-little-known-zeigarnik-effect-impacts-everyone-daily))

This is the scientific justification for **capture + clarify-to-next-action**: you can quiet the overwhelming mental noise (and restore PFC bandwidth) by *planning* the open loops, not by closing them all.

### Getting Things Done: capture, the next physical action, and the two-minute rule

David Allen's **GTD** operationalizes the above. Its central tenet — *"your mind is for having ideas, not for holding them"* — is the Zeigarnik/Masicampo finding in plain language. Key mechanics: ([GTD, Wikipedia](https://en.wikipedia.org/wiki/Getting_Things_Done), [Two-minute rule, official GTD](https://gettingthingsdone.com/2020/05/the-two-minute-rule-2/))

- **Capture everything externally** → empties working memory, quiets open loops.
- **The next physical action** — define the single, visible, physical next step for everything. This is the unit that defeats freeze: you don't act on "launch company B's product," you act on "draft the three bullet points for the landing page." Most people feel *immediate relief* just from clarifying the next action.
- **Two-minute rule** — if it takes <2 minutes, do it now; filing it costs more overhead than doing it.
- **Mind like water** — the target state: respond to what hits you with exactly appropriate force, then return to stillness. (This is the felt synonym for "not overwhelmed.")

### Reducing WIP, timeboxing, and the two-minute / tiny-start rules as friction reducers

- **Timeboxing** creates the *delay reduction* and *immediate feedback* the Procrastination Equation and flow both need — a near deadline plus a defined stop.
- **The two-minute / tiny-start rule** drops activation energy below the freeze threshold.

### Tiny habits & "shrink the change" — engineering early wins

**BJ Fogg's Behavior Model: B = MAP** (Behavior happens when **M**otivation, **A**bility, and a **P**rompt converge). The strategic insight for low-motivation states: **don't pump motivation, raise ability by shrinking the behavior** until it's trivially easy, and attach a clear prompt. Fogg's canonical example: floss *one* tooth. Tiny, celebrated wins build the habit. ([Fogg Behavior Model](https://www.behaviormodel.org/), [Tiny Habits summary](https://www.nehrlich.com/blog/2020/03/03/tiny-habits-by-bj-fogg/))

**Chip & Dan Heath, *Switch* — "Shrink the Change."** People are more motivated when they feel *partly finished a long journey* than at the start of a short one. Engineer early, visible wins that are (a) meaningful to the goal and (b) within immediate reach. Early success manufactures hope, which feeds the Expectancy term. ([Switch / shrink the change](https://readingraphics.com/book-summary-switch/), [Heath Brothers, Switch](https://heathbrothers.com/books/switch/))

Together these say: **the antidote to overwhelm-freeze is not better planning — it's shrinking.** Make the next right action so small it slips under the freeze threshold, then make the win visible.

### Self-compassion lowers procrastination and the stress that feeds it

**Sirois (2014), "Procrastination and Stress: Exploring the Role of Self-compassion"** (drawing on **Kristin Neff's** framework): across four samples, procrastination correlated with *lower* self-compassion and *higher* stress, and **self-compassion mediated the stress–procrastination link** in every sample. Because procrastination is mood repair (§2), self-blame *increases* the negative affect that triggers the next avoidance — a vicious cycle. Self-compassion breaks it by reducing the aversive emotion at the source. ([Sirois, "Procrastination and Stress"](https://self-compassion.org/wp-content/uploads/publications/Procrastination.pdf), [Greater Good summary](https://greatergood.berkeley.edu/article/item/can_self_compassion_overcome_procrastination))

A tool that *shames* the user for avoidance ("you've ignored this for 6 days!") will measurably make the loop worse. A tool that responds with non-judgmental, forward-looking framing will help.

---

## 6. Managing MANY concurrent projects: cognitive load, context-switching, one trusted system, WIP limits

### Cognitive load theory

Working memory is a tiny, finite resource. Every open project, undecided obligation, and unresolved loop consumes a slice of it (the Zeigarnik tax, §5). When intrinsic + extraneous load exceeds capacity, performance collapses — the cognitive correlate of overwhelm. Reducing the *number of things simultaneously held in mind* is the most direct lever on overwhelm. ([WIP limits & cognitive load](https://www.kanban.fit/blog/wip-limits-productivity-optimization))

### Context-switching is brutally expensive

**Rubinstein, Meyer & Evans (2001), "Executive Control of Cognitive Processes in Task Switching"** (*J. Experimental Psychology: HPP*, 27, 763–797): switching between tasks incurs a measurable *time cost* that **grows with the complexity and novelty of the tasks** — exactly the strategic, high-value work a founder should be doing. The APA's summary of this work: **even brief mental blocks from switching can cost as much as 40% of someone's productive time** (attributed to David Meyer). ([Rubinstein, Meyer & Evans, APA PDF](https://www.apa.org/pubs/journals/releases/xhp274763.pdf), [APA on multitasking, "40%"](https://www.apa.org/topics/research/multitasking))

For someone running two companies, undisciplined switching between them is a hidden ~40% tax — and the constant re-loading of context is itself exhausting, feeding the stress that triggers freeze.

### The single trusted external system

GTD's core promise — and the Zeigarnik/Masicampo mechanism — is that *one* trusted external system, into which everything is captured and from which next actions are surfaced, restores **perceived control** and quiets open loops. Fragmentation across many tools *re-creates* the overwhelm by scattering the load and breaking trust ("did I capture that somewhere?"). Trust is the operative property: the brain only releases an open loop if it believes the system will resurface it. ([GTD trusted system](https://en.wikipedia.org/wiki/Getting_Things_Done))

### WIP limits as an antidote to overwhelm

Borrowed from Kanban: **cap the number of things "in progress" at once.** The counterintuitive, well-documented result is that **doing less in parallel finishes work faster** (shorter cycle time, less rework), *and* it directly lowers cognitive load, multitasking, and stress while raising focus and satisfaction. WIP limits force *finishing before starting* — the structural opposite of the user's start-easy-things-while-hard-things-stall pattern. ([WIP limits, Atlassian](https://www.atlassian.com/agile/kanban/wip-limits), [WIP & productivity](https://www.kanban.fit/blog/wip-limits-productivity-optimization), [context switching, Atlassian](https://www.atlassian.com/work-management/project-management/context-switching))

---

## Synthesis: the loop and where to break it

| Stage of the loop | Driving mechanism | Strongest counter-lever |
|---|---|---|
| **Overwhelm** | Choice overload (Hick), cognitive-load saturation, Zeigarnik open loops | Capture everything to ONE trusted system; show few items; WIP limits |
| **Freeze** | Yerkes–Dodson over-arousal; amygdala hijack suppressing PFC | Don't require the PFC to prioritize — the system pre-decides ONE next action; self-compassion to lower arousal |
| **Avoidance** | Procrastination = emotion regulation / mood repair (Pychyl, Sirois) | Reduce task aversiveness: shrink it, ritualize it, body-double it; if-then plans automate initiation |
| **Productive procrastination** | Easy work = cheap competence + dopamine, masks avoidance (boredom-zone, not flow) | Make small wins on the *important* work equally easy and visible; raise friction on escape-hatch building |

The unifying scientific insight: **you cannot out-discipline this loop, because the freeze state disables discipline and the avoidance is positively reinforced.** The leverage is environmental and structural — externalize the load, shrink the next step below the freeze threshold, make the right action lower-friction than the wrong one, and surface progress so motivation regenerates.

---

## Design principles for the tool/workflow

Each principle below is a concrete behavior/feature, tied to the science.

1. **Show at most 3 things at once — never the full list.** Hide the backlog by default. Choice overload (Iyengar & Lepper; Hick's Law) means the visible-item count *is* the overwhelm trigger. The full list lives in the trusted system; the screen shows a tiny, bounded view.

2. **Force a single, pre-decided NEXT physical action.** The system, not the frozen user, names the one concrete next step ("draft 3 landing-page bullets," not "launch product"). This bypasses the offline PFC (Yerkes–Dodson / amygdala) and delivers GTD's "immediate relief from clarifying the next action."

3. **Default to shrinking, not planning.** When something feels too big to start, the primary affordance is "make this smaller," recursively, until the next step is two-minutes-trivial (Fogg's raise-ability; *Switch*'s shrink the change; ADHD next-smallest-step). Planning is secondary; shrinking is primary.

4. **Capture is one keystroke, frictionless, always available.** Every stray obligation goes into the ONE trusted system instantly. This is the Zeigarnik/Masicampo mechanism — capturing + planning open loops quiets intrusive thoughts and frees working memory *even before the work is done*.

5. **Enforce a WIP limit ("in progress" cap) across BOTH companies.** Hard-cap active items (e.g., 3). Starting a new item requires finishing or explicitly parking another. This structurally blocks the start-easy-things-while-hard-stalls behavior and cuts the ~40% context-switching tax (Rubinstein/Meyer/Evans).

6. **Make every commitment an if-then plan.** Don't store "email the investor"; store "**When** I sit down after coffee, **I will** email the investor." If-then formatting is the single highest-leverage intervention (Gollwitzer, d ≈ .65) and automates initiation past the freeze.

7. **Surface progress and manufacture early wins.** Show "X of Y done today," streaks, and "you're 70% through this project" framing. This shrinks the *Delay* term, supplies flow's immediate feedback, feeds *Competence* (SDT), and engineers hope (Heath's shrink-the-change → raises Expectancy).

8. **Detect and gently flag "busy avoidance."** When the user keeps logging easy/low-value building while a high-value item sits untouched, surface it non-judgmentally: "Your important work on [X] has been parked 4 days — want a 2-minute first step?" Names the boredom-zone escape hatch without shaming.

9. **Build in self-compassion, never shame.** Overdue framing must be kind and forward-looking ("let's find the smallest restart," not "you failed again"). Self-blame increases the aversive emotion that *drives* the next avoidance (Sirois/Neff); compassion measurably lowers procrastination.

10. **Ritualize a weekly review.** A recurring, low-friction reflect-and-reset (GTD's "reflect") to re-capture, re-prioritize, prune, and re-set the few active items. This is where perceived control is rebuilt and the trusted system earns its trust.

11. **Support body doubling / accountability.** A "work alongside" mode, a co-working session, or a visible commitment shared with one person. Provides an external start cue, lowers activation energy, and feeds *Relatedness* (SDT) that pure solo founder-work starves.

12. **Protect single-company focus blocks (anti-switching).** Default the day into timeboxed blocks dedicated to ONE company/project, with the other's items hidden during the block. Timeboxing supplies near deadlines + clear stop (flow + Delay reduction) and directly fights the 40% switching cost of running two companies in parallel.

---

### Key sources

- Iyengar & Lepper (2000), choice overload / jam study — [overview](https://digitalwellbeing.org/the-jam-study-strikes-back-when-less-choice-does-mean-more-sales/)
- Yerkes–Dodson law — [SimplyPsychology](https://www.simplypsychology.org/what-is-the-yerkes-dodson-law.html) · [Wikipedia](https://en.wikipedia.org/wiki/Yerkes%E2%80%93Dodson_law) · [PFC/norepinephrine mechanism](https://neurosity.co/guides/yerkes-dodson-law-arousal-performance)
- Pychyl & Sirois, procrastination as emotion regulation — [Fast Company](https://www.fastcompany.com/90357248/procrastination-is-an-emotional-problem) · [short-term mood regulation](https://www.researchgate.net/publication/234130829_Procrastination_and_the_Priority_of_Short-Term_Mood_Regulation_Consequences_for_Future_Self)
- Steel & König (2006), Temporal Motivation Theory — [primary PDF](https://goal-lab.psych.umn.edu/orgpsych/readings/12.%20Judgment%20&%20Decision%20Making/Steel%20&%20Konig%20(2006).pdf) · [Wikipedia](https://en.wikipedia.org/wiki/Temporal_motivation_theory)
- Gollwitzer & Sheeran, implementation intentions meta-analysis (d=.65) — [PDF](https://cancercontrol.cancer.gov/sites/default/files/2020-06/goal_intent_attain.pdf) · [2024 642-test meta-analysis](https://www.tandfonline.com/doi/abs/10.1080/10463283.2024.2334563)
- Masicampo & Baumeister (2011), "Consider It Done!" — [PubMed](https://pubmed.ncbi.nlm.nih.gov/21688924/)
- Ryan & Deci, Self-Determination Theory — [primary PDF](https://selfdeterminationtheory.org/SDT/documents/2000_RyanDeci_SDT.pdf) · [APA](https://www.apa.org/research-practice/conduct-research/self-determination-theory.html)
- Csikszentmihályi, Flow — [Wikipedia](https://en.wikipedia.org/wiki/Flow_(psychology)) · [PositivePsychology](https://positivepsychology.com/mihaly-csikszentmihalyi-father-of-flow/)
- Sirois (2014), self-compassion & procrastination — [PDF](https://self-compassion.org/wp-content/uploads/publications/Procrastination.pdf)
- Fogg Behavior Model / Tiny Habits — [behaviormodel.org](https://www.behaviormodel.org/) · Heath, *Switch* / shrink the change — [summary](https://readingraphics.com/book-summary-switch/)
- Allen, Getting Things Done — [Wikipedia](https://en.wikipedia.org/wiki/Getting_Things_Done) · [two-minute rule](https://gettingthingsdone.com/2020/05/the-two-minute-rule-2/)
- Rubinstein, Meyer & Evans (2001), task-switching cost — [APA PDF](https://www.apa.org/pubs/journals/releases/xhp274763.pdf) · [APA "40%"](https://www.apa.org/topics/research/multitasking)
- WIP limits — [Atlassian](https://www.atlassian.com/agile/kanban/wip-limits) · [kanban.fit](https://www.kanban.fit/blog/wip-limits-productivity-optimization)
- ADHD/executive function: externalization, body doubling — [Neurodivergent Insights](https://neurodivergentinsights.com/executive-function-helpers/) · [body doubling science](https://midtownpsychotherapy.org/blog/the-science-behind-body-doubling-why-it-helps-adhd-brains-regulate-and-focus)
