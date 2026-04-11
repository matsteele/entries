import { NextResponse } from 'next/server';
import { Pool } from 'pg';
export const dynamic = 'force-dynamic';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** GET /api/meals/grocery?date=YYYY-MM-DD */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    const result = await pool.query(
      `SELECT m.name, m.ingredients, m.category, mp.status, mp.slot
       FROM meal_plans mp
       JOIN meals m ON mp.meal_id = m.id
       WHERE mp.date = $1 AND mp.meal_id IS NOT NULL
       ORDER BY mp.slot`,
      [date]
    );

    // Aggregate ingredients with counts
    const ingMap = new Map();
    for (const row of result.rows) {
      for (const ing of (row.ingredients || [])) {
        ingMap.set(ing, (ingMap.get(ing) || 0) + 1);
      }
    }

    const ingredients = [...ingMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, count]) => ({ name, count }));

    return NextResponse.json({
      date,
      meals: result.rows,
      ingredients,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
