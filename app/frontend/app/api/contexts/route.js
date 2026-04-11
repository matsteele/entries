import { NextResponse } from 'next/server';
import store from '@/lib/store';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    contexts: store.ALL_CONTEXTS,
    order: store.CONTEXT_ORDER,
    emojis: store.CONTEXT_EMOJI_MAP,
  });
}
