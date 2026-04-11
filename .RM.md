# Entries — Life Planning & Time Tracking System

## Overview

Personal productivity system combining time tracking, journaling, meal planning, goal management, and daily task orchestration. Terminal CLI + Next.js dashboard.

**Goal:** Live an Optimized Life
**Project folder:** `~/projects/currentProjects/entries`
**Architecture:** See `ARCHITECTURE.md`

---

## Epics

### 1. Daily Task Tracking (completed)
Terminal-based task tracking with context-aware numbering, time tracking, routine/novel split.
- ✅ CLI with `/t` commands
- ✅ Context system (per/soc/prof/cul/proj/heal/learn/us)
- ✅ Time budget (earning/spending)
- ✅ Google Tasks pull + completion sync
- ✅ Jira pull
- ✅ Source indicators (GT/Jira chips)
- ✅ Idle monitor with rest-context immunity

### 2. Focus Timeline Dashboard (completed)
Next.js dashboard with day timeline, editable sessions, overlays.
- ✅ Session bars colored by context, height by focus level
- ✅ Drag-edit start/end/focus
- ✅ Calendar overlay, fasting bar, sleep bar, macro bar
- ✅ Date navigation with Postgres historical data
- ✅ Completed tasks strip

### 3. Planning System (active)
Goals → Projects → Epics → Actions hierarchy with treemap visualization.
- ✅ Treemap with drill-down navigation
- ✅ Context inheritance (cascades down hierarchy)
- ✅ Weekly allocation bar (focused minutes budget)
- ✅ Weekly target slider with remaining capacity
- ✅ Add to Today from epics/actions
- ⬜ Project folder convention (.RM.md, ARCHITECTURE.md, docs/epics/)
- ⬜ Auto-sync planning view from project .RM.md files

### 4. Daily Intentions (active)
Morning intention setting with semantic matching against hierarchy.
- ✅ Narrative input saved to daily_intentions table
- ✅ Claude-mediated `/t intentions` protocol
- ✅ Semantic matching against goals/projects/epics/actions/routines
- ✅ Actionable outline in UI (switch/add/start/link)
- ⬜ Auto-match without Claude (for UI-only saves)

### 5. Meals & Nutrition (completed)
Meal planning, macro tracking, grocery lists.
- ✅ Meal library with macro estimation
- ✅ 5-slot daily meal plan
- ✅ Fasting window tracking
- ✅ Grocery list generation

### 6. Sleep Tracking (completed)
Sleep/wake journaling with quality tracking.
- ✅ `/t rest` and `/t wake` journaling flows
- ✅ Sleep bar on timeline
- ✅ Quality rating popover
- ✅ 7-day average stats

### 7. Email Triage (completed)
Gmail inbox management with auto-categorization.
- ✅ Needs Attention / Jobs / Informational / Marketing categories
- ✅ Bulk actions, task creation from emails
- ✅ Gmail CLI tool

### 8. Google Tasks Integration (completed)
Cloud task backlog with list-to-context mapping.
- ✅ Feed view with per-list context dropdown
- ✅ Completion sync (local → Google)
- ✅ Pull due tasks
- ✅ Source indicators

### 9. Supplements & Workout (active)
Health tracking views.
- ✅ Supplements view
- ✅ Workout view
- ⬜ Training journal integration with entries DB

---

## Future

- State tracking (mood, energy, focus subjective ratings)
- Semantic search across all entries
- Weekly/monthly review automation
- Protocol-driven workflows
