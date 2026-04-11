# Goals-to-Actions System PRD

## Problem

18 plans exist as narrative documents in the database. None flow into daily execution. The daily task list is dominated by routine items and reactive work (Jira, one-off Google Tasks). Ambitious projects never start because there's no decomposition path from vision to "what do I do for 45 minutes today?" The result: days feel productive but weeks don't compound toward what actually matters.

## Core Insight

The user needs two things:
1. **A decomposition hierarchy** that breaks goals into progressively smaller units until they become daily actions
2. **An intention-setting ritual** that connects each day's work to the larger picture — not just "what tasks do I have" but "what am I trying to accomplish and why"

## Design Principles

- **Always one next action**: Every active project must have a concrete next step. If it doesn't, it's stuck and the system should surface that.
- **Intention over allocation**: "I want to advance the Solar Geo product by completing the data model" is more motivating than "spend 60 min on projects context." Goals drive time, not the reverse.
- **Gradient of commitment**: Not everything needs to be active. Most things should be dormant. The system helps you choose what's alive *right now*.
- **AI as review partner**: Claude suggests what to work on based on stated goals, recent momentum, and stale projects — but the user decides.
- **Track toward goals, not just tasks**: Completing tasks is satisfying. Completing tasks that move a goal forward is meaningful. The UI should make this connection visible.
- **Direct lineage, no lossy intermediaries**: Actions flow directly into the daily task system carrying their full goal/project/epic ancestry. Google Tasks is NOT the bridge for goal-linked work — it remains for one-off and external tasks only.

---

## Hierarchy

```
Goal (what you want to be true)
  └─ Project (a body of work toward the goal)
       └─ Epic/Phase (a milestone within the project)
            └─ Action (a concrete task, 30min-4hrs)
```

### Goal
- A desired future state. Stable over months/years.
- Examples: "Be financially independent", "Build a portfolio of geospatial products", "Have a strong intellectual community"
- Fields: `title`, `description`, `horizon` (1yr / 3yr / 5yr), `status` (active/dormant), `context`, `weight` (1-10, drives treemap proportionality)

### Project
- A specific initiative that moves toward a goal. Has a beginning and end.
- Sourced from existing `plans` in the database — these ARE your projects.
- Examples: "Solar Investment Geospatial Product", "Substack Community", "Community Land Trust Platform"
- Fields: `title`, `description`, `goal_id`, `status` (active/incubating/dormant/completed), `horizon` (now/soon/someday), `impact_score` (1-5), `next_action`, `last_reviewed`, `context`, `weight` (1-10)

### Epic / Phase
- A milestone or chunk within a project. Represents a shippable increment or logical phase.
- Examples: "Phase 1: Data pipeline MVP", "Launch first 3 Substack posts"
- Fields: `title`, `description`, `project_id`, `status`, `order`, `target_date`

### Action
- A concrete, completable task (30min-4hrs). Lives directly in the daily task system.
- Always belongs to an epic (or directly to a project if no epic decomposition yet).
- This is where the hierarchy meets the existing `/t` system.
- Fields: `title`, `epic_id`, `project_id`, `goal_id` (denormalized), `estimated_minutes`, `status`, `daily_task_id`

---

## Data Flow: Actions to Daily Tasks (No Google Tasks Intermediary)

### The Problem with Google Tasks as Bridge

Google Tasks is a flat structure: title, notes, due date. It cannot carry:
- Goal lineage (which goal → project → epic does this serve?)
- Impact scores or weights
- Epic progress context
- Bidirectional sync back to action completion status

Using Google Tasks as the intermediary between plans and daily execution creates a lossy translation. The hierarchy is stripped at exactly the point where it's most needed (during execution).

### The Solution: Direct Action → Daily Task Flow

```
Goal-linked work:
  Treemap → [→ today] on action
    → /t add-action (new CLI command)
      → Creates daily task with action_id, epic_id, project_id, goal_id metadata
        → Task appears in Focus view with full lineage
          → Completion syncs back: action.status = 'completed', epic progress updates

External / one-off work (unchanged):
  Google Tasks → /t pull-goog → daily task (no goal lineage, shows as "unlinked")
  Jira → /t pull-jira → daily task (linked to Cultivo goal by context)
```

