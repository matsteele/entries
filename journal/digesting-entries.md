# PROTOCOL: Digesting Entries (Stream of Consciousness Ingestion)

**Purpose:** Systematically parse stream of consciousness writing into structured database entries (journals, plans, protocols) and update structured JSON files (decisions, goals, relationships).

**When to use:** After completing daily/periodic stream of consciousness writing session (aim: 2+ pages)

---

## PHASE 1: Initial Parsing and Categorization

### Step 1.1: Read through entire content
- Identify major themes
- Note transitions between topics
- Mark sections with clear category indicators

### Step 1.2: Extract and organize EVENTS
- Pull out concrete happenings, experiences, activities
- Include events mentioned even within contemplation sections
- For each event capture:
  - What happened
  - When (if specified)
  - Where (if specified)
  - Who was involved (people mentioned)
  - Self-observations and reflections during event
  - Impact/outcomes
  - **Context tag** (Personal, Social, Professional, Cultivo, Projects)

### Step 1.3: Extract and organize CONTEMPLATIONS
- Pull out decision points, internal debates, explorations
- Include contemplative content even from events sections
- For each contemplation capture:
  - Core question being explored
  - Arguments/considerations for different options
  - Tensions and tradeoffs
  - Current lean/thinking
  - Related goals, projects, or plans
  - **Context tag** (Personal, Social, Professional, Cultivo, Projects)

### Step 1.4: Extract DECISIONS
- Identify clear choices made
- Distinguish from contemplations (these are DECIDED, not debating)
- For each decision capture:
  - What was chosen
  - Context that led to decision
  - Rationale
  - Actions required
  - Related projects/plans/protocols

### Step 1.5: Extract PLANS
- Identify forward-looking initiatives with multiple steps
- Projects and their execution strategies
- For each plan capture:
  - Goal/objective
  - Current status
  - Key phases or components
  - Success criteria
  - Risks
  - Timeline
  - Next steps
  - **Context tag** (Personal, Social, Professional, Cultivo, Projects)

### Step 1.6: Extract PROTOCOLS
- Identify repeatable procedures, rules, or processes
- "How to do X" patterns
- **EXCLUDE time-specific items** - these become tasks instead
- For each protocol capture:
  - Purpose
  - When to use
  - Step-by-step process
  - Rules/constraints
  - Rationale
  - **Context tag** (Personal, Social, Professional, Cultivo, Projects)

### Step 1.7: Extract TASKS
- Time-specific action items
- Items with immediate deadlines or "this week" timeframes
- Items that would have been protocols but have specific timing
- For each task capture:
  - What needs to be done
  - By when
  - Why (context)
  - Related to which plan/project

---

## PHASE 2: Present Organized Content for Review

### Step 2.1: Present each category to user
- Show organized content category by category
- Events → Contemplations → Decisions → Plans → Protocols → Tasks
- Get user approval before proceeding

### Step 2.2: Adjust based on feedback
- Merge items if requested
- Reorganize groupings
- Clarify ambiguities
- Don't proceed until user approves

---

## PHASE 3: People/Relationship Extraction

### Step 3.1: Extract all people mentioned
- From events section primarily
- Also from contemplations and plans where relevant
- For each person note:
  - Context of mention
  - Relationship observations
  - Action items related to them
  - Updates to relationship understanding

### Step 3.2: Check against relationship JSON
- Query: Does this person exist in relationship database?
- If ambiguous, ask user to clarify which person
- If new, note what information should be added
- If existing, note what should be updated

---

## PHASE 4: Decision Mapping

### Step 4.1: Review decisions against plans and protocols
- For each decision, determine:
  - Is there an existing plan this updates?
  - Is there an existing protocol this relates to?
  - Should this create a new plan?
  - Should this create a new protocol?

### Step 4.2: Group decisions logically
- Geographic decisions together
- Health/fitness decisions together
- Work decisions together
- Financial decisions together
- Relationship decisions together

### Step 4.3: Map to decision JSON structure
- Only major life decisions (higher than project level)
- Fields: options, choice made, context, objectives, related projects
- Update existing decisions or create new entries

---

## PHASE 5: Plan and Protocol Updates

### Step 5.1: Search for existing related plans
- Use vector database search for similar plans
- Check plan IDs and metadata
- Identify which plans need updates based on:
  - New decisions made
  - New information from contemplations
  - Progress updates from events

### Step 5.2: Update existing plans
- Integrate relevant decisions
- Update status based on events
- Add new phases or considerations from contemplations
- Update risks, timeline, next steps
- Don't duplicate - only add if doesn't already exist

### Step 5.3: Create new plans if needed
- Only if no existing plan covers this
- Assign plan ID
- Add metadata (objectives, related projects, context tags)
- Prepare for vectorization
- Determine if needs Google Tasks project (create linking ID)

### Step 5.4: Search for existing related protocols
- Check protocol database
- Identify updates needed based on new decisions or learnings

### Step 5.5: Update or create protocols
- Integrate improvements from experience
- Add new protocols for new repeatable processes
- Ensure clarity and actionability
- Ensure context tags applied

---

## PHASE 6: Task Extraction and Management

### Step 6.1: Extract actionable tasks
- From decisions
- From protocols (that have specific timeframes)
- From plans
- Distinguish immediate vs. future tasks

### Step 6.2: Check existing tasks
- Query Google Tasks for related projects
- Pull in completed and uncompleted tasks
- Determine if new tasks should be added or if they already exist

### Step 6.3: Categorize tasks by system
- Google Tasks: Immediately actionable personal tasks
- Jira: Work-related tasks for Cultivo
- GitHub Issues: Technical project tasks
- Plan metadata: Strategic milestones

