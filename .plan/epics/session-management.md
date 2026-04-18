# PRD: Session Management (E10)

**Epic ID:** `ee717322-575e-436d-ac53-2fdb424920c9`  
**Priority:** P5 W:9  
**Status:** Planned  
**Planning IDs:** Epic `ee717322`, Project `proj-life-system`, Goal `goal-life-infrastructure`

---

## Problem

Sessions (tracked work blocks) are immutable once recorded. Users can drag-edit start/end/focus on today's sessions in the FocusTimeline, but:

1. **Can't delete** a session block — no delete affordance in the UI at all
2. **Historical sessions are read-only** — `isLive: false` gates all editing in FocusTimeline; historical days can't be corrected
3. **Can't fill gaps** — untracked time gaps in the timeline have no interaction; you can't claim "I was working on X during that gap"
4. **Can't reassign active task from timeline** — the live block can't be changed to a different task from the timeline UI

The API (`PATCH /api/sessions`, `DELETE /api/sessions`) already exists and works. This is a UI gap.

---

## Goals

- Allow deleting any session block (today or historical)
- Allow editing historical sessions (adjust times, focus level)
- Allow assigning work to an untracked gap (create a new session in a gap)
- Allow reassigning the currently-active block to a different task

---

## User Stories

### Delete a session
> As a user, I want to delete a session block I don't want tracked, so I can clean up accidental or incorrect time entries.

**Acceptance criteria:**
- Right-click (or long-press / hover reveal) on any session block shows a delete option
- Confirmation required before delete (brief toast with undo, or a confirm dialog)
- Deleting today's session updates JSON + Postgres
- Deleting historical session updates Postgres only
- Timeline re-renders immediately after delete

### Edit historical sessions
> As a user, I want to adjust the start/end time and focus level of sessions on past days, so I can correct retroactive mistakes.

**Acceptance criteria:**
- Historical sessions are drag-editable the same way today's are (left/right edge drag = times, top edge = focus)
- `isLive: false` no longer hard-blocks editing — instead it blocks writing to JSON (historical has no JSON source)
- Changes write to Postgres (`UPDATE task_sessions SET started_at/ended_at/focus_level WHERE task_id AND started_at`)
- No JSON file update needed for historical (all historical is Postgres-only)

### Assign untracked time (fill a gap)
> As a user, I want to click an untracked gap in the timeline and assign it to an existing task, so I don't lose time that happened outside the tracker.

**Acceptance criteria:**
- Untracked gap blocks (already rendered) are clickable
- Clicking opens a task picker: shows today's tasks (current, pending, routine) + free-text entry
- Selecting a task creates a new session spanning the gap (start = gap start, end = gap end, focus = task default)
- New session is written to JSON (today) or Postgres (historical)
- New session also written to `task_sessions` Postgres table

### Reassign active block
> As a user, I want to change which task the currently-running block is attributed to from the timeline, so I can correct "I switched tasks and forgot to update the tracker."

**Acceptance criteria:**
- The live (active) block has a reassign option (right-click or inline button)
- Picker shows today's pending/routine tasks
- Selecting a task sets it as the new current task (via `/api/tasks/action { action: 'switch-to' }`)
- The live block's context/color updates to match the new task

---

## Technical Design

### API changes needed

**PATCH /api/sessions** — already handles historical (sourceFile: 'postgres'). No changes needed.

**DELETE /api/sessions** — already handles both JSON and Postgres. No changes needed.

**POST /api/sessions** (new) — create a new session in a gap:
```js
// Body:
{
  taskId: string,
  taskTitle: string,
  context: string,
  focusLevel: number,
  startedAt: ISO string,
  endedAt: ISO string,
  sourceFile: 'pending' | 'routine' | 'completed' | null  // null = postgres-only
}
// Behavior:
// - If sourceFile provided + today: insert session into that JSON file's task.sessions[]
// - Always: INSERT INTO task_sessions
```

### FocusTimeline changes

**Remove the `isLive` gate on editing.** Currently: `canEdit = isLive`. Change to: `canEdit = true` (always), but routing: today uses JSON PATCH, historical uses Postgres-only PATCH.

Pass `isLive` to the drag handler so it knows whether to update JSON. The API already handles this via `sourceFile: 'postgres'`.

**Delete affordance:** Add a small ✕ button that appears on hover of any session block. On click:
- Call `DELETE /api/sessions` with the block's taskId, sourceFile, sessionIdx (or startedAt for postgres)
- Optimistically remove from local state; show toast with undo (re-create the session on undo)

**Gap click:** Gap blocks already render. Add an `onClick` handler that opens a drawer/popover:
- Title: "Assign this time"
- Shows gap duration
- Task list: current + pending + routine tasks with search
- "+ New task" freetext option
- On confirm: call `POST /api/sessions`

**Reassign active block:** Add a small "reassign" icon to the live block (top-right corner). Opens same task picker as gap click, but uses `switch-to` action + updates the in-progress session's task attribution.

### State management

All session mutations should optimistically update local React state, with error rollback. Use React Query `invalidateQueries` on the focus/today key after mutation.

---

## Out of Scope

- Splitting a session into two (overkill — just delete and re-create)
- Merging adjacent sessions (not needed yet)
- Editing task title from session block (use PlanningView / TasksView for that)

---

## Implementation Order

1. Delete button on session blocks (today + historical) — touches only FocusTimeline + existing DELETE API
2. Remove `isLive` edit gate — unlock drag-editing on historical dates (PATCH already works)
3. Gap-click to assign untracked time — needs POST /api/sessions
4. Reassign active block — needs task picker + switch-to wiring
