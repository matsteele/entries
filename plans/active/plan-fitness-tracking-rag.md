# Entries Project - Fitness Tracking with RAG

**Plan ID:** `plan-fitness-tracking-rag`
**Type:** Project Plan
**Status:** Draft
**Created:** `2025-11-16`
**Context:** `personal`
**Objective:** Build AI-powered fitness tracking system with semantic search
**Project:** `entries-fitness-system`

---

## Overview

### Problem Statement
*What problem are we solving?*

Currently, there is no integrated fitness tracking system that:
- Tracks workout progress with structured data (sets, reps, weights)
- Enables reflective journaling about workouts with semantic search
- Generates AI-powered workout plans based on past performance and goals
- Integrates with the broader entries knowledge system for holistic insights
- Maintains historical max weight data in a queryable format

We need a fitness tracking system that combines structured workout data with AI-powered insights and semantic search capabilities.

### Goals
*What do we want to achieve?*

- Build fitness tracking system with workout logging, progress tracking, and AI-powered plan generation
- Import existing fitness spreadsheet data (max weights) into structured system
- Enable semantic search across workout reflections
- Generate workout plans based on recent training patterns and fitness goals
- Track progression toward fitness goals
- Integrate fitness insights with general journal for holistic life insights

### Success Criteria
*How will we know we've succeeded?*

- Can query: "Show me my squat progression over the last 6 months" and get accurate workout history
- Can generate workout plans based on recent training patterns and fitness goals
- All historical max weight data is imported and queryable through semantic search
- Fitness reflections integrate with general journal for holistic life insights
- Can ask: "What factors contribute to my best workouts?" and get cross-domain results
- Workout plan generator uses RAG to create intelligent, personalized programs

---

## Strategy

### Approach
*How will we solve this?*

**Phase 1: Infrastructure & Data Setup**
- Create fitness folder structure (parallel to journal/, plans/, protocols/)
- Design fitness-specific database schema for Supabase
- Import existing max weight spreadsheet data
- Set up local JSON backups for data security

**Phase 2: CLI Development**
- Build fitness-cli.js for workout logging and tracking
- Implement commands: log, max, goal, progress, plan, reflect
- Share utilities with existing CLIs (Supabase connection, embeddings)

**Phase 3: RAG & Intelligence**
- Generate embeddings for workout reflections
- Implement workout plan generator using RAG (query past workouts + goals)
- Enable cross-domain semantic search (fitness + journal insights)

**Phase 4: Integration & Polish**
- Add fitness data visualization and progress tracking
- Test cross-domain queries with journal system
- Documentation and usage examples

### Key Decisions
*What are the important choices we're making?*

- **Fitness as separate domain**: Create `fitness/` folder structure parallel to `journal/`, `plans/`, `protocols/` but share CLI interface and semantic search capabilities
- **Structured + unstructured fitness data**: Store workout sets/reps/weights in structured tables, but also enable reflective journaling with embeddings for semantic insights
- **Same Supabase instance**: Use the same database as journals/plans/protocols for unified cross-domain search
- **Custom CLI over MCP integrations**: Build custom interface first; consider MCP integrations (Hevy, Strava) for future data import
- **Local + cloud backup**: Store in Supabase with local JSON backups for data security

### Risks & Mitigation
*What could go wrong and how will we handle it?*

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Spreadsheet import errors | Medium | Medium | Validate data format; manual review of imported records |
| Workout plan quality | Medium | High | Start with simple rule-based plans; iterate based on usage |
| Over-engineering the CLI | Low | Medium | Start with basic commands; add features based on actual needs |
| Data inconsistency (structured vs unstructured) | Low | Low | Clear separation: structured for tracking, embeddings for insights |

---

## Execution Plan

### Phases
*Break down into major phases*

1. **Phase 1: Infrastructure & Data (Week 1)**
   - Create fitness folder structure
   - Design and implement database schema
   - Import existing max weight spreadsheet
   - Set up local backup system

2. **Phase 2: CLI Development (Week 1-2)**
   - Build fitness-cli.js with basic commands
   - Implement workout logging
   - Add max tracking and goal setting

3. **Phase 3: RAG & Intelligence (Week 2-3)**
   - Generate embeddings for reflections
   - Build workout plan generator
   - Implement progress tracking

4. **Phase 4: Integration & Polish (Week 3)**
   - Enable cross-domain search
   - Add data visualization
   - Documentation and examples

### Tasks
*High-level tasks (will be broken down into trackable tasks)*

**Infrastructure**
- [ ] Create `fitness/` folder structure (data/, scripts/, templates/)
- [ ] Design fitness schema (workouts, exercises, maxes, goals tables)
- [ ] Add fitness tables to Supabase migration scripts
- [ ] Create import script for existing max weight spreadsheet
- [ ] Set up local JSON backup system

