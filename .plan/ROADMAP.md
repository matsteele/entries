# Entries — Life Planning & Time Tracking System

## Overview

Personal productivity system combining time tracking, journaling, meal planning, goal management, and daily task orchestration. Terminal CLI + Next.js dashboard.

**Goal:** [Live an Optimized Life](http://localhost:7777/?view=planning&goalId=goal-life-infrastructure) (`goal-life-infrastructure`)
**Project:** [Life Planning System Architecture](http://localhost:7777/?view=planning&goalId=proj-life-system) (`proj-life-system`)
**Project folder:** `~/projects/currentProjects/entries`
**Architecture:** See `ARCHITECTURE.md`

**Priority:** 1–5 (5 = highest). **Weight:** 1–10 (granular version of priority).

---

## Bugs — P5 (fix first)

> Specs: [bugs-p5.md](epics/bugs-p5.md)

| Bug | W | Status |
|-----|---|--------|
| 🐛 Planning view: deleting a project doesn't remove it | 10 | ⬜ |
| 🐛 Focus Timeline: can't assign untracked time at current gap / can't reassign active task from timeline | 9 | ⬜ |
| 🐛 Focus Timeline: timezone mismatch in time axis ticks | 8 | ⬜ |
| 🐛 Current task view: focus level buttons don't work | 8 | ⬜ |

---

## Epics

### E10: Session Management — P5 W:9 (planned) `ee717322-575e-436d-ac53-2fdb424920c9`
> PRD: [session-management.md](epics/session-management.md)

Edit and delete tracked sessions across today and historical days.
- ⬜ Delete sessions (today — remove from JSON + Postgres)
- ⬜ Delete sessions (historical — remove from Postgres, update JSON if present)
- ⬜ Edit historical sessions (currently read-only because `isLive` gates `canEdit`)
- ⬜ Unified session API: PATCH/DELETE that works regardless of source (JSON vs Postgres)

### E3: Planning System — P4 W:8 (active) `e905601c-a607-499f-8bfe-a2ed22610df8`
Goals → Projects → Epics → Actions hierarchy with treemap visualization.
- ✅ Treemap with drill-down navigation
- ✅ Context inheritance (cascades down hierarchy)
- ✅ Weekly allocation bar (focused minutes budget)
- ✅ Weekly target slider with remaining capacity
- ✅ Add to Today from epics/actions
- ⬜ Completed items: sort to bottom, render transparent with checkmark — P5 W:8
- ⬜ Project folder convention (.RM.md, ARCHITECTURE.md, docs/epics/) — P3 W:7
- ⬜ Auto-sync planning view from project .RM.md files — P3 W:7

### E5: Meals & Nutrition — P4 W:8 (active) `536affe8-80bb-4a50-aabf-4880ee47f632`
> PRD: [meals-nutrition.md](epics/meals-nutrition.md)

Meal planning, macro tracking, grocery lists.
- ✅ Meal library with macro estimation
- ✅ 5-slot daily meal plan
- ✅ Fasting window tracking
- ✅ Grocery list generation
- ⬜ Delete and add meals from the menu — P5 W:8
- ⬜ Composable meals: pick sub-ingredients and combine into meals — P4 W:8

### E11: Starred Time Allotments — P4 W:9 (planned) `8de9e4a1-ed4a-4620-98cb-7574165c524c`
> PRD: [starred-allotments.md](epics/starred-allotments.md)
Dedicate a weekly time budget to a specific intention (goal, task, or epic). The point is the time you commit, not a particular outcome.
> "I want to be able to budget my time better. I want to have a slot of time dedicated this week to a particular intention (Goal, task, epic), we can call it starring it, and giving it a time allotment in actual mins that have to be accomplished that week, or until it is finished. It will sit on your task. The point of a starred activity with an allotment is that the point is the time you dedicate to it, not a particular outcome."
- ⬜ Star a task/epic/goal with a weekly wall-clock minute allotment
- ⬜ Track actual minutes spent against allotment (auto from sessions)
- ⬜ Visual indicator on task (starred badge + progress toward allotment)
- ⬜ Weekly rollup: allotted vs actual per starred item
- ⬜ Allotment persists until completed or user removes it
- ⬜ Works across hierarchy levels (goal, project, epic, action, task)

### E9: Supplements & Workout — P3 W:5 (active) `8f70b4b4-fc4b-4a71-a899-9d2eca2cf75c`
Health tracking views.
- ✅ Supplements view
- ✅ Workout view
- ⬜ Training journal integration with entries DB

### E4: Daily Intentions — P3 W:5 (active) `ed081569-e6bf-4985-b44e-2de6b1cb7202`
Morning intention setting with semantic matching against hierarchy.
- ✅ Narrative input saved to daily_intentions table
- ✅ Claude-mediated `/t intentions` protocol
- ✅ Semantic matching against goals/projects/epics/actions/routines
- ✅ Actionable outline in UI (switch/add/start/link)
- ⬜ Auto-match without Claude (for UI-only saves)

### E13: Focus Timeline Day Summary & Analytics — P4 W:7 (planned) `focus-analytics`
Better "how much" visibility in the focus view, taking lessons from the sleep view's information density.
> "The tasks show total, but I also want the focus to be total for the day. And have useful visualizations."
- ⬜ **Headline summary row** — compact stat strip directly under the timeline: tracked time, focused minutes (fm), deep focus time (f:3+), biggest context chunk. Replaces the three weak `LinearProgress` bars
- ⬜ **Context breakdown bar** — full-width stacked horizontal bar below the time axis showing today's wall-clock time split by context (colors match context config). Hover shows "🟣 proj 1h 40m (32%)"
- ⬜ **Focus level histogram** — small bar chart (like sleep density histogram) showing minutes at each focus level 0–5 for the day, sitting below the breakdown bar
- ⬜ **7-day focused-minutes sparkline** — mini multi-day trend of focused minutes with target reference line; mirrors sleep's duration sparkline
- ⬜ **`buildTimeline` enhancement** — add per-context minute totals + per-focus-level totals to `summary` object so frontend doesn't recompute from raw timeline

### E12: Content Publishing & Planning — P2 W:4 (planned) `449f9d2f-ebd3-49bd-aa31-eac9e61331f4`
Cross-platform content creation view — draft once, publish to Twitter, Threads, Substack by selection. Evolves into a full content planning pipeline.
> "I want to use a threads interface that cross-pollinates across Twitter, Threads and Substack based on selection. This may eventually build out to a content planning view, where I come up with my plans for building content there and then dedicate time to build it out. So the view is potential content, that could manifest as threads, long-form Substacks, and eventually short-form video on TikTok."
- ⬜ Content drafting view (new dashboard tab)
- ⬜ Platform selector: Twitter, Threads, Substack (multi-select per draft)
- ⬜ Thread composer (split long-form into thread chunks with preview)
- ⬜ Content backlog: ideas → drafts → published pipeline
- ⬜ Content planning: schedule and dedicate time to content creation (ties into starred allotments)
- ⬜ Future: short-form video planning (TikTok)

### Completed Epics

<details>
<summary>E1: Daily Task Tracking ✅ <code>98774d67-865b-4106-9198-f9327e46eb8c</code></summary>

Terminal-based task tracking with context-aware numbering, time tracking, routine/novel split.
- ✅ CLI with `/t` commands
- ✅ Context system (per/soc/prof/cul/proj/heal/learn/us)
- ✅ Time budget (earning/spending)
- ✅ Google Tasks pull + completion sync
- ✅ Jira pull
- ✅ Source indicators (GT/Jira chips)
- ✅ Idle monitor with rest-context immunity
</details>

<details>
<summary>E2: Focus Timeline Dashboard ✅ <code>d42a96c3-f3ca-4e60-ae30-8aa7086c0121</code></summary>

Next.js dashboard with day timeline, editable sessions, overlays.
- ✅ Session bars colored by context, height by focus level
- ✅ Drag-edit start/end/focus
- ✅ Calendar overlay, fasting bar, sleep bar, macro bar
- ✅ Date navigation with Postgres historical data
- ✅ Completed tasks strip
</details>

### E6: Sleep Tracking — P4 W:7 (active) `50503fbc-8fad-4e91-b15b-af76189526ef`
> PRD: [sleep-tracking.md](epics/sleep-tracking.md)

Sleep/wake journaling with quality tracking. Sleep crosses midnight, needs retroactive correction, and must sync both JSON + Postgres.
- ✅ `/t rest` and `/t wake` journaling flows
- ✅ Sleep bar on timeline
- ✅ Quality rating popover
- ✅ 7-day average stats
- ⬜ Retroactive sleep logging: `/t sleep 10:20pm-7:30am` — set sleep times after the fact, updates routine.json session + Postgres + sleep log file
- ⬜ Sleep correction from UI: click sleep bar to adjust start/end times (drag or input)
- ⬜ Cross-midnight handling: sleep session spans two days, shows tail on previous day + head on current day
- ⬜ Claude skill (`/sleep`) for natural language sleep logging ("I slept from 10:20 last night until 7:30")

<details>
<summary>E7: Email Triage ✅ <code>ed346d65-a038-49ce-b9e3-792648c910f3</code></summary>

Gmail inbox management with auto-categorization.
- ✅ Needs Attention / Jobs / Informational / Marketing categories
- ✅ Bulk actions, task creation from emails
- ✅ Gmail CLI tool
</details>

<details>
<summary>E8: Google Tasks Integration ✅ <code>8b31d4e2-e52b-43a2-8020-f40206af173d</code></summary>

Cloud task backlog with list-to-context mapping.
- ✅ Feed view with per-list context dropdown
- ✅ Completion sync (local → Google)
- ✅ Pull due tasks
- ✅ Source indicators
</details>

---

## Future — P1–2

- **Open source launch: pitch to startup friends** — P2 W:5. Demo the system to startup circle, get feedback, prep for open source release. Needs cleanup pass (README, setup docs, env var hardcoding audit).
- **Oura Ring integration** — P2 W:5. Sync Oura data to auto-populate sleep times (replacing manual `/t rest` / `/t wake` logging) and fill in activity/movement during non-computer time (exercise, walks, errands) that the task tracker can't capture. Oura becomes the passive data layer; entries remains the active/intentional layer.
- **Task sorting by focus level & priority** — P3 W:6. Group by focus level, sort by priority within each group.
- **Claude session ↔ task linking** — P2 W:4. Associate Claude sessions with tracked tasks for passive time tracking.
- **AI-guided planning → intentions autofill** — P2 W:4. Claude-guided planning that auto-fills morning intentions.
- **State tracking** — P1 W:3. Mood, energy, focus subjective ratings.
- **Semantic search UI** — P1 W:3. Backend exists (`npm run search`), needs frontend.
- **Weekly/monthly review automation** — P1 W:3. Automated review generation.
- **Protocol-driven workflows** — P1 W:2. Needs definition.
