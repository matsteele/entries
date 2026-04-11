/**
 * Google Calendar integration for time tracking.
 * Pushes completed task blocks as calendar events.
 */

const { execSync } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const CONTEXT_EMOJI_MAP = {
  personal: '🏠',
  social: '👥',
  professional: '💼',
  cultivo: '🌱',
  projects: '🚀',
  health: '💪',
  learning: '📚',
  unstructured: '☀️'
};

// Google Calendar color IDs (1-11)
const CONTEXT_COLOR_MAP = {
  cultivo: '2',       // Sage (green)
  professional: '9',  // Blueberry (blue)
  personal: '5',      // Banana (yellow)
  social: '3',        // Grape (purple)
  projects: '6',      // Tangerine (orange)
  health: '10',       // Basil (dark green)
  learning: '4',      // Flamingo (pink)
  unstructured: '8'   // Graphite (gray)
};

/**
 * Exchange the calendar refresh token for an access token.
 * Returns the access token string, or null on failure.
 */
function getCalendarAccessToken() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  try {
    const tokenResponse = execSync(
      `curl -s -X POST https://oauth2.googleapis.com/token ` +
      `-d client_id="${clientId}" ` +
      `-d client_secret="${clientSecret}" ` +
      `-d refresh_token="${refreshToken}" ` +
      `-d grant_type=refresh_token`,
      { encoding: 'utf8' }
    );
    const tokenData = JSON.parse(tokenResponse);
    return tokenData.access_token || null;
  } catch (e) {
    return null;
  }
}

/**
 * Push a completed task entry to Google Calendar.
 *
 * @param {Object} completedEntry - The completedWork entry from daily log
 * @param {string} completedEntry.title - Task title
 * @param {string} completedEntry.activityContext - Context (cultivo, personal, etc.)
 * @param {number} completedEntry.timeSpent - Time spent in minutes
 * @param {Object} completedEntry.details - Details with startedAt/completedAt
 * @returns {string|null} Google Calendar event ID, or null on failure
 */
function createCalendarEvent(completedEntry) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) return null;

  const accessToken = getCalendarAccessToken();
  if (!accessToken) return null;

  try {
    const context = completedEntry.activityContext || 'professional';
    const emoji = CONTEXT_EMOJI_MAP[context] || '💼';
    const colorId = CONTEXT_COLOR_MAP[context] || '9';

    // Use actual session timestamps to avoid overlapping events.
    // startedAt/completedAt reflect the real wall-clock session, not accumulated time.
    let startTime, endTime;
    const completedAt = completedEntry.details?.completedAt || completedEntry.timestamp;
    const startedAt = completedEntry.details?.startedAt;

    if (startedAt) {
      // Current task completion — use actual session window
      startTime = startedAt;
      endTime = completedAt;
    } else if (completedEntry.timeSpent > 0) {
      // Pending task completed (no active session) — compute block from timeSpent
      const endDate = new Date(completedAt);
      const startDate = new Date(endDate.getTime() - (completedEntry.timeSpent * 60000));
      startTime = startDate.toISOString();
      endTime = completedAt;
    } else {
      // No meaningful time block to create
      return null;
    }

    // Build description
    const parts = [];
    if (completedEntry.category && completedEntry.category !== 'General') {
      parts.push(`Category: ${completedEntry.category}`);
    }
    parts.push(`Context: ${context}`);
    parts.push(`Time: ${completedEntry.timeSpent}m`);
    if (completedEntry.details?.notes?.length > 0) {
      parts.push(`Notes: ${completedEntry.details.notes.join(', ')}`);
    }
    const description = parts.join('\\n');

    const event = {
      summary: `${emoji} ${completedEntry.title}`,
      description: description,
      start: { dateTime: startTime },
      end: { dateTime: endTime },
      colorId: colorId
    };

    const eventJson = JSON.stringify(event);

    const response = execSync(
      `curl -s -X POST "https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events" ` +
      `-H "Authorization: Bearer ${accessToken}" ` +
      `-H "Content-Type: application/json" ` +
      `-d '${eventJson.replace(/'/g, "'\\''")}'`,
      { encoding: 'utf8' }
    );

    const result = JSON.parse(response);
    if (result.id) {
      return result.id;
    }
    if (result.error) {
      console.error(`   ⚠️  Calendar sync failed: ${result.error.message}`);
    }
    return null;
  } catch (e) {
    console.error(`   ⚠️  Calendar sync error: ${e.message}`);
    return null;
  }
}

