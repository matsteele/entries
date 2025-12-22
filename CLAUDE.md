# Claude Instructions for Entries Project

> **⚠️ Important for Agents:** This application has a dual-environment architecture. When making changes, you MUST synchronize updates across both ZSH shell configuration (`.zshrc`) and Claude documentation. See [`AGENT.md`](./AGENT.md) for critical guidance on maintaining consistency between user terminal commands and AI assistant capabilities.

## Three Core Activities

This application supports three interconnected workflows:

### 1. 📋 Daily Task Tracking (Terminal/Daily Log)
**Purpose:** Track tasks intended for completion *today*.

- **Input**: Tasks user expects to complete today
- **Tools**: `/t` commands (ZSH), `npm run log:*` scripts
- **Output**: Daily log JSON files, terminal statusline
- **Key Principle**: Only pull tasks into daily log when ready to work on them today

### 2. 📝 Logging & Journaling (Supabase)
**Purpose:** Capture and organize life data for semantic search and reflection.

- **Input**: Events, contemplations, plans, protocols
- **Storage**: Supabase with vector embeddings
- **Tools**: MCP Supabase tools, `scripts/journal-supabase.js`
- **Output**: Searchable knowledge base of life patterns, decisions, and protocols

### 3. 🎯 Planning & Backlog Management (Google Tasks + Calendar)
**Purpose:** Plan future work and manage task backlog.

- **Planning Phase**: 
  - Pull in existing plans from Supabase
  - Generate new tasks from plans
  - Store tasks in Google Tasks when confirmed as "will definitely do"
- **Execution Phase**:
  - User favorites tasks in Google Tasks for that day
  - `/t pull` pulls only favorited tasks into daily log
  - Sync tasks with Google Calendar for time management

**Flow:**
```
Plans (Supabase) 
  → Generate Tasks 
    → Google Tasks (backlog) 
      → User favorites for today 
        → /t pull → Daily Log (terminal)
          → Google Calendar (time blocking)
```

### Workflow Integration

**Planning Session:**
1. User discusses plans, goals, or projects
2. Search Supabase for existing related plans using semantic search
3. Update existing plans or create new ones (with vector embeddings)
4. Extract actionable tasks from plans
5. User confirms tasks → Create in Google Tasks with appropriate list/context
6. Tasks stay in Google Tasks backlog until user is ready

**Daily Execution:**
1. User reviews Google Tasks and favorites items for today
2. User runs `/t pull` to pull favorited tasks into terminal daily log
3. Tasks appear in daily log with appropriate context (per/cul/prof/soc/proj)
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

**When user discusses their data (protocols, plans, contemplations, etc.):**

1. **Semantic search Supabase** - Find conceptually similar existing entries
2. **Pull relevant entries** - Bring in related protocols, plans, contemplations for context
3. **Provide commentary** - Offer insights based on what's found and recent activity
4. **Discuss and reflect** with the user
5. **Update or create** - When user asks to log:
   - **If relevant entry exists** → Update it with new information
   - **If no relevant match** → Create new entry

**Key principle: Update existing entries when appropriate rather than always creating new ones.**

---

## Data Location

**All personal data is in Supabase.** Use `mcp__supabase__execute_sql` to query.

### `journals` table (by type field)

| Type | What it captures | Analysis provides |
|------|------------------|-------------------|
| `events` | Concrete happenings, experiences, activities, who was involved | Relationship insights, pattern observations |
| `contemplation` | Decision points, internal debates, explorations, tensions | Framework for thinking through decisions, questions to consider |
| `plan` | Forward-looking initiatives, strategies, phases, milestones | Risk mitigation, resource identification, timeline reality-checks |
| `protocol` | Repeatable procedures, rules, behavioral guidelines | Optimization ideas, potential challenges, complementary protocols |
| `entry` | General journal entries, reflections | - |
| `quick` | Quick notes | - |

### Decisions
**Decisions do NOT get standalone entries.** Instead:
- Decisions get integrated into plans and protocols
- Decisions are referenced from contemplations
- Major life decisions update existing plans/protocols

### Other tables
- `plans` - Structured plans with status, context_id, objective_id, project_id
- `protocols` - Formal protocol documents
- `journal_metadata` - People, emotions, concepts, key_insights per journal entry

---

## Querying Data

### Find all protocols
```sql
SELECT id, date, content FROM journals WHERE type = 'protocol' ORDER BY date DESC;
```

