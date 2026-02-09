# Claude Instructions for Entries Project

> **⚠️ Important for Agents:** This application has a dual-environment architecture. When making changes, you MUST synchronize updates across both ZSH shell configuration (`.zshrc`) and Claude documentation. See **[AGENTS.md](./AGENTS.md)** for critical guidance on maintaining consistency between user terminal commands and AI assistant capabilities.

## Three Core Activities

This application supports three interconnected workflows:

### 1. 📋 Daily Task Tracking (Terminal/Daily Log)
**Purpose:** Track tasks intended for completion *today*.

- **Input**: Tasks user expects to complete today
- **Tools**: `/t` commands (ZSH), `npm run log:*` scripts
- **Output**: Daily log JSON files, terminal statusline
- **Key Principle**: Only pull tasks into daily log when ready to work on them today

### 2. 📝 Logging & Journaling (PostgreSQL Local Database)
**Purpose:** Capture and organize life data for reflection and analysis with semantic search.

- **Input**: Journal entries, reflections, protocols, plans
- **Storage**: Local PostgreSQL database with pgvector extension
- **Tools**: Custom CLI scripts, direct SQL queries
- **Features**: Vector embeddings for semantic search, full-text search, metadata extraction
- **Output**: Local database entries (private, never synced to cloud)

### 3. 🎯 Planning & Backlog Management (Google Tasks + Calendar)
**Purpose:** Plan future work and manage task backlog.

- **Planning Phase**:
  - Review existing plans in database (full narrative) and `plans/data/plans.json` (index/hierarchy)
  - Generate new tasks from plans
  - Store tasks in Google Tasks when confirmed as "will definitely do"
- **Execution Phase**:
  - User sets due dates on tasks in Google Tasks for today
  - `/t pull-goog` pulls tasks due today into daily log
  - `/t pull-jira` pulls assigned Jira tickets into daily log
  - Sync tasks with Google Calendar for time management

**Flow:**
```
Plans (Database - full narrative)
  → Generate Tasks
    → Google Tasks (backlog)
      → Set due date for today
        → /t pull-goog → Daily Log (terminal)
          → Google Calendar (time blocking)
```

### Workflow Integration

**Planning Session:**
1. User discusses plans, goals, or projects
2. Review existing plans in database; check `plans/data/plans.json` for plan index/hierarchy
3. Update existing plans or create new ones (always in database)
4. Extract actionable tasks from plans
5. User confirms tasks → Create in Google Tasks with appropriate list/context
6. Tasks stay in Google Tasks backlog until user is ready

**Daily Execution:**
1. User reviews Google Tasks and sets due dates for today
2. User runs `/t pull-goog` to pull tasks due today into terminal daily log
3. Tasks appear in daily log with appropriate context (per/cul/prof/soc/proj/heal)
4. **TODO**: Tasks sync to Google Calendar for time management
5. User works on tasks, updates via `/t` commands
6. Completed tasks logged with time tracking by context

**End of Day:**
1. Review completed work via `npm run log:show`
2. Generate Slack update from daily log
3. Review time spent by context via `npm run time:week`
4. Archive day's time automatically on next `/t start`

---

## Core Workflow

**When user discusses their data (protocols, plans, journals, etc.):**

1. **Review existing entries** - Query the database for related content
2. **Pull relevant context** - Bring in related protocols, plans, journals for context
3. **Provide commentary** - Offer insights based on what's found and recent activity
4. **Discuss and reflect** with the user
5. **Update or create** - When user asks to log:
   - **If relevant entry exists** → Update it with new information
   - **If no relevant match** → Create new entry

**Key principle: Update existing entries when appropriate rather than always creating new ones.**

---

## Data Location

> **⚠️ Database name is `entries`. Connect with: `psql -U matthewsteele -d entries`**

- **Narrative content** → PostgreSQL (journals, plans, protocols, metadata, embeddings)
- **Operational data** → JSON files (daily logs, time tracking, goals, relationships, decisions)
- All data stays local. Nothing synced to cloud (except OpenAI API for embeddings).

For full schema, storage rules, setup, and query examples, see **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

### Journal types

