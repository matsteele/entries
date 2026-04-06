# System Architecture

> **Local-First Personal Productivity System**
> All narrative content goes to PostgreSQL. JSON files are only for operational/structured data.

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    ENTRIES SYSTEM                            │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────┐        ┌─────────────────────┐    │
│  │  PostgreSQL + pgvector│        │   JSON Files       │    │
│  │  (ALL Narrative Data) │        │   (Operational Only)│    │
│  ├─────────────────────┤        ├─────────────────────┤    │
│  │                       │        │                       │    │
│  │ • journals            │        │ • tracking/          │    │
│  │ • plans               │        │   - pending.json     │    │
│  │ • protocols           │        │   - completed.json   │    │
│  │ • journal_metadata    │        │   - routine.json     │    │
│  │                       │        │   - current.json     │    │
│  │ Full narrative text   │        │   - time-logs/       │    │
│  │ + AI embeddings       │        │ • plans/data/        │    │
│  │ (vector(1536))        │        │ • goals.json         │    │
│  │                       │        │ • relationships.json │    │
│  └─────────────────────┘        └─────────────────────┘    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Storage Rules

**PostgreSQL Database** - ALL narrative/searchable content:
- Journals (reflections, events, contemplations, quick notes)
- Plans (full narrative plan documents)
- Protocols (workflow procedures, guides)
- Journal metadata (people, emotions, concepts, key insights)
- Vector embeddings for semantic search

**JSON Files** - Operational/structured data ONLY:
- Task tracking (`tracking/pending.json`, `completed.json`, `routine.json`, `current.json`)
- Time tracking (`tracking/time-logs/`) - time by context
- State tracking (`tracking/states/YYYY-MM-DD.json`) - self-reported focused/stressed/energy per hour
- Session logs (`tracking/sessions/session-YYYY-MM-DD.json`) - conversation session records
- Sleep journals (`tracking/sleep/journal/YYYY-MM-DD-rest.json`, `YYYY-MM-DD-wake.json`)
- Distraction logs (`tracking/distractions/logs/YYYY-MM-DD.json`)
- Plan index (`plans/data/plans.json`) - references DB entries by title/ID, not full content
- Goals (`goals.json`) - structured hierarchies (1-month, 1-year, 5-year)
- Decisions (`decisions.json`) - structured decision records
- Relationships (`relationships.json`) - people info, birthdays, contacts

**The rule:** If it's narrative text you'd want to search later, it goes in the database. If it's structured operational data, it goes in JSON.

## Setup

### Prerequisites
- **PostgreSQL 17** (Homebrew) with pgvector extension
- **Node.js** (version 16+)
- **OpenAI API key** (for embeddings)

### Database Connection

```bash
psql -U matthewsteele -d entries
```

> **Database name is `entries`. Always use `-d entries`.**

### Environment Variables

```bash
# .env file
DATABASE_URL=postgresql://matthewsteele@localhost:5432/entries
OPENAI_API_KEY=sk-your-key-here
```

## Database Schema

### journals
```sql
CREATE TABLE journals (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  content TEXT NOT NULL,
  type TEXT,           -- 'entry', 'event', 'contemplation', 'plan', 'protocol', 'quick'
  context TEXT,        -- 'personal', 'social', 'professional', 'cultivo', 'projects'
  summary TEXT,
  word_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  embedding vector(1536)
);
```

### plans
```sql
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT,
  status TEXT,
  context_id TEXT,
  objective_id TEXT,
  project_id TEXT,
  content TEXT NOT NULL,
  file_path TEXT,
  created_at DATE,
  updated_at DATE,
  tags TEXT[],
  embedding vector(1536)
);
```

### protocols
```sql
CREATE TABLE protocols (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  file_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  embedding vector(1536)
);
```

### journal_metadata
```sql
CREATE TABLE journal_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id UUID REFERENCES journals(id) ON DELETE CASCADE,
  people TEXT[],
  emotions TEXT[],
  concepts TEXT[],
  key_insights TEXT[]
);
```

## Data Flow

### Adding a Narrative Entry (journal, plan, protocol)

