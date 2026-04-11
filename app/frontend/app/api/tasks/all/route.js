import { NextResponse } from 'next/server';
import store from '@/lib/store';
export const dynamic = 'force-dynamic';

export function GET() {
  try {
    const current = store.loadCurrent();
    const pending = store.loadPending();
    const routine = store.loadRoutine();
    const completed = store.loadCompleted();
    if (current.task?.startedAt) {
      current.task.elapsedMinutes = store.calculateElapsedMinutes(current.task);
    }
    return NextResponse.json({ current, pending, routine, completed });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
