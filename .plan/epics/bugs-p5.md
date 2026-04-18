# Bug Specs: P5 Fixes

These are high-priority bugs to fix before new features.

---

## Bug 1: Planning View — deleting a project doesn't remove it

**Weight:** 10

### Symptoms
Deleting a project in the PlanningView treemap doesn't remove it from the UI (it persists until page reload).

### Root cause (likely)
The delete action calls the API but doesn't invalidate or update the local React Query cache for the treemap. The `goals/treemap` query isn't being refetched after delete.

### Fix
After a successful `DELETE /api/projects/:id` (or equivalent), call `queryClient.invalidateQueries(['goals', 'treemap'])`. If the delete is optimistic, also filter it out of local state immediately.

### Files likely involved
- `app/frontend/src/components/PlanningView.jsx` — delete handler
- `app/frontend/app/api/epics/[id]/route.js` or similar — DELETE route
- `app/frontend/src/hooks/useApi.js` — query keys

---

## Bug 2: Focus Timeline — can't assign untracked time at current gap / can't reassign active task

**Weight:** 9

### Two related issues

**A) Gap blocks are not interactive**  
Untracked time gaps render as gray blocks but have no click handler. You can't assign work to them.

**Fix:** This is a feature gap more than a bug — covered in [session-management.md](./session-management.md) (Gap-click to assign untracked time). Implement as part of E10.

**B) Active (live) block can't be reassigned**  
The currently-running session block in the timeline has no way to change which task it's attributed to from the UI.

**Fix:** Also covered in [session-management.md](./session-management.md) (Reassign active block). Implement as part of E10.

---

## Bug 3: Focus Timeline — timezone mismatch in time axis ticks

**Weight:** 8

### Symptoms
The time axis ticks (hour labels on the timeline) don't align with where session blocks start/end. Likely showing UTC-based ticks vs. local-time blocks, or vice versa.

### Root cause (likely)
The timeline renders ticks based on `dayStartMs` + fixed hourly offsets. If `dayStartMs` is computed in server timezone (or UTC) but the blocks use local time, there's an offset.

The `GET /api/focus/today` route now accepts a `tz` param and computes `dayStartMs` correctly using Postgres timezone conversion. The bug may be that:
- The `tz` param isn't being passed from the browser
- The client is rendering ticks using raw UTC intervals from `dayStartMs` without adjusting for DST

### Fix
1. Verify the FocusTimeline is passing `tz: Intl.DateTimeFormat().resolvedOptions().timeZone` in the focus/today request
2. Verify tick generation uses local time (not UTC) for label text:
   ```js
   const label = new Date(tickMs).toLocaleTimeString('en-US', {
     hour: 'numeric', hour12: true, timeZone: userTimezone
   });
   ```
3. Check that `dayStartMs` from the API equals local midnight (not UTC midnight)

### Files likely involved
- `app/frontend/src/components/FocusTimeline.jsx` — tick rendering, tz param
- `app/frontend/app/api/focus/today/route.js` — `dayStartMs` computation (already fixed here, may just need the tz param wired)

---

## Bug 4: Current task view — focus level buttons don't work

**Weight:** 8

### Symptoms
Clicking the focus level buttons (0–5) on the current task card in TasksView has no effect (focus level doesn't update).

### Root cause (likely)
The `set-focus` action in `POST /api/tasks/action` may not be updating `current.json` correctly, or the UI isn't refreshing the current task state after the mutation.

### Fix
1. Check the `set-focus` handler in `app/frontend/app/api/tasks/action/route.js`
2. Verify it updates `current.json` task's `focusLevel` field
3. Verify it also updates the source task in `pending.json` / `routine.json`
4. Verify the TasksView mutation triggers a refetch of `GET /api/tasks/current`

The sessions route's `PATCH` handler has logic for updating focus on a live session — may need to call that as well (to propagate to Postgres).

### Files likely involved
- `app/frontend/app/api/tasks/action/route.js` — `set-focus` case
- `app/frontend/src/components/TasksView.jsx` — focus button click handler + refetch
- `app/backend/task-store.js` — `updateTaskInFile` or similar

---

## Fix Order

1. **Bug 4** (focus level buttons) — isolated, low risk, high daily annoyance
2. **Bug 3** (timezone ticks) — investigate tz param first; may be a one-liner
3. **Bug 1** (project delete) — React Query cache invalidation, straightforward
4. **Bugs 2A + 2B** — deliver as part of E10 Session Management