```
1. User writes entry
   ↓
2. Generate embedding via OpenAI API
   ↓
3. Store in PostgreSQL with embedding
   ↓
4. Searchable semantically
```

### Daily Task Tracking (operational)

```
1. User logs task activity via /t commands
   ↓
2. Write to tracking/ split files:
   - pending.json (novel tasks)
   - completed.json (done tasks)
   - routine.json (ongoing tasks)
   - current.json (active task + view state + cached sums)
   ↓
3. Session recorded with startedAt/endedAt timestamps
   ↓
4. Context sums (day/week/month) calculated from session timestamps
   ↓
5. Time budget updated from session-based calculations
```

### Google Calendar Sync

Google Calendar events are pulled and displayed as an overlay on the FocusTimeline (appointments, reminders). Task sessions are no longer pushed to Google Calendar — the FocusTimeline is the authoritative view for session time blocks, with direct editing support.

**Session tracking:**
- Every task (current, pending, completed) has a `sessions` array
- Each session: `{ startedAt, endedAt }`
- A session is recorded every time a task is paused, switched, or completed
- Sessions carry over when a task is resumed from pending

**Pull sync (`/t sync`):**
- **Import**: Calendar events are fetched and displayed as an overlay on the FocusTimeline
- **Import to tasks**: Calendar events with no local match can be imported — matched to routine/pending tasks by title. Context is inferred from matched task, title-to-context aliases (e.g. "fitness" → health), or calendar color.
- `/t sync yesterday` syncs both yesterday and today

**Context → Calendar color mapping:**

| Context | Color ID | Google Calendar Color |
|---------|----------|----------------------|
| Cultivo | 2 | Sage (green) |
| Professional | 9 | Blueberry (blue) |
| Personal | 5 | Banana (yellow) |
| Social | 3 | Grape (purple) |
| Projects | 6 | Tangerine (orange) |
| Health | 10 | Basil (dark green) |
| Unstructured | 8 | Graphite (gray) |

**Setup (one-time):**
1. `node app/cli/daily-log-cli.js setup-gcal` — OAuth flow, saves `GOOGLE_CALENDAR_REFRESH_TOKEN` to `.env`
2. `node app/cli/daily-log-cli.js init-gcal` — Creates calendar, saves `GOOGLE_CALENDAR_ID` to `.env`

**Key files:**
- `app/backend/google-calendar.js` — Calendar API helper (token refresh, event CRUD, list events)
- `.env` — `GOOGLE_CALENDAR_REFRESH_TOKEN`, `GOOGLE_CALENDAR_ID`

### Contexts

Tasks and time are tracked across 7 contexts:

| Context | Code | Emoji | Budget Role |
|---------|------|-------|-------------|
| Personal | `per` | 🏠 | Earning |
| Social | `soc` | 👥 | Earning |
| Professional | `prof` | 💼 | Earning |
| Cultivo | `cul` | 🌱 | Earning |
| Projects | `proj` | 🚀 | Earning |
| Health | `heal` | 💪 | Neutral |
| Unstructured | `us` | ☀️ | Spending |

**Note on Journal Context:** In the PostgreSQL journal, both `prof` and `cul` work are stored under a single "professional" context. This keeps all work-related reflections, plans, and protocols together for comprehensive professional context analysis.

### Idle/Pause & Time Reassignment

When idle is detected or a task is paused (via `/t p`, idle auto-pause, or task checker pause), the current task is set to **blank** (null). No automatic switch to unstructured occurs.

**Set last task end time:** `/t last HH:MM` sets the end time of the most recent task to a specific time (e.g., `6:50`):
- Finds the most recent completed session
- Replaces its `endedAt` timestamp with the specified time
- Recalculates duration based on new end time
- Updates the task's total time spent
- Current remains blank
- Only works when no task is active

**Reassign idle time:** `/t last-N` attributes time since the last task ended to task N:
- Finds the most recent session end time (when idle/pause began)
- Creates a session from that time to now on the target task
- Task stays in its file (pending if novel, routine if routine) — current remains blank
- Session recorded with the task's context