### Step 6.4: Create task additions
- Only add tasks that don't already exist
- Link to appropriate plan via ID
- Add to appropriate external system

---

## PHASE 7: Goal Timeline Updates

### Step 7.1: Review goals JSON
- Check current week, month, 6-month, 1-year, 2-year, 5-year, 10-year goals
- Note which objectives are referenced in this entry

### Step 7.2: Update based on decisions
- Major decisions may shift project prioritization
- Update timeline if needed
- Mark objectives as accomplished or push to next period

### Step 7.3: Link projects to objectives
- Ensure new or updated plans link to appropriate objectives
- Update project IDs in goals structure

---

## PHASE 8: Journal Entry Creation

### Step 8.1: Create coherent EVENTS entry
- Organize chronologically
- Group related events together
- Create narrative flow
- Tag people mentioned
- **Tag context** (Personal, Social, Professional, Cultivo, Projects)
- Add to journal database

### Step 8.2: Create coherent CONTEMPLATIONS entry
- Group by theme
- Maintain internal logic of exploration
- Tag decision points identified
- **Tag context** (Personal, Social, Professional, Cultivo, Projects)
- Add to journal database

### Step 8.3: Do NOT create standalone decision entries
- Decisions live in decision JSON
- Decisions get integrated into plans/protocols
- Decisions referenced from contemplations
- Not separate journal entry type

---

## PHASE 9: Analysis and Suggestions

### Step 9.1: Analyze each entry category
- Events: What patterns emerge? What relationships strengthened/weakened?
- Contemplations: What decision points remain unresolved? What information is needed?
- Plans: What's feasible? What conflicts exist? What's missing?
- Protocols: What's working? What needs refinement?

### Step 9.2: Provide relevant suggestions
- For events: Relationship insights, pattern observations
- For contemplations: Framework for thinking through decision points, questions to consider
- For plans: Risk mitigation, resource identification, timeline reality-checks
- For protocols: Optimization ideas, potential challenges, complementary protocols

### Step 9.3: Cross-reference existing knowledge
- Pull from previous contemplations on similar topics
- Reference existing plans that relate
- Note relevant protocols already in place
- Identify contradictions or tensions with previous decisions

---

## PHASE 10: Iteration and Refinement

### Step 10.1: Present analysis and suggestions to user
- Organized by category
- Specific and actionable
- Reference sources where relevant

### Step 10.2: User review and discussion
- Iterate on suggestions
- Clarify thinking
- Resolve contradictions
- Make additional decisions if needed

### Step 10.3: Update entries based on iteration
- Refine events entries with new insights
- Update contemplations with resolved decisions
- Enhance plans with suggestions adopted
- Improve protocols based on discussion

### Step 10.4: Final review
- Confirm all entries ready for submission
- Verify all updates mapped correctly
- Ensure database/JSON updates captured

---

## PHASE 11: Submission and Logging

### Step 11.1: Submit to journal (MCP)
- Events entries (coherent narrative form)
- Contemplations entries (organized by theme)

### Step 11.2: Update databases
- Decision JSON with new/updated decisions
- Goals JSON with timeline updates
- Relationship JSON with people updates
- Plans database with new/updated plans
- Protocols database with new/updated protocols

### Step 11.3: Update external systems
- Google Tasks with new tasks
- Jira with work tasks
- GitHub with technical tasks
- Sunsama with weekly objectives

### Step 11.4: Create audit trail
- Summarize what was extracted
- List what was updated
- Note what was created new
- Record any unresolved questions

---

## QUALITY CHECKS

Throughout process:
- ✓ No duplication (check existing before adding)
- ✓ Proper categorization (right entry type, context tags)
- ✓ Coherent narrative (reorganized for clarity, not raw dump)
- ✓ Decisions mapped to plans/protocols (not standalone)
- ✓ People disambiguated (check relationship JSON)
- ✓ Tasks don't already exist (check external systems)
- ✓ IDs properly linked (plans to projects to objectives)
- ✓ Context tags applied (Personal, Social, Professional, Cultivo, Projects)
- ✓ Time-specific items become tasks, not protocols

---

## OUTPUT FORMATS

### Events entry:
```
### Event: [Title]
**Context:** [Personal/Social/Professional/Cultivo/Projects]
**Date/Period:** [When]
**People:** [Tagged individuals]

[Coherent narrative...]

**Reflections:** [Self-observations]
**Impact:** [Outcomes]
```

### Contemplations entry:
```
### Contemplation: [Theme/Question]
**Context:** [Personal/Social/Professional/Cultivo/Projects]
**Decision points:** [What's being considered]

[Organized exploration...]

**Current thinking:** [Where this stands]
**Related:** [Plans, protocols, decisions]
```

### Plans format:
```
### Plan: [Name]
**Context:** [Personal/Social/Professional/Cultivo/Projects]
**Plan ID:** [Unique identifier]
**Goal:** [What this aims to achieve]
**Status:** [Current state]

[Plan details...]

**Related objectives:** [From goals JSON]
**Related projects:** [Project IDs]
```

### Protocols format:
```
### Protocol: [Name]
**Context:** [Personal/Social/Professional/Cultivo/Projects]
**Purpose:** [Why this exists]
**When to use:** [Conditions]

[Steps/rules...]

**Rationale:** [Why it works this way]
```

---

## NOTES

- Take time with this process - it's complex and important
- Better to ask clarifying questions than make assumptions
- User approval required before proceeding through phases
- Maintain conversation flow - explain what you're doing at each step
- Use TodoWrite to track progress through phases
- This protocol itself should be saved and available for future ingestion sessions
- **Context tags are REQUIRED**: Personal, Social, Professional, Cultivo, Projects
- Time-specific protocols become tasks instead
