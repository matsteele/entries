# End of Day Update Protocol

## Purpose
Generate a daily update in Slack-friendly format from your daily log, summarizing completed work, meetings, in-progress items, and next steps.

## When to Use
At the end of each workday, before wrapping up.

## Format Template

```
⬆️ Daily update - [Date]
✅ [Completed task/accomplishment]
✅ [Completed task/accomplishment]
✅ [Completed task/accomplishment]
🗓️ [Meeting/calendar event]
🗓️ [Meeting/calendar event]
⏳ [In progress task]
⏳ [In progress task]
🟠 [Blocker/challenge/note]
⭐ [Kudos/thanks/appreciation]
⏭️ [Next up/tomorrow task]
```

## Emoji Guide
- ✅ `:white_check_mark:` - Completed work
- 🗓️ `:spiral_calendar_pad:` - Meetings, calls, syncs
- ⏳ `:hourglass_flowing_sand:` - In progress, continuing work
- 🟠 `:large_orange_circle:` - Blockers, challenges, important notes
- ⭐ `:star:` - Thanks, kudos, appreciation
- ⏭️ `:black_right_pointing_double_triangle_with_vertical_bar:` - Next up, tomorrow's focus

## Process

### Step 1: Review Daily Log
```bash
node app/backend/daily-log-cli.js show
```

This shows:
- Current task (may become ⏳ in progress)
- Completed work (becomes ✅)
- Pending tasks (candidates for ⏭️ next up)
- Time by context

### Step 2: Draft Update

**Completed (✅)**
- Pull from "Completed Work" section
- Focus on outcomes and impact, not just tasks
- Be specific about what was achieved
- Good: "Fixed CORS error on Get Started form"
- Avoid: "Worked on website"

**Meetings (🗓️)**
- List significant meetings, syncs, calls
- Use brief descriptive names
- Format: "Topic with Person(s)"
- Example: "Get-to-know-you with Nicolas"

**In Progress (⏳)**
- Current task if still ongoing
- Major items that span multiple days
- Frame as "Continuing with..." or "Working on..."

**Blockers/Notes (🟠)**
- Optional but valuable
- Surface challenges, dependencies, context
- Example: "Too many interruptions to make progress on X"

**Thanks (⭐)**
- Optional but builds culture
- Call out helpful teammates
- Be specific about what they helped with

**Next Up (⏭️)**
- Usually 1-2 items
- What's the priority tomorrow?
- Pull from pending tasks or current task

### Step 3: Format for Slack

Copy the formatted text directly into Slack. The emoji codes will render automatically.

## Example Generation

**From daily log:**
```
✅ COMPLETED WORK:
   1. test land cover change tool (2h 12m)
   2. SOC MDD Bug (45m)
   3. review doubling counting issue with Aamir (1h 15m)

🎯 CURRENT TASK:
   Interp feature request (3h 45m)

📋 PENDING:
   1. adapt mask PR to using PM Tiles
   2. debug precommit error with devin
```

**Becomes:**
```
⬆️ Daily update - 10th Dec
✅ Tested land cover change tool migration
✅ Fixed SOC MDD input validation bug
✅ Reviewed and merged doubling counting fix with Aamir
⏳ Working on Interp feature request implementation
⏭️ Adapt mask PR to PM Tiles integration
```

## Tips

**Be concise but specific**
- Focus on business value and outcomes
- Avoid overly technical jargon (unless technical audience)

**Timing**
- Run at end of day before signing off
- Complete current task or move to pending first
- Takes 5-10 minutes

**Audience**
- Cultivo team updates → Focus on Cultivo work
- Personal tracking → Include all contexts

**Honesty**
- Use 🟠 blockers to surface real challenges
- Don't overstate progress
- It's okay to have days with mostly meetings

## Automation Helper (Future)

Could create a script that:
1. Reads today's daily log JSON
2. Auto-formats completed work as ✅ items
3. Prompts for meetings, blockers, thanks
4. Outputs formatted Slack message

Location: `scripts/generate-daily-update.js`

## Related
- Daily Log CLI: `app/backend/daily-log-cli.js`
- Task management: `/t` slash command
- Context switching: Personal, Cultivo, Projects, etc.
