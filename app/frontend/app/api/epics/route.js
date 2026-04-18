import { NextResponse } from 'next/server';
import { Pool } from 'pg';
export const dynamic = 'force-dynamic';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** POST /api/epics — create an epic */
export async function POST(request) {
  try {
    const { title, description, project_id, status, sort_order, target_date, target_biweek, target_year, dimension } = await request.json();
    if (!title || !project_id) return NextResponse.json({ error: 'title and project_id required' }, { status: 400 });
    const { rows } = await pool.query(
      `INSERT INTO epics (title, description, project_id, status, sort_order, target_date, target_biweek, target_year, dimension)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [title, description || null, project_id, status || 'open', sort_order || 0, target_date || null, target_biweek || null, target_year || null, dimension || null]
    );
    return NextResponse.json(rows[0]);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
