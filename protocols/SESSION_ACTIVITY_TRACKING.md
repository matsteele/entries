# Session Activity Tracking

## Overview

All Claude development sessions should track activities in a structured JSON format to enable end-of-day debriefs and daily updates. This data should persist across sessions and be used to generate comprehensive daily summaries.

## Activity Tracking Requirements

### JSON File Location
- Daily log files stored in: `/Users/matthewsteele/projects/currentProjects/entries/daily-logs/daily-log-YYYY-MM-DD.json`
- One file per day with date-based naming
- Files managed via npm scripts (see Commands section below)

### JSON Structure

```json
{
  "sessions": [
    {
      "sessionId": "unique-session-id",
      "date": "2025-11-19",
      "startTime": "2025-11-19T09:00:00Z",
      "endTime": "2025-11-19T12:00:00Z",
      "context": "professional", // or "personal"
      "activities": [
        {
          "type": "pr_work",
          "prNumber": 1706,
          "branch": "feature/land-tenure",
          "title": "Land Tenure Feature",
          "activityContext": "professional",
          "tasks": [
            {
              "description": "Addressed all PR review comments",
              "status": "completed",
              "emoji": "✅"
            },
            {
              "description": "Added custom icons to info cards",
              "status": "completed",
              "emoji": "✅"
            },
            {
              "description": "Land Tenure parcels data showing zero",
              "status": "investigating",
              "emoji": "🔍"
            }
          ]
        },
        {
          "type": "testing",
          "title": "Biodiversity MSA Script Migration",
          "tasks": [
            {
              "description": "Initial testing complete - outputs appear consistent",
              "status": "completed",
              "emoji": "✅"
            },
            {
              "description": "Migration command tested successfully",
              "status": "completed",
              "emoji": "✅"
            }
          ]
        },
        {
          "type": "bug_investigation",
          "title": "Grasslands refactor bug",
          "description": "Bug discovered in grasslands refactor - investigating source",
          "status": "in_progress",
          "emoji": "🐛"
        },
        {
          "type": "system_issue",
          "description": "Hub and platform loading slowly locally",
          "status": "blocking",
          "emoji": "⚠️"
        }
      ],
      "personalContext": [
        {
          "description": "Dentist appointment this afternoon",
          "emoji": "🦷"
        }
      ]
    }
  ]
}
```

### Activity Types

**Professional Activities:**
- `pr_work` - Pull request related work
- `feature_development` - New feature implementation
- `bug_fix` - Bug fixes
- `bug_investigation` - Investigating bugs
- `testing` - Testing work
- `refactoring` - Code refactoring
- `migration` - Data or code migrations
- `code_review` - Reviewing code
- `documentation` - Documentation work
- `system_issue` - Development environment or system issues

**Status Values:**
- `completed` - Task finished
- `in_progress` - Currently working on
- `investigating` - Researching/debugging
- `blocked` - Blocked by external factors
- `pending` - Not started

**Context Values:**
- `professional` - Work-related activities
- `personal` - Personal activities during work time

### Emoji Mapping

Use consistent emoji for status indicators:
- ✅ (`:white_check_mark:`) - Completed tasks
- 🔍 (`:mag:`) - Investigating/open issues
- 🐛 (`:bug:`) - Bugs
- ⚠️ (`:warning:`) - Warnings/blockers
- 🦷 (`:tooth:`) - Dentist
- ✈️ (`:airplane:`) - Travel
- 💼 (`:briefcase:`) - Work context

## Session Behavior

### Starting a New Day
At the beginning of each day (first session of the day):
1. Run `/t start` or `npm run log:start-day` to carry over pending tasks from yesterday
2. This will automatically move all uncompleted tasks from the previous day to today
3. Review the carried-over tasks and prioritize them for the day

### On Session Start
1. Check if `activities.json` exists, create if not
2. Generate a new session ID
3. Record start time and context

