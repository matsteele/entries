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

## Getting Started

```bash
# Install dependencies
npm install
cd app/backend && npm install

# Configure .env
DATABASE_URL=postgresql://matthewsteele@localhost:5432/entries
OPENAI_API_KEY=your-key

# Connect to database
psql -U matthewsteele -d entries
```

See `ARCHITECTURE.md` for full setup and schema details.

## Project Structure

- `app/backend/` - Backend services and CLI tools
  - `daily-log-cli.js` - Daily task tracking CLI
  - `time-tracker.js` - Time tracking by context
  - `statusline.js` - Terminal statusline display
  - `prompt.js` - ZSH prompt integration
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
