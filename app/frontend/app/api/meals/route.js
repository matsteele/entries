import { NextResponse } from 'next/server';
import { Pool } from 'pg';
export const dynamic = 'force-dynamic';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** GET /api/meals — list all meals grouped by category */
export async function GET() {
  try {
    const result = await pool.query(
      `SELECT id, name, category, ingredients, recipe, protein, carbs, fat, calories
       FROM meals ORDER BY category, name`
    );
    return NextResponse.json({ meals: result.rows });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** POST /api/meals — create a new meal */
export async function POST(request) {
  try {
    const body = await request.json();
    const { name, category, ingredients, recipe, protein, carbs, fat, calories } = body;
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
    const result = await pool.query(
      `INSERT INTO meals (name, category, ingredients, recipe, protein, carbs, fat, calories)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name, category || null, ingredients || [], recipe || null,
       protein || 0, carbs || 0, fat || 0, calories || 0]
    );
    return NextResponse.json({ meal: result.rows[0] });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
