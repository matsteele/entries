import { NextResponse } from 'next/server';
import store from '@/lib/store';
import { Pool } from 'pg';
export const dynamic = 'force-dynamic';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const CONTEXTS = ['cul', 'prof', 'per', 'soc', 'proj', 'heal', 'us'];

// Map task-store context names to short codes
const CTX_NAME_TO_CODE = {
  cultivo: 'cul', professional: 'prof', personal: 'per',
  social: 'soc', projects: 'proj', health: 'heal', unstructured: 'us',
};

/**
 * GET /api/time/budget
 * Returns today's context minutes, focused minutes, vs user targets.
 */
export async function GET() {
  try {
    // Load targets from user_config
    let targets = { cul: 180, proj: 120, per: 60, soc: 30, prof: 60, heal: 30, us: 0 };
    try {
      const configResult = await pool.query(
        `SELECT value FROM user_config WHERE key = 'focused_minutes_targets'`
      );
      if (configResult.rows[0]) targets = configResult.rows[0].value;
    } catch (_) {}

    // This week's context sums from store
    const sums = store.calculateContextSums();
    const todaySums = sums.week || {};

    // Build per-context data (normalize to short codes)
    const contextData = {};
    for (const [name, mins] of Object.entries(todaySums)) {
      const code = CTX_NAME_TO_CODE[name] || name;
      contextData[code] = (contextData[code] || 0) + mins;
    }

    // Focused minutes: sum over today's sessions of (focusLevel * minutes)
    const sessions = store.getTodaySessions();
    const now = Date.now();
    const midnight = store.getMidnightToday().getTime();
    let totalFocusedMins = 0;
    const focusedByContext = {};

    for (const s of sessions) {
      if (s.sourceFile === 'current') continue; // exclude live session from focused calc
      const start = new Date(s.session.startedAt).getTime();
      const end   = s.session.endedAt ? Math.min(new Date(s.session.endedAt).getTime(), now) : now;
      if (end <= start || start < midnight) continue;
      const mins = (end - start) / 60000;
      const fl   = s.focusLevel || 0;
      const code = CTX_NAME_TO_CODE[s.activityContext] || s.activityContext;
      const focused = mins * fl;
      totalFocusedMins += focused;
      focusedByContext[code] = (focusedByContext[code] || 0) + focused;
    }

    const budget = store.getTimeBudgetBalance();

    return NextResponse.json({
      targets,
      contextMinutes: contextData,
      focusedMins: Math.round(totalFocusedMins),
      focusedByContext: Object.fromEntries(
        Object.entries(focusedByContext).map(([k, v]) => [k, Math.round(v)])
      ),
      budget,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
