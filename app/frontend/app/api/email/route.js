import { NextResponse } from 'next/server';
import { fetchGmailFeed } from '@/lib/feeds';
export const dynamic = 'force-dynamic';

export function GET(request) {
  try {
    const force = new URL(request.url).searchParams.get('refresh') === 'true';
    return NextResponse.json(fetchGmailFeed(force));
  } catch (error) {
    return NextResponse.json({ error: error.message, emails: [], categories: {} }, { status: 500 });
  }
}