| Type | What it captures |
|------|------------------|
| `events` | Concrete happenings, experiences, who was involved |
| `contemplation` | Decision points, internal debates, tensions |
| `plan` | Forward-looking initiatives, strategies, milestones |
| `protocol` | Repeatable procedures, rules, behavioral guidelines |
| `entry` | General journal entries, reflections |
| `quick` | Quick notes |

**Decisions do NOT get standalone entries** — they integrate into plans and protocols.

---

## Entry Formats

### Events
```
Event: [Title]

Context: [Personal/Social/Professional/Cultivo/Projects]
Date/Period: [When]
People: [Who was involved]

[What happened - coherent narrative...]

Reflections: [Self-observations during event]
Impact: [Outcomes]
```

### Contemplations
```
Contemplation: [Theme/Question]

Context: [Personal/Social/Professional/Cultivo/Projects]
Core Question: [What's being explored]

Arguments for [Option A]:
- [Consideration]
- [Consideration]

Arguments for [Option B]:
- [Consideration]
- [Consideration]

Tensions/Tradeoffs: [What's in conflict]
Current lean: [Where thinking stands]
Related: [Plans, protocols, previous decisions]
```

### Plans
```
Plan: [Name]

Context: [Personal/Social/Professional/Cultivo/Projects]
Plan ID: [Unique identifier]
Goal: [What this aims to achieve]
Status: [Current state]

Phases:
1. [Phase with details]
2. [Phase with details]

Success criteria: [How to know it worked]
Risks: [What could go wrong]
Timeline: [When]
Next steps: [Immediate actions]

Related objectives: [From goals]
Related projects: [Project IDs]
```

### Protocols
```
Protocol: [Name]

Context: [Personal/Social/Professional/Cultivo/Projects]
Purpose: [Why this exists]
When to use: [Conditions/triggers]

Process:
1. [Step]
2. [Step]

Rules/Constraints:
- [Rule]
- [Rule]

Rationale: [Why it works this way]
```

---

## Updating vs Creating

**When user asks to log something:**

1. **Search for existing related entries** using semantic search
2. **If similarity > 0.8 or clearly related:**
   - Update the existing entry with new information
   - Add new sections, refine thinking, update status
   - Use SQL UPDATE with the entry's id
3. **If no relevant match:**
   - Create new entry
   - Use SQL INSERT

### Update existing
```sql
UPDATE journals
SET content = '[updated content]', updated_at = NOW()
WHERE id = '[entry-id]';
```

### Create new
```sql
INSERT INTO journals (id, date, content, type, context, created_at, updated_at)
VALUES (gen_random_uuid()::text, CURRENT_DATE, '[content]', '[type]', '[context]', NOW(), NOW());
```

---

## Daily Activity Logging

**Two separate task systems exist — keep them distinct:**

### 1. Terminal Todos (daily-log CLI)
Local task tracking for **today's focused work**. Context-aware numbering, grouped display, time tracking by context, routine/novel task views, and a time budget system.

