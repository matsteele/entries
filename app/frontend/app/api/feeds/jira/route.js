import { NextResponse } from 'next/server';
import { fetchJiraFeed } from '@/lib/feeds';
export const dynamic = 'force-dynamic';

export function GET(request) {
  try {
    const force = new URL(request.url).searchParams.get('refresh') === 'true';
    return NextResponse.json(fetchJiraFeed(force));
  } catch (error) {
    return NextResponse.json({ error: error.message, tickets: [] }, { status: 500 });
  }
}
