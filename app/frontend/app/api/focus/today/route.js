import { NextResponse } from 'next/server';
import store from '@/lib/store';
import { Pool } from 'pg';
import { buildTimeline } from '@/lib/buildTimeline';
export const dynamic = 'force-dynamic';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date'); // YYYY-MM-DD or null
    const tz = searchParams.get('tz') || 'America/Chicago'; // browser timezone
    const todayStr  = store.getLocalDate();

    // Resolve midnight in the user's timezone via Postgres
    const tzQuery = dateParam && dateParam !== todayStr
      ? `SELECT ($1::date AT TIME ZONE $2)::timestamptz AS day_start,
                (($1::date + interval '1 day') AT TIME ZONE $2)::timestamptz AS day_end`
      : `SELECT (CURRENT_DATE AT TIME ZONE $1)::timestamptz AS day_start,
                ((CURRENT_DATE + interval '1 day') AT TIME ZONE $1)::timestamptz AS day_end`;
    const tzParams = dateParam && dateParam !== todayStr ? [dateParam, tz] : [tz];
    const tzResult = await pool.query(tzQuery, tzParams);
    const dayStartMs = new Date(tzResult.rows[0].day_start).getTime();
    const dayEndMs   = new Date(tzResult.rows[0].day_end).getTime();

    if (!dateParam || dateParam === todayStr) {
      // Today — read from JSON files (includes live active task)
      const sessions  = store.getTodaySessions();
      const nowMs      = Date.now();

      const rawSessions = sessions.map(s => ({
        startedAt:       s.session.startedAt,
        endedAt:         s.session.endedAt,
        focusLevel:      s.focusLevel,
        taskTitle:       s.taskTitle,
        activityContext: s.activityContext,
        taskId:          s.taskId,
        sessionIdx:      s.sessionIdx,
        sourceFile:      s.sourceFile,
      }));

      const { timeline, summary } = buildTimeline(rawSessions, dayStartMs, nowMs);
      return NextResponse.json({ dayStartMs, nowMs, timeline, summary, isLive: true, date: todayStr, tz });
    }

    // Historical date — read from Postgres
    const result = await pool.query(
      `SELECT task_id, task_title, context AS activity_context, focus_level,
              started_at, ended_at
       FROM task_sessions
       WHERE started_at < $2 AND ended_at > $1
         AND ended_at IS NOT NULL
       ORDER BY started_at`,
      [tzResult.rows[0].day_start, tzResult.rows[0].day_end]
    );

    const rawSessions = result.rows.map(r => ({
      startedAt:       r.started_at,
      endedAt:         r.ended_at,
      focusLevel:      r.focus_level,
      taskTitle:       r.task_title,
      activityContext: r.activity_context,
      taskId:          r.task_id,
      sessionIdx:      null,
      sourceFile:      'postgres',
    }));

    const { timeline, summary } = buildTimeline(rawSessions, dayStartMs, dayEndMs);
    return NextResponse.json({ dayStartMs, nowMs: dayEndMs, timeline, summary, isLive: false, date: dateParam, tz });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