For full command reference, context auto-detection keywords, routine vs novel tasks, and time budget details, see **[tracking/SESSION_ACTIVITY_TRACKING.md](./tracking/SESSION_ACTIVITY_TRACKING.md)**. For the command quick-reference table, see **[ARCHITECTURE.md](./ARCHITECTURE.md#t-command-reference)**.

**Key commands:**
- `/t start` - Start new day, carry over tasks, archive yesterday's time
- `/t add "task" [context] [r]` - Add task (optional context code, trailing `r` = routine)
- `/t -N` / `/t c-N` / `/t cs-N` / `/t d-N` - Switch / complete / complete+switch / delete
- `/t r` - Toggle routine/novel view
- `/t per|soc|prof|cul|proj|heal|us|all` - Context filter
- `/t jira` / `/t pull-goog` - Pull from Jira / Google Tasks

**Important**: When in a filtered context, task numbers map to only that context's tasks.

### 2. Google Tasks (MCP)
Cloud-based task backlog for longer-term tasks and plan-generated work.

| Action | Terminal Todos | Google Tasks |
|--------|----------------|--------------|
| "Add task from plan" | - | `mcp__google-tasks__createTask` |
| "Pull today's tasks" | `/t pull-goog` (due today) | Source for pull |
| "Add immediate task" | `/t add` (default) | - |
| "Complete task" | `/t c-N` | `mcp__google-tasks__completeTask` |

**Default:** Plan tasks → Google Tasks backlog → User sets due date → `/t pull-goog` → Daily Log.

### 3. Session Logging (`/t log-session`)

**Claude-only workflow** — logs the current conversation as a tracked work session.

When the user says `/t log-session`, Claude should:

1. **Read the daily log** to see current + pending tasks (all views):
   ```bash
   node ~/projects/currentProjects/entries/app/backend/statusline.js
   ```

2. **Analyze the conversation** to determine:
   - **Title**: concise task description (what was worked on)
   - **Context**: which context code applies (proj, cul, prof, per, etc.)
   - **Summary**: 1-2 sentence summary of work done
   - **Start time**: estimate when the conversation/work started (ask user if unclear)
   - **End time**: current time (now)

3. **Match against existing tasks** — check current task and all pending tasks (routine + novel). Look for semantic alignment between the conversation topic and task titles.

4. **Call the CLI** with the match result:
   ```bash
   node ~/projects/currentProjects/entries/app/backend/daily-log-cli.js log-session '{"title":"...","context":"proj","summary":"...","startedAt":"2026-02-08T05:00:00Z","endedAt":"2026-02-08T07:00:00Z","match":"current"}'
   ```

   The `match` field determines how the session is recorded:
   - `"current"` — session matches the current task (adds session to it)
   - `N` (number) — matches pending task N (all-tasks view, 1-indexed, adds session + time)
   - `"new"` — no match found, creates a new pending task with the session

5. **Report back** what was logged.

**Session log files** are stored in `tracking/sessions/session-YYYY-MM-DD.json` with conversation summaries, timestamps, and task match info.

**Calendar integration**: Sessions are automatically pushed to Google Calendar as events.

**Estimating start time**: If the conversation context makes it clear when work started (e.g., "I've been working on this for 2 hours"), use that. Otherwise, ask the user. Don't guess wildly — a reasonable estimate is better than no log.

**Task matching heuristics**:
- Current task title contains keywords from the conversation topic → `"current"`
- A pending task title semantically matches → use that task's number
- Multiple potential matches → ask user which one
- No match at all → `"new"` (creates a fresh pending task)

### End of Day Update Format

**IMPORTANT: For Cultivo Slack updates, ALWAYS use this format:**

```
⬆️ Daily Update - [Date]
✅ [TSP-1234](https://cultivo.atlassian.net/browse/TSP-1234): Task description [PR#123](https://github.com/org/repo/pull/123)
✅ [Completed task/accomplishment]
⏳ [In progress task]
⏭️ [Next up/tomorrow task]
```

**Note:** Use standard Markdown link syntax `[Text](URL)` for all links in Slack updates.

**Emoji guide:**
- ✅ (`:white_check_mark:`) - Completed
- ⏳ (`:hourglass_flowing_sand:`) - In progress
- ⏭️ (`:black_right_pointing_double_triangle_with_vertical_bar:`) - Next up

**Linking Jira Tickets and PRs:**

When tasks are associated with Jira tickets or GitHub PRs, include links in this format:
- **Format**: `[TSP-1234](jira-url): Task name [PR#123](pr-url)`
- **Jira link**: `https://cultivo.atlassian.net/browse/TSP-XXXXX`
- **PR link**: Full GitHub PR URL

**Slack Hyperlink Formatting:**

Use standard Markdown syntax for hyperlinks in Slack updates:
- **Markdown format**: `[Text to display](URL)`
- **Example**: `[TSP-1234](https://cultivo.atlassian.net/browse/TSP-1234)`
- **With PR**: `[PR#123](https://github.com/org/repo/pull/123)`

**When generating Slack updates:**
- Use `[Text](URL)` Markdown format for ALL hyperlinks
- Jira tickets: `[TSP-1234](https://cultivo.atlassian.net/browse/TSP-1234)`
- GitHub PRs: `[PR#123](https://github.com/CultivoLand/cultivo-mono/pull/123)`
- Commit hashes: `[abc123](https://github.com/CultivoLand/cultivo-mono/commit/abc123)`

**Note:** The Slack API format `<URL|Text>` only works when posting via API, not when copy-pasting into Slack manually.

**Commands:**
- `/t end [X-Y]` - Generate end-of-day update for date range
- `/t end links` - **AUTO-LINK MODE**: Automatically pull Jira and GitHub data to find and add relevant links to completed tasks

**Auto-linking process (`/t end links`):**
1. Pull recent Jira tickets assigned to user
2. Pull recent GitHub PRs authored by user
3. Match completed tasks to Jira tickets by:
   - Ticket number in task description (e.g., "TSP-1234" or "fix TSP-1234")
   - Semantic similarity between task description and ticket summary
4. Match tasks to PRs by:
   - PR number in task description
   - Commit messages
   - PR title similarity
5. Format completed tasks with ticket and PR links

**Task metadata retention:**
When Jira tasks are added to the todo list (via `/t pull-jira` or manual add), they should retain:
- `jiraTicket`: Ticket number (e.g., "TSP-1234")
- `jiraUrl`: Full Jira ticket URL
- `prNumber`: Associated PR number (if linked in Jira)
- `prUrl`: Full GitHub PR URL (if available)

This metadata is stored in the task JSON and used when generating end-of-day reports.

**Instructions for Claude when generating end-of-day reports:**

1. **When user runs `/t end [X-Y]` WITHOUT providing commit history or Jira data:**
   - Generate standard format update from daily log
   - Include links ONLY if task metadata contains `jiraTicket`, `jiraUrl`, `prNumber`, or `prUrl`
   - Format: `✅ [TSP-1234](url): Task description [PR#123](pr-url)` if links available
   - Otherwise: `✅ Task description` (no links)

2. **When user provides commit history or Git summary alongside `/t end`:**
   - Cross-reference completed tasks with commit messages and PR titles
   - Extract Jira ticket numbers from:
     - Task descriptions (e.g., "fix TSP-1234", "TSP-1234: feature")
     - Commit messages
     - PR titles
   - Match tasks to PRs by:
     - Semantic similarity between task description and PR title/commits
     - Explicit PR numbers in task descriptions
   - Format completed tasks with discovered links
   - **Important**: Only link tasks where there's clear evidence of connection

3. **When user runs `/t end links` (auto-link mode):**
   - First, pull Jira tickets: Use GitHub CLI or MCP to fetch recent tickets
     ```bash
     gh api /search/issues?q=assignee:@me+repo:cultivo/repo+type:issue
     ```
   - Then pull GitHub PRs:
     ```bash
     gh pr list --author @me --state all --limit 20 --json number,title,url,mergedAt
     ```
   - Match completed tasks to tickets/PRs using:
     - Direct ticket number mentions (regex: `TSP-\d+`)
     - Semantic similarity (>0.7 threshold) between task and ticket summary
     - PR numbers in task descriptions
     - Commit message analysis from PRs
   - Format output with all discovered links

4. **Matching heuristics:**
   - **Exact match**: Task contains "TSP-1234" → Link to TSP-1234
   - **Semantic match**: Task "Fixed mask layer bug" + Ticket "Resolve PMTiles mask layer rendering issue" → High similarity, link them
   - **PR match**: Task mentions "PR" or "#123" → Link to PR #123
   - **Commit match**: PR commits mention task keywords → Link PR to task
   - **Time-based**: Completed tasks matched to PRs merged within same timeframe

5. **Link format requirements:**
   - Jira: `[TSP-XXXXX](https://cultivo.atlassian.net/browse/TSP-XXXXX)`
   - GitHub PR: `[PR#123](https://github.com/cultivo/repo-name/pull/123)`
   - Combined: `✅ [TSP-1234](jira-url): Task description [PR#123](pr-url)`
   - If only Jira: `✅ [TSP-1234](jira-url): Task description`
   - If only PR: `✅ Task description [PR#123](pr-url)`
   - If neither: `✅ Task description`

6. **When commit history is provided in user message:**
   - Parse commit messages for Jira ticket numbers
   - Parse PR titles and numbers
   - Cross-reference with completed tasks from daily log
   - Automatically enhance the update with links
   - Show which links were auto-discovered vs. from task metadata

**Example workflow:**

User provides:
```
/t end 0-1

Commit history:
- Merged PR#1275: Fix PMTiles mask layer visibility (TSP-1240)
- Merged PR#1280: Add interpolation stats (TSP-1245)
```

Claude should:
1. Read daily logs for dates 2025-12-10 and 2025-12-11
2. Extract completed tasks
3. Match "mask layer" task → TSP-1240, PR#1275
4. Match "interpolation" task → TSP-1245, PR#1280
5. Generate:
```
⬆️ Daily update - 10th-11th Dec
✅ [TSP-1240](https://cultivo.atlassian.net/browse/TSP-1240): Fixed PMTiles mask layer visibility [PR#1275](https://github.com/cultivo/repo/pull/1275)
✅ [TSP-1245](https://cultivo.atlassian.net/browse/TSP-1245): Added interpolation stats [PR#1280](https://github.com/cultivo/repo/pull/1280)
✅ Reviewed and merged doubling counting issue with Aamir
...
```

---

## Context Tags

Always apply to entries. See **[ARCHITECTURE.md](./ARCHITECTURE.md#contexts)** for full context table with codes, emojis, and budget roles.

- **Health** (`heal`) - Sleep, meals, hygiene, exercise, medical
- **Personal** (`per`) - Feelings, reflections, growth, family, errands
- **Social** (`soc`) - Relationships, conversations, social activities
- **Professional** (`prof`) - Work, meetings, career (non-Cultivo)
- **Cultivo** (`cul`) - Cultivo-specific work
- **Projects** (`proj`) - Personal projects, side work
- **Unstructured** (`us`) - Leisure, free time, browsing

---

## Stream of Consciousness Entry Processing

When user provides stream of consciousness writing (aim: 2+ pages), follow the systematic protocol documented in `protocols/digesting-entries.md`.

**Key Steps:**
1. Parse and categorize into: Events, Contemplations, Plans, Protocols, Tasks
2. Extract people/relationships
3. Map decisions to existing plans/protocols
4. Search database for existing related entries
5. Update existing entries (don't duplicate)
6. Create new entries only when no relevant match exists
7. Extract actionable tasks → add to Google Tasks if confirmed
8. Provide analysis appropriate to each entry type

**Critical Rules:**
- **NO standalone decision entries** - decisions integrate into plans/protocols
- **Time-specific items become tasks**, not protocols
- **Context tags required** on all entries: Personal/Social/Professional/Cultivo/Projects
- **Check existing entries first** using semantic search (similarity > 0.8 = update, not create)
- **People must be disambiguated** against relationship data

See full protocol: `protocols/digesting-entries.md`

---

## Key Principles

1. **Semantic search first** - Find related entries before creating new
2. **Update over create** - Evolve existing entries when relevant
3. **Decisions integrate** - They don't stand alone, they update plans/protocols
4. **Discuss then log** - User explicitly asks to create/update entries
5. **Provide analysis** - Offer insights appropriate to entry type
6. **No duplicates** - Check existing before adding
7. **Three distinct activities** - Daily tracking, logging/journaling, planning/backlog

---

## Session Activity Tracking

Track activities during sessions for end-of-day debriefs. Update daily log periodically.

For full details on session behavior, JSON structure, activity types, and NPM commands, see **[tracking/SESSION_ACTIVITY_TRACKING.md](./tracking/SESSION_ACTIVITY_TRACKING.md)**.

---

## Related Documentation

- **[AGENTS.md](./AGENTS.md)** - Dual-environment sync guidance (ZSH + Claude), testing checklist
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture, database schema, contexts, `/t` command reference, setup
- **[tracking/SESSION_ACTIVITY_TRACKING.md](./tracking/SESSION_ACTIVITY_TRACKING.md)** - Full `/t` command details, routine/novel tasks, time budget, context auto-detection, session behavior
- **[protocols/](./protocols/)** - User protocols
  - `digesting-entries.md` - Stream-of-consciousness entry ingestion protocol
- **[docs/PLANNING_SYSTEM.md](./docs/PLANNING_SYSTEM.md)** - Planning system documentation
