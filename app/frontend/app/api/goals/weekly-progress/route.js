import { NextResponse } from 'next/server';
import { Pool } from 'pg';
export const dynamic = 'force-dynamic';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * GET /api/goals/weekly-progress
 *
 * Returns goals and projects with weekly_target_minutes and actual minutes
 * spent this week (from task_sessions where goal_id/project_id is set).
 *
 * Response: {
 *   goals: [{ id, title, weekly_target_minutes, actual_minutes, projects: [{ id, title, weekly_target_minutes, actual_minutes }] }]
 * }
 */
export async function GET() {
  try {
    // Get Monday of current week
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
    const mondayISO = monday.toISOString();

    // Get goals with targets
    const goalsRes = await pool.query(
      `SELECT id, title, weekly_target_minutes, context FROM goals WHERE status = 'active' ORDER BY sort_order`
    );

    // Get projects with targets
    const projectsRes = await pool.query(
      `SELECT id, title, goal_id, weekly_target_minutes, context FROM plans WHERE status = 'active' ORDER BY weight DESC`
    );

    // Get actual minutes per goal this week from task_sessions
    const goalActualRes = await pool.query(
      `SELECT goal_id,
              COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60), 0)::int as minutes
       FROM task_sessions
       WHERE goal_id IS NOT NULL
         AND started_at >= $1
       GROUP BY goal_id`,
      [mondayISO]
    );

    // Get actual minutes per project this week
    const projectActualRes = await pool.query(
      `SELECT project_id,
              COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60), 0)::int as minutes
       FROM task_sessions
       WHERE project_id IS NOT NULL
         AND started_at >= $1
       GROUP BY project_id`,
      [mondayISO]
    );

    // Index actuals
    const goalActuals = {};
    for (const r of goalActualRes.rows) goalActuals[r.goal_id] = r.minutes;
    const projectActuals = {};
    for (const r of projectActualRes.rows) projectActuals[r.project_id] = r.minutes;

    // Build response
    const goals = goalsRes.rows.map(g => {
      const gProjects = projectsRes.rows.filter(p => p.goal_id === g.id);
      return {
        id: g.id,
        title: g.title,
        context: g.context,
        weekly_target_minutes: g.weekly_target_minutes || 0,
        actual_minutes: goalActuals[g.id] || 0,
        projects: gProjects.map(p => ({
          id: p.id,
          title: p.title,
          weekly_target_minutes: p.weekly_target_minutes || 0,
          actual_minutes: projectActuals[p.id] || 0,
        })),
      };
    });

    return NextResponse.json({ goals });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
