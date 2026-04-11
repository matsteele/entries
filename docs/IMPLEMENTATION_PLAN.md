# Entries — Implementation Plan

> Generated from PRD review session 2026-04-05. Covers all features in `entries.prd.md`.

---

## Decisions Made

### Data Layer
- **Sessions move to Postgres**: new `task_sessions` table. JSON files (`completed.json`, `pending.json`, `routine.json`, `current.json`) remain for task metadata, but sessions are written to Postgres going forward.
- **Historical backfill**: `time-log.json` (Dec 2025–present) migrated into `daily_time_snapshots` as legacy rows (context minutes only, no focus data). Existing 80 sessions from `completed.json` migrated with focus defaults (novel→f:2, routine→f:1, unstructured→f:0).
- **Protocols canonical source**: `journals WHERE type = 'protocol'` — 23 entries. The `protocols` table is legacy, ignored for all new features.
- **Meals in Postgres**: new `meals` and `meal_plans` tables in `entries` database.
- **No separate snapshots job**: analytics aggregate directly from `task_sessions` by timestamp. Day/week/month = date arithmetic on `started_at`.

### Calendar
- **Push removed**: stop pushing task sessions to Google Calendar.
- **Pull remains**: calendar events pulled and rendered as a separate overlay on FocusTimeline (reminders/appointments, visually distinct from session blocks).
- **Historical calendar events**: leave in place, just stop creating new ones.

### Timeline Editing
- **Resize only** (no full block move): drag left/right edge to adjust start/end time.
- **Clamp behavior**: sessions are mutually exclusive — drag cannot cross an adjacent session boundary.
- **Focus level editing**: drag top edge of block up/down to change focus level (0–5). Block height is already proportional to focus level, so the gesture matches the visual.
- **Persistence**: `PATCH /api/sessions/:taskId/:sessionIndex` → writes back to task JSON + updates Postgres session row.

### Focus Defaults
- Routine tasks → `f:1` (exceptions stored explicitly, e.g. meditation = `f:5`)
- Novel tasks → `f:2`
- Unstructured → `f:0`
- All overridable via timeline drag or `/t focus-N`

### Focused Minutes Target
- Single user-configurable value per context (not daily — a persistent baseline).
- Editable via dashboard input.
- Stored in a config file or `user_config` table.
- Progress bar on dashboard tracks today's focused minutes (minutes × focus) vs target.

### Meal Planning
- ~30 meals across categories — simple categorized list, no search needed.
- Meal slots appear as draggable buttons within the eating window band on the fasting bar (same visual language as protein shake icon).
- Clicking a slot opens protocol-style drawer: meal selector (empty slot) or meal detail + "Change meal" button (filled slot).
- Macro bar shows totals for planned meals only, with "X of Y meals planned" indicator.
- Ad-hoc food log input for items eaten outside planned meals.
- Tables: `meals (id, name, category, ingredients[], recipe, macros{protein,carbs,fat,calories})` and `meal_plans (date, slot, meal_id, planned_time)`.

### Protocol/Plan Surfacing
- Match cached on task object as `protocolId` / `planId` after first lookup.
- Lookup = Postgres vector similarity query against `journals WHERE type = 'protocol'` or `plans` table — no OpenAI call at switch time.
- Threshold: similarity > 0.7.
- Display: collapsible inline panel below active task card in dashboard; shown after switch confirmation in CLI.
- Routine tasks: match precomputed once, stored in `routine.json` task object.
- Novel tasks: match on first switch, cached on task object.

### URL State
- Historical FocusTimeline date reflected in URL as `?date=YYYY-MM-DD`.

### Removed
- `/t start` command: removed from CLI and all documentation.
- Google Calendar session push: removed from task switch/complete/pause flows.

---

## Implementation Sequence

### Phase 1 — Schema & Data Migration
**Goal**: Get sessions into Postgres, meals table ready, legacy data preserved.

1. Create `task_sessions` table
2. Create `daily_time_snapshots` table
3. Create `meals` and `meal_plans` tables
4. Create `user_config` table (focused minutes targets, other persistent settings)
5. Backfill `daily_time_snapshots` from `time-log.json` (legacy rows, no focus data)
6. Migrate 80 sessions from `completed.json` into `task_sessions` with focus defaults
7. Write session to Postgres on every future task switch/complete/pause (modify `daily-log-cli.js`)

