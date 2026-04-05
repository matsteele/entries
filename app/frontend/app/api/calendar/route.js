import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

// Simple in-memory cache per date (60s TTL)
const _cache = new Map();
const CACHE_TTL = 60000;

async function getAccessToken() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALENDAR_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_CALENDAR_REFRESH_TOKEN) return null;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_CALENDAR_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  return data.access_token || null;
}

/**
 * GET /api/calendar?date=YYYY-MM-DD
 * Returns Google Calendar events for the given date as an overlay for FocusTimeline.
 */
export async function GET(request) {
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

    const calendarId = process.env.GOOGLE_CALENDAR_ID;
    if (!calendarId) {
      return NextResponse.json({ events: [], date: dateParam });
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      return NextResponse.json({ events: [], date: dateParam });
    }

    const [y, m, d] = dateParam.split('-').map(Number);
    const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
    const dayEnd   = new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();

    const params = new URLSearchParams({ timeMin: dayStart, timeMax: dayEnd, singleEvents: 'true', maxResults: '500', orderBy: 'startTime' });
    const gcalRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const gcalData = await gcalRes.json();

    const events = (gcalData.items || [])
      .filter(ev => ev.start?.dateTime && ev.end?.dateTime)
      .map(ev => ({
        id:      ev.id,
        title:   ev.summary || '(No title)',
        startMs: new Date(ev.start.dateTime).getTime(),
        endMs:   new Date(ev.end.dateTime).getTime(),
        color:   ev.colorId ? `gcal-${ev.colorId}` : null,
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
