import { NextResponse } from 'next/server';
import { fetchGoogleTasksFeed } from '@/lib/feeds';
export const dynamic = 'force-dynamic';

export function GET(request) {
  try {
    const force = new URL(request.url).searchParams.get('refresh') === 'true';
    return NextResponse.json(fetchGoogleTasksFeed(force));
  } catch (error) {
    return NextResponse.json({ error: error.message, tasks: [] }, { status: 500 });
  }
}
