# Entries: Planning & Reflection System

A Claude-assisted system for planning, journaling, and reflection - focused on thoughtful deliberation rather than time tracking.

## Philosophy

This system is designed around the principle that **planning and reflection** are more valuable than tracking every minute. The goal is to:

- **Think deeply** about priorities and goals
- **Document thoughts** and insights as you work
- **Create strategic plans** for projects
- **Reflect daily** on what matters
- **Use AI assistance** to organize and surface relevant context

Time tracking has been separated into a different system, allowing this to focus purely on thinking, planning, and documenting.

---

## System Components

### 1. **Journal Entries** 📝

Your stream of consciousness, thoughts, and reflections.

**Commands:**
```bash
cd app/backend
npm run journal:add "Your thought here"
npm run journal:daily        # Show daily reflection template
npm run journal:view         # View recent entries
npm run journal:today        # View today's entries
```

**Data:**
- `journal/data/journal_entries.json` - All journal entries (650+ entries)
- `journal/data/daily_logs.json` - Daily logs and quick notes

**Use Cases:**
- Quick capture of thoughts while working
- End-of-day reflections based on your plan and work
- Recording insights and breakthroughs
- Processing decisions and dilemmas

### 2. **Strategic Plans** 📋

Detailed plans for projects and features, created from templates.

**Commands:**
```bash
cd app/backend
npm run plan:create project-plan "Title" [context] [objective] [project]
npm run plan:list [status]
npm run plan:view <plan-id>
npm run plan:status <plan-id> <new-status>
npm run plan:templates
```

**Data:**
- `plans/data/plans.json` - Plan metadata
- `plans/active/*.md` - Active plan documents
- `plans/templates/*.md` - Plan templates

**Templates:**
- `project-plan.md` - Comprehensive project planning
- `feature-spec.md` - Feature specifications

**Use Cases:**
- Breaking down large projects into phases
- Documenting architecture decisions
- Creating implementation roadmaps
- Tracking plan status (draft → active → completed → archived)

### 3. **Daily Planning** 📅

Session-based daily planning with priorities, time blocks, and logistics.

**Commands:**
```bash
cd app/backend
npm run daily:start                          # Start with reflection
npm run daily:priority "Priority text"
npm run daily:block "9:00-11:00" "Activity" [plan-id]
npm run daily:logistics "Logistics note"
npm run daily:health "Health note"
npm run daily:view
npm run daily:complete                       # Mark planning complete
```

**Data:**
- `.current_day_plan.json` - Today's plan

**Structure:**
```json
{
  "date": "2025-11-16",
  "reflection": "Morning thoughts...",
  "priorities": [
    {"text": "Make progress on analysis refactor", "order": 1}
  ],
  "time_blocks": [
    {"time": "9:00-11:00", "activity": "Work at cafe", "plan_id": "plan-123"}
  ],
  "logistics": ["Book Airbnb before 10am"],
  "health_notes": ["Ice rotator cuff after workout"],
  "status": "active"
}
```

**Use Cases:**
- Morning planning ritual
- Setting daily priorities based on strategic plans
- Scheduling time blocks (aspirational, not tracked)
- Managing logistics and health reminders
- Linking daily work to strategic plans

### 4. **Protocols** 📖

Process documentation and workflow guidelines.

**Files:**
- `protocols/refactoring-protocol.md` - How to approach refactoring
- Add more as you develop standardized processes

**Use Cases:**
- Documenting your best practices
- Creating checklists for common tasks
- Standardizing decision-making processes
- Reference material for Claude interactions

### 5. **Planning Contexts** 🗂️

Hierarchical organization: Contexts → Objectives → Projects

**Data:**
- `plans/data/planning_contexts.json`

**Structure:**
```json
{
  "contexts": {
    "cultivo": {
      "name": "Cultivo",
      "objectives": {
        "obj-cultivo-general": {
          "title": "General work",
          "scope": "ongoing",
          "projects": {
            "proj-cultivo-001": {
              "title": "Analysis service refactor",
              "plan_id": "plan-refactor-analysis-service"
            }
          }
        }
      }
    }
  }
}
```

**Use Cases:**
- Organizing work by life context (work, personal, learning)
- Grouping projects under objectives
- Linking strategic plans to the hierarchy
- Providing structure for Claude to understand your priorities

---

## Workflow

### Morning Routine

1. **Daily Planning**
   ```bash
   npm run daily:start
   ```
   - Write morning reflection
   - Set 3-5 priorities for the day
   - Plan time blocks (optional)
   - Note logistics and health items

2. **Review Strategic Plans**
   ```bash
   npm run plan:list active
   npm run plan:view <plan-id>
   ```
   - Check what you're working on
   - Understand next steps

### During Work

3. **Use Claude for Planning**
   - Pull in relevant journal entries
   - Reference strategic plans
   - Create task breakdowns
   - Make architectural decisions
   - Everything as a conversation

4. **Quick Journal Entries**
   ```bash
   npm run journal:add "Breakthrough: realized X pattern solves Y problem"
   ```

### End of Day

