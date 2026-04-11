import path from 'path';
import { readFileSync, existsSync } from 'fs';

export const dynamic = 'force-dynamic';

const BASE_DIR = process.env.ENTRIES_BASE_DIR || '/Users/matthewsteele/projects/currentProjects/entries';
const WORKOUT_FILE = path.join(BASE_DIR, 'tracking', 'workout-log.json');
const TO_EMAIL = 'matsteele@gmail.com';

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  return data.access_token;
}

function buildEmailBody(program, movements) {
  const strengthDetails = program.strength.map(key => {
    const m = movements[key];
    if (!m) return `  • ${key}`;
    const last = m.logs[m.logs.length - 1];
    const lastStr = last ? ` (last: ${last.weight}lbs × ${last.reps} reps × ${last.sets} sets on ${last.date})` : ' (no history)';
    return `  • ${m.name}${lastStr}`;
  }).join('\n');

  return `Today's Workout — ${program.day}, ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
Focus: ${program.focus}

⏱ Warmup (8m)
  ${program.warmup}

🎯 Skill (6m)
  ${program.skill}

💪 WoD (15m)
  ${program.wod.name}: ${program.wod.description}

🔥 WoD 2 (15m)
  ${program.wod2.name}: ${program.wod2.description}

🏋️ Strength (12m)
${strengthDetails}

✅ Cash Out
  • ${program.cashout[0]}
  • ${program.cashout[1]}
`;
}

export async function POST(request) {
  const { program, movements } = await request.json();

  const body = buildEmailBody(program, movements);
  const subject = `Workout — ${program.day} ${program.focus} Day`;

  // Build RFC 2822 message
  const message = [
    `To: ${TO_EMAIL}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n');

  const encoded = Buffer.from(message).toString('base64url');

  try {
    const token = await getAccessToken();
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: encoded }),
    });

    if (!res.ok) {
      const err = await res.json();
      // If Gmail scope missing, return helpful error
      return Response.json({ error: err.error?.message || 'Gmail send failed', detail: err }, { status: 400 });
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