### Find recent contemplations
```sql
SELECT id, date, content FROM journals WHERE type = 'contemplation' ORDER BY date DESC LIMIT 10;
```

### Find plans
```sql
SELECT id, date, content FROM journals WHERE type = 'plan' ORDER BY date DESC;
```

### Keyword search
```sql
SELECT id, date, type, content FROM journals WHERE content ILIKE '%search term%';
```

### Semantic search (pgvector)
The `embedding` column enables similarity search:
```sql
SELECT id, date, type, content, 1 - (embedding <=> '[query_embedding]') as similarity
FROM journals
WHERE embedding IS NOT NULL
ORDER BY embedding <=> '[query_embedding]'
LIMIT 10;
```

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

**Two separate task systems exist - keep them distinct:**

### 1. Terminal Todos (daily-log CLI)
Local task tracking shown in terminal statusline. These are the tasks for **today's focused work**.

**Key Features:**
- **Context-aware task numbering**: When in a specific context, task numbers map to that context's tasks only
- **Grouped display**: When viewing all tasks, they're grouped by context with emoji separators  
- **Time tracking by context**: End-of-day shows time spent in each context

**Slash commands:**
- `/t start` - Start new day, carry over pending tasks and current task from last available day
- `/t per|cul|prof|soc|proj` - Quick context switch (filters todos to that context)
- `/t all` - Clear filter, show all tasks grouped by context emoji
- `/t add "task" [context]` - Add pending task
  - Context auto-detected from task keywords if omitted
  - If in a filtered context (e.g., after `/t per`), uses that context by default
  - Can override with explicit context: `/t add "task" cul`
- `/t addS "task" [context]` - Add task and immediately switch to it
- `/t -N` - Switch to pending task N (context-aware: maps to filtered list)
- `/t c-N` - Complete pending task N (context-aware)
- `/t cs-N` - Complete current task and switch to pending task N
- `/t p-N` - Move current task to pending
- `/t d-N` - Delete pending task N (context-aware)
- **TODO: `/t pull`** - Pull favorited tasks from Google Tasks into daily log

**Important**: When in a filtered context (e.g., `/t per`), task numbers map to only that context's tasks. So `/t -1` switches to the first personal task, not the first overall task. Use `/t all` to see all tasks.