**Example flow:**
1. Working on "Fix bug" → idle detected → task auto-paused (current = blank)
2. Come back, realize you worked until 6:50pm but system says 7:15pm → `/t last 6:50`
3. See pending tasks: `1. Fix bug  2. Review PR  3. transit [R]`
4. `/t last-3` → reassigns idle time to "transit" (stays in routine.json)
5. `/t -1` to switch to your next real task

### Routine vs Novel Tasks

Tasks are categorized as **routine** (ongoing, never completed) or **novel** (one-off, default):
- Add routine task: `/t add "sleeping" heal r` (trailing `r` flag)
- Toggle view: `/t r` switches between novel and routine views
- Task numbers are relative to the active view
- Routine tasks persist across days and cannot be completed

### Time Budget

Structured work earns unstructured (free) time:
- **Earning rate**: 1 hour structured work = 6 minutes earned (0.1x)
- **Spending rate**: Unstructured time spends at 1x
- **Neutral**: Health context neither earns nor spends
- Balance persists across days in `tracking/time-logs/time-log.json`
- Budget calculated from session data on task switches (no daily archival needed)

## Semantic Search

**CLI (recommended):**
```bash
cd app
npm run search "travel plans"
npm run search "fungal feet" -- --type protocol --limit 5
```

**Backfill embeddings after adding new entries:**
```bash
cd app && npm run embeddings:backfill
```

**Raw SQL** (requires pre-computed embedding vector):
```sql
SELECT id, date, type, LEFT(content, 200),
  1 - (embedding <=> '[query_embedding]'::vector) as similarity
FROM journals
WHERE embedding IS NOT NULL
ORDER BY embedding <=> '[query_embedding]'::vector
LIMIT 10;
```

## Backup

### Database
```bash
pg_dump -U matthewsteele entries > backup-$(date +%Y-%m-%d).sql
psql -U matthewsteele entries < backup.sql
```

### JSON Files
```bash
cp -r ~/projects/entries/tracking ~/Backups/entries-tracking-$(date +%Y-%m-%d)
```

## Troubleshooting

### Connection Issues
```bash
# Check if PostgreSQL is running
brew services list | grep postgresql

# Restart PostgreSQL
brew services restart postgresql@17

# Test connection
psql -U matthewsteele -d entries -c "SELECT 1"
```

### Database Not Found
```bash
createdb -U matthewsteele entries
```

### Vector Embedding Errors
- Ensure pgvector extension is installed: `CREATE EXTENSION vector;`
- Ensure OpenAI API key is set in `.env`
- Embedding function must be called before INSERT

## Privacy

- Database runs locally (not in the cloud)
- All personal JSON files are in `.gitignore`
- No data sent to external servers (except OpenAI for embeddings)

## Documentation

- **`CLAUDE.md`** - AI assistant instructions (primary reference)
- **`journal/LOCAL_DATABASE.md`** - Database schema details
- **`docs/PLANNING_SYSTEM.md`** - Planning system details
- **`AGENTS.md`** - Dual-environment sync guidance
- **`tracking/SESSION_ACTIVITY_TRACKING.md`** - Full `/t` command details, routine/novel tasks, time budget

## Dashboard

A Next.js 16 web app running at **http://localhost:7777**. No separate backend — all API routes are Next.js App Router handlers in `app/frontend/app/api/`.

**Start:** `cd app/frontend && npm run dev`

### Views

| View | Description |
|------|-------------|
| **TasksView** | Current task card (with complete button), pending tasks grouped by context with inline focus/priority pickers, switch/complete/delete actions on hover, add-task form, Pull Google Tasks + Pull Jira buttons |
| **FocusTimeline** | Day timeline with drag-editable session bars, date navigation, ideal schedule overlay, calendar event overlay, fasting bar with meal slots, meal drawer, macro totals bar, protocol drawer |
| **TimeView** | Historical stacked bar charts (daily last 7 / weekly last 8 / monthly last 6) with focused-minutes trend line; today/week/month context breakdowns with progress bars; time budget balance |
| **BudgetPanel** | Per-context focused-minutes progress bars vs. editable daily targets; headline total focused minutes |
| **FeedsView** | Google Tasks + Jira feeds (1-min cache) with "Add to today" buttons; duplicate detection against pending list |
| **WorkoutView** | Workout tracking |

