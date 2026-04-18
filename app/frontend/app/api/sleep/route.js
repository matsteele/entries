import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
export const dynamic = 'force-dynamic';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TRACKING_DIR = path.resolve(process.cwd(), '..', '..', 'tracking');
const SLEEP_DIR = path.join(TRACKING_DIR, 'sleep');

function loadRoutine() {
  const f = path.join(TRACKING_DIR, 'routine.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [];
}

function loadSleepLog(date) {
  const f = path.join(SLEEP_DIR, `sleep-log-${date}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

function loadStrategies() {
  const f = path.join(SLEEP_DIR, 'strategies.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { strategies: [] };
}

/**
 * GET /api/sleep?date=YYYY-MM-DD&days=7
 * Returns sleep + rest sessions for the past N days.
 * Merges routine.json sessions with sleep-log files for quality/strategy data.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);
    const days = parseInt(searchParams.get('days') || '8', 10);

    const routine = loadRoutine();
    const sleepTask = routine.find(t => t.title === 'sleeping' || t.title?.toLowerCase().includes('sleep'));
    const restTask = routine.find(t => t.title === 'resting');
    const allSleepSessions = sleepTask?.sessions || [];
    const allRestSessions = restTask?.sessions || [];
    const strategies = loadStrategies();

    const windowEnd = new Date(date + 'T23:59:59').getTime();
    const windowStart = windowEnd - days * 86400000;

    // Build sleep records from routine sessions
    const records = [];
    for (const s of allSleepSessions) {
      if (!s.startedAt || !s.endedAt) continue;
      const startMs = new Date(s.startedAt).getTime();
      const endMs = new Date(s.endedAt).getTime();
      if (endMs < windowStart || startMs > windowEnd) continue;

      const durationMinutes = Math.round((endMs - startMs) / 60000);
      if (durationMinutes < 30) continue;

      const wakeDate = new Date(s.endedAt).toISOString().slice(0, 10);
      const sleepLog = loadSleepLog(wakeDate);

      records.push({
        date: wakeDate,
        sleepStart: s.startedAt,
        wakeTime: s.endedAt,
        durationMinutes,
        quality: sleepLog?.quality || null,
        strategies: sleepLog?.strategiesUsed || [],
        notes: sleepLog?.notes || null,
        medicationUsed: sleepLog?.medicationUsed || false,
        supplementsUsed: sleepLog?.supplementsUsed || [],
      });
    }

    // Build rest/nap records
    const restRecords = [];
    for (const s of allRestSessions) {
      if (!s.startedAt || !s.endedAt) continue;
      const startMs = new Date(s.startedAt).getTime();
      const endMs = new Date(s.endedAt).getTime();
      if (endMs < windowStart || startMs > windowEnd) continue;

      const durationMinutes = Math.round((endMs - startMs) / 60000);
      if (durationMinutes < 5) continue;

      const restDate = new Date(s.endedAt).toISOString().slice(0, 10);
      restRecords.push({
        date: restDate,
        restStart: s.startedAt,
        restEnd: s.endedAt,
        durationMinutes,
      });
    }

    // For the requested date: last night's sleep (keyed by wake date)
    const todaySleep = records.find(r => r.date === date);

    // Today's rest sessions
    const todayRest = restRecords.filter(r => r.date === date);
    const todayRestMinutes = todayRest.reduce((sum, r) => sum + r.durationMinutes, 0);

    // 7-day averages (exclude today)
    const past = records.filter(r => r.date !== date && r.durationMinutes > 60);
    const avgMinutes = past.length > 0
      ? Math.round(past.reduce((sum, r) => sum + r.durationMinutes, 0) / past.length)
      : null;

    // Quality-adjusted average: duration * (quality/5), quality defaults to 3 if missing
    const qualityAdjustedAvg = past.length > 0
      ? Math.round(past.reduce((sum, r) => sum + r.durationMinutes * ((r.quality || 3) / 5), 0) / past.length)
      : null;

    // Average quality score
    const pastWithQuality = past.filter(r => r.quality != null);
    const avgQuality = pastWithQuality.length > 0
      ? Math.round((pastWithQuality.reduce((sum, r) => sum + r.quality, 0) / pastWithQuality.length) * 10) / 10
      : null;

    // Average bed/wake times (in minutes from midnight)
    const bedtimes = past.map(r => {
      const d = new Date(r.sleepStart);
      let mins = d.getHours() * 60 + d.getMinutes();
      if (mins < 720) mins += 1440; // after midnight → treat as late night
      return mins;
    });
    const waketimes = past.map(r => {
      const d = new Date(r.wakeTime);
      return d.getHours() * 60 + d.getMinutes();
    });
    const avgBedtimeMinutes = bedtimes.length > 0 ? Math.round(bedtimes.reduce((a, b) => a + b, 0) / bedtimes.length) : null;
    const avgWaketimeMinutes = waketimes.length > 0 ? Math.round(waketimes.reduce((a, b) => a + b, 0) / waketimes.length) : null;

    // Sleep debt: target 8h (480min), sum shortfall over past 7 days
    const TARGET_SLEEP = 480;
    const sleepDebt = past.reduce((debt, r) => debt + Math.max(0, TARGET_SLEEP - r.durationMinutes), 0);

    // Average rest per day
    const pastRest = restRecords.filter(r => r.date !== date);
    const restDays = new Set(pastRest.map(r => r.date));
    const avgRestMinutes = restDays.size > 0
      ? Math.round(pastRest.reduce((sum, r) => sum + r.durationMinutes, 0) / days)
      : 0;

    // Strategy effectiveness: avg quality by strategy
    const strategyStats = {};
    for (const r of records) {
      if (!r.quality || !r.strategies?.length) continue;
      for (const s of r.strategies) {
        if (!strategyStats[s]) strategyStats[s] = { totalQuality: 0, count: 0 };
        strategyStats[s].totalQuality += r.quality;
        strategyStats[s].count += 1;
      }
    }
    const strategyEffectiveness = Object.entries(strategyStats).map(([name, s]) => ({
      name,
      avgQuality: Math.round((s.totalQuality / s.count) * 10) / 10,
      usageCount: s.count,
    })).sort((a, b) => b.avgQuality - a.avgQuality);

    // Work sessions from PostgreSQL for this date window
    let workSessions = [];
    try {
      const wsStart = new Date(windowStart).toISOString();
      const wsEnd   = new Date(windowEnd).toISOString();
      const wsResult = await pool.query(
        `SELECT started_at, ended_at FROM task_sessions
         WHERE started_at >= $1 AND ended_at <= $2 AND ended_at IS NOT NULL
         ORDER BY started_at`,
        [wsStart, wsEnd]
      );
      workSessions = wsResult.rows.map(r => ({
        startedAt: r.started_at,
        endedAt:   r.ended_at,
      }));
    } catch (_) { /* pg not available — skip silently */ }

    return NextResponse.json({
      date,
      lastNight: todaySleep || null,
      avgMinutes,
      avgQuality,
      qualityAdjustedAvg,
      avgBedtimeMinutes,
      avgWaketimeMinutes,
      sleepDebt,
      targetMinutes: TARGET_SLEEP,
      todayRest,
      todayRestMinutes,
      avgRestMinutes,
      records,
      restRecords,
      strategyEffectiveness,
      strategies: strategies.strategies || [],
      workSessions,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function saveRoutine(tasks) {
  fs.writeFileSync(path.join(TRACKING_DIR, 'routine.json'), JSON.stringify(tasks, null, 2), 'utf8');
}

function findSleepTask(routine, type) {
  if (type === 'rest') return routine.find(t => t.title === 'resting');
  return routine.find(t => t.title === 'sleeping' || t.title?.toLowerCase().includes('sleep'));
}

/**
 * PATCH /api/sleep — update a sleep/rest session's times
 * Body: { type?: 'sleep'|'rest', startedAt, newStartedAt?, newEndedAt? }
 */
export async function PATCH(request) {
  try {
    const { type = 'sleep', startedAt, newStartedAt, newEndedAt } = await request.json();
    if (!startedAt) return NextResponse.json({ error: 'startedAt required' }, { status: 400 });

    const routine = loadRoutine();
    const task = findSleepTask(routine, type);
    if (!task?.sessions) return NextResponse.json({ error: 'task not found' }, { status: 404 });

    const s = task.sessions.find(s => s.startedAt === startedAt);
    if (!s) return NextResponse.json({ error: 'session not found' }, { status: 404 });

    if (newStartedAt) s.startedAt = newStartedAt;
    if (newEndedAt)   s.endedAt   = newEndedAt;
    saveRoutine(routine);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PUT /api/sleep — add a session or fill-default for future days
 * Body: { type?, startedAt, endedAt }
 *    or { action: 'fill-default', startHour, startMin, endHour, endMin, days, existingDates }
 */
export async function PUT(request) {
  try {
    const body = await request.json();
    const routine = loadRoutine();

    if (body.action === 'fill-default') {
      const { startHour, startMin, endHour, endMin, days = 14, existingDates = [] } = body;
      const task = findSleepTask(routine, 'sleep');
      if (!task) return NextResponse.json({ error: 'sleep task not found' }, { status: 404 });
      if (!task.sessions) task.sessions = [];

      let filled = 0;
      const today = new Date();
      // Fill backward: today's night, then yesterday's, etc.
      for (let i = 0; i < days; i++) {
        const sleepDay = new Date(today); sleepDay.setDate(today.getDate() - i);
        const wakeDay  = new Date(today); wakeDay.setDate(today.getDate() - i + 1);
        const wakeDateStr = wakeDay.toISOString().slice(0, 10);
        if (existingDates.includes(wakeDateStr)) continue;

        const startedAt = new Date(sleepDay);
        startedAt.setHours(startHour, startMin, 0, 0);
        const endedAt = new Date(wakeDay);
        endedAt.setHours(endHour, endMin, 0, 0);

        // Don't duplicate
        if (!task.sessions.find(s => s.startedAt === startedAt.toISOString())) {
          task.sessions.push({ startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString() });
          filled++;
        }
      }
      saveRoutine(routine);
      return NextResponse.json({ ok: true, filled });
    }

    // Add single session
    const { type = 'sleep', startedAt, endedAt } = body;
    if (!startedAt || !endedAt) return NextResponse.json({ error: 'startedAt and endedAt required' }, { status: 400 });

    const task = findSleepTask(routine, type);
    if (!task) return NextResponse.json({ error: 'task not found' }, { status: 404 });
    if (!task.sessions) task.sessions = [];

    if (!task.sessions.find(s => s.startedAt === startedAt)) {
      task.sessions.push({ startedAt, endedAt });
      saveRoutine(routine);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/sleep — remove a session by startedAt
 * Body: { type?, startedAt }
 */
export async function DELETE(request) {
  try {
    const { type = 'sleep', startedAt } = await request.json();
    if (!startedAt) return NextResponse.json({ error: 'startedAt required' }, { status: 400 });

    const routine = loadRoutine();
    const task = findSleepTask(routine, type);
    if (!task?.sessions) return NextResponse.json({ error: 'task not found' }, { status: 404 });

    const idx = task.sessions.findIndex(s => s.startedAt === startedAt);
    if (idx < 0) return NextResponse.json({ error: 'session not found' }, { status: 404 });

    task.sessions.splice(idx, 1);
    saveRoutine(routine);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/sleep — save quality score for a sleep record
 * Body: { date, quality, notes? }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { date, quality, notes } = body;
    if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 });
    if (quality != null && (quality < 1 || quality > 5)) {
      return NextResponse.json({ error: 'quality must be 1-5' }, { status: 400 });
    }

    if (!fs.existsSync(SLEEP_DIR)) fs.mkdirSync(SLEEP_DIR, { recursive: true });
    const filePath = path.join(SLEEP_DIR, `sleep-log-${date}.json`);
    let log = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : { date };

    if (quality != null) log.quality = quality;
    if (notes != null) log.notes = notes;
    log.updated_at = new Date().toISOString();

    fs.writeFileSync(filePath, JSON.stringify(log, null, 2), 'utf8');
    return NextResponse.json({ ok: true, log });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
