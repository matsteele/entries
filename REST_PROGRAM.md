# Rest Program - Sleep Tracking System

> Integrated sleep tracking with bedtime/morning protocols, strategy tracking, quality metrics, and analytics.

## Overview

The Rest Program adds structured sleep tracking to the daily task system. It captures the full sleep cycle: wind-down → sleep → wake, with protocol checklists, strategy selection, quality ratings, and journal integration.

```
Evening                          Morning
┌──────────────────┐            ┌──────────────────┐
│  /t rest         │            │  /t wake         │
│                  │            │                  │
│  1. Pause task   │            │  1. Record wake  │
│  2. Show bedtime │  SLEEPING  │  2. Sleep quality │
│     protocol     │ ────────►  │  3. Review/add   │
│  3. Select sleep │            │     strategies   │
│     strategies   │            │  4. Optional note │
│  4. Start sleep  │            │  5. Show morning │
│     tracking     │            │     protocol     │
└──────────────────┘            └──────────────────┘
         │                               │
         └───── tracking/sleep/ ─────────┘
              sleep-log-YYYY-MM-DD.json
```

## Commands

### `/t rest` - Enter Rest Mode

Triggers the bedtime sequence:

1. **Pauses current task** (moves to pending with session tracking)
2. **Switches to `sleeping` routine task** (health context)
3. **Displays Bedtime Protocol** checklist
4. **Shows sleep strategies** - numbered list, user selects by typing numbers (comma-separated)
5. **Records wind-down start time** in sleep log
6. **Saves planned strategies** to sleep log

**Usage:**
```bash
/t rest
# Shows:
# 🌙 Rest Mode - Bedtime Protocol
# ────────────────────────────────
# ☐ Phone at door/desk
# ☐ No screens in bed
# ☐ Room dark & cool
# ☐ Meditation/breathing
# ☐ Gratitude reflection
#
# Select sleep strategies (comma-separated numbers, Enter to skip):
#  1. meditation
#  2. breathing exercises
#  3. no phone in bedroom
#  4. dark room
#  5. cool temperature
#  6. white noise
#  7. reading (physical book)
#  8. melatonin
#  9. sleep medication
# 10. magnesium
# 11. herbal tea
# 12. stretching
# 13. journaling
# 14. no caffeine after 2pm
# 15. no alcohol
# > 1,3,4,8
#
# 😴 Rest mode started. Selected: meditation, no phone in bedroom, dark room, melatonin
# 💤 Good night! Run /t wake when you get up.
```

### `/t wake` - Exit Rest Mode

Triggers the morning sequence:

1. **Records wake time** and calculates sleep duration
2. **Prompts for sleep quality** (1-5 scale)
3. **Shows strategies from `/t rest`** - user can confirm or add more that were used
4. **Prompts for optional notes** (e.g., "woke up at 4am, fell back asleep")
5. **Saves complete sleep record** to sleep log
6. **Displays Morning Protocol** checklist
7. **Switches to unstructured** (user then picks their first task)

**Usage:**
```bash
/t wake
# Shows:
# ☀️ Good morning! Sleep summary:
# ────────────────────────────────
# Went to bed: 1:30 AM
# Woke up: 9:15 AM
# Duration: 7h 45m
#
# Sleep quality (1-5, 5=excellent): 4
#
# Strategies used at bedtime: meditation, no phone in bedroom, dark room, melatonin
# Add more strategies? (comma-separated numbers, Enter to keep as-is):
#  1. meditation          ✓
#  2. breathing exercises
#  3. no phone in bedroom ✓
#  4. dark room           ✓
#  ...
# > 2
#
# Notes (Enter to skip): Woke briefly at 6am, back to sleep quickly
#
# ✅ Sleep logged: 7h 45m, quality 4/5
#
# 🌅 Morning Protocol
# ────────────────────
# ☐ Hydrate (glass of water)
# ☐ Morning writing (5-min stream of consciousness)
# ☐ Plan the day
# ☐ Leave home
```

### `/t sleep:stats` - Sleep Analytics