/**
 * Create a new Google Calendar for time tracking.
 * @returns {string|null} Calendar ID, or null on failure
 */
function createTimeTrackingCalendar() {
  const accessToken = getCalendarAccessToken();
  if (!accessToken) {
    console.error('❌ Could not get access token. Run setup-gcal first.');
    return null;
  }

  try {
    const calendarData = JSON.stringify({
      summary: 'Time Tracking',
      description: 'Auto-synced from daily task tracker',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });

    const response = execSync(
      `curl -s -X POST "https://www.googleapis.com/calendar/v3/calendars" ` +
      `-H "Authorization: Bearer ${accessToken}" ` +
      `-H "Content-Type: application/json" ` +
      `-d '${calendarData.replace(/'/g, "'\\''")}'`,
      { encoding: 'utf8' }
    );

    const result = JSON.parse(response);
    if (result.id) {
      return result.id;
    }
    if (result.error) {
      console.error(`❌ Failed to create calendar: ${result.error.message}`);
    }
    return null;
  } catch (e) {
    console.error(`❌ Calendar creation error: ${e.message}`);
    return null;
  }
}

/**
 * List events from the Time Tracking calendar for a date range.
 * @param {string} timeMin - ISO datetime for range start
 * @param {string} timeMax - ISO datetime for range end
 * @returns {Array} Array of Google Calendar event objects, or empty array
 */
function listCalendarEvents(timeMin, timeMax) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) return [];

  const accessToken = getCalendarAccessToken();
  if (!accessToken) return [];

  try {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      maxResults: '500',
      orderBy: 'startTime'
    });

    const response = execSync(
      `curl -s "https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}" ` +
      `-H "Authorization: Bearer ${accessToken}"`,
      { encoding: 'utf8' }
    );

    const result = JSON.parse(response);
    return result.items || [];
  } catch (e) {
    return [];
  }
}

/**
 * Update an existing calendar event's times.
 * @param {string} eventId - Google Calendar event ID
 * @param {Object} updates - { startTime, endTime } as ISO strings
 * @returns {boolean} true on success
 */
function updateCalendarEvent(eventId, updates) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId || !eventId) return false;

  const accessToken = getCalendarAccessToken();
  if (!accessToken) return false;

  try {
    const patchData = {};
    if (updates.startTime) patchData.start = { dateTime: updates.startTime };
    if (updates.endTime) patchData.end = { dateTime: updates.endTime };
    if (updates.summary) patchData.summary = updates.summary;
    if (updates.colorId) patchData.colorId = updates.colorId;

    const patchJson = JSON.stringify(patchData);

    const response = execSync(
      `curl -s -X PATCH "https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}" ` +
      `-H "Authorization: Bearer ${accessToken}" ` +
      `-H "Content-Type: application/json" ` +
      `-d '${patchJson.replace(/'/g, "'\\''")}'`,
      { encoding: 'utf8' }
    );

    const result = JSON.parse(response);
    return !!result.id;
  } catch (e) {
    return false;
  }
}

/**
 * Delete a calendar event.
 * @param {string} eventId - Google Calendar event ID
 * @returns {boolean} true on success
 */
function deleteCalendarEvent(eventId) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId || !eventId) return false;

  const accessToken = getCalendarAccessToken();
  if (!accessToken) return false;

  try {
    execSync(
      `curl -s -X DELETE "https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}" ` +
      `-H "Authorization: Bearer ${accessToken}"`,
      { encoding: 'utf8' }
    );
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  getCalendarAccessToken,
  createCalendarEvent,
  createTimeTrackingCalendar,
  listCalendarEvents,
  updateCalendarEvent,
  deleteCalendarEvent,
  CONTEXT_COLOR_MAP,
  CONTEXT_EMOJI_MAP
};
