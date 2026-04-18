import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
export const dynamic = 'force-dynamic';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const TRACKING_DIR = path.resolve(process.cwd(), '..', '..', 'tracking');
const ROUTINE_FILE = path.join(TRACKING_DIR, 'routine.json');
const PENDING_FILE = path.join(TRACKING_DIR, 'pending.json');

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

/** PUT /api/intentions/:date — save intention narrative, auto-analyze into outline */
export async function PUT(request, { params }) {
  try {
    const { date } = await params;
    const body = await request.json();
    const { morning_intention, goal_allocations } = body;

    // If narrative provided but no explicit allocations, auto-analyze
    let finalAllocations = goal_allocations;
    if (morning_intention && !goal_allocations) {
      finalAllocations = await analyzeIntentions(morning_intention);
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

// ─── Analysis engine ────────────────────────────────────────────────────────

/**
 * Parse narrative into bullets, then match each against the full hierarchy
 * (goals → projects → epics → actions) and routine tasks.
 *
 * Returns: { outline: [...], matched: [...], suggested: [...] }
 */
async function analyzeIntentions(narrative) {
  // 1. Load hierarchy + routines + external tasks in parallel
  const [goalsRes, projectsRes, epicsRes, actionsRes, routines, jiraTickets, googleTasks, pendingTasks] = await Promise.all([
    pool.query("SELECT id, title, description, context FROM goals WHERE status = 'active' ORDER BY sort_order"),
    pool.query("SELECT id, title, goal_id, context, status FROM plans ORDER BY weight DESC NULLS LAST"),
    pool.query("SELECT id, title, project_id, status, description FROM epics ORDER BY sort_order"),
    pool.query("SELECT id, title, epic_id, project_id, status, estimated_minutes FROM actions WHERE status != 'done' ORDER BY sort_order"),
    loadRoutines(),
    fetchJiraTickets(),
    fetchGoogleTasks(),
    loadPendingTasks(),
  ]);

  const goals = goalsRes.rows;
  const projects = projectsRes.rows;
  const epics = epicsRes.rows;
  const actions = actionsRes.rows;

  // Build lookup maps
  const projectsByGoal = groupBy(projects, 'goal_id');
  const epicsByProject = groupBy(epics, 'project_id');
  const actionsByEpic = groupBy(actions, 'epic_id');
  const projectById = Object.fromEntries(projects.map(p => [p.id, p]));
  const epicById = Object.fromEntries(epics.map(e => [e.id, e]));

  // 2. Parse narrative into bullets
  const bullets = parseBullets(narrative);

  // 3. Match each bullet against hierarchy + routines
  const outline = bullets.map(bullet => {
    const lower = bullet.toLowerCase();

    // Try routine match first — routines have short names, so use direct word match
    const routineMatch = routines.find(r => {
      const name = r.title.toLowerCase();
      // Direct word boundary match: "eating" in "eat cleaner" won't work,
      // but we check stems too
      const stem = name.replace(/(ing|tion|s)$/, '');
      return lower.includes(name) || (stem.length >= 4 && lower.includes(stem));
    });

    if (routineMatch) {
      return {
        intention: bullet,
        matchType: 'routine',
        matchTitle: routineMatch.title,
        matchId: routineMatch.id,
        matchContext: routineMatch.activityContext,
        routineTitle: routineMatch.title,
        score: 10,
        actions: ['switch'],
      };
    }

    // Build flat list of all hierarchy items to match against
    const candidates = [];

    for (const action of actions) {
      const epic = epicById[action.epic_id];
      const project = epic ? projectById[epic.project_id] : projectById[action.project_id];
      const goal = project ? goals.find(g => g.id === project.goal_id) : null;
      candidates.push({
        id: action.id,
        text: action.title,
        type: 'action',
        context: project?.context || goal?.context,
        goalId: goal?.id,
        goalTitle: goal?.title,
        projectId: project?.id,
        projectTitle: project?.title,
        epicId: epic?.id,
        epicTitle: epic?.title,
        score: 0,
      });
    }

    for (const epic of epics) {
      const project = projectById[epic.project_id];
      const goal = project ? goals.find(g => g.id === project.goal_id) : null;
      candidates.push({
        id: epic.id,
        text: epic.title + (epic.description ? ' ' + epic.description : ''),
        displayText: epic.title,
        type: 'epic',
        context: project?.context || goal?.context,
        goalId: goal?.id,
        goalTitle: goal?.title,
        projectId: project?.id,
        projectTitle: project?.title,
        score: 0,
      });
    }

    for (const project of projects) {
      const goal = goals.find(g => g.id === project.goal_id);
      candidates.push({
        id: project.id,
        text: project.title,
        type: 'project',
        context: project.context || goal?.context,
        goalId: goal?.id,
        goalTitle: goal?.title,
        score: 0,
      });
    }

    for (const goal of goals) {
      candidates.push({
        id: goal.id,
        text: goal.title + (goal.description ? ' ' + goal.description : ''),
        displayText: goal.title,
        type: 'goal',
        context: goal.context,
        goalId: goal.id,
        goalTitle: goal.title,
        score: 0,
      });
    }

    // Jira tickets
    for (const ticket of jiraTickets) {
      candidates.push({
        id: ticket.key,
        text: `${ticket.key} ${ticket.summary}`,
        displayText: `${ticket.key}: ${ticket.summary}`,
        type: 'jira',
        context: 'cultivo',
        jiraTicket: ticket.key,
        jiraUrl: ticket.url,
        score: 0,
      });
    }

    // Google Tasks
    for (const gt of googleTasks) {
      candidates.push({
        id: gt.id,
        text: gt.title,
        type: 'google-task',
        context: gt.context || null,
        googleTaskId: gt.id,
        googleTaskListId: gt.listId,
        score: 0,
      });
    }

    // Pending tasks already in today's docket
    for (const pt of pendingTasks) {
      candidates.push({
        id: pt.id,
        text: pt.title,
        type: 'pending',
        context: pt.activityContext,
        score: 0,
      });
    }

    // Find best match — prefer most specific
    const match = findBestMatch(lower, candidates);

    if (match && match.score >= 2) {
      const item = match.item;
      const breadcrumb = [item.goalTitle, item.projectTitle, item.epicTitle, item.type === 'action' ? (item.displayText || item.text) : null]
        .filter(Boolean).join(' / ');

      // Determine actions based on match type
      let matchActions = [];
      if (item.type === 'action' || item.type === 'epic') matchActions = ['add', 'start'];
      else if (item.type === 'jira') matchActions = ['add', 'start'];
      else if (item.type === 'google-task') matchActions = ['add'];
      else if (item.type === 'pending') matchActions = ['start'];

      return {
        intention: bullet,
        matchType: item.type,
        matchTitle: item.displayText || item.text,
        matchId: item.id,
        matchContext: item.context,
        goalId: item.goalId,
        goalTitle: item.goalTitle,
        projectId: item.projectId,
        projectTitle: item.projectTitle,
        epicId: item.epicId,
        epicTitle: item.epicTitle,
        jiraTicket: item.jiraTicket,
        jiraUrl: item.jiraUrl,
        breadcrumb: breadcrumb || null,
        score: match.score,
        note: item.type,
        actions: matchActions,
      };
    }

    // No match — still infer context from keywords
    return {
      intention: bullet,
      matchType: 'none',
      matchTitle: null,
      matchId: null,
      matchContext: inferContext(lower),
      score: 0,
      actions: ['add-novel'],
    };
  });

  // Also produce the legacy matched goals list
  const matchedGoalIds = new Set();
  const matched = [];
  for (const item of outline) {
    if (item.goalId && !matchedGoalIds.has(item.goalId)) {
      matchedGoalIds.add(item.goalId);
      const goal = goals.find(g => g.id === item.goalId);
      if (goal) matched.push({ goalId: goal.id, title: goal.title, context: goal.context, score: item.score });
    }
  }

  return { outline, matched, suggested: [] };
}

/**
 * Parse free-form narrative into bullet points.
 * Handles: line breaks, numbered lists, bullet chars, sentence splitting.
 */
function parseBullets(text) {
  // Split on line breaks first
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);

  const bullets = [];
  for (const line of lines) {
    // Strip leading bullet/number markers
    const cleaned = line.replace(/^[\-\*•·>]+\s*/, '').replace(/^\d+[.)]\s*/, '').trim();
    if (!cleaned) continue;

    // If the line is long (likely a paragraph), split on sentences
    if (cleaned.length > 120) {
      const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(s => s.length > 10);
      bullets.push(...sentences.map(s => s.trim()));
    } else {
      bullets.push(cleaned);
    }
  }

  // Deduplicate near-identical bullets
  const unique = [];
  for (const b of bullets) {
    if (!unique.some(u => u.toLowerCase() === b.toLowerCase())) {
      unique.push(b);
    }
  }

  return unique;
}

/**
 * Score-based fuzzy matching. Returns best match or null.
 */
// Words too common to be meaningful for matching
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her',
  'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its',
  'may', 'new', 'now', 'old', 'see', 'way', 'who', 'did', 'let', 'say', 'she',
  'too', 'use', 'will', 'with', 'this', 'that', 'have', 'from', 'they', 'been',
  'some', 'than', 'them', 'then', 'when', 'what', 'your', 'more', 'make', 'like',
  'just', 'over', 'also', 'back', 'into', 'year', 'much', 'most', 'very', 'after',
  'know', 'take', 'come', 'could', 'would', 'about', 'going', 'being', 'want',
  'need', 'keep', 'look', 'feel', 'think', 'work', 'time', 'today', 'week',
  'start', 'doing', 'done', 'good', 'well', 'here', 'there', 'where', 'things',
  'thing', 'really', 'still', 'plan', 'should', 'might', 'each', 'through',
  'believe', 'remember', 'focused', 'focus', 'train', 'training', 'light',
  'less', 'explore', 'ways', 'creating', 'create', 'build', 'update', 'finish',
  'hope', 'diligent', 'careful', 'mostly', 'afternoon', 'morning', 'evening',
  'hour', 'bit', 'level', 'myself', 'almost', 'perhaps', 'working',
]);

