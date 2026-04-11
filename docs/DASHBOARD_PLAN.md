# Entries Dashboard — Product Requirements Document

## Vision

A local dashboard and AI-assisted planning system that connects daily execution to long-term goals — and keeps me in a state of productive, focused flow throughout the day.

The system bridges three layers of planning:

1. **Today** — local task log (what I will definitely complete today)
2. **This month** — Google Tasks (what is in scope for the month)
3. **Beyond** — project plans and goals (what I am building toward)

### Philosophy: Visual Thinking + Constant Conversation

The dashboard is not just for reviewing data — it is a cognitive support structure. Keeping plans, tasks, and progress visible reduces the mental overhead of re-orienting after every task switch, which is the primary cause of lost momentum. Visual structure keeps context loaded so focus can resume faster.

Equally important: being in continuous conversation (with Claude) acts as an external focus anchor. It channels thinking into productive output rather than letting it diffuse into distraction. The goal is a system where I am always either working or talking through what to work on next — never in a limbo of unfocused drift.

Claude acts as the primary planning interface — surfacing relevant tasks, helping resolve conflicts, keeping layers in sync, and serving as a thinking partner throughout the day. The dashboard is for **visibility and navigation**; Claude is for **manipulation, creation, and conversation**.

---

## Core Planning Model

### Task Hierarchy

```
10-year goal
  └── 5-year goal
        └── 1-year goal
              └── 6-month goal
                    └── Monthly goal
                          └── Project Plan
                                └── Phase (in scope this month)
                                      └── Google Tasks (month buffer)
                                              └── Local Daily Log (today only)
```

### Layer Rules

| Layer | Tool | Scope | Rule |
|-------|------|-------|------|
| Today | Local daily log (`/t`) | Must complete by day's end | Only add if 100% intending to complete. Scope must be achievable. |
| This month | Google Tasks | In-scope tasks for current month | Reflects current phase of active projects. Synced from project plans when phase is selected. |
| Project plans | Local database | Beyond current month | Full phases, milestones, and tasks for each project. Source of truth for what's planned. |
| Goals | Local database | Week → 10 years | Hierarchical. Each goal links to projects that serve it. |

### Conflict Resolution
Google Tasks and project plans represent different time horizons — tension between them is expected. Resolution:
- Selecting a project phase generates a task list in Google Tasks (month scope)
- Google Tasks should only contain tasks relevant to the **current month**
- Longer-horizon tasks stay in the project plan until their phase is active
- The "today" Google Tasks list syncs bidirectionally with the local daily log

---

## User Stories

### Morning Planning
- **As a user**, I want to start each morning by reviewing what I have on my plate — from Google Tasks (personal), Jira (work), and my project plans — so I can decide what to pull into today's local task log.
- **As a user**, I want Claude to surface the most relevant tasks from each source based on my current goals and active project phases, so I don't have to manually scan everything.
- **As a user**, I want today's local task list to only contain tasks I am 100% committed to completing that day, so my end-of-day completion rate is meaningful.

### Goal & Project Navigation
- **As a user**, I want to browse my goals by time horizon (today / month / 6 months / 1 year / 5 years / 10 years), so I can zoom in or out depending on my planning mode.
- **As a user**, I want to click a goal and see the projects that contribute to it, so I understand how my daily work connects to long-term intentions.
- **As a user**, I want to click a project and see its phases, and click a phase to see the tasks within it, so I can understand what needs to happen and when.
- **As a user**, I want to select an active project phase and have its tasks reflected in Google Tasks (month scope), so my monthly task list stays current without manual entry.

### Task Management
- **As a user**, I want my "today" Google Tasks list to stay in sync with my local daily log, so both systems reflect the same set of committed work.
- **As a user**, I want to pull tasks from Google Tasks or Jira into my local log in one action, so I don't have to duplicate effort.
- **As a user**, I want to see a visual overview of which tasks in each project plan are completed, in progress, or pending, so I can track project momentum at a glance.

