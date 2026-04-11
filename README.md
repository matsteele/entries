# Personal Productivity System

A local-first personal productivity and journaling system with planning, time tracking, and reflection capabilities.

## Local-First Design

- **PostgreSQL + pgvector** - ALL narrative content (journals, plans, protocols) with AI-powered semantic search
- **Local JSON files** - Operational data only (daily logs, time tracking, structured references)

All data stays on your machine. No cloud database.

## Features

- **Journal System**: Personal journaling with semantic search (PostgreSQL)
- **Planning System**: Project planning with vector embeddings (PostgreSQL)
- **Protocols**: Structured workflows with semantic search (PostgreSQL)
- **Daily Task Tracking**: Terminal statusline with context-aware tasks (JSON)
- **Time Tracking**: Time by context - personal, professional, cultivo, social, projects (JSON)
- **Semantic Search**: Find entries by meaning, not just keywords (OpenAI embeddings)

## Daily Task Tracking Workflow

The system has **two separate task lists**:

1. **Google Tasks (Cloud Backlog)** - Long-term planning
   - Create tasks from plans/goals
   - Store tasks in Google Tasks for later review
   - Tasks live here until you're ready to work on them

2. **Daily Log (Local JSON)** - Tasks you're working on TODAY
   - Pull today's tasks from Google Tasks via `/t pull-goog`
   - Or manually add with `/t add "task description"`
   - Tasks tracked in `tracking/pending.json` and `tracking/routine.json`

### Task Status Line (Synced Across Environments)

The same task list appears in **three places simultaneously**:

1. **Claude Code Status Line** (top right of interface)
   - Shows current task and pending list
   - Configured via `~/.claude/statusline-command.sh`
   - Updates when task state changes

2. **ZSH Prompt** (terminal prompt line)
   - Shows current task and counts inline
   - Configured in `~/.zshrc` (PROMPT variable)
   - Displayed on every command

3. **Terminal Display** (`/t` command)
   - Full detailed view: `node ~/projects/currentProjects/entries/app/cli/statusline.js`
   - Shows all pending/routine tasks with time spent
   - Run `/t` or `todos` to refresh

All three pull from the same source (`tracking/` JSON files via `app/cli/statusline.js`), so you always see the same task list everywhere.

**The workflow:**
```
Plan → Google Tasks (set due date) → /t pull-goog → Daily Log → Work & Track → Complete
```

When you see tasks in any statusline, they are either:
- **Pending tasks** from today's pull (not yet started)
- **Routine tasks** for ongoing contexts (never "complete")

See `CLAUDE.md` section "Daily Task Tracking Workflow" for full details.

## Getting Started

```bash
# Install dependencies
npm install
cd app && npm install

# Configure .env
DATABASE_URL=postgresql://matthewsteele@localhost:5432/entries
OPENAI_API_KEY=your-key

# Connect to database
psql -U matthewsteele -d entries
```

See `ARCHITECTURE.md` for full setup and schema details.

## Project Structure

- `app/backend/` - Shared libraries (task-store, google-calendar, embeddings, server)
- `app/cli/` - CLI entry points
  - `daily-log-cli.js` - Daily task tracking CLI
  - `time-tracker.js` - Time tracking by context
  - `statusline.js` - Terminal statusline display
  - `prompt.js` - ZSH prompt integration
- `app/daemons/` - Background launchd agents (idle-monitor, task-checker)
- `protocols/` - Protocol documents (also stored in database)
  - `digesting-entries.md` - Stream-of-consciousness ingestion protocol
- `plans/` - Planning system
  - `data/plans.json` - Plan index (references DB entries by title/ID)
- `tracking/` - Time tracking and daily logs (JSON, not committed)
- `docs/` - Additional documentation

## Privacy

- Database runs locally (not in the cloud)
- All personal data files are in `.gitignore`
- No data sent to external servers (except OpenAI for embeddings)

## Documentation

- **`ARCHITECTURE.md`** - System architecture, schema, setup
- **`CLAUDE.md`** - AI assistant instructions
- **`AGENTS.md`** - Dual-environment sync guidance
- **`docs/PLANNING_SYSTEM.md`** - Planning system details

## License

Private repository - Personal use only