function significantWords(text) {
  return text.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !STOP_WORDS.has(w));
}

function findBestMatch(query, candidates) {
  const queryWords = significantWords(query);
  if (queryWords.length === 0) return null;

  let best = null;
  let bestScore = 0;

  const TYPE_PRIORITY = { action: 4, jira: 4, pending: 4, 'google-task': 3, epic: 3, project: 2, goal: 1, routine: 3 };

  for (const item of candidates) {
    const itemLower = item.text.toLowerCase();
    const itemWords = significantWords(item.text);
    if (itemWords.length === 0) continue;

    // Forward: what fraction of item's significant words appear in query
    const fwdHits = itemWords.filter(w => query.toLowerCase().includes(w));
    const fwdRatio = fwdHits.length / itemWords.length;

    // Reverse: what fraction of query's significant words appear in item
    const revHits = queryWords.filter(w => itemLower.includes(w));
    const revRatio = revHits.length / queryWords.length;

    // Require at least 40% of the item's words to match AND at least 1 hit each way
    if (fwdHits.length === 0 || revHits.length === 0) continue;
    if (fwdRatio < 0.4 && fwdHits.length < 3) continue;

    // Score: geometric mean of ratios * hit count (rewards both coverage and volume)
    let score = Math.sqrt(fwdRatio * revRatio) * (fwdHits.length + revHits.length);

    // Big bonus for multi-word substring match (e.g. "trading app" in query)
    const itemSignificant = itemWords.join(' ');
    if (itemSignificant.length > 5 && query.toLowerCase().includes(itemSignificant)) score += 5;

    // Tie-break: prefer more specific types
    const priority = TYPE_PRIORITY[item.type] || 0;
    const effective = score + (priority * 0.1);

    // Minimum score threshold — must be a strong match
    if (score >= 1.5 && effective > bestScore) {
      bestScore = effective;
      best = { item, score };
    }
  }

  return best;
}

