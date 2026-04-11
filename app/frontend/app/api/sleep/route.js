import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
export const dynamic = 'force-dynamic';

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
export function GET(request) {
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
    });
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
