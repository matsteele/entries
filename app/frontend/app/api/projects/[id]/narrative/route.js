import { NextResponse } from 'next/server';
import { Pool } from 'pg';
export const dynamic = 'force-dynamic';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** GET /api/projects/[id]/narrative — fetch the linked journal entry content */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    // Get the project's journal_id, then fetch the journal content
    const projRes = await pool.query('SELECT journal_id FROM plans WHERE id = $1', [id]);
    if (projRes.rows.length === 0) return NextResponse.json({ error: 'project not found' }, { status: 404 });

    const { journal_id } = projRes.rows[0];
    if (!journal_id) return NextResponse.json({ content: null, message: 'no linked journal entry' });

    const journalRes = await pool.query(
      'SELECT id, content, type, context, created_at, updated_at FROM journals WHERE id = $1',
      [journal_id]
    );
    if (journalRes.rows.length === 0) return NextResponse.json({ content: null, message: 'journal entry not found' });

    return NextResponse.json(journalRes.rows[0]);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
