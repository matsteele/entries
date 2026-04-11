import { NextResponse } from 'next/server';
import { Pool } from 'pg';
export const dynamic = 'force-dynamic';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** POST /api/actions — create an action */
export async function POST(request) {
  try {
    const { title, epic_id, project_id, goal_id, estimated_minutes, status, sort_order } = await request.json();
    if (!title || !project_id) return NextResponse.json({ error: 'title and project_id required' }, { status: 400 });
    const { rows } = await pool.query(
      `INSERT INTO actions (title, epic_id, project_id, goal_id, estimated_minutes, status, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [title, epic_id || null, project_id, goal_id || null, estimated_minutes || null, status || 'pending', sort_order || 0]
    );
    return NextResponse.json(rows[0]);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
