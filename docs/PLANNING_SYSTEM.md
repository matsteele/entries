# Planning & Reflection System

A Claude-assisted system for planning, journaling, and reflection - focused on thoughtful deliberation rather than time tracking.

## Philosophy

- **Think deeply** about priorities and goals
- **Document thoughts** as narrative entries in the database
- **Create strategic plans** stored in PostgreSQL with semantic search
- **Reflect daily** on what matters
- **Use AI assistance** to organize and surface relevant context

## System Components

### 1. Journal Entries

Stream of consciousness, thoughts, and reflections. **Stored in PostgreSQL database.**

**Use Cases:**
- Quick capture of thoughts while working
- End-of-day reflections
- Recording insights and breakthroughs
- Processing decisions and dilemmas

### 2. Strategic Plans

Full narrative plan documents stored in the database with vector embeddings for semantic search. The `plans/data/plans.json` file serves as an **index** that references database entries by title/ID, organized by time horizon (1-month, 1-year, 5-year).

**Use Cases:**
- Breaking down large projects into phases
- Documenting architecture decisions
- Creating implementation roadmaps
- Tracking plan status (draft -> active -> completed -> archived)

### 3. Planning Contexts

Hierarchical organization: Contexts -> Objectives -> Projects

**Data:** `plans/data/planning_contexts.json` (structured JSON index)

```json
{
  "contexts": {
    "cultivo": {
      "objectives": {
        "obj-cultivo-general": {
          "title": "General work",
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

### 4. Daily Task Tracking

Operational task tracking via `/t` commands and terminal statusline. **Stored in JSON files** (`tracking/daily-logs/`).

This is not narrative content - it's structured operational data for today's focused work.

### 5. Goal Hierarchies

Structured goal references at different time horizons. **Stored in JSON** (`goals.json`) as an organizational scaffold that references database plans by title/ID.

## Storage Separation

| Content Type | Storage | Why |
|---|---|---|
| Journal entries | PostgreSQL | Narrative, searchable semantically |
| Plans (full text) | PostgreSQL | Narrative, searchable semantically |
| Protocols | PostgreSQL | Narrative, searchable semantically |
| Plan index/hierarchy | JSON (`plans/data/plans.json`) | Structured reference, not narrative |
| Goals | JSON (`goals.json`) | Structured hierarchy |
| Decisions | JSON (`decisions.json`) | Structured records |
| Daily task logs | JSON (`tracking/`) | Operational, session-based |
| Relationships | JSON (`relationships.json`) | Structured people data |

## Workflow

### Planning Session
1. Discuss plans, goals, or projects with Claude
2. Claude queries database for existing related plans/entries
3. Update existing plans in database or create new ones
4. Extract actionable tasks from plans
5. Tasks confirmed -> Google Tasks (backlog)
6. Update `plans/data/plans.json` index if needed

### Daily Execution
1. Review Google Tasks, favorite items for today
2. `/t pull` brings favorited tasks into terminal daily log
3. Work on tasks, update via `/t` commands
4. Completed tasks logged in daily JSON

### Reflection
1. Journal entries go to database via SQL INSERT
2. Claude searches semantically for related past entries
3. Updates existing entries when relevant (similarity > 0.8)
4. Creates new entries only when no match exists

## Philosophy in Practice

### Narrative Over Numbers

Instead of tracking 47 minutes on a task, write:

> "Spent the morning refactoring the analysis service. Realized the core issue is coupling between data access and business logic. Created a repository pattern to separate concerns."

This captures what you did, what you learned, and what comes next.

### Plans as Living Documents

1. Create initial plan -> store in database
2. Work on the project
3. Add journal entries with insights
4. Update plan in database with new understanding
5. Claude helps keep plan current via semantic search

### Claude as Planning Partner

- Break down complex projects
- Surface relevant past experiences via semantic search
- Challenge assumptions
- Organize thoughts into actionable plans

---

**The goal isn't to track every minute - it's to think clearly, plan thoughtfully, and document your journey.**