**NPM commands (from entries/app/backend):**
- `npm run log:start-day` - Start new day (archives yesterday's time automatically)
- `npm run log:current "task"` - Set current task
- `npm run log:complete` - Complete current task
- `npm run log:complete "work description"` - Add completed work to log
- `npm run log:complete-switch N` - Complete current task and switch to pending task N (clearer interface)
- `npm run log:pending "task"` - Add pending task
- `npm run log:show [date]` - Display daily log
- `npm run log:note "note text"` - Add note to current task
- `npm run log:note-pending N "note text"` - Add note to pending task N
- `npm run log:note-completed <work-id> "note text"` - Add note to completed work

**Time tracking commands:**
- `npm run time:week` - Show current week's time by context
- `npm run time:month` - Show current month's time by context
- `npm run time:year [year]` - Show year's time by context
- `npm run time:archive [date]` - Manually archive a day's time (usually automatic)

### 2. Google Tasks (MCP)
Cloud-based task backlog. Use for capturing ideas, longer-term tasks, and tasks organized into different task lists (contexts).

**Purpose in Workflow:**
1. Store tasks generated from plans (when confirmed as "will definitely do")
2. Backlog management and task organization
3. User favorites tasks for the day → `/t pull` brings them into daily log
4. **TODO: Integration with Google Calendar for time blocking**

**MCP tools:**
- `mcp__google-tasks__listTaskLists` - List all your Google Tasks lists (e.g., "Planning", "Finance", "Home")
- `mcp__google-tasks__getTasks` - Get tasks from a specific task list
- `mcp__google-tasks__createTask` - Create a new task in a specific list
- `mcp__google-tasks__updateTask` - Update an existing task
- `mcp__google-tasks__completeTask` - Mark a task as complete
- `mcp__google-tasks__deleteTask` - Delete a task
- `mcp__google-tasks__searchTasks` - Search across all task lists
- `mcp__google-tasks__syncAllTasks` - Get all tasks from all lists

### Important Distinction

| Action | Terminal Todos | Google Tasks |
|--------|----------------|--------------|
| "Add task from plan" | - | `mcp__google-tasks__create` when confirmed |
| "Favorite for today" | - | User action in Google Tasks UI |
| "Pull today's tasks" | `/t pull` (pulls favorited) | Source for pull |
| "Add immediate task" (default) | `/t add` or `pending` command | - |
| "Complete task" | `/t c-N` | `mcp__google-tasks__update` with status |

**Default behavior:**
- Adding tasks from plans → Google Tasks (for backlog management)
- Favoriting for today → User action in Google Tasks
- Pulling today's work → `/t pull` (Terminal Todos)
- Completing tasks → Terminal Todos (unless managing backlog in Google Tasks)

### Context auto-detection

When `--c` is not specified, tasks are automatically categorized into one of these contexts:

- **Personal** (`per`): Health, appointments, family, personal errands (dentist, doctor, health, family, personal)
- **Social** (`soc`): Relationships, social events, hangouts, conversations (friends, meet, dinner, coffee, social)
- **Professional** (`prof`): Non-Cultivo work, career activities (meeting, interview, job, career, resume)
- **Cultivo** (`cul`): Cultivo-specific work (PR, feature, bug, test, migration, review, deploy, Jira, sprint)
- **Projects** (`proj`): Personal projects, side work, trading (btx, trading, side project, freelance, consulting)

**Auto-detection keywords** (case-insensitive):
- Cultivo: PR, feature, bug, test, migration, review, deploy, sprint, Jira, TSP-
- Personal: dentist, doctor, appointment, health, family, errands, personal
- Social: friends, meet, dinner, coffee, hangout, party, social, drinks
- Projects: trading, btx, side, freelance, consulting, project
- Professional: (default if none of the above match)

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
When Jira tasks are added to the todo list (via `/t pull` or manual add), they should retain:
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

Always apply to entries:
- **Personal** - Feelings, reflections, personal growth, health
- **Social** - Relationships, conversations, social activities
- **Professional** - Work, meetings, career (non-Cultivo)
- **Cultivo** - Cultivo-specific work
- **Projects** - Personal projects, side work

---

## Stream of Consciousness Entry Processing

When user provides stream of consciousness writing (aim: 2+ pages), follow the systematic protocol documented in `protocols/PROTOCOL_LOGGING.md`.

**Key Steps:**
1. Parse and categorize into: Events, Contemplations, Plans, Protocols, Tasks
2. Extract people/relationships
3. Map decisions to existing plans/protocols
4. Search Supabase for existing related entries
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

See full protocol: `protocols/PROTOCOL_LOGGING.md`

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

All Claude sessions should track activities for end-of-day debriefs. See `protocols/SESSION_ACTIVITY_TRACKING.md` for full details.

**During Session:**
- Track significant activities using npm log commands
- Update daily log periodically (every 15-30 minutes)
- Maintain both professional and personal context

**NPM Commands (from entries/app/backend):**
- `npm run log:start-day` - Start new day (archives yesterday's time automatically)
- `npm run log:current "task"` - Set current task
- `npm run log:complete` - Complete current task
- `npm run log:complete "work description"` - Add completed work to log
- `npm run log:show [date]` - Display daily log

**End of Day Debrief:**
When user requests "end of day debrief" or "generate Slack update", create formatted summary using this **exact format**:

```
⬆️ Daily Update - [Date]
✅ [Completed task/accomplishment]
✅ [Completed task/accomplishment]
⏳ [In progress task]
⏭️ [Next up/tomorrow task]
```

---

## Key Principles

1. **Semantic search first** - Find related entries before creating new
2. **Update over create** - Evolve existing entries when relevant
3. **Decisions integrate** - They don't stand alone, they update plans/protocols
4. **Discuss then log** - User explicitly asks to create/update entries
5. **Provide analysis** - Offer insights appropriate to entry type
6. **No duplicates** - Check existing before adding

---

## Related Documentation

- **[AGENT.md](./AGENT.md)** - **READ THIS FIRST when making changes!** Explains the dual-environment architecture and synchronization requirements between ZSH and Claude
- **[protocols/](./protocols/)** - User protocols for specific workflows
  - `CLAUDE_JOURNAL_GUIDE.md` - Journal entry guidance
  - `SESSION_ACTIVITY_TRACKING.md` - Activity tracking protocol
  - `PROTOCOL_LOGGING.md` - Protocol documentation standards
  - `end-of-day-update.md` - EOD update format
  - `refactoring-protocol.md` - Code refactoring process
- **[docs/PLANNING_SYSTEM.md](./docs/PLANNING_SYSTEM.md)** - Planning system documentation
- **[supabase/](./supabase/)** - Database setup and migration docs