### During Session
1. Track all significant activities in memory
2. Update `activities.json` periodically (every 15-30 minutes)
3. Group related tasks under common activity types
4. Maintain both professional and personal context

### On Session End or Debrief Request
1. Finalize session record with end time
2. Write complete session data to JSON
3. Generate formatted summary suitable for Slack daily update
4. Format output with appropriate emoji and status indicators

## End-of-Day Debrief Format

When generating debrief for Slack, use this exact format:

```
:arrow_up: Daily update - [DATE in format: "20th Nov", "24th Nov", etc.]
:white_check_mark: [Completed task/work item]
:white_check_mark: [Completed task/work item]
:hourglass_flowing_sand: [In-progress work with context/notes]
```

**Example:**
```
:arrow_up: Daily update - 20th Nov
:white_check_mark: All SNAPGRAZE requests (TSP-1198, TSP-1197, TSP-1211, TSP-1209, TSP-1210)
:white_check_mark: reviewed PRs
:hourglass_flowing_sand: Develop map layer for masked areas in NCA - making progress after issues with Devin
```

**Formatting Rules:**
- Use `:arrow_up:` for the header
- Use `:white_check_mark:` for completed items
- Use `:hourglass_flowing_sand:` for in-progress work
- Date format: "20th Nov", "1st Dec", "15th Jan" (ordinal day + short month)
- Keep it concise - group related tasks when possible
- Add context to in-progress items (blockers, progress notes, etc.)

## Commands/Queries

Claude sessions should respond to:
- **"log"** or **"log: [activity]"** - Update the daily log file with current activities, what's done, what's in progress, or tasks to do
  - When user says "log", use the npm scripts below to update the daily log
  - Example: "log: found migration report examples" → run `npm run log:complete "found migration report examples"`

**NPM Commands (run from entries/app/backend):**
- `npm run log:start-day` - Start new day by carrying over pending tasks from yesterday
- `npm run log:current "<task>"` - Set/update current task (auto-completes previous task)
- `npm run log:complete-current ["<new task>"]` - Complete current task, optionally set new task
- `npm run log:complete "<work>"` - Add completed work (auto-categorizes)
- `npm run log:pending "<task>"` - Add pending task (auto-detects priority)
- `npm run log:show [date]` - Display daily log

**Slash Commands:**
- `/t start` or `/task start` - Start new day and carry over pending tasks from yesterday
- `/t add "task name" [--context personal|professional|projects]` - Add new pending task
- `/t -N` - Switch to pending task N
- `/t c-N` - Complete pending task N
- `/t p-N` - Move current task to pending
- `/t d-N` - Delete pending task N

**Auto-Detection Features:**
- **Context (Professional/Personal/Projects)**: Automatically inferred from task description
  - 💼 **Professional**: Cultivo work - PR, feature, bug, test, migration, review, code, deploy, etc.
  - 🏠 **Personal**: Personal life - dentist, doctor, appointment, lunch, family, health, etc.
  - 🚀 **Projects**: Non-Cultivo work - trading, side hustles, consulting, freelance, entrepreneurial, business, etc.
  - Default: professional (if unclear)
- Categories: PR, Feature, Bug Fix, Testing, Research, Migration, etc.
- Priorities: high (urgent/asap), medium (default), low (whenever)
- PR numbers: Automatically extracted from "PR #123" or "pr 123"
- Branch names: Extracted from "branch: feature/xyz" or "branch feature/xyz"

Additional commands:
- "Start new day" or "Start the day" - Run `/t start` to carry over pending tasks from yesterday
- "What have I done today?" - Run `npm run log:show`
- "End of day debrief" - Generate formatted daily update from log data
- "Generate Slack update" - Create Slack-formatted daily update

## File Persistence

- Activities should persist across all sessions
- Each new Claude session should read and append to existing data
- Never overwrite the entire file - always append new sessions
- Keep data for at least 30 days for historical analysis

---

*Last updated: 2025-11-21*
