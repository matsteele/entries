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
 * GET /api/calendar?date=YYYY-MM-DD&tz=IANA/Timezone
 * Returns Google Calendar events for the given date as an overlay for FocusTimeline.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const tz = searchParams.get('tz') || 'America/New_York';
    if (!dateParam) {
      return NextResponse.json({ error: 'date param required' }, { status: 400 });
    }

    const cached = _cache.get(dateParam);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json(cached.data);
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      return NextResponse.json({ events: [], date: dateParam });
    }

    // Calculate day boundaries in user's timezone
    // dateParam is YYYY-MM-DD, we need midnight-to-midnight in that timezone
    const [year, month, day] = dateParam.split('-').map(Number);
    // Create a UTC date at noon on the target day (to avoid date shifting)
    const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

    // Use formatter to get what time that noon is in the user's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      timeZone: tz,
    });
    const parts = formatter.formatToParts(noonUtc);
    const tzParts = {};
    parts.forEach(p => { tzParts[p.type] = p.value; });

    // Calculate the offset: how many hours ahead is this timezone from UTC?
    // If noon UTC shows as 8am in the timezone, the timezone is UTC-4
    const tzHour = parseInt(tzParts.hour);
    const offset = tzHour - 12;

    // So midnight in the user's timezone is offset hours before midnight UTC
    const dayStartUtc = new Date(Date.UTC(year, month - 1, day, -offset, 0, 0));
    const dayEndUtc = new Date(Date.UTC(year, month - 1, day + 1, -offset, 0, 0));

    const dayStart = dayStartUtc.toISOString();
    const dayEnd = dayEndUtc.toISOString();

    // Fetch from both personal and work calendars
    const calendarIds = ['primary', 'matthew.steele@cultivo.land'];
    const allEvents = [];

    for (const calendarId of calendarIds) {
      try {
        const params = new URLSearchParams({ timeMin: dayStart, timeMax: dayEnd, singleEvents: 'true', maxResults: '500', orderBy: 'startTime' });
        const gcalRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const gcalData = await gcalRes.json();
        if (gcalData.items) {
          allEvents.push(...gcalData.items);
        }
      } catch (e) {
        // Continue if one calendar fails
      }
    }

    const events = allEvents
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
