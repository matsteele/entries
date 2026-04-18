import { NextResponse } from 'next/server';
import { Pool } from 'pg';
export const dynamic = 'force-dynamic';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function biweekDates(year, bw) {
  const jan1 = new Date(year, 0, 1);
  const start = new Date(jan1.getTime() + (bw - 1) * 14 * 86400000);
  const end = new Date(start.getTime() + 13 * 86400000);
  // Clamp end to Dec 31
  const dec31 = new Date(year, 11, 31);
  return {
    start: start.toISOString().slice(0, 10),
    end: (end > dec31 ? dec31 : end).toISOString().slice(0, 10),
  };
}

const QUARTER_MONTHS = {
  1: 'Jan-Mar', 2: 'Apr-Jun', 3: 'Jul-Sep', 4: 'Oct-Dec',
};

function currentBiweek() {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now - jan1) / 86400000) + 1;
  return Math.min(26, Math.ceil(dayOfYear / 14));
}

/** GET /api/intentions/matrix?scope=quarters&startYear=2026&endYear=2026 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope') || 'quarters';
  const startYear = parseInt(searchParams.get('startYear') || new Date().getFullYear(), 10);
  const endYear = parseInt(searchParams.get('endYear') || startYear, 10);

  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentQ = Math.ceil((now.getMonth() + 1) / 3);
    const currentBW = currentBiweek();

    let periods = [];

    if (scope === 'years') {
      // Each period = a year, items = goals
      const { rows: goals } = await pool.query(`
        SELECT g.id, g.title, g.status, g.dimension, g.target_year,
          (SELECT count(*) FROM plans p WHERE p.goal_id = g.id AND p.status != 'completed') as child_count
        FROM goals g
        WHERE g.status IN ('active', 'dormant')
        ORDER BY g.sort_order
      `);

      for (let y = startYear; y <= endYear; y++) {
        const yearGoals = goals.filter(g => g.target_year === y);
        periods.push({
          key: `${y}`,
          year: y,
          period: null,
          label: `${y}`,
          sublabel: '',
          isCurrent: y === currentYear,
          items: yearGoals.map(g => ({
            id: g.id,
            title: g.title,
            type: 'goal',
            status: g.status,
            dimension: g.dimension,
            hasChildren: parseInt(g.child_count) > 0,
          })),
          context: null,
        });
      }

      // Palette: goals not assigned to any year
      const unplaced = goals.filter(g => !g.target_year).map(g => ({
        id: g.id, title: g.title, type: 'goal', dimension: g.dimension,
        parentId: null, parentTitle: null, hasChildren: parseInt(g.child_count) > 0,
      }));

      return NextResponse.json({ scope, range: { startYear, endYear }, periods, palette: { unplaced, placed: [] } });
    }

    if (scope === 'quarters') {
      // Each period = a quarter, items = plans (projects/feats)
      // Include plans that: have target_year in range, OR whose parent goal has target_year in range
      const { rows: plans } = await pool.query(`
        SELECT p.id, p.title, p.status, p.dimension, p.target_year, p.target_quarter, p.goal_id,
          g.title as goal_title, g.dimension as goal_dimension, g.target_year as goal_target_year,
          (SELECT count(*) FROM epics e WHERE e.project_id = p.id) as child_count
        FROM plans p
        LEFT JOIN goals g ON p.goal_id = g.id
        WHERE p.status != 'completed'
          AND (
            (p.target_year >= $1 AND p.target_year <= $2)
            OR (g.target_year >= $1 AND g.target_year <= $2)
          )
        ORDER BY p.title
      `, [startYear, endYear]);

      for (let y = startYear; y <= endYear; y++) {
        for (let q = 1; q <= 4; q++) {
          const qPlans = plans.filter(p => p.target_year === y && p.target_quarter === q);
          periods.push({
            key: `${y}-Q${q}`,
            year: y,
            period: q,
            label: `Q${q} ${y}`,
            sublabel: QUARTER_MONTHS[q],
            isCurrent: y === currentYear && q === currentQ,
            items: qPlans.map(p => ({
              id: p.id,
              title: p.title,
              type: parseInt(p.child_count) > 0 ? 'project' : 'feat',
              status: p.status,
              dimension: p.dimension,
              parentId: p.goal_id,
              parentTitle: p.goal_title,
              hasChildren: parseInt(p.child_count) > 0,
            })),
            context: null,
          });
        }
      }

      // Palette: only plans whose parent goal has target_year in range, and no quarter assigned
      const placedGoalIds = new Set();
      // Get goals placed in this year range
      const { rows: placedGoals } = await pool.query(
        `SELECT id FROM goals WHERE target_year >= $1 AND target_year <= $2`,
        [startYear, endYear]
      );
      placedGoals.forEach(g => placedGoalIds.add(g.id));

      const unplaced = plans
        .filter(p => !p.target_quarter && (placedGoalIds.has(p.goal_id) || !p.goal_id))
        .map(p => ({
          id: p.id, title: p.title,
          type: parseInt(p.child_count) > 0 ? 'project' : 'feat',
          dimension: p.dimension,
          parentId: p.goal_id, parentTitle: p.goal_title,
          hasChildren: parseInt(p.child_count) > 0,
        }));
      const placed = plans.filter(p => p.target_quarter).map(p => ({
        id: p.id, title: p.title, dimension: p.dimension,
        period: `Q${p.target_quarter} ${p.target_year}`,
      }));

      return NextResponse.json({ scope, range: { startYear, endYear }, periods, palette: { unplaced, placed } });
    }

    if (scope === 'biweeks') {
      // Each period = a biweek, items = epics
      const { rows: epics } = await pool.query(`
        SELECT e.id, e.title, e.status, e.dimension, e.target_biweek, e.target_year, e.project_id,
          p.title as project_title, p.dimension as project_dimension, p.target_quarter,
          (SELECT count(*) FROM actions a WHERE a.epic_id = e.id) as child_count
        FROM epics e
        LEFT JOIN plans p ON e.project_id = p.id
        WHERE (e.target_year >= $1 AND e.target_year <= $2)
           OR (p.target_year >= $1 AND p.target_year <= $2)
        ORDER BY e.title
      `, [startYear, endYear]);

      // Get biweek contexts
      const { rows: contexts } = await pool.query(
        `SELECT * FROM biweek_context WHERE year >= $1 AND year <= $2 ORDER BY year, biweek`,
        [startYear, endYear]
      );
      const contextMap = {};
      for (const c of contexts) contextMap[`${c.year}-${c.biweek}`] = c;

      for (let y = startYear; y <= endYear; y++) {
        for (let bw = 1; bw <= 26; bw++) {
          const dates = biweekDates(y, bw);
          const bwEpics = epics.filter(e => e.target_year === y && e.target_biweek === bw);
          const ctx = contextMap[`${y}-${bw}`] || null;

          periods.push({
            key: `${y}-BW${bw}`,
            year: y,
            period: bw,
            label: `BW${bw}`,
            sublabel: `${dates.start.slice(5)} – ${dates.end.slice(5)}`,
            yearLabel: bw === 1 ? `${y}` : null,
            isCurrent: y === currentYear && bw === currentBW,
            items: bwEpics.map(e => ({
              id: e.id,
              title: e.title,
              type: parseInt(e.child_count) > 0 ? 'epic' : 'task',
              status: e.status,
              dimension: e.dimension || e.project_dimension,
              parentId: e.project_id,
              parentTitle: e.project_title,
              hasChildren: parseInt(e.child_count) > 0,
            })),
            context: ctx ? {
              location: ctx.location,
              trips: ctx.trips,
              people: ctx.people,
              birthdays: ctx.birthdays,
              cycleNotes: ctx.cycle_notes,
              notes: ctx.notes,
            } : null,
          });
        }
      }

      // Palette: epics with no biweek, only under projects placed in a quarter within range
      const { rows: placedProjects } = await pool.query(
        `SELECT id FROM plans WHERE target_year >= $1 AND target_year <= $2 AND target_quarter IS NOT NULL`,
        [startYear, endYear]
      );
      const placedProjectIds = new Set(placedProjects.map(p => p.id));

      const unplaced = epics
        .filter(e => !e.target_biweek && (placedProjectIds.has(e.project_id) || !e.project_id))
        .map(e => ({
          id: e.id, title: e.title,
          type: parseInt(e.child_count) > 0 ? 'epic' : 'task',
          dimension: e.dimension || e.project_dimension,
          parentId: e.project_id, parentTitle: e.project_title,
          hasChildren: parseInt(e.child_count) > 0,
        }));

      return NextResponse.json({ scope, range: { startYear, endYear }, periods, palette: { unplaced, placed: [] } });
    }

    return NextResponse.json({ error: 'invalid scope' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
