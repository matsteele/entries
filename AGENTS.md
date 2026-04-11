# Agent Development Instructions

## Critical: Dual-Environment Architecture

**This application operates in two environments simultaneously:**

1. **ZSH Shell Environment** (`.zshrc`)
2. **Claude AI Environment** (`CLAUDE.md`, this file, and MCP configuration)

## Three Core Activities

1. **📋 Daily Task Tracking** — `/t` commands, terminal statusline, time budget
2. **📝 Logging & Journaling** — PostgreSQL + pgvector for narrative content
3. **🎯 Planning & Backlog** — Google Tasks + Calendar (plan-driven)

See **[CLAUDE.md](./CLAUDE.md)** for workflow details. See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for system architecture and database schema.

### Why This Matters

Any changes to CLI commands, aliases, behaviors, or data structures **MUST be synchronized across BOTH environments**:

```
┌─────────────────────────────────────────────────────────┐
│  User's ZSH Shell                                       │
│  ├─ ~/.zshrc aliases (/t, todos, ent)                  │
│  ├─ Calls: daily-log-cli.js, statusline.js, etc.      │
│  └─ Terminal statusline prompt integration             │
└─────────────────────────────────────────────────────────┘
              ↕ (must stay synchronized)
┌─────────────────────────────────────────────────────────┐
│  Claude AI Assistant                                    │
│  ├─ CLAUDE.md instructions (slash commands)            │
│  ├─ AGENTS.md (sync guidance)                          │
│  ├─ MCP tools for Google Tasks, etc.                   │
│  └─ npm run scripts awareness                          │
└─────────────────────────────────────────────────────────┘
```

---

## When Making Changes

### 1. Adding/Modifying Slash Commands

**Example: Adding a new `/t` command**

**✅ DO THIS:**
1. Update `daily-log-cli.js` with new functionality
2. Add corresponding case in `.zshrc` `/t` function (around line 174-230)
3. Update `CLAUDE.md` slash commands section (lines 200-214)
4. Test in both ZSH terminal AND verify Claude knows about it

**❌ DON'T:**
- Add command only to CLI without updating `.zshrc`
- Document in `CLAUDE.md` without implementing in code
- Assume one environment will "figure it out"

### 2. Changing Context System

**Example: Modifying context tags (per, cul, prof, soc, proj, heal, us)**

