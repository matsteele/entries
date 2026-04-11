import { NextResponse } from 'next/server';
import store from '@/lib/store';
export const dynamic = 'force-dynamic';

export function GET() {
  try {
    const sums = store.calculateContextSums();
    const budget = store.getTimeBudgetBalance();
    return NextResponse.json({ sums, budget });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