/**
 * Keyword-based context inference — same logic as the CLI's detectContext.
 * Returns a context code or null if nothing clear matches.
 */
function inferContext(lower) {
  if (/health|healthcare|doctor|dentist|medical|sick|gym|workout|exercise|therapy|physio|medication|vitamins|supplement|stretch|yoga|running|clinic|checkup|wellness|insurance|prescription|hospital|pain|injury/.test(lower)) return 'health';
  if (/sleep|sleeping|rest|nap|bedtime|tired|wake/.test(lower)) return 'health';
  if (/trading|trade|futures|stocks|crypto|btx|saas|side project|freelance|consulting|startup|investment|portfolio|product/.test(lower)) return 'projects';
  if (/cultivo|pull request|deploy|sprint|jira|tsp-|merge|refactor|implement|feature|bug fix/.test(lower)) return 'cultivo';
  if (/meeting|interview|career|resume|presentation|conference|networking/.test(lower)) return 'professional';
  if (/friends|dinner|coffee|hangout|party|social|drinks|catch up|gathering/.test(lower)) return 'social';
  if (/learn|study|course|tutorial|lecture|reading|research|book|documentation|workshop|class/.test(lower)) return 'learning';
  if (/family|home|errand|grocery|bank|birthday|personal|vacation|car/.test(lower)) return 'personal';
  if (/relax|leisure|free time|tv|movie|gaming|browse|youtube|scroll|netflix|chill/.test(lower)) return 'unstructured';
  return null;
}