**CLI Development**
- [ ] Build fitness-cli.js with shared utilities
- [ ] Implement `log` command (start/log workout session)
- [ ] Implement `max` command (update personal records)
- [ ] Implement `goal` command (set/track fitness goals)
- [ ] Implement `progress` command (view progression trends)
- [ ] Implement `reflect` command (post-workout reflection prompt)
- [ ] Add exercise tracking with sets/reps/weight/RPE

**RAG & Intelligence**
- [ ] Generate embeddings for workout reflections
- [ ] Implement workout plan generator using RAG
- [ ] Query past similar workouts for plan generation
- [ ] Consider recovery time and goals in plan generation
- [ ] Enable cross-domain search (e.g., "When did I feel energized?" → fitness + journal)

**Integration & Polish**
- [ ] Add fitness data visualization and progress tracking
- [ ] Test cross-domain queries with journal system
- [ ] Create workout log template
- [ ] Create progress report template
- [ ] Write documentation and usage examples

### Timeline
*Rough timeline estimates*

**Total Duration:** 3 weeks (part-time)

- **Week 1:** Infrastructure + Start CLI
  - Days 1-2: Folder structure, database schema
  - Days 3-4: Import spreadsheet data
  - Days 5-7: Build basic CLI commands (log, max, goal)

- **Week 2:** Complete CLI + Start RAG
  - Days 8-10: Finish CLI commands (progress, reflect)
  - Days 11-14: Generate embeddings, build plan generator

- **Week 3:** Integration & Polish
  - Days 15-17: Cross-domain search, visualization
  - Days 18-21: Testing, documentation, refinement

### Resources Needed
*What do we need to execute this?*

**Technical**
- Existing Supabase account (from main RAG system)
- Existing OpenAI API key
- Node.js environment (already have)
- Existing fitness spreadsheet (max weights)

**Knowledge**
- Supabase pgvector (already learned from main system)
- Node.js CLI development
- Basic workout programming principles for plan generation

**Time**
- ~15-20 hours over 3 weeks
- Depends on main RAG system being set up first
- Can be done in parallel once Supabase is configured

**Dependencies**
- Main RAG system (Supabase + pgvector setup)
- Shared utilities (supabase-client.js, embeddings.js)

---

## Notes

### Implementation Details

**Database Schema**
```sql
-- Fitness workouts table
CREATE TABLE fitness_workouts (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  type TEXT, -- 'strength', 'cardio', 'flexibility', 'sport', etc.
  duration_minutes INTEGER,
  notes TEXT,
  reflection TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  embedding vector(1536) -- For semantic search of reflections
);

-- Exercise tracking table (structured data)
CREATE TABLE fitness_exercises (
  id TEXT PRIMARY KEY,
  workout_id TEXT REFERENCES fitness_workouts(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  sets INTEGER,
  reps INTEGER,
  weight NUMERIC,
  unit TEXT DEFAULT 'lbs',
  rpe INTEGER, -- Rate of Perceived Exertion (1-10)
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Personal records and maxes
CREATE TABLE fitness_maxes (
  id TEXT PRIMARY KEY,
  exercise_name TEXT NOT NULL,
  max_weight NUMERIC NOT NULL,
  unit TEXT DEFAULT 'lbs',
  date_achieved DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Fitness goals
CREATE TABLE fitness_goals (
  id TEXT PRIMARY KEY,
  exercise_name TEXT,
  target_weight NUMERIC,
  target_date DATE,
  status TEXT DEFAULT 'active', -- 'active', 'achieved', 'modified', 'abandoned'
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  embedding vector(1536)
);

-- Create vector similarity search indexes
CREATE INDEX ON fitness_workouts USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON fitness_goals USING ivfflat (embedding vector_cosine_ops);

-- Create regular indexes for fitness queries
CREATE INDEX ON fitness_workouts(date);
CREATE INDEX ON fitness_exercises(workout_id);
CREATE INDEX ON fitness_exercises(exercise_name);
CREATE INDEX ON fitness_maxes(exercise_name);
CREATE INDEX ON fitness_maxes(date_achieved);
```

**Example Query Patterns**
```javascript
// Fitness: Get workout progression for an exercise
const { data } = await supabase
  .from('fitness_exercises')
  .select('*, fitness_workouts(date)')
  .eq('exercise_name', 'Squat')
  .order('fitness_workouts.date', { ascending: false })
  .limit(10);

// Fitness: Semantic search for workout reflections
const { data } = await supabase.rpc('search_fitness_workouts', {
  query_embedding: await getEmbedding("When did I feel strongest?"),
  match_threshold: 0.7,
  match_count: 5
});

// Cross-domain search: energy levels across journal + fitness
const { data } = await supabase.rpc('search_all_content', {
  query_embedding: await getEmbedding("When did I feel most energized?"),
  match_threshold: 0.7,
  match_count: 10,
  content_types: ['journals', 'fitness_workouts']
});

// Generate workout plan: RAG query for similar past workouts
const pastWorkouts = await supabase.rpc('search_fitness_workouts', {
  query_embedding: await getEmbedding("push day chest and shoulders strength focus"),
  match_threshold: 0.6,
  match_count: 3
});
// Use pastWorkouts + goals + recovery state to generate new plan
```

