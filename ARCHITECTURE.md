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
│  │ • plans               │        │   - daily-logs/      │    │
│  │ • protocols           │        │   - time-logs/       │    │
│  │ • journal_metadata    │        │ • plans/data/        │    │
│  │                       │        │   (index only,       │    │
│  │ Full narrative text   │        │    refs DB entries)   │    │
│  │ + AI embeddings       │        │ • goals.json         │    │
│  │ (vector(1536))        │        │ • decisions.json     │    │
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
- Daily task logs (`tracking/daily-logs/`) - today's task tracking
- Time tracking (`tracking/time-logs/`) - time by context
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
2. Write to tracking/daily-logs/daily-log-YYYY-MM-DD.json
   ↓
3. On task completion → push event to Google Calendar ("Time Tracking" calendar)
   ↓
4. Update tracking/time-logs/time-log.json
   ↓
5. Time budget (earned/spent) updated on day archive
```

### Google Calendar Sync

Completed task blocks are automatically pushed to a dedicated **"Time Tracking"** Google Calendar as color-coded events.

**How it works:**
- On task completion (`/t c-N`, `/t cs-N`, `/t c-0`), a calendar event is created
- Event spans `completedAt - timeSpent` → `completedAt` (reflects total work time)
- Events are color-coded by context (see color map below)
- Calendar event ID is stored as `calendarEventId` on the completed entry
- Push is fire-and-forget — calendar failures don't block task completion

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
1. `node app/backend/daily-log-cli.js setup-gcal` — OAuth flow, saves `GOOGLE_CALENDAR_REFRESH_TOKEN` to `.env`
2. `node app/backend/daily-log-cli.js init-gcal` — Creates calendar, saves `GOOGLE_CALENDAR_ID` to `.env`

**Key files:**
- `app/backend/google-calendar.js` — Calendar API helper (token refresh, event creation)
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

## Semantic Search

**CLI (recommended):**
```bash
cd app/backend
npm run search "travel plans"
npm run search "fungal feet" -- --type protocol --limit 5
```

**Backfill embeddings after adding new entries:**
```bash
cd app/backend && npm run embeddings:backfill
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
cd app/backend && npm run idle:check
cd app/backend && npm run task:check

# View logs
tail -20 tracking/idle-monitor/idle-monitor.log
tail -20 tracking/idle-monitor/task-checker.log
```

## `/t` Command Reference

| Command | Description |
|---------|-------------|
| `/t start` | Start new day, carry over pending + routine tasks |
| `/t show` or `/t` | Show statusline |
| `/t add "task" [context] [r]` | Add pending task (optional context, optional routine flag) |
| `/t addS "task" [context] [r]` | Add task and switch to it |
| `/t -N` | Switch to pending task N |
| `/t c-N` | Complete pending task N |
| `/t cs-N` | Complete current, switch to N |
| `/t p-N` | Move current to pending |
| `/t d-N` | Delete pending task N |
| `/t m-N context` | Modify task context (0=current) |
| `/t r` | Toggle routine/novel view |
| `/t per\|soc\|prof\|cul\|proj\|heal\|us` | Filter by context |
| `/t all` | Clear context filter |
| `/t jira` | Pull assigned Jira tickets |
| `/t p` | Pause current task |

---

**Last Updated:** 2026-02-07