Shows sleep metrics over time.

```bash
/t sleep:stats
# 📊 Sleep Report (Last 7 days)
# ──────────────────────────────
# Avg Duration: 7h 12m
# Avg Quality: 3.7/5
# Avg Bedtime: 1:45 AM
# Avg Wake: 9:00 AM
#
# Best night: Feb 6 (8h 30m, quality 5)
# Worst night: Feb 4 (5h 15m, quality 2)
#
# Strategy effectiveness:
#   meditation: avg quality 4.2 (used 5x)
#   melatonin: avg quality 3.8 (used 3x)
#   no phone: avg quality 4.0 (used 6x)
```

## Sleep Strategies

Strategies are stored in `tracking/sleep/strategies.json` and can be customized. Each strategy has a name and optional category.

**Default strategies:**

| # | Strategy | Category |
|---|----------|----------|
| 1 | meditation | relaxation |
| 2 | breathing exercises | relaxation |
| 3 | no phone in bedroom | environment |
| 4 | dark room | environment |
| 5 | cool temperature | environment |
| 6 | white noise | environment |
| 7 | reading (physical book) | relaxation |
| 8 | melatonin | supplement |
| 9 | sleep medication | medication |
| 10 | magnesium | supplement |
| 11 | herbal tea | supplement |
| 12 | stretching | relaxation |
| 13 | journaling | relaxation |
| 14 | no caffeine after 2pm | habit |
| 15 | no alcohol | habit |

Users can add custom strategies via the strategies file.

**Medication tracking:** Strategies categorized as `medication` or `supplement` are flagged separately in the sleep log, distinguishing between natural techniques and chemical aids. This lets you track whether you're relying on medication as a first resort vs. last resort.

## Data Storage

### Sleep Logs: `tracking/sleep/sleep-log-YYYY-MM-DD.json`

```json
{
  "date": "2026-02-08",
  "restStarted": "2026-02-09T01:30:00-03:00",
  "wakeTime": "2026-02-09T09:15:00-03:00",
  "durationMinutes": 465,
  "quality": 4,
  "notes": "Woke briefly at 6am, back to sleep quickly",
  "strategies": {
    "planned": [1, 3, 4, 8],
    "actual": [1, 2, 3, 4, 8]
  },
  "strategiesUsed": ["meditation", "breathing exercises", "no phone in bedroom", "dark room", "melatonin"],
  "medicationUsed": false,
  "supplementsUsed": ["melatonin"]
}
```

### Strategies Config: `tracking/sleep/strategies.json`

```json
{
  "strategies": [
    { "id": 1, "name": "meditation", "category": "relaxation" },
    { "id": 2, "name": "breathing exercises", "category": "relaxation" },
    ...
  ]
}
```

## Integration Points

| System | Integration |
|--------|-------------|
| **Time tracking** | `/t rest` switches to `sleeping` routine task. Duration tracked as health context. |
| **Google Calendar** | Sleep session pushed to calendar (basil/dark green). |
| **Journaling** | Sleep notes optionally saved as quick journal entry (type: `quick`, context: `Health`). |
| **Daily planning** | `/t start` shows last night's sleep summary. |
| **Protocols (DB)** | Bedtime + Morning protocols stored in `journals` table (type: `protocol`). |
| **Goals** | Sleep duration/quality targets can be set in goals.json. |

## Protocol Storage

Two protocols are stored in the PostgreSQL `journals` table:

1. **Bedtime Protocol** (type: `protocol`, context: `Health`)
   - Pre-sleep checklist derived from "Home is Sacred" principles
   - Displayed by `/t rest`

2. **Morning Protocol** (type: `protocol`, context: `Health`)
   - Post-wake checklist integrating "Daily Writing" protocol
   - Displayed by `/t wake`

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture, `/t` command reference
- [tracking/SESSION_ACTIVITY_TRACKING.md](./tracking/SESSION_ACTIVITY_TRACKING.md) - Task tracking details
- [CLAUDE.md](./CLAUDE.md) - AI assistant instructions
