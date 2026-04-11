import { NextResponse } from 'next/server';
import store from '@/lib/store';
export const dynamic = 'force-dynamic';

/**
 * POST /api/tasks/reassign
 * Body: { fromTaskId: string, toTaskId: string, sessionStartedAt?: string }
 * Moves a session from one task to another (works across pending/routine/completed).
 * If sessionStartedAt is provided, moves that specific session; otherwise moves the last one.
 */
export async function POST(request) {
  try {
    const { fromTaskId, toTaskId, sessionStartedAt } = await request.json();
    if (!fromTaskId || !toTaskId) {
      return NextResponse.json({ error: 'fromTaskId and toTaskId required' }, { status: 400 });
    }

    // Load all three sources
    const sources = {
      pending:   { load: store.loadPending,   save: store.savePending },
      routine:   { load: store.loadRoutine,   save: store.saveRoutine },
      completed: { load: store.loadCompleted, save: store.saveCompleted },
    };

    const data = {};
    for (const [key, { load }] of Object.entries(sources)) {
      data[key] = load();
    }

    // Find source and destination tasks
    let fromTask = null, fromFile = null;
    let toTask = null, toFile = null;

    for (const [key, tasks] of Object.entries(data)) {
      if (!fromTask) {
        const t = tasks.find(t => t.id === fromTaskId);
        if (t) { fromTask = t; fromFile = key; }
      }
      if (!toTask) {
        const t = tasks.find(t => t.id === toTaskId);
        if (t) { toTask = t; toFile = key; }
      }
    }

    if (!fromTask) return NextResponse.json({ error: 'Source task not found' }, { status: 404 });
    if (!toTask) return NextResponse.json({ error: 'Destination task not found' }, { status: 404 });
    if (!fromTask.sessions?.length) {
      return NextResponse.json({ error: 'Source task has no sessions to reassign' }, { status: 400 });
    }

    // Find and remove the target session
    let session;
    if (sessionStartedAt) {
      const targetMs = new Date(sessionStartedAt).getTime();
      const idx = fromTask.sessions.findIndex(s => {
        const sMs = new Date(s.startedAt).getTime();
        return Math.abs(sMs - targetMs) < 60000; // within 1 minute tolerance
      });
      if (idx === -1) {
        return NextResponse.json({ error: 'Session not found on source task' }, { status: 404 });
      }
      session = fromTask.sessions.splice(idx, 1)[0];
    } else {
      session = fromTask.sessions.pop();
    }

    const durationMs = (session.startedAt && session.endedAt)
      ? new Date(session.endedAt) - new Date(session.startedAt)
      : 0;
    const durationMin = Math.round(durationMs / 60000);

    // Update source timeSpent
    fromTask.timeSpent = Math.max(0, (fromTask.timeSpent || 0) - durationMin);

    // Push session to destination
    if (!toTask.sessions) toTask.sessions = [];
    toTask.sessions.push(session);
    toTask.timeSpent = (toTask.timeSpent || 0) + durationMin;

    // Save only dirty files
    const dirtyFiles = new Set([fromFile, toFile]);
    for (const key of dirtyFiles) {
      sources[key].save(data[key]);
    }

    return NextResponse.json({
      ok: true,
      session,
      from: { id: fromTask.id, title: fromTask.title, file: fromFile },
      to: { id: toTask.id, title: toTask.title, file: toFile },
      durationMin,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