### FocusTimeline Details

- Session bars colored by context, height proportional to focus level
- **Date navigation**: prev/next arrows + "Today" button; syncs to `?date=YYYY-MM-DD` URL param; historical dates load from `task_sessions` Postgres table
- **Drag editing** (today only): drag left/right edge of a block to adjust start/end time; drag top edge to change focus level; clamped to adjacent sessions; writes to both JSON files and Postgres via `PATCH /api/sessions`
- **Ideal schedule overlay**: background blocks showing the planned daily structure (Sleep → Abs → Wake → Workout → Protein Shake → Meditation → Fasted Focus → Protein Meal → Meditation → Trading → Projects → Meal Prep + Media → Wind Down → Sleep)
- **Calendar overlay**: Google Calendar events for the day rendered as a separate track below the session bars; pulled from `GET /api/calendar?date=`
- **Fasting bar**: shows fasted/eating window periods; meal slot buttons appear inside the eating window
- **Meal slots**: clicking a slot opens a drawer to select from the meals table; displays macro totals bar when meals are planned
- **Protocol drawer**: click any schedule block to pull and display the relevant protocol from PostgreSQL
- **Summary stats**: focused minutes (Σ mins×focusLevel), % of day tracked, % active focus

### Postgres Tables (added for dashboard)

```sql
-- Session-level time tracking (source of truth going forward)
CREATE TABLE task_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL,
  task_title TEXT,
  context TEXT,
  focus_level INTEGER DEFAULT 2,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  source TEXT DEFAULT 'live',  -- 'live' | 'backfill'
  UNIQUE (task_id, started_at)
);

-- Legacy daily totals (pre-migration, from time-log.json, Dec 2025+)
CREATE TABLE daily_time_snapshots (
  date DATE PRIMARY KEY,
  context_minutes JSONB NOT NULL,
  source TEXT DEFAULT 'legacy'
);

-- Meal reference data
CREATE TABLE meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  category TEXT,           -- 'breakfast' | 'lunch' | 'dinner' | 'snack'
  ingredients TEXT[],
  recipe TEXT,
  protein NUMERIC, carbs NUMERIC, fat NUMERIC, calories NUMERIC
);

-- Daily meal plans
CREATE TABLE meal_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  slot TEXT NOT NULL,       -- e.g. 'breakfast', 'lunch', 'dinner', 'snack-1'
  meal_id UUID REFERENCES meals(id),
  planned_time TIME,
  UNIQUE (date, slot)
);

-- User config / targets
CREATE TABLE user_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
-- Default: focused_minutes_targets = {"cul":180,"proj":120,"per":60,"soc":30,"prof":60,"heal":30,"us":0}
```

**Backfill migrations run:**
- `app/migrations/backfill-snapshots.js` — 37 daily snapshots from `time-log.json` (Dec 2025 – Feb 2026)
- `app/migrations/backfill-sessions.js` — 202 sessions from completed.json + routine.json
- `app/migrations/seed-meals.js` — 23 reference meals seeded

**Session writes:** Every task switch/complete/pause writes a session row to `task_sessions` (fire-and-forget from CLI and daemons). `daily_time_snapshots` is legacy fallback for history charts when no session data exists for a period.

### Reporting CLI

```bash
/t report          # Today: context totals, focused minutes, top 3 tasks
/t report week     # Last 7 days aggregated
```

### Protocol Surfacing on Task Switch

When switching to a task via CLI, the task title is matched against `journals WHERE type = 'protocol'` using `ILIKE` keyword search. Matching protocol names are printed after the switch confirmation and cached as `task.protocolHints` on the task object.

### API Routes (`app/frontend/app/api/`)

