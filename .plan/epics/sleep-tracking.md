# PRD: Sleep Tracking (E6 — Remaining)

**Epic ID:** `50503fbc-8fad-4e91-b15b-af76189526ef`  
**Priority:** P4 W:7  
**Status:** Active (partial)  
**Planning IDs:** Epic `50503fbc`, Project `proj-life-system`, Goal `goal-life-infrastructure`

**Already built:** `/t rest` + `/t wake` flows, sleep bar on timeline, quality rating popover, 7-day stats.  
**This PRD covers:** retroactive logging, UI correction, cross-midnight display, and `/sleep` Claude skill.

---

## Context: Sleep Data Architecture

Sleep data lives in three places:
- `tracking/sleep/sleep-log-YYYY-MM-DD.json` — operational sleep log per calendar day
- `tracking/routine.json` — the sleeping/resting task with sessions (for time tracking attribution)
- `task_sessions` (Postgres) — same sessions as routine.json, mirrored for historical queries

The FocusTimeline shows the sleep bar using data from the `sleep-log` file for today, and from `task_sessions` for historical dates. The sleep bar is a special overlay, not a regular session block.

---

## Feature 1: Retroactive Sleep Logging

### Problem

The user sometimes forgets to run `/t rest` before bed or `/t wake` after waking. The sleep log has no entry, and the timeline shows nothing for that sleep period.

### User Stories

**Retroactive log from CLI:**
> As a user, I want to type `/t sleep 10:20pm-7:30am` and have the system log sleep retroactively, updating all data stores.

**Acceptance criteria:**
- Command: `/t sleep HH:MMam/pm-HH:MMam/pm` (or 24h format)
- Cross-midnight is implied when end time is earlier than start (10:20pm→7:30am)
- Updates `sleep-log-YYYY-MM-DD.json` for the **wake date** (the morning date) with `restAt` and `wakeAt`
- Adds/updates a session in `routine.json` on the sleeping task (id: sleeping) spanning that period
- Writes to `task_sessions` Postgres with `context: 'heal'`, `task_title: 'sleeping'`
- Does NOT run the journaling prompts (those are for live `/t rest` / `/t wake`) — just logs the times silently
- Output: `Logged sleep: 10:20 PM → 7:30 AM (9h 10m)`

**Retroactive log via Claude skill (`/sleep`):**
> As a user, I want to say "I slept from 10:20 last night until 7:30" and have Claude log it using natural language.

See Feature 4.

### Technical notes

The existing `/t rest` and `/t wake` commands set timestamps interactively. Retroactive logging needs a new CLI command that:
1. Accepts a time range string
2. Parses into UTC timestamps (respecting local timezone)
3. Creates/updates the sleep-log file for the wake date
4. Upserts the sleeping task session in routine.json
5. Inserts into task_sessions

New CLI command: `daily-log-cli.js log-sleep '{"restAt":"2026-04-17T22:20:00-05:00","wakeAt":"2026-04-18T07:30:00-05:00"}'`

---

## Feature 2: Sleep Correction from UI

### Problem

The sleep bar on the FocusTimeline is read-only. When you logged the wrong time (or used retroactive logging and want to fine-tune), you have to use the CLI.

### User Stories

**Click sleep bar to adjust times:**
> As a user, I want to click the sleep bar on the timeline and drag its edges to correct start/end times, just like session blocks.

**Acceptance criteria:**
- Sleep bar is draggable (left edge = rest time, right edge = wake time)
- Drag behavior: same clamping as session blocks (can't overlap adjacent sessions)
- On drag release: PATCH the sleep-log file + task_sessions Postgres row
- For historical dates: only update Postgres

**New API route needed:**
```
PATCH /api/sleep?date=YYYY-MM-DD
Body: { restAt?: ISO, wakeAt?: ISO, quality?: number }
```

Internally: updates the `sleep-log-YYYY-MM-DD.json` file's `restAt`/`wakeAt` AND updates the `task_sessions` row for the sleeping task on that date.

---

## Feature 3: Cross-Midnight Sleep Display

### Problem

Sleep starts the previous night (e.g., 10:30 PM) but ends the next morning (e.g., 7:30 AM). Currently, the timeline only shows sleep within the current date's day boundary. So:
- Today's timeline: sleep bar starts at midnight (missing the previous night's tail)
- Previous day's timeline: sleep bar stops at midnight (missing the morning portion)

### Desired behavior

- **Current day timeline**: Show the full sleep bar from the previous night's `restAt` if it fell in the previous calendar day, extending from the left edge (midnight) to `wakeAt`
- **Previous day timeline**: Show sleep bar from `restAt` through end of day (midnight), with a visual indicator that it continues into the next day (faded right edge / "→" indicator)

**Acceptance criteria:**
- `GET /api/focus/today?date=YYYY-MM-DD` returns sleep data that includes cross-midnight segments
- If `restAt` is on date D-1 and `wakeAt` is on date D: both D-1 and D timelines reflect this correctly
- Sleep bar render clips to the current day's bounds (00:00–23:59) but uses full timestamps for calculation
- "Continuation" visual: slightly different color or dashed edge on the truncated side

### API changes

`GET /api/sleep?date=YYYY-MM-DD` (or extend focus/today) should also return the previous day's sleep log if it started the night before. 

Alternatively, the FocusTimeline fetches both today's and yesterday's sleep logs and renders accordingly.

---

## Feature 4: `/sleep` Claude Skill

### Problem

Typing `/t sleep 10:20pm-7:30am` requires remembering the exact format. A natural language skill is more ergonomic.

### Behavior

The `/sleep` skill is triggered by:
- `/sleep` (no args) — runs the full interactive journaling flow (same as `/t rest` / `/t wake`)
- `/sleep [natural language]` — e.g., "I slept from 10:20 last night until 7:30", "log 9 hours starting 11pm"

For natural language input, Claude should:
1. Parse the times (accounting for "last night" = previous evening, "until 7:30" = this morning)
2. Confirm: "Log sleep: 10:20 PM → 7:30 AM (9h 10m)?"
3. On confirm: call `log-sleep` CLI with parsed timestamps
4. Show result

For no-arg invocation:
- Ask "Are you logging a new sleep or correcting a past one?"
- If new: run the `/t rest` or `/t wake` journaling flow depending on time of day
- If correction: ask for the date and times, then call `log-sleep`

### Skill file

Create `~/.claude/commands/sleep.md` with the skill definition. The skill should be self-contained: read the current sleep log for context, parse the user's input, call the CLI, report back.

---

## Implementation Order

1. **Feature 1 (CLI retroactive logging)** — `log-sleep` command in `daily-log-cli.js`
2. **Feature 4 (Claude skill)** — `~/.claude/commands/sleep.md` that calls `log-sleep`
3. **Feature 2 (UI sleep bar editing)** — `PATCH /api/sleep` + drag handles on sleep bar in FocusTimeline
4. **Feature 3 (cross-midnight display)** — FocusTimeline adjustment to fetch ±1 day sleep data

Features 1 and 4 are independent quick wins. Features 2 and 3 are UI work that can be batched.