### Task Metadata Extension

Daily tasks (in pending.json / current.json) gain optional fields:

```json
{
  "title": "Build ingestion service",
  "activityContext": "projects",
  "actionId": "abc-123",
  "epicId": "def-456",
  "projectId": "ghi-789",
  "goalId": "jkl-012",
  "goalTitle": "Financial Independence",
  "projectTitle": "Solar Geo Product",
  "epicTitle": "Phase 1: Data Pipeline MVP",
  "estimatedMinutes": 120,
  "focusLevel": 4,
  "priority": 5
}
```

The denormalized titles mean the Focus view can display lineage without additional API calls.

### Completion Sync

When a daily task with `actionId` is completed via `/t c-N`:
1. Daily task marked complete (existing behavior)
2. `actions` table: `status = 'completed'`, `updated_at = NOW()`
3. Epic progress recalculated (% of actions completed)
4. If all actions in epic complete → epic.status = 'completed'
5. Project next_action auto-advances to next pending action

---

## Database Schema

### New Tables

```sql
-- Goals: top-level desired outcomes
CREATE TABLE goals (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title TEXT NOT NULL,
    description TEXT,
    horizon TEXT CHECK (horizon IN ('1yr', '3yr', '5yr')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'dormant')),
    context TEXT,
    weight INTEGER DEFAULT 5 CHECK (weight BETWEEN 1 AND 10),
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Epics: milestones within projects (plans)
CREATE TABLE epics (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title TEXT NOT NULL,
    description TEXT,
    project_id TEXT REFERENCES plans(id),
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'active', 'completed', 'dropped')),
    sort_order INTEGER DEFAULT 0,
    target_date DATE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Actions: concrete tasks within epics or directly under projects
CREATE TABLE actions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title TEXT NOT NULL,
    epic_id TEXT REFERENCES epics(id),
    project_id TEXT REFERENCES plans(id) NOT NULL,
    goal_id TEXT REFERENCES goals(id),           -- denormalized for fast queries
    estimated_minutes INTEGER,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'in_progress', 'completed', 'dropped')),
    daily_task_id TEXT,                           -- links to /t task when pulled into daily
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Enhance existing plans table
ALTER TABLE plans ADD COLUMN IF NOT EXISTS goal_id TEXT REFERENCES goals(id);
ALTER TABLE plans ADD COLUMN IF NOT EXISTS horizon TEXT CHECK (horizon IN ('now', 'soon', 'someday'));
ALTER TABLE plans ADD COLUMN IF NOT EXISTS impact_score INTEGER CHECK (impact_score BETWEEN 1 AND 5);
ALTER TABLE plans ADD COLUMN IF NOT EXISTS weight INTEGER DEFAULT 5 CHECK (weight BETWEEN 1 AND 10);
ALTER TABLE plans ADD COLUMN IF NOT EXISTS next_action TEXT;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS last_reviewed DATE;

-- Daily intentions table (for morning intention + evening reflection)
CREATE TABLE daily_intentions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    date DATE NOT NULL UNIQUE,
    morning_intention TEXT,
    evening_reflection TEXT,
    goal_allocations JSONB,      -- [{ goalId, plannedMinutes }]
    journal_id TEXT,             -- links to auto-created journal entry
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Linking to Existing Data
- Projects = existing `plans` table rows (enhanced with new columns)
- Plans in `journals` (type='plan') are the narrative source — linked to `plans` rows and displayed in the side panel
- Actions flow DIRECTLY into daily `/t` tasks with full lineage metadata
- Google Tasks remains for one-off / external tasks only (unchanged)

---

## Two Views: Planning (Treemap) + Focus (Concentric Rings)

### View 1: Planning View — Weighted Treemap

A full-screen treemap where **area = weight/intention**. This is where strategic thinking happens — separate from daily execution.

#### Top Level: Goals

```
┌─────────────────────────────────────────────┬──────────────────────┐
│                                             │                      │
│         Financial Independence              │    Cultivo Career    │
│              weight: 8                      │      weight: 7       │
│                                             │                      │
│         4 projects · 2 active               │    1 project · NOW   │
│         ██████░░░░ 55% on track             │    ████████░░ 80%    │
│                                             │                      │
│                                             │                      │
├─────────────────────┬───────────────────────┼──────────────────────┤
│                     │                       │                      │
│    Intellectual     │   Health & Wellbeing  │    dormant (4)       │
│    Community        │      weight: 5        │    ·················  │
│     weight: 6       │                       │    Property          │
│                     │   2 projects          │    AI Startup        │
│     2 projects      │   ██░░░░░░░░ 15%     │    Family Office     │
│     ████░░░░░░ 35%  │                       │    Geo Strategy      │
│                     │                       │                      │
└─────────────────────┴───────────────────────┴──────────────────────┘
```

**Visual encoding:**
- **Area** = weight (user-set intention/priority, 1-10). Higher weight = more visual space. This is the key insight: the treemap makes you *confront* your stated priorities. If Financial Independence is weight:8 but you spent 0 hours on it this week, the large empty box is a visual indictment.
- **Color saturation** = health/momentum. Deep color = on track, active work. Faded = stale, no recent progress. Gray = dormant.
- **Progress bar** = aggregate completion across active projects/epics.
- **Border treatment**: Solid = active. Dashed = incubating. Dotted/dim = dormant. Dormant goals collapse into a shared "dormant" region to avoid wasting space.

#### Click Goal → Drill Into Projects (Treemap Recalculates)

Clicking "Financial Independence" replaces the treemap with projects within that goal. The side panel opens simultaneously.

```
┌─ Financial Independence ─────────────────────────────┬─────────────────────┐
│                                                      │ 📋 Side Panel       │
│  ┌──────────────────────────────────┬──────────────┐ │                     │
│  │                                  │              │ │ Solar Geo Product   │
│  │     🚀 Solar Geo Product         │  📈 Trading  │ │ ─────────────────── │
│  │        weight: 9 · NOW           │   System     │ │                     │
│  │                                  │  weight: 5   │ │ Narrative:          │
│  │     Phase 1: ████████░░ 75%      │  SOON        │ │ "Build a geospatial │
│  │     Next: Build ingestion svc    │              │ │ intelligence product│
│  │     Reviewed: 2d ago             │  Phase 1:    │ │ for solar invest..."│
│  │                                  │  ██░░░░ 20%  │ │                     │
│  │                                  │              │ │ Status: NOW         │
│  ├──────────────────────────────────┤  Reviewed:   │ │ Impact: ★★★★★       │
│  │  🏠 Family Office    │ 🏦 Prop.  │  8d ago      │ │ Last reviewed: 2d   │
│  │  SOMEDAY · wt:3      │ DORMANT   │              │ │                     │
│  │                       │ wt:1      │              │ │ [Edit Plan]         │
│  └───────────────────────┴──────────┴──────────────┘ │ [View Full Narrative]│
│                                                      │ [Add Epic]          │
│  ← Back to Goals                                     │ [Set Weight: ●●●●●] │
└──────────────────────────────────────────────────────┴─────────────────────┘
```

#### Click Project → Drill Into Epics/Actions

Clicking "Solar Geo Product" drills one more level. The treemap shows epics. The side panel shows the project narrative.

```
┌─ Solar Geo Product ──────────────────────────────────┬─────────────────────┐
│                                                      │ 📋 Phase 1: Data    │
│  ┌─────────────────────────────────────────────────┐ │    Pipeline MVP     │
│  │                                                 │ │ ─────────────────── │
│  │        Phase 1: Data Pipeline MVP               │ │                     │
│  │        ████████████░░░░ 75%                     │ │ Description:        │
│  │                                                 │ │ "Set up the core    │
│  │  ✅ Define schema    ✅ PMTiles integration      │ │ data ingestion and  │
│  │                                                 │ │ storage pipeline    │
│  │  ◻ Build ingestion service   2hr   [→ today]    │ │ for PMTiles..."     │
│  │  ◻ Test with sample data     1hr   [→ today]    │ │                     │
│  │                                                 │ │ Target: April 20    │
│  ├────────────────────────┬────────────────────────┤ │                     │
│  │ Phase 2: Analysis      │ Phase 3: UI + Dist.    │ │ Actions:            │
│  │ Engine                 │                        │ │ 2/4 complete        │
│  │ 0% · 5 actions         │ 0% · 3 actions         │ │                     │
│  │ (locked until Phase 1) │                        │ │ [Add Action]        │
│  └────────────────────────┴────────────────────────┘ │ [Edit Epic]         │
│                                                      │                     │
│  ← Back to Financial Independence                    │                     │
└──────────────────────────────────────────────────────┴─────────────────────┘
```

#### Side Panel Behavior

The side panel is the **detail + narrative layer**. It appears when you click any node and shows contextual information for whatever level you're viewing:

| Viewing | Side Panel Shows |
|---------|-----------------|
| Goals (top level) | Selected goal description, weight slider, horizon, linked journal entries |
| Projects within a goal | Project narrative (from journals type='plan'), status, impact, last reviewed, weight slider |
| Epics within a project | Epic description, target date, action list with status, [Add Action] |
| Actions within an epic | Action detail, estimated time, notes, [→ today] button |

The narrative plan content from the `journals` table (type='plan') surfaces here — this is where the rich context lives. The treemap boxes show the minimal summary; the side panel shows the full story.

#### `[→ today]` Button Behavior

When clicked on an action:
1. Calls `/api/tasks/action` with `{ action: 'add-from-plan', actionId, title, estimatedMinutes, goalId, projectId, epicId, goalTitle, projectTitle, epicTitle, context }`
2. CLI creates a daily task in `pending.json` with full lineage metadata
3. Action status in `actions` table updates to `in_progress`
4. Toast confirmation: "Added to today: Build ingestion service (Solar Geo → Phase 1)"
5. Task immediately appears in Focus view with goal lineage

#### Weight Adjustment

Each goal and project has a weight slider (1-10) accessible in the side panel. Changing weight:
- Immediately recalculates treemap proportions with smooth animation
- Higher weight = more visual real estate = clearer priority signal
- Weights represent *intended* priority, not time spent — the gap between the two is itself informative

#### Dormant/Incubating Handling

- **Dormant** items collapse into a small shared region at the bottom-right of the treemap (minimal space, just names listed)
- **Incubating** items appear with reduced opacity and dashed borders — they have space proportional to weight but are visually muted
- Clicking dormant region expands it to show the list; clicking an item lets you reactivate it (change status, set weight)

---

### View 2: Focus View — Concentric Rings on Active Task

The Focus view (existing FocusTimeline) gains a **goal lineage display** for the currently active task. This is NOT a separate view — it's an enhancement to the existing timeline.

#### When a goal-linked task is active:

```
┌─────────────────────────────────────────────────────────────┐
│  ▶ Build ingestion service                    ⏱ 47min       │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Financial Independence                  │    │
│  │         ┌───────────────────────────────┐           │    │
│  │         │      Solar Geo Product        │           │    │
│  │         │   ┌───────────────────────┐   │           │    │
│  │         │   │  Phase 1: Pipeline    │   │           │    │
│  │         │   │  ┌─────────────────┐  │   │           │    │
│  │         │   │  │ Build ingestion │  │   │           │    │
│  │         │   │  │    ⏱ 47/120min  │  │   │           │    │
│  │         │   │  └─────────────────┘  │   │           │    │
│  │         │   │  2/4 actions done     │   │           │    │
│  │         │   └───────────────────────┘   │           │    │
│  │         │   Phase 2 ░░░  Phase 3 ░░░    │           │    │
│  │         └───────────────────────────────┘           │    │
│  │         Trading ░░░░  Family Office ░░░              │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  [rest of FocusTimeline below...]                           │
└─────────────────────────────────────────────────────────────┘
```

Each ring shows:
- **Outer ring**: Goal — the "why"
- **Middle ring**: Project — the initiative
- **Inner ring**: Epic — the current milestone + progress
- **Center**: The actual task you're working on + time elapsed vs. estimated

The rings are **not purely decorative** — they carry information:
- **Ring thickness** = weight/priority of that level
- **Fill/progress** = how much of that level is complete
- **Sibling items** in each ring are shown as small segments (Trading, Family Office visible as faded segments in the project ring)

#### When an unlinked task is active (routine, one-off):

No concentric rings shown. Just the standard task display. This naturally highlights the difference: goal-linked work shows you the purpose chain; unlinked work is just a task.

#### Compact mode

For the concentric rings to not dominate the Focus view, offer a compact rendering that collapses to a breadcrumb-style lineage:

```
┌─────────────────────────────────────────────────────────────┐
│  ▶ Build ingestion service                    ⏱ 47/120min   │
│  🎯 Financial Independence → Solar Geo → Phase 1 (2/4)     │
│  ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░ 39%          │
└─────────────────────────────────────────────────────────────┘
```

User can toggle between compact breadcrumb and full concentric rings. Default: compact (less visual noise during heads-down work). Expand rings during intention-setting or review moments.

---

### View Integration: Intentions Panel (Morning/Evening)

The Intentions Panel sits at the top of the Focus view and bridges the two views conceptually:

```
┌─────────────────────────────────────────────────────────────┐
│  📋 Today's Intentions                          April 11    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Free-form text...                                   │    │
│  │ "Focus on completing Solar Phase 1 today. Handle    │    │
│  │ the 2 remaining Jira tickets. Evening: exercise."   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ── Active Goal Threads Today ──                            │
│  🎯 Financial Independence → Solar Geo                      │
│     2 actions queued · est 3hr · progress: ░░░░░░░░░░       │
│  🌱 Cultivo → Performance                                   │
│     2 Jira tickets · est 2hr · progress: ░░░░░░░░░░        │
│  💪 Health → Fitness                                        │
│     exercise (1hr) · progress: ░░░░░░░░░░                   │
│                                                             │
│  Total planned: 6hr of ~10hr available                      │
└─────────────────────────────────────────────────────────────┘
```

Goal threads are auto-populated from today's queued actions (tasks with `goalId` metadata). Progress bars fill as time is tracked. The free-form text is the user's voice — their own words about what matters today.

---

## AI Integration: Claude as Review Partner

### Weekly Review (`/t review`)

Claude-driven conversation that:

1. **Pulls all active projects** sorted by `last_reviewed` (stalest first) and `impact_score`
2. **For each active project asks:**
   - What's the next concrete action? (updates `next_action`)
   - Is the horizon still right? (now/soon/someday)
   - Any blockers?
   - Impact score still accurate?
   - Weight still right? (shows time spent vs. weight allocation)
3. **Surfaces stuck projects**: Active projects with no actions in `ready` or `pending` status
4. **Suggests promotions**: "Substack has been 'someday' for 6 weeks — want to move it to 'soon'?"
5. **Suggests demotions**: "Trading system hasn't been touched in 3 weeks — move to dormant?"
6. **Weight rebalancing**: "Your weights total 46 across active goals. Financial Independence is weight:8 but got 5% of time this week. Adjust weight down or commit more time?"
7. **Updates `last_reviewed`** on all reviewed projects

### Daily Suggestion

When starting the day (or in planning mode `---`), Claude can suggest:

```
Based on your goals and recent momentum:
  1. Solar Geo: "Build ingestion service" (Phase 1 is 75% done, 2 actions left)
  2. Substack: "Write first draft" (hasn't been touched in 12 days, weight:6)
  3. Cultivo: 3 Jira tickets due this week

Recommend: 90min Solar Geo + 120min Cultivo + 45min Substack
This aligns with your weights: Financial(8) > Cultivo(7) > Intellectual(6)
```

### Decomposition Assistant

When the user creates a new goal or project, Claude helps decompose:
- "What are the major phases?"
- "What's the very first action you'd need to take?"
- "How long would that take?"

This ensures new plans immediately have actionable next steps rather than sitting as narratives.

---

## Implementation Roadmap

### Phase 1: Foundation (database + data model)
1. Create `goals`, `epics`, `actions`, `daily_intentions` tables
2. Add columns to `plans` table (goal_id, horizon, impact_score, weight, next_action, last_reviewed)
3. Seed initial goals by analyzing existing 18 plans — group under goal themes
4. Create API routes: `/api/goals`, `/api/goals/[id]/projects`, `/api/projects/[id]/epics`, `/api/epics/[id]/actions`, `/api/actions/[id]/today`, `/api/intentions`
5. Add `add-from-plan` action to `/api/tasks/action` — creates daily task with lineage metadata
6. Add completion sync: when daily task with `actionId` completes, update `actions` table

### Phase 2: Planning View — Treemap
7. Build `PlanningView.jsx` component with treemap layout (use d3-hierarchy or recharts treemap)
8. Implement drill-down navigation: goals → projects → epics → actions
9. Build side panel with narrative display, weight slider, status controls
10. Implement `[→ today]` button with direct action-to-daily-task flow
11. Color encoding: saturation by health/momentum, borders by status
12. Dormant collapse region
13. Breadcrumb navigation for drill-up

### Phase 3: Focus View — Concentric Rings
14. Build `GoalLineage.jsx` component (concentric rings + compact breadcrumb)
15. Integrate into FocusTimeline — show lineage when active task has `goalId`
16. Ring rendering: thickness = weight, fill = progress, siblings as segments
17. Toggle between compact breadcrumb and full rings
18. Progress bar for epic/project completion

### Phase 4: Intentions Panel
19. Build `IntentionsPanel.jsx` — free-form text + auto-populated goal threads
20. Goal thread progress bars (time tracked today vs. estimated)
21. Evening reflection text area
22. Auto-save intention + reflection → `daily_intentions` table → journal entry
23. Integrate at top of Focus view

### Phase 5: AI Review Integration
24. `/t review` command — weekly review flow with weight rebalancing
25. Daily suggestion logic (surface top actions based on goals + momentum + weights)
26. Decomposition assistant for new goals/projects
27. Stale project detection and nudges

### Phase 6: Polish
28. Treemap animations on weight change and drill-down transitions
29. Drag-and-drop in treemap (reorder epics, move projects between goals)
30. Historical goal progress charts (week-over-week time by goal)
31. Goal completion milestones
32. Weight vs. actual-time-spent comparison visualization

---

## Key Metrics (for yourself)

- **% of daily tasks linked to a goal** — should trend up over time
- **Active projects with a next action defined** — should be 100%
- **Days since last review per project** — alerts at 14+ days
- **Weight vs. actual time ratio** — shows intention-reality gap per goal
- **Goals with zero time in past 30 days** — either demote or recommit
- **Epic completion velocity** — are phases finishing or stalling?

---

## Open Questions

1. **Treemap library**: d3-hierarchy gives full control; recharts Treemap is simpler but less customizable. Recommendation: d3-hierarchy for the custom interactions needed (drill-down, side panel, weight sliders).
2. **Weight semantics**: Should weights represent intended time proportion, or abstract importance? (Recommendation: abstract importance — time follows naturally, and forcing exact time allocation feels rigid.)
3. **Plan narratives**: Keep narratives in `journals` and structured data in `plans`, or consolidate? (Recommendation: keep both — narratives surface in the side panel for rich context, structured data drives the treemap.)
4. **How many active "now" projects?** Consider a soft cap (e.g., 3-4 "now" projects) surfaced as a warning, not a hard block.
5. **Concentric rings rendering**: SVG (precise, animatable) vs. CSS nested boxes (simpler, good enough)? Recommendation: SVG for the full view, CSS for the compact breadcrumb.