| Route | Description |
|-------|-------------|
| `GET /api/tasks/current` | Active task + elapsed minutes |
| `GET /api/tasks/all` | All task lists combined |
| `GET /api/tasks/pending` | Pending tasks |
| `GET /api/tasks/routine` | Routine tasks |
| `GET /api/tasks/completed` | Completed tasks |
| `POST /api/tasks/action` | Task actions: switch-to, complete-task, complete-current, delete-task, set-focus, set-priority, add-task, pull-goog, pull-jira, add-from-feed |
| `GET /api/time/sums` | Context sums + budget balance |
| `GET /api/time/sessions/today` | Today's sessions |
| `GET /api/time/budget` | Focused-minutes targets, actuals, and budget per context |
| `GET /api/time/history?period=day\|week\|month&n=N` | Last N periods of context minutes + focused minutes |
| `PATCH /api/sessions` | Update session start/end time or focus level (writes JSON + Postgres) |
| `GET /api/focus/today?date=YYYY-MM-DD` | Timeline segments + summary stats (today = JSON files; historical = Postgres) |
| `GET /api/calendar?date=YYYY-MM-DD` | Google Calendar events for date (60s in-memory cache) |
| `GET /api/config` | User config key/value map |
| `PUT /api/config` | Upsert a config key |
| `GET /api/meals` | All reference meals |
| `POST /api/meals` | Create a meal |
| `GET /api/meal-plans/:date` | Meal plan for date with macro totals |
| `POST /api/meal-plans/:date` | Set or clear a meal slot |
| `GET /api/feeds/google-tasks` | Google Tasks feed |
| `GET /api/feeds/jira` | Jira tickets feed |
| `GET /api/contexts` | Context definitions |
| `GET /api/stats/today` | Daily stats summary |
| `GET /api/states/:date` | State tracking data for a date |
| `POST /api/states/:date` | Save state tracking data |
| `GET /api/protocols` | List all protocols |
| `GET /api/protocols/search?q=` | Search protocols by keyword |
| `GET /api/health` | Health check |

### Tech Stack

- Next.js 16, React 19, MUI v7, TanStack Query (React Query)
- `app/frontend/lib/store.js` — wraps task-store for server-side use
- `app/frontend/lib/db.js` — pg pool singleton for protocol queries
- `app/frontend/lib/feeds.js` — Google Tasks + Jira helpers with 1-min module-level cache
- `app/frontend/lib/states.js` — state file read/write helpers
- Environment: `app/frontend/.env.local` → symlink to root `.env`

### Google Tasks Integration

Google Tasks serves as the cloud task backlog. Tasks are created here when a plan generates actionable work, then pulled to the daily log when due.

- **Pull due tasks**: `/t pull-goog` — imports tasks with today's due date into pending
- **Dashboard feed**: `GET /api/feeds/google-tasks` — shows all incomplete tasks across all lists
- **Credentials**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` in `.env`

---

## Background Daemons

Two launchd agents run in the background to automate time tracking:

### Idle Monitor (`idle-monitor.js`)

Detects when the computer sleeps/idles and auto-pauses the active task.

- **Interval**: Every 2 minutes (StartInterval: 120)
- **Mechanism**: Writes a heartbeat timestamp each run. On wake, detects the gap between last heartbeat and now. If >5 minutes, pauses the active task backdated to the last heartbeat time and switches to unstructured.
- **State file**: `tracking/idle-monitor/heartbeat.json`
- **Logs**: `tracking/idle-monitor/idle-monitor.log`
- **plist**: `~/Library/LaunchAgents/com.entries.idle-monitor.plist`

### Task Checker (`task-checker.js`)

Periodic popup asking if the user is still working on the current task.

- **Interval**: Every 30 minutes (StartInterval: 1800)
- **Mechanism**: Shows a macOS native dialog (via osascript) with the current task and elapsed time. User can continue, switch to a pending task, or pause.
- **Dialog flow**: First dialog asks "Still working on this?" → if "Switch Task", second dialog shows pending task list via `choose from list`
- **State file**: `tracking/idle-monitor/task-check.json`
- **Logs**: `tracking/idle-monitor/task-checker.log`
- **plist**: `~/Library/LaunchAgents/com.entries.task-checker.plist`
- **Skips when**: no task, unstructured mode, task just started (<5min), task changed since last check

### Managing Daemons

```bash
# Load (start)
launchctl load ~/Library/LaunchAgents/com.entries.idle-monitor.plist
launchctl load ~/Library/LaunchAgents/com.entries.task-checker.plist