For the full list of contexts, codes, emojis, and budget roles, see **[ARCHITECTURE.md](./ARCHITECTURE.md#contexts)**.

**✅ UPDATE ALL:**
- `daily-log-cli.js` - Context detection logic, `normalizeContext()`, regex patterns
- `statusline.js` - `CONTEXT_EMOJI`, `CONTEXT_COLORS`, `contextOrder`
- `prompt.js` - `CONTEXT_NAMES`, `CONTEXT_COLORS`
- `time-tracker.js` - All context initialization objects
- `.zshrc` - Context filter commands in `/t` function
- `CLAUDE.md` - Context tags section
- `tracking/SESSION_ACTIVITY_TRACKING.md` - Context values, auto-detection keywords

### 3. Modifying NPM Scripts

**Example: Changing `npm run log:*` commands**

**✅ UPDATE:**
- `app/package.json` - Script definitions
- `CLAUDE.md` - NPM commands section (lines 217-233)
- Any `.zshrc` aliases that wrap these commands

### 4. Adding/Removing Data Structures

**Example: Adding new journal entry type**

**✅ UPDATE:**
- Backend code (daily-log-cli.js, etc.)
- Local JSON file structures if needed
- `CLAUDE.md` - Data Location section
- `LOCAL_DATABASE.md` - Storage documentation

---

## Key Files to Synchronize to ZSH commands

| File | Purpose | What to Sync |
|------|---------|--------------|
| `~/.zshrc` | Shell aliases & functions | Command syntax, available options, file paths |
| `AGENTS.md` | This file - sync guidance | Architectural patterns, sync requirements |
| `ARCHITECTURE.md` | System architecture | Schema, contexts, command reference table |
| `tracking/SESSION_ACTIVITY_TRACKING.md` | Command details | Full `/t` docs, routine/novel, time budget, auto-detection |
| `app/package.json` | NPM scripts | Script names, parameters, what they do |
| `app/cli/daily-log-cli.js` | CLI implementation | Actual command behavior |
| `app/cli/statusline.js` | Status display | What info is shown in terminal |
| `app/cli/prompt.js` | ZSH prompt | Current task in prompt line |
| `app/cli/time-tracker.js` | Time tracking | Context time, budget calculations |
| `.mcp.json` | MCP server configuration | Available tools and their descriptions |

---

## Common Pitfalls

### ❌ Pitfall 1: Out-of-Sync Command Documentation
```
User: "/t addS is broken"
Issue: Command added to .zshrc but Claude's docs still reference old syntax
```

**Prevention:** When adding commands, update `CLAUDE.md` in the same commit/session.

### ❌ Pitfall 2: Context Filter Confusion
```
User: "Why does /t -1 switch to the wrong task?"
Issue: Context filtering behavior changed in CLI but .zshrc or Claude docs not updated
```

**Prevention:** Test both filtered and unfiltered views after context changes.

### ❌ Pitfall 3: NPM Script Assumptions
```
Claude: "Run npm run log:switch to switch tasks"
Issue: No such script exists, Claude hallucinated based on pattern
```

**Prevention:** Verify all npm commands exist in `package.json` before documenting.

### ❌ Pitfall 4: Wrong Database Name
```
Claude: "psql -U matthewsteele -d entries_db"
Issue: Database is named "entries", NOT "entries_db". Connecting to wrong db creates empty tables.
```

**Prevention:** The database name is **`entries`**. Always use `psql -U matthewsteele -d entries`. See the Database Connection section below.

---

## Database Connection

> **⚠️ CRITICAL: The database name is `entries` — NOT `entries_db`, NOT `postgres`.**
> Connect with: `psql -U matthewsteele -d entries`

For full connection details, schema, and semantic search, see **[ARCHITECTURE.md](./ARCHITECTURE.md#database-connection)**.

---

## Testing Checklist

Before considering any CLI/command change complete:

- [ ] **ZSH Test**: Run actual command in terminal (e.g., `/t add "test task"`)
- [ ] **Claude Test**: Ask Claude to explain/use the command
- [ ] **Documentation**: Verify `CLAUDE.md` mentions the command correctly
- [ ] **Code**: Confirm implementation in relevant `.js` file
- [ ] **NPM**: If applicable, verify script exists in `package.json`
- [ ] **MCP**: If using external tools, verify in `.mcp.json` or `.claude/settings.local.json`

---

## File Locations Reference

```
entries/
├── AGENTS.md                         ← This file (sync guidance)
├── CLAUDE.md                         ← Claude's primary instructions
├── ARCHITECTURE.md                   ← System architecture, schema, command reference
├── tracking/
│   └── SESSION_ACTIVITY_TRACKING.md  ← Full command details, routine/novel, time budget
├── .mcp.json                         ← MCP server config
├── .claude/
│   └── settings.local.json          ← Claude Code MCP tools
├── app/
│   ├── package.json                 ← NPM scripts (shared across cli/backend/daemons)
│   ├── backend/                     ← Shared libraries + server
│   │   ├── task-store.js            ← Core data layer (split-file I/O)
│   │   ├── google-calendar.js       ← Calendar API helper
│   │   ├── embeddings.js            ← Semantic search + pgvector
│   │   └── server.js                ← Express REST API
│   ├── cli/                         ← Terminal entry points
│   │   ├── daily-log-cli.js         ← Main CLI implementation
│   │   ├── statusline.js            ← Terminal status display
│   │   ├── prompt.js                ← ZSH prompt integration
│   │   └── time-tracker.js          ← Time tracking + time budget logic
│   └── daemons/                     ← Background launchd agents
│       ├── idle-monitor.js          ← Auto-pause on idle (every 2 min)
│       └── task-checker.js          ← Check-in dialog (every 30 min)
└── ~/.zshrc                         ← User's shell config (EXTERNAL)
```

---



## Quick Reference: Where to Update What

| Change Type | Files to Update |
|------------|-----------------|
| New `/t` command | `.zshrc`, `daily-log-cli.js`, `SESSION_ACTIVITY_TRACKING.md`, `ARCHITECTURE.md` command table |
| New context | `daily-log-cli.js`, `statusline.js`, `prompt.js`, `time-tracker.js`, `.zshrc`, `ARCHITECTURE.md`, `SESSION_ACTIVITY_TRACKING.md`, `CLAUDE.md` |
| New npm script | `package.json`, `SESSION_ACTIVITY_TRACKING.md` |
| New journal type | Backend code, `CLAUDE.md` journal types table, `ARCHITECTURE.md` |
| New MCP tool | `.mcp.json` or `.claude/settings.local.json`, `CLAUDE.md` if user-facing |
| Command syntax change | `.zshrc`, `SESSION_ACTIVITY_TRACKING.md`, `ARCHITECTURE.md`, test extensively |
| Context detection logic | `daily-log-cli.js`, `SESSION_ACTIVITY_TRACKING.md` auto-detection section |
| Task workflow change | `daily-log-cli.js`, `.zshrc`, `SESSION_ACTIVITY_TRACKING.md`, possibly Google Tasks integration |

---

## For AI Agents Reading This

When you (Claude or another agent) are asked to modify this application:

1. **Always consider both environments** - terminal and AI assistant
2. **Always update documentation alongside code** - not as an afterthought
3. **Always test in both contexts** - ZSH commands AND npm scripts
4. **Never assume** - verify file paths, script names, and command synta
5. **Ask if uncertain** - better to clarify than break the user's workflow

**Remember:** The user relies on this application multiple times per day, every day. Consistency and reliability across both environments is critical to their productivity.

---

## Database Entry Management: Update Over Create

When the user asks you to log or create a database entry (journal, plan, protocol, contemplation):

**✅ ALWAYS DO THIS FIRST:**
1. Search for existing related entries using relevant keywords and content patterns
2. If you find entries with similarity > 0.8 or clear thematic relationship:
   - **Update the existing entry** with new information
   - Add new sections, refine thinking, update status
   - Use SQL UPDATE with the entry's id
3. **Only create new entries when no relevant match exists**

**✅ WHY THIS MATTERS:**
- Prevents duplicate information scattered across multiple entries
- Allows plans and protocols to evolve and stay current
- Makes semantic search more effective (fewer but richer entries)
- Reduces database clutter while preserving narrative evolution
- Follows the principle: "Update existing entries when appropriate rather than always creating new ones"

**✅ WHEN TO CREATE NEW:**
- No existing entry addresses this topic
- The entry is fundamentally different (e.g., new plan, different contemplation theme)
- The user explicitly requests a new entry separate from an existing one
- The information is time-sensitive and belongs in a new dated entry

**Example Update Pattern:**
```
SEARCH: SELECT * FROM journals WHERE type='plan' AND content ILIKE '%trading%'
RESULT: Found "Plan: Brazil projects and wealth" from March 1
ACTION: UPDATE that plan with new trading hour details, not create new entry
REASON: Both address same goal (wealth building), information is complementary
```

**Example Create Pattern:**
```
SEARCH: SELECT * FROM journals WHERE type='contemplation' AND content ILIKE '%love%'
RESULT: Found "Brazil, sexuality, life direction" and "Love patterns with Philippe"
SEARCH: No entry on "Daily sleep and schedule optimization"
ACTION: Create new protocol for sleep/schedule since no relevant match exists
```

