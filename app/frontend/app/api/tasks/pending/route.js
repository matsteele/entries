import { NextResponse } from 'next/server';
import store from '@/lib/store';
export const dynamic = 'force-dynamic';

export function GET() {
  try {
    return NextResponse.json(store.loadPending());
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