# Unload (stop)
launchctl unload ~/Library/LaunchAgents/com.entries.idle-monitor.plist
launchctl unload ~/Library/LaunchAgents/com.entries.task-checker.plist

# Check status
launchctl list | grep entries

# Manual test
cd app && npm run idle:check
cd app && npm run task:check

# View logs
tail -20 tracking/idle-monitor/idle-monitor.log
tail -20 tracking/idle-monitor/task-checker.log
```

## `/t` Command Reference

| Command | Description |
|---------|-------------|
| `/t` | Show statusline |
| `/t add "task" [ctx] [p:N] [f:N] [r]` | Add pending task (context, priority 1–5, focus 0–5, routine flag) |
| `/t addS "task" [ctx] [p:N] [f:N]` | Add task and immediately switch to it |
| `/t -N` | Switch to task N |
| `/t c-N` | Complete task N (0 = current) |
| `/t cs-N` | Complete current, switch to N |
| `/t d-N` | Delete task N |
| `/t p [HH:MM]` | Pause current task (optional: set end time) |
| `/t note "text"` | Add note to current task |
| `/t note-pending N "text"` | Add note to pending task N |
| `/t pri-N <1-5>` | Set priority (1=high, 5=low) |
| `/t focus-N <0-5>` | Set focus level (0=trivial, 5=deep work) |
| `/t m-N context` | Modify task context (0=current) |
| `/t r` | Toggle routine/novel view |
| `/t ? <search>` | Fuzzy search tasks by title and switch to best match |
| `/t per\|soc\|prof\|cul\|proj\|heal\|us` | Filter by context |
| `/t all` | Clear context filter, pause current task |
| `/t last HH:MM` | Set end time of last task (only when no task active) |
| `/t last-N` | Reassign idle time to task N |
| `/t pull-goog` | Pull Google Tasks due today into pending |
| `/t jira` | Pull assigned Jira tickets into pending |
| `/t sync` | Pull Google Calendar events for timeline overlay |
| `/t sync yesterday` | Pull yesterday + today |
| `/t log-session '{...}'` | Log a Claude conversation as a tracked session |
| `/t end [X-Y]` | Generate end-of-day Slack update (optional date range) |
| `/t rest` | Pre-sleep journaling + log sleep start |
| `/t wake` | Post-sleep journaling + log wake time |
| `/t sleep:stats [N]` | Sleep analytics for last N days (default 7) |
| `/t eeh` | Distraction journaling (does NOT pause current task) |

### Sleep Tracking & Journaling

Sleep tracking is managed via the Rest Program. See **[REST_PROGRAM.md](./REST_PROGRAM.md)** for full documentation.

- **Data**: `tracking/sleep/sleep-log-YYYY-MM-DD.json` (operational), `tracking/sleep/strategies.json` (config)
- **Journaling**: `tracking/sleep/journal/YYYY-MM-DD-rest.json` and `YYYY-MM-DD-wake.json` (pre/post-sleep journals)
- **Memory**: `tracking/sleep/memory.md` (persistent insights — strategy effectiveness, patterns, theories)
- **Instructions**: `tracking/sleep/instructions.md` (journaling flow for Claude)
- **Protocols**: Bedtime Protocol + Morning Wake Protocol stored in `journals` table (type: `protocol`, context: `Health`)
- **Flow**: `/t rest` (wind-down journaling + strategies) → sleep → `/t wake` (quality reflection + morning journaling)

### Distraction Journaling

Quick check-in mode for processing distraction urges. Does NOT pause or change the current task.

- **Logs**: `tracking/distractions/logs/YYYY-MM-DD.json` (array of distraction events per day)
- **Memory**: `tracking/distractions/memory.md` (persistent insights — trigger taxonomy, strategies, patterns)
- **Instructions**: `tracking/distractions/instructions.md` (journaling flow for Claude)
- **Flow**: `/t eeh` → brief journaling about the trigger/feeling → log event → back to work

---

**Last Updated:** 2026-04-04
