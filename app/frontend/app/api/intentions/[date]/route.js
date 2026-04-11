import { NextResponse } from 'next/server';
import { Pool } from 'pg';
export const dynamic = 'force-dynamic';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** GET /api/intentions/:date — load daily intention + matched goals */
export async function GET(request, { params }) {
  try {
    const { date } = await params;
    const { rows } = await pool.query(
      'SELECT * FROM daily_intentions WHERE date = $1', [date]
    );
    if (rows.length === 0) return NextResponse.json(null);
    return NextResponse.json(rows[0]);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** PUT /api/intentions/:date — save intention narrative, match goals */
export async function PUT(request, { params }) {
  try {
    const { date } = await params;
    const body = await request.json();
    const { morning_intention, goal_allocations } = body;

    // If narrative provided but no goal_allocations, auto-match against existing goals
    let finalAllocations = goal_allocations;
    if (morning_intention && !goal_allocations) {
      const { rows: goals } = await pool.query(
        "SELECT id, title, description, context FROM goals WHERE status = 'active'"
      );
      finalAllocations = matchGoals(morning_intention, goals);
    }

    const { rows } = await pool.query(
      `INSERT INTO daily_intentions (id, date, morning_intention, goal_allocations)
       VALUES (gen_random_uuid()::text, $1, $2, $3)
       ON CONFLICT (date) DO UPDATE SET
         morning_intention = COALESCE(EXCLUDED.morning_intention, daily_intentions.morning_intention),
         goal_allocations = COALESCE(EXCLUDED.goal_allocations, daily_intentions.goal_allocations),
         updated_at = NOW()
       RETURNING *`,
      [date, morning_intention || null, finalAllocations ? JSON.stringify(finalAllocations) : null]
    );

    return NextResponse.json(rows[0]);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Match narrative text against existing goals using keyword overlap.
 * Returns { matched: [...], suggested: [...] }
 */
function matchGoals(narrative, goals) {
  const lower = narrative.toLowerCase();
  const words = lower.split(/\W+/).filter(w => w.length > 3);

  const matched = [];
  for (const goal of goals) {
    const titleWords = (goal.title || '').toLowerCase().split(/\W+/).filter(w => w.length > 3);
    const descWords = (goal.description || '').toLowerCase().split(/\W+/).filter(w => w.length > 3);
    const goalWords = [...new Set([...titleWords, ...descWords])];

    // Score: how many goal keywords appear in the narrative
    const hits = goalWords.filter(w => lower.includes(w));
    // Also check if any narrative words appear in goal title
    const reverseHits = words.filter(w => (goal.title || '').toLowerCase().includes(w));

    const score = hits.length + reverseHits.length;
    if (score >= 2 || (goal.title.length < 20 && score >= 1)) {
      matched.push({
        goalId: goal.id,
        title: goal.title,
        context: goal.context,
        score,
      });
    }
  }

  matched.sort((a, b) => b.score - a.score);

  // Extract potential new goals from phrases that don't match existing ones
  const suggested = extractSuggestions(narrative, matched.map(m => m.title));

  return { matched, suggested };
}

/**
 * Extract potential goal suggestions from narrative text.
 * Looks for intention-like phrases not covered by matched goals.
 */
function extractSuggestions(narrative, matchedTitles) {
  const suggestions = [];
  // Split on sentence boundaries
  const sentences = narrative.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 10);

  // Look for sentences with intent markers
  const intentMarkers = [
    'want to', 'need to', 'plan to', 'going to', 'will', 'should',
    'focus on', 'work on', 'start', 'finish', 'complete', 'build',
    'learn', 'improve', 'develop', 'create', 'launch', 'ship',
  ];

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    const hasIntent = intentMarkers.some(m => lower.includes(m));
    if (!hasIntent) continue;

    // Skip if this sentence likely matches an existing goal
    const alreadyMatched = matchedTitles.some(t =>
      t.toLowerCase().split(/\W+/).filter(w => w.length > 3).some(w => lower.includes(w))
    );
    if (alreadyMatched) continue;

    suggestions.push(sentence.length > 80 ? sentence.slice(0, 77) + '...' : sentence);
  }

  return suggestions.slice(0, 5);
}