5. **Reflection Journal Entry**
   - Review your daily plan
   - Summarize what you accomplished
   - Note insights and blockers
   - Optional structured reflection using template:
   ```bash
   npm run journal:daily  # Get template
   npm run journal:add "$(cat reflection.txt)"
   ```

6. **Update Plan Status**
   ```bash
   npm run plan:status <plan-id> completed
   ```

---

## Claude Integration

The power of this system comes from Claude being able to access your entire context:

### Planning Session Example

```
You: I need to plan today's work on the analysis service refactor

Claude can:
- Read your strategic plan (plan-refactor-analysis-service.md)
- See your daily plan and priorities
- Pull relevant journal entries about this project
- Reference your refactoring protocol
- Create a detailed implementation plan
- Update the strategic plan with progress
```

### Reflection Session Example

```
You: Help me reflect on this week

Claude can:
- Review your daily plans for the week
- Read journal entries
- Check plan statuses
- Identify patterns and insights
- Draft a weekly reflection
- Suggest adjustments to priorities
```

---

## Data Storage

### Current Files
- **Journal:** Plain JSON files locally
- **Plans:** Markdown files + JSON metadata
- **Daily Plans:** JSON state file

### Future: RAG with PGVector

The system is designed to migrate to a RAG (Retrieval-Augmented Generation) system:

- Store all entries, plans, protocols in PostgreSQL with pgvector
- Semantic search for relevant context
- Claude can pull in exactly what's needed for each conversation
- See `plans/active/plan-entries-project-rag-system-with-pgvector.md`

---

## Separation from Time Tracking

**What was removed:**
- Session management (start/end work sessions)
- Activity tracking (task work, planning time)
- Time aggregation and statistics
- All time tracking UI components
- End-of-day summaries with time data

**Where it went:**
- `../time-tracking/` - Complete separate system
- Can be used independently if you want time tracking
- Tasks and hierarchy live there now

**Why separated:**
- Different mental models (reflection vs. measurement)
- Time tracking adds cognitive overhead during planning
- Focus on narrative and thought rather than minutes
- Allows pure planning conversations with Claude

---

## Next Steps

### Immediate
- [x] Separate time tracking from planning
- [ ] Set up Supabase with pgvector
- [ ] Migrate journal entries to vector database
- [ ] Create MCP connections to external tools (Jira, Google Tasks)

### Future Enhancements
- **AI-Assisted Planning:** Claude reads your journal, suggests daily priorities
- **Context-Aware Conversations:** Every session has full historical context
- **Pattern Recognition:** AI identifies themes across entries
- **Plan Generation:** Claude creates strategic plans from journal entries
- **Weekly/Monthly Reviews:** Automated summaries and insights

---

## File Structure

```
entries/
├── journal/
│   ├── data/
│   │   ├── journal_entries.json    # All journal entries
│   │   └── daily_logs.json         # Quick logs
│   ├── templates/
│   │   └── daily-reflection.md
│   └── scripts/                    # RAG scripts
├── plans/
│   ├── data/
│   │   ├── plans.json              # Plan metadata
│   │   └── planning_contexts.json  # Contexts/objectives/projects
│   ├── active/                     # Active plan documents
│   └── templates/                  # Plan templates
├── protocols/
│   └── refactoring-protocol.md
├── app/backend/
│   ├── plan-cli.js                 # Strategic plans CLI
│   ├── daily-cli.js                # Daily planning CLI
│   ├── journal-cli.js              # Journal CLI
│   └── package.json                # NPM scripts
├── supabase/                       # RAG database setup
└── docs/
    └── PLANNING_SYSTEM.md          # This file
```

---

## Philosophy in Practice

### Narrative Over Numbers

Instead of tracking 47 minutes on a task, write:

> "Spent the morning refactoring the analysis service. Realized the core issue is coupling between data access and business logic. Created a repository pattern to separate concerns. Next step is to extract the validation logic into a separate service."

This captures:
- What you did
- What you learned
- What comes next
- The thought process

### Plans as Living Documents

Strategic plans aren't static - they evolve:

1. Create initial plan from template
2. Work on the project
3. Add journal entries with insights
4. Update plan with new understanding
5. Claude helps keep plan current

### Claude as Planning Partner

Use Claude to:
- Break down complex projects
- Identify missing considerations
- Suggest next steps based on progress
- Surface relevant past experiences
- Challenge assumptions
- Organize thoughts into actionable plans

---

## Getting Started

1. **Start your day:**
   ```bash
   cd app/backend
   npm run daily:start
   ```

2. **Create a plan for your project:**
   ```bash
   npm run plan:create project-plan "My Project" personal
   ```

3. **Work and journal as you go:**
   ```bash
   npm run journal:add "Insight or progress note"
   ```

4. **Use Claude to plan and reflect:**
   - Ask Claude to read your plans and journal
   - Have conversations about priorities
   - Get help breaking down tasks
   - Reflect on progress

5. **End your day with reflection**

---

**Remember:** The goal isn't to track every minute - it's to think clearly, plan thoughtfully, and document your journey.
