import { NextResponse } from 'next/server';
import { Pool } from 'pg';
export const dynamic = 'force-dynamic';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** GET /api/meal-plans/[date] */
export async function GET(request, { params }) {
  try {
    const { date } = await params;
    const result = await pool.query(
      `SELECT mp.slot, mp.planned_time, mp.meal_id, mp.status, mp.eaten_at, mp.notes,
              m.name, m.category, m.ingredients, m.recipe,
              m.protein, m.carbs, m.fat, m.calories
       FROM meal_plans mp
       LEFT JOIN meals m ON mp.meal_id = m.id
       WHERE mp.date = $1
       ORDER BY mp.eaten_at NULLS LAST, mp.planned_time NULLS LAST, mp.slot`,
      [date]
    );

    let totalProtein = 0, totalCarbs = 0, totalFat = 0, totalCalories = 0;
    for (const row of result.rows) {
      if (row.meal_id) {
        totalProtein  += parseFloat(row.protein  || 0);
        totalCarbs    += parseFloat(row.carbs    || 0);
        totalFat      += parseFloat(row.fat      || 0);
        totalCalories += parseFloat(row.calories || 0);
      }
    }

    const SLOTS = ['meal-1', 'meal-2', 'meal-3', 'meal-4', 'meal-5'];
    const slotMap = {};
    for (const row of result.rows) slotMap[row.slot] = row;
    const stackSlots = SLOTS.map(s => slotMap[s] || { slot: s, meal_id: null, status: null, name: null });
    const otherSlots = result.rows.filter(r => r.slot.startsWith('other-'));

    return NextResponse.json({
      date,
      slots: stackSlots,
      otherSlots,
      macroTotals: {
        protein:  Math.round(totalProtein),
        carbs:    Math.round(totalCarbs),
        fat:      Math.round(totalFat),
        calories: Math.round(totalCalories),
        mealsEaten: result.rows.filter(r => r.status === 'eaten').length,
        mealsPlanned: result.rows.filter(r => r.meal_id).length,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** POST /api/meal-plans/[date] */
export async function POST(request, { params }) {
  try {
    const { date } = await params;
    const { slot, mealId, plannedTime, status, eatenAt, notes } = await request.json();
    if (!slot) return NextResponse.json({ error: 'slot required' }, { status: 400 });

    if (mealId || status) {
      await pool.query(
        `INSERT INTO meal_plans (date, slot, meal_id, planned_time, status, eaten_at, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (date, slot) DO UPDATE SET
           meal_id      = COALESCE(EXCLUDED.meal_id, meal_plans.meal_id),
           planned_time = COALESCE(EXCLUDED.planned_time, meal_plans.planned_time),
           status       = COALESCE(EXCLUDED.status, meal_plans.status),
           eaten_at     = COALESCE(EXCLUDED.eaten_at, meal_plans.eaten_at),
           notes        = COALESCE(EXCLUDED.notes, meal_plans.notes)`,
        [date, slot, mealId || null, plannedTime || null,
         status || 'planned', eatenAt || null, notes || null]
      );
    } else {
      await pool.query(`DELETE FROM meal_plans WHERE date = $1 AND slot = $2`, [date, slot]);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
