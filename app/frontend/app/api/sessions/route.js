import { NextResponse } from 'next/server';
import store from '@/lib/store';
import { Pool } from 'pg';
export const dynamic = 'force-dynamic';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * PATCH /api/sessions
 * Update a session's start time, end time, and/or focus level.
 * Updates both the JSON source file and the Postgres task_sessions table.
 *
 * Body: {
 *   taskId: string,
 *   sourceFile: 'pending' | 'routine' | 'completed',
 *   sessionIdx: number,
 *   startedAt?: ISO string,  // current value, used to match Postgres row
 *   endedAt?: ISO string,
 *   focusLevel?: number,
 *   newStartedAt?: ISO string,
 *   newEndedAt?: ISO string,
 *   newFocusLevel?: number,
 * }
 */
export async function PATCH(request) {
  try {
    const body = await request.json();
    const { taskId, sourceFile, sessionIdx, startedAt, newStartedAt, newEndedAt, newFocusLevel } = body;

    if (!taskId) {
      return NextResponse.json({ error: 'taskId required' }, { status: 400 });
    }

    const updates = {};
    if (newStartedAt !== undefined) updates.startedAt = newStartedAt;
    if (newEndedAt   !== undefined) updates.endedAt   = newEndedAt;
    if (newFocusLevel !== undefined) updates.focusLevel = newFocusLevel;

    // Update JSON file (pending/routine/completed) — skip for postgres-only rows
    if (sourceFile === 'postgres') {
      // No JSON file to update; Postgres update below handles it
    } else if (sourceFile !== 'current') {
      const ok = store.updateSession(taskId, sourceFile, sessionIdx, updates);
      if (!ok) {
        return NextResponse.json({ error: 'Session not found in source file' }, { status: 404 });
      }
    } else if (newFocusLevel !== undefined) {
      // Live session: update current.json task focus + propagate to source task
      const fs = await import('fs');
      const path = await import('path');
      const currentPath = path.join(process.cwd(), '..', '..', 'tracking', 'current.json');
      const cur = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
      if (cur.task) {
        cur.task.focusLevel = newFocusLevel;
        fs.writeFileSync(currentPath, JSON.stringify(cur, null, 2));
      }
      // Also update the source task's default focusLevel (pending or routine)
      if (taskId) {
        store.updateTaskInFile(taskId, t => { t.focusLevel = newFocusLevel; });
      }
    }

    // Update Postgres task_sessions row (match by task_id + old startedAt)
    if (startedAt) {
      const setParts = [];
      const vals = [];
      if (newStartedAt !== undefined) { vals.push(newStartedAt); setParts.push(`started_at = $${vals.length}`); }
      if (newEndedAt   !== undefined) { vals.push(newEndedAt);   setParts.push(`ended_at = $${vals.length}`); }
      if (newFocusLevel !== undefined) { vals.push(newFocusLevel); setParts.push(`focus_level = $${vals.length}`); }

      if (setParts.length > 0) {
        vals.push(taskId, startedAt);
        await pool.query(
          `UPDATE task_sessions SET ${setParts.join(', ')} WHERE task_id = $${vals.length - 1} AND started_at = $${vals.length}`,
          vals
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/sessions
 * Delete a session from JSON file (today) or Postgres (historical).
 *
 * Body: {
 *   taskId: string,
 *   sourceFile: 'pending' | 'routine' | 'completed' | 'postgres',
 *   sessionIdx?: number,   // required for JSON files
 *   startedAt?: ISO string, // required for postgres
 * }
 */
export async function DELETE(request) {
  try {
    const body = await request.json();
    const { taskId, sourceFile, sessionIdx, startedAt } = body;

    if (!taskId) {
      return NextResponse.json({ error: 'taskId required' }, { status: 400 });
    }

    if (sourceFile === 'postgres') {
      if (!startedAt) return NextResponse.json({ error: 'startedAt required for postgres' }, { status: 400 });
      await pool.query(
        `DELETE FROM task_sessions WHERE task_id = $1 AND started_at = $2`,
        [taskId, startedAt]
      );
    } else {
      if (sessionIdx === undefined || sessionIdx === null) {
        return NextResponse.json({ error: 'sessionIdx required for JSON source' }, { status: 400 });
      }
      const ok = store.deleteSession(taskId, sourceFile, sessionIdx);
      if (!ok) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

      // Also delete from Postgres if startedAt is provided
      if (startedAt) {
        await pool.query(
          `DELETE FROM task_sessions WHERE task_id = $1 AND started_at = $2`,
          [taskId, startedAt]
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
