# PRD: Starred Time Allotments (E11)

**Epic ID:** `8de9e4a1-ed4a-4620-98cb-7574165c524c`  
**Priority:** P4 W:9  
**Status:** Planned  
**Planning IDs:** Epic `8de9e4a1`, Project `proj-life-system`, Goal `goal-life-infrastructure`

---

## Concept

> "I want to have a slot of time dedicated this week to a particular intention (Goal, task, epic), we can call it starring it, and giving it a time allotment in actual mins that have to be accomplished that week, or until it is finished. The point of a starred activity with an allotment is that the point is the time you dedicate to it, not a particular outcome."

This is **commitment-based scheduling** — you're not tracking tasks to completion, you're committing to _spending time_ on something. Like a recurring weekly block: "I will spend 120 mins this week on trading."

### Key differences from regular task tracking

| Regular task | Starred allotment |
|---|---|
| Done when complete | Done when time is spent |
| Binary (complete/pending) | Progress toward a minute budget |
| Ephemeral (single day) | Persists week-over-week until removed |
| Tied to a specific task | Can be tied to any level of the hierarchy |

---

## Goals

- Star any item in the hierarchy (goal, project, epic, action) or a standalone task
- Assign a weekly minute budget to the starred item
- Auto-track actual minutes from sessions (any session under a starred epic counts toward it)
- Show visual progress toward the budget on the item card
- Weekly rollup view: budget vs. actual per starred item
- Allotment persists until the user removes it or the week ends (optionally auto-renews)

---

## User Stories

### Star and budget an item
> As a user, I want to star a goal/project/epic/action with a weekly minute allotment, so I'm committed to spending time on it this week.

**Acceptance criteria:**
- Any node in the PlanningView treemap can be starred (star icon on hover)
- Starring opens an inline prompt: "How many minutes this week?" with a number input
- The star + budget is saved to the database
- Starred items show a star badge + progress ring/bar (actual/allotted minutes)
- Multiple items can be starred simultaneously

### Track progress automatically
> As a user, I want my actual session time to count toward the allotment automatically, without manual entry.

**Acceptance criteria:**
- Sessions are attributed to an allotment based on their task's position in the hierarchy
- A session under action X → counts toward allotment on action X's epic AND project AND goal (all levels)
- Sessions on a task pulled from an epic count toward that epic's allotment
- Progress updates in real-time (on page refresh; live polling optional)

### Weekly rollup view
> As a user, I want to see all my starred allotments in one place with budget vs. actual, so I can plan the week.

**Acceptance criteria:**
- A "Starred" summary section appears at the top of the PlanningView (or as a widget on the FocusTimeline)
- Shows each starred item: name, context, allotted mins, actual mins this week, % complete
- Color coded: green (on track), yellow (behind), red (overdue/unstarted)
- Clicking an item navigates to it in the treemap
- "This week" = Mon–Sun calendar week

### Remove / renew allotment
> As a user, I want to remove a starred allotment or carry it over to next week.

**Acceptance criteria:**
- Un-starring removes the allotment immediately
- If week ends with incomplete allotment, system prompts: "Carry over to next week?" on Sunday evening or Monday morning (via task checker or morning intentions)
- Completed allotments (100% reached) auto-archive at week end (stay in history, removed from active view)

---

## Data Model

### New table: `allotments`

```sql
CREATE TABLE allotments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- What's being allotted (exactly one of these)
  goal_id     TEXT REFERENCES goals(id) ON DELETE CASCADE,
  project_id  TEXT REFERENCES plans(id) ON DELETE CASCADE,
  epic_id     UUID REFERENCES epics(id) ON DELETE CASCADE,
  action_id   UUID REFERENCES actions(id) ON DELETE CASCADE,
  task_id     TEXT,  -- local task ID (no FK, tasks are ephemeral)
  
  -- Budget
  allotted_minutes INTEGER NOT NULL,
  week_start       DATE NOT NULL,   -- ISO Monday of the week (e.g. 2026-04-14)
  
  -- State
  status TEXT DEFAULT 'active',     -- 'active' | 'completed' | 'archived'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Enforce exactly one target (check constraint)
  CONSTRAINT one_target CHECK (
    (goal_id IS NOT NULL)::int +
    (project_id IS NOT NULL)::int +
    (epic_id IS NOT NULL)::int +
    (action_id IS NOT NULL)::int +
    (task_id IS NOT NULL)::int = 1
  )
);
```

### Actual minutes computation

Actual minutes come from `task_sessions`. To attribute sessions to an allotment:

1. **Action-level allotment**: sum sessions where `task_id` matches any task derived from that action
2. **Epic-level allotment**: sum sessions where tasks belong to any action under that epic
3. **Project-level allotment**: sum sessions where tasks belong to any epic under that project
4. **Goal-level allotment**: sum sessions where tasks belong to any project under that goal
5. **Task-level allotment**: sum sessions for that specific task_id

The linking is loose — tasks pulled from epics carry an `epicId` field (already stored on tasks from `/t pull-goog`). Sessions carry `task_id`. So attribution chain: `task_id → epicId → projectId → goalId`.

For week: filter `started_at >= week_start AND started_at < week_start + 7 days`.

### API routes needed

```
GET  /api/allotments              → list active allotments with computed actual_minutes
POST /api/allotments              → create allotment (body: targetType, targetId, allottedMinutes, weekStart)
PATCH /api/allotments/:id         → update allotted_minutes or status
DELETE /api/allotments/:id        → remove allotment
GET  /api/allotments/summary      → weekly rollup: allotted vs actual, per item, current week
```

---

## UI Design

### On PlanningView treemap nodes

Add a ⭐ icon (star) to every node card, visible on hover. If starred:
- Show star as filled gold
- Show progress bar or circular ring: `actual / allotted` minutes
- Show badge: `X / Y min`

### Starred Summary Panel

New collapsible section at top of PlanningView (or separate tab):

```
⭐ This Week's Commitments
─────────────────────────────────────────────────────
● Trading System        [████████░░]  96/120 min  80%  🟡
● Life Planning System  [██████████]  130/90 min  ✅   🟢
● Trading (daily)       [░░░░░░░░░░]  0/60 min    🔴
```

Clicking any row drills into that item in the treemap.

### On TasksView

Starred tasks (task-level allotments) show a ⭐ badge + mini progress bar in the task row. When you switch to a starred task, the statusline shows: `★ 96/120 min this week`.

### On FocusTimeline (optional, stretch)

A thin horizontal "allotments bar" above or below the timeline shows today's contribution to each starred item as colored segments (like a mini budget bar).

---

## Edge Cases

- **Multiple allotments for same item**: Prevent duplicate — only one active allotment per item per week
- **Sessions span midnight**: Count in the week they _started_
- **Task moved to different epic**: Attribution follows the task at session time (snapshot, not retroactive)
- **Task has no epicId**: Falls back to task-level attribution only
- **Week rollover**: Sunday midnight — active allotments with `< 100%` remain visible; completed ones archive

---

## Implementation Order

1. DB migration: `allotments` table
2. API routes (GET, POST, PATCH, DELETE)
3. PlanningView: star icon + allotment modal on nodes
4. Actual minutes computation (query via API)
5. Starred summary panel in PlanningView
6. TasksView: star badge + progress on task rows
7. Week rollover logic + carry-over prompt (can be a `/t intentions` nudge initially)