### Reflection & Journaling
- **As a user**, I want to explore my journal entries, plans, and ideas as a connected node map, so I can discover patterns and relationships across my thinking.
- **As a user**, I want Claude to aggregate related ideas into themes and surface tensions or recurring concepts across my entries, so reflection is richer than reading individual entries.
- **As a user**, I want to connect my training data to a training journal, so my fitness reflection is tied to actual workout data.

### Focus & Time Tracking
- **As a user**, I want to see how my focus level changes throughout the day as a timeline, with untracked time shown as zero, so I can understand my actual cognitive output.
- **As a user**, I want to see time spent by context (Cultivo, personal, health, etc.) across day/week/month views, so I can balance my attention intentionally.

---

## Roadmap

### Phase 1 — Foundation (Backend + Core UI)
**Goal**: Get data visible in a browser

1. Database migration: Create `goals`, `goal_plans`, `goal_projects`, `daily_time_snapshots` tables
2. API routes: Extend `server.js` with all `/api/*` endpoints
3. Daily snapshot job: Archive each day's time data at midnight
4. Frontend scaffold: Next.js (or Vite + React) in `app/frontend/`
5. **Current tasks panel**: Pending/current/routine tasks, nested by context, with live active task timer
6. **Time tracking panel**: Today's context breakdown (stacked bar)

### Phase 2 — Goal & Project Hierarchy
**Goal**: Navigate from goals down to tasks

1. **Goal hierarchy UI**: Horizon selector (today → 10yr), goal cards grouped by context
2. **Project view**: Click goal → see linked projects with phase list
3. **Phase → task view**: Click phase → see tasks, with completion status
4. **Phase activation**: Select a phase → auto-generate Google Tasks entries for month scope
5. Goals API: CRUD, ancestry queries, embeddings on create/update
6. Project plan reader: Parse plans from local DB, display phases and tasks

### Phase 3 — Task Feeds & Morning Planning
**Goal**: Pull all task sources into one morning view

1. **Morning planning panel**: Aggregated view of Google Tasks (personal + today list), Jira tickets, and project plan tasks
2. **Claude-assisted triage**: Claude surfaces recommended tasks for today based on goals, phases, and due dates
3. **Pull-to-daily**: One-click to add any task from any source into local daily log
4. **Today list sync**: Bidirectional sync between Google Tasks "today" list and local daily log
5. Google Tasks proxy API
6. Jira proxy API

### Phase 4 — Time Analytics & Calendar
**Goal**: Historical views and calendar integration

1. Backfill `daily_time_snapshots` from `completed.json` history
2. Week/month/year stacked bar charts with period comparison
3. **Calendar timeline**: Today's sessions as color-coded time blocks
4. Calendar deep links: Click block → open Google Calendar event
5. Sync controls: Manual sync trigger + status

### Phase 5 — Focus Tracking Widget
**Goal**: Visualize cognitive output across the day

- **Daily focus timeline**: Horizontal chart, time on x-axis, focus level (0–5) on y-axis
- Tracked sessions rendered as colored bars; untracked gaps rendered at zero
- **Summary metrics**:
  - Average focus (tracked only)
  - Weighted average (including gaps as 0)
  - % of day tracked
  - Peak sustained focus (longest streak ≥ F:3)
- Focus color scale: 0=grey, 1=blue, 2=teal, 3=yellow, 4=orange, 5=red
- API: `GET /api/focus/today`, `GET /api/focus/week`

### Phase 6 — Training Spreadsheet Sync
**Goal**: Connect fitness data to journaling and reflection

- Pull workout data from Google Sheets (training spreadsheet)
- Display: recent workouts, PRs per lift, weekly volume trend
- Post-workout journal prompt: reflection entry linked to workout data
- Training journal entries stored in `journals` table (`type: entry`, `context: health`)
- API: `GET /api/training/recent`, `GET /api/training/prs`, `POST /api/training/journal`

### Phase 7 — Idea Graph (Node Map)
**Goal**: Visual exploration of knowledge and semantic clustering

