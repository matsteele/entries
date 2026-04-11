import { NextResponse } from 'next/server';
import { pgPool } from '@/lib/db';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const q = new URL(request.url).searchParams.get('q');
  if (!q) return NextResponse.json([]);
  if (!pgPool) return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  try {
    const result = await pgPool.query(
      `SELECT id, date, content
       FROM journals
       WHERE type = 'protocol'
         AND content ILIKE $1
       ORDER BY date DESC
       LIMIT 3`,
      [`%${q}%`]
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
