import { NextResponse } from 'next/server';
import { Pool } from 'pg';
export const dynamic = 'force-dynamic';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** PATCH /api/projects/[id] — update project (plans table) fields */
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const updates = await request.json();
    const allowed = ['title', 'name', 'status', 'context', 'weight', 'horizon', 'impact_score', 'next_action', 'last_reviewed', 'goal_id', 'journal_id', 'weekly_target_minutes', 'folder_path', 'target_year', 'target_quarter', 'dimension'];
    const sets = [];
    const values = [];
    let i = 1;
    for (const [key, value] of Object.entries(updates)) {
      if (allowed.includes(key)) {
        sets.push(`${key} = $${i++}`);
        values.push(value);
      }
    }
    if (sets.length === 0) return NextResponse.json({ error: 'no valid fields' }, { status: 400 });
    values.push(id);
    const { rows } = await pool.query(
      `UPDATE plans SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
