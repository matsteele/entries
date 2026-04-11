import { NextResponse } from 'next/server';
import store from '@/lib/store';
export const dynamic = 'force-dynamic';

export function GET() {
  try {
    const current = store.loadCurrent();
    const completedCount = store.getCompletedTodayCount();
    const pendingCount = store.loadPending().length;
    const sums = store.calculateContextSums();
    const budget = store.getTimeBudgetBalance();
    return NextResponse.json({
      completedCount,
      pendingCount,
      contextSums: sums,
      budget,
      hasActiveTask: !!(current.task?.startedAt),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
