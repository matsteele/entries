/**
 * Shared buildTimeline logic for focus day view.
 * Extracted for testability. Used by /api/focus/today route.
 */

function buildTimeline(rawSessions, dayStartMs, endMs) {
  const sorted = rawSessions
    .map(s => ({
      startMs:         Math.max(new Date(s.startedAt).getTime(), dayStartMs),
      endMs:           Math.min(new Date(s.endedAt).getTime(), endMs),
      focusLevel:      s.focusLevel ?? 2,
      taskTitle:       s.taskTitle,
      activityContext: s.activityContext,
      taskId:          s.taskId ?? null,
      sessionIdx:      s.sessionIdx ?? null,
      sourceFile:      s.sourceFile ?? null,
      isGap:           false,
    }))
    .filter(s => s.endMs > s.startMs)
    .sort((a, b) => a.startMs - b.startMs);

  const timeline = [];
  let cursor = dayStartMs;
  for (const seg of sorted) {
    if (seg.startMs > cursor + 60000) {
      timeline.push({ startMs: cursor, endMs: seg.startMs, focusLevel: 0, taskTitle: null, activityContext: null, isGap: true });
    }
    timeline.push(seg);
    cursor = Math.max(cursor, seg.endMs);
  }
  if (cursor < endMs - 60000) {
    timeline.push({ startMs: cursor, endMs: endMs, focusLevel: 0, taskTitle: null, activityContext: null, isGap: true });
  }

  // Merge overlapping intervals to get actual wall-clock tracked time
  const merged = [];
  for (const s of sorted) {
    if (merged.length && s.startMs <= merged[merged.length - 1].endMs) {
      merged[merged.length - 1].endMs = Math.max(merged[merged.length - 1].endMs, s.endMs);
    } else {
      merged.push({ startMs: s.startMs, endMs: s.endMs });
    }
  }
  const trackedMs  = merged.reduce((acc, s) => acc + (s.endMs - s.startMs), 0);
  const totalMs    = endMs - dayStartMs;
  const pctTracked = totalMs > 0 ? Math.min(100, Math.round((trackedMs / totalMs) * 100)) : 0;

  // Focused minutes: all sessions, minutes × focus level
  const focusedMs  = sorted.reduce((acc, s) => acc + s.focusLevel * (s.endMs - s.startMs), 0);
  const focusedMins = Math.round(focusedMs / 60000);

  // Active focus: only sessions with focus >= 3, merge to avoid double-counting overlaps
  const activeSorted = sorted.filter(s => s.focusLevel >= 3).sort((a, b) => a.startMs - b.startMs);
  const activeMerged = [];
  for (const s of activeSorted) {
    if (activeMerged.length && s.startMs <= activeMerged[activeMerged.length - 1].endMs) {
      const last = activeMerged[activeMerged.length - 1];
      last.endMs = Math.max(last.endMs, s.endMs);
    } else {
      activeMerged.push({ startMs: s.startMs, endMs: s.endMs });
    }
  }
  const activeMs   = activeMerged.reduce((acc, s) => acc + (s.endMs - s.startMs), 0);
  const pctActive  = trackedMs > 0 ? Math.min(100, Math.round((activeMs / trackedMs) * 100)) : 0;

  return { timeline, summary: { focusedMins, pctTracked, pctActive } };
}

export { buildTimeline };
