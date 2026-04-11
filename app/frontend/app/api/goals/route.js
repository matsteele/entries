import { NextResponse } from 'next/server';
import { Pool } from 'pg';
export const dynamic = 'force-dynamic';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** GET /api/goals — all goals with project counts */
export async function GET() {
  try {
    const { rows } = await pool.query(`
      SELECT g.*,
        (SELECT count(*) FROM plans p WHERE p.goal_id = g.id) as project_count,
        (SELECT count(*) FROM plans p WHERE p.goal_id = g.id AND p.status = 'active') as active_project_count
      FROM goals g
      ORDER BY g.sort_order
    `);
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** POST /api/goals — create a goal */
export async function POST(request) {
  try {
    const { title, description, horizon, status, context, weight, sort_order } = await request.json();
    if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
    const { rows } = await pool.query(
      `INSERT INTO goals (title, description, horizon, status, context, weight, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [title, description || null, horizon || '3yr', status || 'active', context || null, weight || 5, sort_order || 0]
    );
    return NextResponse.json(rows[0]);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
