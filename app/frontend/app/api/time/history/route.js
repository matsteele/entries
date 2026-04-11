import { NextResponse } from 'next/server';
import { Pool } from 'pg';
export const dynamic = 'force-dynamic';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const CONTEXTS = ['cul', 'prof', 'per', 'soc', 'proj', 'heal', 'us'];

const CTX_NAME_TO_CODE = {
  cultivo: 'cul', professional: 'prof', personal: 'per',
  social: 'soc', projects: 'proj', health: 'heal', unstructured: 'us',
};

function emptyCtx() {
  return Object.fromEntries(CONTEXTS.map(c => [c, 0]));
}

/**
 * GET /api/time/history?period=day|week|month&n=7
 * Returns last N periods of aggregated context minutes + focused minutes.
 *
 * For 'day': last N days (queries task_sessions + daily_time_snapshots for legacy)
 * For 'week': last N weeks
 * For 'month': last N months
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'day';
    const n      = Math.min(parseInt(searchParams.get('n') || '7'), 24);

    const now = new Date();
    const results = [];

    if (period === 'day') {
      for (let i = n - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
        const dayEnd   = new Date(dayStart.getTime() + 86400000);

        // Query task_sessions for this day
        const sessRes = await pool.query(
          `SELECT context, focus_level,
                  EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at)) / 60 AS mins
           FROM task_sessions
           WHERE started_at >= $1 AND started_at < $2 AND ended_at IS NOT NULL`,
          [dayStart.toISOString(), dayEnd.toISOString()]
        );

        const ctx = emptyCtx();
        let focusedMins = 0;
        let hasSessions = false;

        for (const row of sessRes.rows) {
          const code = CTX_NAME_TO_CODE[row.context] || row.context;
          if (ctx[code] !== undefined) {
            const mins = parseFloat(row.mins);
            const fl   = parseFloat(row.focus_level) || 0;
            const focused = mins * fl;
            ctx[code] += focused;
            focusedMins += focused;
            hasSessions = true;
          }
        }

        // Fall back to legacy snapshot if no session data
        if (!hasSessions) {
          const snapRes = await pool.query(
            `SELECT context_minutes FROM daily_time_snapshots WHERE date = $1`,
            [dateStr]
          );
          if (snapRes.rows[0]) {
            const snap = snapRes.rows[0].context_minutes;
            for (const [k, v] of Object.entries(snap)) {
              const code = CTX_NAME_TO_CODE[k] || k;
              if (ctx[code] !== undefined) ctx[code] = v;
            }
          }
        }

        results.push({
          label: dateStr,
          contexts: Object.fromEntries(Object.entries(ctx).map(([k, v]) => [k, Math.round(v)])),
          focusedMins: Math.round(focusedMins),
          isLegacy: !hasSessions,
        });
      }
    } else if (period === 'week') {
      for (let i = n - 1; i >= 0; i--) {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() - i * 7);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
        const label = weekStart.toISOString().split('T')[0];

        const sessRes = await pool.query(
          `SELECT context, focus_level,
                  EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at)) / 60 AS mins
           FROM task_sessions
           WHERE started_at >= $1 AND started_at < $2 AND ended_at IS NOT NULL`,
          [weekStart.toISOString(), weekEnd.toISOString()]
        );

        const ctx = emptyCtx();
        let focusedMins = 0;
        let hasSessions = false;

        for (const row of sessRes.rows) {
          const code = CTX_NAME_TO_CODE[row.context] || row.context;
          if (ctx[code] !== undefined) {
            const mins = parseFloat(row.mins);
            const fl   = parseFloat(row.focus_level) || 0;
            const focused = mins * fl;
            ctx[code] += focused;
            focusedMins += focused;
            hasSessions = true;
          }
        }

        // Fall back to legacy snapshots for weeks without session data
        if (!hasSessions) {
          const snapRes = await pool.query(
            `SELECT context_minutes FROM daily_time_snapshots WHERE date >= $1 AND date < $2`,
            [weekStart.toISOString().split('T')[0], weekEnd.toISOString().split('T')[0]]
          );
          for (const snap of snapRes.rows) {
            for (const [k, v] of Object.entries(snap.context_minutes)) {
              const code = CTX_NAME_TO_CODE[k] || k;
              if (ctx[code] !== undefined) ctx[code] += v;
            }
          }
        }

        results.push({
          label,
          contexts: Object.fromEntries(Object.entries(ctx).map(([k, v]) => [k, Math.round(v)])),
          focusedMins: Math.round(focusedMins),
          isLegacy: !hasSessions,
        });
      }
    } else if (period === 'month') {
      for (let i = n - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
        const monthEnd   = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const label      = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

        const sessRes = await pool.query(
          `SELECT context, focus_level,
                  EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at)) / 60 AS mins
           FROM task_sessions
           WHERE started_at >= $1 AND started_at < $2 AND ended_at IS NOT NULL`,
          [monthStart.toISOString(), monthEnd.toISOString()]
        );

        const ctx = emptyCtx();
        let focusedMins = 0;
        let hasSessions = false;

        for (const row of sessRes.rows) {
          const code = CTX_NAME_TO_CODE[row.context] || row.context;
          if (ctx[code] !== undefined) {
            const mins = parseFloat(row.mins);
            const fl   = parseFloat(row.focus_level) || 0;
            const focused = mins * fl;
            ctx[code] += focused;
            focusedMins += focused;
            hasSessions = true;
          }
        }

        if (!hasSessions) {
          const snapRes = await pool.query(
            `SELECT context_minutes FROM daily_time_snapshots
             WHERE date >= $1 AND date < $2`,
            [monthStart.toISOString().split('T')[0], monthEnd.toISOString().split('T')[0]]
          );
          for (const snap of snapRes.rows) {
            for (const [k, v] of Object.entries(snap.context_minutes)) {
              const code = CTX_NAME_TO_CODE[k] || k;
              if (ctx[code] !== undefined) ctx[code] += v;
            }
          }
        }

        results.push({
          label,
          contexts: Object.fromEntries(Object.entries(ctx).map(([k, v]) => [k, Math.round(v)])),
          focusedMins: Math.round(focusedMins),
          isLegacy: !hasSessions,
        });
      }
    }

    return NextResponse.json({ period, n, results });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