function loadRoutines() {
  try {
    const data = fs.readFileSync(ROUTINE_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function loadPendingTasks() {
  try {
    const data = fs.readFileSync(PENDING_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function getGoogleAccessToken() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) return null;
  try {
    const res = execSync(
      `curl -s -X POST https://oauth2.googleapis.com/token ` +
      `-d client_id="${GOOGLE_CLIENT_ID}" ` +
      `-d client_secret="${GOOGLE_CLIENT_SECRET}" ` +
      `-d refresh_token="${GOOGLE_REFRESH_TOKEN}" ` +
      `-d grant_type=refresh_token`,
      { encoding: 'utf8', timeout: 5000 }
    );
    return JSON.parse(res).access_token || null;
  } catch {
    return null;
  }
}

async function fetchGoogleTasks() {
  try {
    const token = getGoogleAccessToken();
    if (!token) return [];

    const listsData = JSON.parse(execSync(
      `curl -s -H "Authorization: Bearer ${token}" "https://www.googleapis.com/tasks/v1/users/@me/lists"`,
      { encoding: 'utf8', timeout: 5000 }
    ));

    const tasks = [];
    for (const list of (listsData.items || [])) {
      try {
        const tasksData = JSON.parse(execSync(
          `curl -s -H "Authorization: Bearer ${token}" ` +
          `"https://www.googleapis.com/tasks/v1/lists/${list.id}/tasks?showCompleted=false&showHidden=false&maxResults=50"`,
          { encoding: 'utf8', timeout: 5000 }
        ));
        for (const t of (tasksData.items || [])) {
          if (t.title && t.status !== 'completed') {
            tasks.push({ id: t.id, title: t.title, listId: list.id, listTitle: list.title });
          }
        }
      } catch { /* skip list on error */ }
    }
    return tasks;
  } catch {
    return [];
  }
}

async function fetchJiraTickets() {
  try {
    const email = process.env.ATLASSIAN_EMAIL;
    const token = process.env.ATLASSIAN_API_TOKEN;
    const domain = process.env.ATLASSIAN_DOMAIN || 'cultivo.atlassian.net';
    if (!email || !token) return [];

    const creds = `${email}:${token}`;
    const url = `https://${domain}/rest/api/3/search/jql`;
    const payload = JSON.stringify({
      jql: 'assignee=currentUser() AND status in (Ready, "In Progress") ORDER BY updated DESC',
      maxResults: 30,
      fields: ['summary', 'status']
    });

    const res = execSync(
      `curl -s -u "${creds}" -H "Content-Type: application/json" --data '${payload}' "${url}"`,
      { encoding: 'utf8', timeout: 10000 }
    );
    const data = JSON.parse(res);

    return (data.issues || []).map(i => ({
      key: i.key,
      summary: i.fields.summary,
      status: i.fields.status?.name,
      url: `https://${domain}/browse/${i.key}`,
    }));
  } catch {
    return [];
  }
}

function groupBy(arr, key) {
  const map = {};
  for (const item of arr) {
    const k = item[key];
    if (!k) continue;
    if (!map[k]) map[k] = [];
    map[k].push(item);
  }
  return map;
}