### Phase 2 — Remove Deprecated Features
**Goal**: Clean break before building on top.

1. Remove `/t start` command from `daily-log-cli.js`
2. Remove Google Calendar session push from task switch/complete/pause/idle flows
3. Remove all references to `/t start` from `CLAUDE.md`, `ARCHITECTURE.md`, `AGENTS.md`, `README.md`, `tracking/SESSION_ACTIVITY_TRACKING.md`
4. Keep `/t sync` command but repurpose as pull-only (import calendar events, no push)

### Phase 3 — Editable Timeline Blocks
**Goal**: Direct time and focus editing in FocusTimeline.

1. Add `PATCH /api/sessions` route — finds task across JSON files, updates session timestamps + Postgres row
2. Make session blocks interactive in FocusTimeline:
   - Left/right edge drag → resize time (clamped to adjacent sessions)
   - Top edge drag → change focus level (0–5), updates block height in real time
3. Visual affordances: cursor change on hover over edges, subtle resize handles
4. Write tests: session update API, clamp behavior, focus level bounds

### Phase 4 — Calendar Pull Overlay
**Goal**: Show Google Calendar events in FocusTimeline as a separate layer.

1. Add `GET /api/calendar/events?date=` route — pulls events from Google Calendar for a given day
2. Render calendar events as a distinct overlay on FocusTimeline (different visual style — outlined, not filled)
3. Tooltip on hover showing event title and time

### Phase 5 — Context Budget Bars + Focused Minutes
**Goal**: Live visual feedback on time allocation and focus quality.

1. Add focused minutes targets to `user_config` (one per context)
2. Add dashboard input to edit targets per context
3. Build context budget bar component: actual minutes vs target, color-coded (green/yellow/red)
4. Build focused minutes counter: today's sum of (minutes × focus level) vs target
5. Connect to polling — updates live as tasks are switched
6. Expose budget data via `GET /api/time/budget`

### Phase 6 — Focus/Priority Chips on Tasks
**Goal**: f:N and p:N visible on every task without running a command.

1. Add `f` and `p` fields to task display in dashboard TasksView (active task + pending list)
2. Unset focus → apply defaults (routine=1, novel=2, unstructured=0) at display time, not stored
3. Unset priority → show as `p:—`
4. Add compact chips to terminal statusline output

### Phase 7 — Historical Timeline
**Goal**: Browse any past day's FocusTimeline.

1. Add `?date=YYYY-MM-DD` query param support to FocusTimeline
2. Add prev/next day navigation buttons
3. Load sessions from `task_sessions` Postgres table filtered by date
4. Load state data from `tracking/states/YYYY-MM-DD.json` for the selected date
5. Load calendar overlay for selected date
6. Ideal schedule overlay always shows current schedule (not date-specific)
7. Today = default when no date param

### Phase 8 — Reporting CLI
**Goal**: `/t report day` and `/t report week` in terminal.

1. `/t report day [YYYY-MM-DD]`: total time by context, focused minutes, focus distribution, vs targets
2. `/t report week [YYYY-WW]`: context totals aggregated across week, trend vs prior week
3. Both read from `task_sessions` Postgres table
4. Terminal-rendered table output

### Phase 9 — Meal Planning Panel
**Goal**: Plan meals, see macros, access recipes from dashboard.

1. Create `meals` seed data — ingest reference meals (name, category, macros, recipe)
2. Add meal slot buttons to fasting bar — draggable within eating window
3. Clicking slot opens protocol-style drawer (meal selector or meal detail)
4. Daily macro totals bar — sums planned meals, shows "X of Y planned"
5. Ad-hoc food log input — free-entry items added to daily macro total
6. API routes: `GET /api/meals`, `GET /api/meal-plans/:date`, `POST /api/meal-plans/:date`

### Phase 10 — Protocol/Plan Surfacing
**Goal**: Relevant protocol or plan shown on task activation without extra steps.

