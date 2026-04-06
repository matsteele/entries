# Entries — Product Requirements Document

## Overview

Entries is a personal operating system for daily life management. It combines task tracking, time tracking, journaling, planning, and self-monitoring into a unified local-first application. The core insight is that awareness of how time is actually spent — across contexts and focus levels — enables better daily decision-making and habit formation.

The current system is fully documented in [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Requirements: What to Build Next

### 1. Reporting & Analytics Dashboard View

**Problem**: The CLI has `/t report day` and `/t report week`, but there's no visual dashboard equivalent.

**Requirements**:
- Dashboard view showing: total focused minutes vs. target, focus level distribution (how much time at each level), average sustained session length per context
- Time waste report: identify recurring patterns in unstructured/gap time (when, how often, how long)
- Accessible as a dedicated dashboard tab

**Success criteria**: Can look at any past day or week and immediately understand where time went and whether targets were met — without leaving the dashboard.

---

### 2. Sleep Analytics Panel

**Problem**: Sleep journal data (`/t rest`, `/t wake`) is collected but never visualized.

**Requirements**:
- Dashboard panel showing: sleep duration trend (last 14 days), bed time / wake time consistency, self-reported quality score over time
- Surface correlations between sleep quality and next-day focused minutes

**Success criteria**: Can see at a glance whether sleep patterns are improving or degrading.

---

### 3. Distraction Pattern Visualization

**Problem**: Distraction journal (`/t eeh`) data is collected but never reviewed.

**Requirements**:
- Visualization of distraction events by time of day, context, and trigger type
- Frequency trend over time
- Top recurring triggers surfaced explicitly
- Distraction events shown as markers on the FocusTimeline at the time they occurred; hovering shows the trigger text

**Success criteria**: Can identify the top 2–3 distraction triggers and when they most commonly occur.

---

### 4. Protocol Linking for Routine Tasks

**Problem**: Routine tasks like "workout", "planning", and "hygiene" have related protocols in the database but there's no persistent connection — the match runs on every switch.

**Requirements**:
- On demand (or setup), run a semantic match between each routine task title and all protocols; store the match as a `protocolId` on the routine task
- When a routine task becomes active, surface the linked protocol inline in the dashboard active task panel
- Allow manual override: user can link or unlink a protocol from any routine task
- If no protocol exists for a routine task, surface a prompt to create one

**Success criteria**: Every routine task with a relevant protocol shows it automatically on activation, without keyword search overhead.

---

### 5. Plan Surfacing for Novel Tasks

**Problem**: Non-routine tasks often have an associated plan in the database, but it's disconnected from the task.

**Requirements**:
- When a novel task becomes active (or is clicked in the dashboard), semantically match its title against plans in the database
- If a match is found (similarity > 0.7), surface the plan inline — key sections: Goal, Current Status, Next Steps
- Allow manual linking: user can explicitly associate a task with a plan ID

**Success criteria**: Clicking an active novel task reveals its related plan without leaving the dashboard.

---

### 6. Task Recommendations

**Problem**: The task list shows everything but doesn't help decide what to work on next.

**Requirements**:
- "Next task" suggestion based on: time of day (vs. ideal schedule), priority, context budget deficit
- Surfaced as a single highlighted suggestion at the top of the task list
- User can accept (switch to it) or dismiss

**Success criteria**: The suggested task is the right one > 70% of the time.

---

### 7. Auto-Start on Boot

**Problem**: The dashboard and daemons require manual startup after a reboot.

**Requirements**:
- Single command to register all processes (Next.js server + daemons) as launchd agents on macOS
- Processes restart automatically on crash
- Logs written to a known location

**Success criteria**: After a reboot, everything is running within 30 seconds with no manual intervention.

---

## Users

Single-user personal tool (Matthew Steele). No multi-tenancy, auth, or cloud sync needed.

## Contexts

| Context | Code | Purpose |
|---------|------|---------|
| Health | `heal` | Sleep, meals, exercise, hygiene |
| Personal | `per` | Feelings, growth, family, errands |
| Social | `soc` | Relationships, conversations |
| Cultivo | `cul` | Work at Cultivo |
| Professional | `prof` | Other professional work |
| Projects | `proj` | Side projects, trading |
| Unstructured | `us` | Leisure, rest, browsing |