### Related Documents
- **Main RAG System Plan:** `plan-rag-system-pgvector.md` - Core infrastructure this depends on
- **Refactoring Protocol:** `/protocols/refactoring-protocol.md` - Follow for implementation

**Folder Structure**
```
/entries/
├── fitness/              # NEW: Fitness tracking system
│   ├── data/
│   │   ├── workouts.json       # Local backup of workouts
│   │   ├── maxes.json          # Local backup of PRs
│   │   └── goals.json          # Local backup of goals
│   ├── scripts/
│   │   ├── import_maxes.js     # Import spreadsheet data
│   │   └── generate_plan.js    # Workout plan generator
│   └── templates/
│       ├── workout-log.md      # Template for workout reflection
│       └── progress-report.md  # Weekly/monthly progress template
└── app/
    └── backend/
        ├── journal-cli.js      # Existing
        ├── plan-cli.js         # Existing
        ├── fitness-cli.js      # NEW: Fitness CLI interface
        └── lib/
            ├── supabase-client.js    # Shared Supabase connection
            ├── embeddings.js         # OpenAI embedding generation
            └── search.js             # Semantic search utilities
```

**CLI Usage Examples**
```bash
# Log a workout
node fitness-cli.js log --type strength --duration 60

# Add exercises to workout
node fitness-cli.js add-exercise --name "Squat" --sets 5 --reps 5 --weight 225 --rpe 8
node fitness-cli.js add-exercise --name "Bench Press" --sets 5 --reps 5 --weight 185 --rpe 7

# Update a PR
node fitness-cli.js max --exercise "Squat" --weight 315 --date 2025-11-16

# Set a goal
node fitness-cli.js goal --exercise "Deadlift" --target 405 --date 2026-01-01

# View progress
node fitness-cli.js progress --exercise "Bench Press" --weeks 12

# Generate workout plan
node fitness-cli.js plan --type push --focus strength

# Post-workout reflection
node fitness-cli.js reflect
```

### Fitness System Workflow

**Typical Workout Day Flow:**
1. Start workout: `node fitness-cli.js log --type strength`
2. During workout: Track exercises in real-time or log afterward
3. Add exercises: `node fitness-cli.js add-exercise --name "Squat" --sets 5 --reps 5 --weight 225 --rpe 8`
4. Post-workout reflection: `node fitness-cli.js reflect` (opens interactive prompt for reflection)
5. Update PR if achieved: `node fitness-cli.js max --exercise "Squat" --weight 315`

**Planning and Analysis:**
- Query progress: `node fitness-cli.js progress --exercise "Bench Press" --weeks 12`
- Generate next workout: `node fitness-cli.js plan --type push --focus strength`
  - Uses RAG to query similar past workouts
  - Considers recovery (days since last similar workout)
  - Aligns with current goals
  - Returns structured workout with exercises, sets, reps, target weights

**Cross-Domain Insights:**
- Semantic search across fitness + journal: `node journal-cli.js ask "What factors contribute to my best workouts?"`
  - Returns: fitness reflections + journal entries about sleep, stress, nutrition, mood
- Energy patterns: `node journal-cli.js ask "How does my workout schedule affect my energy levels?"`
  - Cross-references fitness workout dates with journal energy mentions

**Data Architecture Philosophy:**
- **Structured data** (sets/reps/weight) → Direct SQL queries, trend analysis, PR tracking
- **Unstructured data** (reflections/notes) → Embeddings, semantic search, pattern discovery
- **Cross-domain** → Unified semantic search reveals connections between fitness, mood, productivity, life events

### Next Steps (Immediate)
1. Review and approve this plan
2. Ensure main RAG system (Supabase + pgvector) is set up
3. Create fitness folder structure (5 minutes)
4. Add fitness tables to database schema (30 minutes)
5. Locate and prepare fitness spreadsheet for import

### Future Enhancements (Out of Scope)
- **MCP Integrations:**
  - Hevy MCP Server for importing existing workout data
  - Strava MCP for cardio activity tracking
  - Fitbit MCP for recovery metrics
- **Advanced Features:**
  - Integration with wearables (Apple Watch, Garmin, etc.)
  - Video form analysis with vision models
  - Nutrition tracking alongside workouts
  - Recovery metrics and recommendations
  - Social features (workout sharing, training partners)
  - Plate calculator and workout timer features
  - Body composition tracking (weight, body fat %, measurements)

### References
- Main RAG system plan for infrastructure details
- Supabase pgvector guide: https://supabase.com/docs/guides/ai/vector-columns
- OpenAI embeddings: https://platform.openai.com/docs/guides/embeddings

---

*This plan will generate trackable tasks that reference this document.*