1. Precompute protocol matches for all routine tasks — store `protocolId` on task object in `routine.json`
2. On novel task first switch: query `journals WHERE type = 'protocol'` by vector similarity, cache `protocolId` on task
3. Same for plan matching against `plans` table
4. CLI: show protocol name + first 3 steps after switch confirmation
5. Dashboard: collapsible panel below active task card showing protocol/plan summary
6. Manual override: UI to link/unlink protocol or plan from any task

---

## New Database Schema

```sql
-- Task sessions (source of truth for all time analytics)
CREATE TABLE task_sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  task_id TEXT NOT NULL,
  task_title TEXT NOT NULL,
  context TEXT NOT NULL,          -- cul/prof/per/soc/proj/heal/us
  focus_level INTEGER DEFAULT 2,  -- 0-5
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,           -- null = currently active
  source TEXT DEFAULT 'live',     -- 'live' | 'legacy' | 'migrated'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON task_sessions (started_at);
CREATE INDEX ON task_sessions (context, started_at);

-- Daily snapshots (backfilled from time-log.json, legacy only)
CREATE TABLE daily_time_snapshots (
  date DATE PRIMARY KEY,
  context_minutes JSONB NOT NULL, -- {cul: 240, prof: 0, ...}
  source TEXT DEFAULT 'legacy',   -- 'legacy' | 'computed'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Meals reference data
CREATE TABLE meals (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  category TEXT,                  -- breakfast/lunch/dinner/snack
  ingredients TEXT[],
  recipe TEXT,
  protein NUMERIC,
  carbs NUMERIC,
  fat NUMERIC,
  calories NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily meal plans
CREATE TABLE meal_plans (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  date DATE NOT NULL,
  slot TEXT NOT NULL,             -- breakfast/lunch/dinner/snack-1/snack-2
  meal_id TEXT REFERENCES meals(id),
  planned_time TIME,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, slot)
);

-- User config (focused minutes targets, etc.)
CREATE TABLE user_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Example rows:
-- ('focused_minutes_targets', '{"cul": 180, "proj": 120, "per": 60}')
-- ('fasting_window', '{"eating_start": "12:00", "eating_end": "20:00"}')
```

---

## API Routes to Add

| Route | Description |
|-------|-------------|
| `PATCH /api/sessions` | Update session start/end/focus — timeline drag edits |
| `GET /api/calendar/events?date=` | Pull Google Calendar events for a date |
| `GET /api/time/budget` | Context minutes vs targets + focused minutes total |
| `GET /api/time/history?period=day\|week\|month&n=7` | Historical aggregates for charts |
| `GET /api/meals` | All meals |
| `GET /api/meal-plans/:date` | Meal plan for a date |
| `POST /api/meal-plans/:date` | Set a meal slot |
| `DELETE /api/meal-plans/:date/:slot` | Clear a meal slot |
| `GET /api/config` | User config values |
| `PUT /api/config/:key` | Update a config value |

---

## Open / Deferred

- **`/t sync` repurpose**: currently does bidirectional sync. Needs to become pull-only. Decide whether to keep the command or fold it into the calendar overlay auto-fetch.
- **Workout integration**: defer until Google Spreadsheet is shared. Will infer data model from structure.
- **Distraction visualization**: lower priority, defer to after Phase 10.
- **StateTracker weekly view**: defer.
- **Sleep analytics panel**: defer.
- **Task recommendations**: defer.
- **Auto-boot (launchd)**: defer.

---

## Testing Strategy

### Automatable (run in loop)
- Session update API — clamp behavior, focus bounds, cross-file lookup
- Analytics aggregation — focused minutes math, context totals by day/week/month
- Meal plan CRUD — slot uniqueness, macro sum calculation
- Protocol match caching — first lookup stores result, second lookup skips query
- `/t report` CLI — output format, correct aggregation

### Playwright (dashboard)
- Budget bars render and update after task switch
- Meal drawer opens/closes, macro bar updates
- Historical timeline loads correct data for `?date=` param
- Focus/priority chips visible on all tasks

### Manual only
- Drag resize on timeline blocks — clamp feel, visual feedback
- Top-edge drag for focus level — gesture precision
- Meal slot drag within eating window
- Protocol drawer content accuracy
