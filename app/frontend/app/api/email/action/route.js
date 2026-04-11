import { NextResponse } from 'next/server';
import { gmailAction } from '@/lib/feeds';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { action, ids } = await request.json();
    if (!action || !ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Missing action or ids' }, { status: 400 });
    }
    const results = gmailAction(action, ids);
    const ok = results.filter(r => r.ok).length;
    return NextResponse.json({ ok, total: ids.length, results });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
