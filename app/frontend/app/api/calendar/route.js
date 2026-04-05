import { NextResponse } from 'next/server';
import { createRequire } from 'module';
export const dynamic = 'force-dynamic';

const _require = createRequire(import.meta.url);
const { listCalendarEvents } = _require('../../../../backend/google-calendar.js');

// Simple in-memory cache per date (60s TTL)
const _cache = new Map();
const CACHE_TTL = 60000;

/**
 * GET /api/calendar?date=YYYY-MM-DD
 * Returns Google Calendar events for the given date as an overlay for FocusTimeline.
 */
export function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    if (!dateParam) {
      return NextResponse.json({ error: 'date param required' }, { status: 400 });
    }

    const cached = _cache.get(dateParam);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json(cached.data);
    }

    const [y, m, d] = dateParam.split('-').map(Number);
    const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
    const dayEnd   = new Date(y, m - 1, d, 23, 59, 59, 999);

    const rawEvents = listCalendarEvents(dayStart.toISOString(), dayEnd.toISOString());

    const events = (rawEvents || [])
      .filter(ev => ev.start?.dateTime && ev.end?.dateTime)
      .map(ev => ({
        id:       ev.id,
        title:    ev.summary || '(No title)',
        startMs:  new Date(ev.start.dateTime).getTime(),
        endMs:    new Date(ev.end.dateTime).getTime(),
        color:    ev.colorId ? `gcal-${ev.colorId}` : null,
      }))
      .filter(ev => ev.endMs > ev.startMs);

    const data = { events, date: dateParam };
    _cache.set(dateParam, { ts: Date.now(), data });

    return NextResponse.json(data);
  } catch (err) {
    // Calendar may not be configured — return empty gracefully
    return NextResponse.json({ events: [], error: err.message });
  }
}