- Interactive graph: nodes = journal entries, plans, protocols, concepts
- Edges = semantic similarity (pgvector) or explicit relationships
- Zoom/pan, click node to read, filter by type/context/date
- **Claude-assisted clustering**:
  - Aggregate: surface themes across entries
  - Disaggregate: explode a dense entry into sub-nodes
  - Synthesize: generate concept nodes from clusters (stored as new journal entries)
- New table: `concept_links` (source_id, target_id, similarity, link_type, label)
- API: `GET /api/graph/nodes`, `GET /api/graph/edges`, `POST /api/graph/cluster`

### Phase 8 — Claude Chat Panel
**Goal**: Natural language as primary modification interface

1. Evaluate integration approach (CLI subprocess vs direct API vs MCP client)
2. Side panel chat UI with message history
3. Context injection: pass current dashboard state to Claude on each message
4. Tool definitions mapped to backend API routes
5. Optimistic UI: update dashboard immediately, reconcile on response

### Phase 9 — Polish
1. Semantic search bar across goals, plans, journals
2. Browser notifications: idle detection, task check-in prompts
3. Keyboard shortcuts matching terminal `/t` commands
4. Dark mode (system preference)
5. PWA: offline support for cached data

---

## Architecture

### Stack
- **Frontend**: Next.js (App Router) — or Vite + React if simpler
- **Backend**: Existing Express server (`server.js` port 5001) — extend with new API routes
- **Database**: Local PostgreSQL 17 + pgvector (already running)
- **Auth**: None (local-only, single user)
- **State**: React Query for server state, minimal client state
- **Charts**: Recharts or Chart.js

### New Database Tables

```sql
-- Goals with time horizons
CREATE TABLE goals (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL,
  description TEXT,
  context TEXT NOT NULL,
  horizon TEXT NOT NULL,          -- week/month/6month/1year/2year/5year/10year
  status TEXT DEFAULT 'active',   -- active/completed/abandoned/paused
  parent_goal_id TEXT REFERENCES goals(id),
  target_date DATE,
  progress_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  embedding vector(1536)
);

CREATE TABLE goal_plans (
  goal_id TEXT REFERENCES goals(id) ON DELETE CASCADE,
  plan_id TEXT REFERENCES plans(id) ON DELETE CASCADE,
  PRIMARY KEY (goal_id, plan_id)
);

CREATE TABLE daily_time_snapshots (
  date DATE PRIMARY KEY,
  context_minutes JSONB NOT NULL,
  task_count INTEGER,
  completed_count INTEGER,
  budget_earned NUMERIC,
  budget_spent NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE concept_links (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  similarity NUMERIC,
  link_type TEXT,                 -- 'semantic' | 'explicit' | 'claude-inferred'
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### File Structure

```
app/
  frontend/
    src/
      components/
        MorningPlanning/     — daily triage: Google Tasks + Jira + project tasks
        GoalsPanel/          — horizon selector, goal cards, project drill-down
        TaskPanel/           — current tasks nested by context, live timer
        TimeOverview/        — stacked bar charts (day/week/month/year)
        FocusTimeline/       — focus level chart across the day
        CalendarTimeline/    — session time blocks
        TrainingPanel/       — workouts, PRs, volume trend
        IdeaGraph/           — interactive node map
        ChatPanel/           — Claude integration
        TaskFeeds/           — Google Tasks + Jira feeds
        common/              — shared components
      hooks/
      lib/
  backend/
    server.js
    routes/
      goals.js
      time.js
      focus.js
      feeds.js
      calendar.js
      training.js
      graph.js
    migrations/
```

---

## Open Questions

1. **Today list sync**: Bidirectional or local → Google one-way? Conflict if both sides change.
2. **Phase activation**: Should selecting a phase clear old Google Tasks entries for that project, or append?
3. **Real-time updates**: WebSocket or 1s polling for active task timer?
4. **Claude integration**: CLI subprocess vs direct API vs MCP client (Phase 8 decision)
5. **Historical reconstruction**: How far back can `daily_time_snapshots` be rebuilt from `completed.json`?
6. **Training spreadsheet**: Google Sheets API directly, or user exports CSV periodically?

---

## Future Ideas

- Record a video demo of the task tracking system and trading platform for public sharing
