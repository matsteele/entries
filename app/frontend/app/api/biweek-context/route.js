import { NextResponse } from 'next/server';
import { Pool } from 'pg';
export const dynamic = 'force-dynamic';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** GET /api/biweek-context?year=2026 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get('year') || new Date().getFullYear(), 10);
  try {
    const { rows } = await pool.query(
      'SELECT * FROM biweek_context WHERE year = $1 ORDER BY biweek',
      [year]
    );
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** PUT /api/biweek-context — upsert */
export async function PUT(request) {
  try {
    const body = await request.json();
    const { year, biweek, location, trips, people, birthdays, cycle_notes, effort_allocation, notes } = body;
    if (!year || !biweek) return NextResponse.json({ error: 'year and biweek required' }, { status: 400 });

    const { rows } = await pool.query(`
      INSERT INTO biweek_context (year, biweek, location, trips, people, birthdays, cycle_notes, effort_allocation, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (year, biweek) DO UPDATE SET
        location = COALESCE(EXCLUDED.location, biweek_context.location),
        trips = COALESCE(EXCLUDED.trips, biweek_context.trips),
        people = COALESCE(EXCLUDED.people, biweek_context.people),
        birthdays = COALESCE(EXCLUDED.birthdays, biweek_context.birthdays),
        cycle_notes = COALESCE(EXCLUDED.cycle_notes, biweek_context.cycle_notes),
        effort_allocation = COALESCE(EXCLUDED.effort_allocation, biweek_context.effort_allocation),
        notes = COALESCE(EXCLUDED.notes, biweek_context.notes)
      RETURNING *
    `, [year, biweek, location || null, trips || null, people || null, birthdays || null, cycle_notes || null, effort_allocation || null, notes || null]);

    return NextResponse.json(rows[0]);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
