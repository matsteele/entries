import { NextResponse } from 'next/server';
import { pgPool } from '@/lib/db';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (!pgPool) return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    const result = await pgPool.query(
      `SELECT id, date, LEFT(content, 120) as preview,
              REGEXP_REPLACE(content, E'\\n.*', '') as title
       FROM journals
       WHERE type = 'protocol'
       ORDER BY date DESC`
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
