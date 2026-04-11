import { NextResponse } from 'next/server';
import { Pool } from 'pg';
export const dynamic = 'force-dynamic';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** PATCH /api/actions/[id] — update action fields */
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const updates = await request.json();
    const allowed = ['title', 'status', 'epic_id', 'project_id', 'goal_id', 'estimated_minutes', 'daily_task_id', 'sort_order', 'weight'];
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
      `UPDATE actions SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** DELETE /api/actions/[id] */
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    await pool.query('DELETE FROM actions WHERE id = $1', [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
