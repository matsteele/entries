const express = require('express');
const next = require('next');
const path = require('path');
const { execSync } = require('child_process');

// Load .env from project root
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const store = require('../backend/task-store');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev, dir: __dirname });
const handle = app.getRequestHandler();

// ─── Google Tasks helpers ─────────────────────────────────────────────────────

function getGoogleAccessToken() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) return null;

  const tokenResponse = execSync(
    `curl -s -X POST https://oauth2.googleapis.com/token ` +
    `-d client_id="${GOOGLE_CLIENT_ID}" ` +
    `-d client_secret="${GOOGLE_CLIENT_SECRET}" ` +
    `-d refresh_token="${GOOGLE_REFRESH_TOKEN}" ` +
    `-d grant_type=refresh_token`,
    { encoding: 'utf8' }
  );
  const tokenData = JSON.parse(tokenResponse);
  return tokenData.access_token || null;
}

function fetchGoogleTasks(accessToken) {
  const listsResponse = execSync(
    `curl -s -H "Authorization: Bearer ${accessToken}" ` +
    `"https://www.googleapis.com/tasks/v1/users/@me/lists"`,
    { encoding: 'utf8' }
  );
  const listsData = JSON.parse(listsResponse);
  if (!listsData.items) return [];

  const results = [];
  for (const list of listsData.items) {
    const tasksResponse = execSync(
      `curl -s -H "Authorization: Bearer ${accessToken}" ` +
      `"https://www.googleapis.com/tasks/v1/lists/${list.id}/tasks?showCompleted=false&showHidden=false&maxResults=100"`,
      { encoding: 'utf8' }
    );
    const tasksData = JSON.parse(tasksResponse);
    if (!tasksData.items) continue;

    for (const task of tasksData.items) {
      if (task.status === 'completed') continue;
      results.push({
        id: task.id,
        title: task.title,
        notes: task.notes || null,
        due: task.due || null,
        updated: task.updated,
        listId: list.id,
        listName: list.title,
        status: task.status,
      });
    }
  }
  return results;
}

// ─── Jira helpers ─────────────────────────────────────────────────────────────

function fetchJiraTickets() {
  const { ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN, ATLASSIAN_DOMAIN } = process.env;
  const domain = ATLASSIAN_DOMAIN || 'cultivo.atlassian.net';

  if (!ATLASSIAN_EMAIL || !ATLASSIAN_API_TOKEN) return null;

  const jqlPayload = JSON.stringify({
    jql: 'assignee=currentUser() AND status in (Ready, "In Progress", Untriaged, "In Review") ORDER BY updated DESC',
    maxResults: 50,
    fields: ['summary', 'status', 'priority', 'issuetype', 'updated', 'assignee']
  });

  const response = execSync(
    `curl -s -u "${ATLASSIAN_EMAIL}:${ATLASSIAN_API_TOKEN}" ` +
    `-H "Content-Type: application/json" ` +
    `--data '${jqlPayload}' ` +
    `"https://${domain}/rest/api/3/search/jql"`,
    { encoding: 'utf8' }
  );
  const data = JSON.parse(response);
  if (!data.issues) return [];

  return data.issues.map(issue => ({
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status?.name,
    priority: issue.fields.priority?.name,
    type: issue.fields.issuetype?.name,
    updated: issue.fields.updated,
    url: `https://${domain}/browse/${issue.key}`,
  }));
}

// ─── Cache for feed data ──────────────────────────────────────────────────────

const feedCache = {
  googleTasks: { data: null, fetchedAt: 0 },
  jira: { data: null, fetchedAt: 0 },
};
const CACHE_TTL = 60000; // 1 minute

app.prepare().then(() => {
  const server = express();
  server.use(express.json());

  // ─── Task endpoints ───────────────────────────────────────────────────────

  server.get('/api/tasks/current', (req, res) => {
    try {
      const current = store.loadCurrent();
      if (current.task && current.task.startedAt) {
        current.task.elapsedMinutes = store.calculateElapsedMinutes(current.task);
      }
      res.json(current);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  server.get('/api/tasks/pending', (req, res) => {
    try { res.json(store.loadPending()); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });

  server.get('/api/tasks/routine', (req, res) => {
    try { res.json(store.loadRoutine()); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });

  server.get('/api/tasks/completed', (req, res) => {
    try { res.json(store.loadCompleted()); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });

  server.get('/api/tasks/all', (req, res) => {
    try {
      const current = store.loadCurrent();
      const pending = store.loadPending();
      const routine = store.loadRoutine();
      const completed = store.loadCompleted();

      if (current.task && current.task.startedAt) {
        current.task.elapsedMinutes = store.calculateElapsedMinutes(current.task);
      }

      res.json({ current, pending, routine, completed });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─── Time endpoints ───────────────────────────────────────────────────────

  server.get('/api/time/sums', (req, res) => {
    try {
      const sums = store.calculateContextSums();
      const budget = store.getTimeBudgetBalance();
      res.json({ sums, budget });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  server.get('/api/time/sessions/today', (req, res) => {
    try { res.json(store.getTodaySessions()); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });

  server.get('/api/focus/today', (req, res) => {
    try {
      const sessions = store.getTodaySessions();
      const now = new Date();

      // Midnight local time as ms
      const midnightMs = store.getMidnightToday().getTime();
      const nowMs = now.getTime();

      // Sort sessions by startedAt
      const sorted = sessions
        .map(s => ({
          startMs: Math.max(new Date(s.session.startedAt).getTime(), midnightMs),
          endMs: Math.min(new Date(s.session.endedAt).getTime(), nowMs),
          focusLevel: s.focusLevel,
          taskTitle: s.taskTitle,
          activityContext: s.activityContext,
          isGap: false,
        }))
        .filter(s => s.endMs > s.startMs)
        .sort((a, b) => a.startMs - b.startMs);

      // Build timeline with gaps
      const timeline = [];
      let cursor = midnightMs;

      for (const seg of sorted) {
        if (seg.startMs > cursor + 60000) {
          // Gap > 1 min
          timeline.push({ startMs: cursor, endMs: seg.startMs, focusLevel: 0, taskTitle: null, activityContext: null, isGap: true });
        }
        timeline.push(seg);
        cursor = Math.max(cursor, seg.endMs);
      }
      // Trailing gap
      if (cursor < nowMs - 60000) {
        timeline.push({ startMs: cursor, endMs: nowMs, focusLevel: 0, taskTitle: null, activityContext: null, isGap: true });
      }

      // Summary stats — merge overlapping intervals for wall-clock tracked time
      const merged = [];
      for (const s of sorted) {
        if (merged.length && s.startMs <= merged[merged.length - 1].endMs) {
          merged[merged.length - 1].endMs = Math.max(merged[merged.length - 1].endMs, s.endMs);
        } else {
          merged.push({ startMs: s.startMs, endMs: s.endMs });
        }
      }
      const trackedMs = merged.reduce((acc, s) => acc + (s.endMs - s.startMs), 0);
      const totalMs = nowMs - midnightMs;
      const pctTracked = totalMs > 0 ? Math.round((trackedMs / totalMs) * 100) : 0;

      const trackedFocusSum = sorted.reduce((acc, s) => acc + s.focusLevel * (s.endMs - s.startMs), 0);
      const avgFocus = trackedMs > 0 ? Math.round((trackedFocusSum / trackedMs) * 10) / 10 : 0;

      const weightedFocusSum = sorted.reduce((acc, s) => acc + s.focusLevel * (s.endMs - s.startMs), 0);
      const weightedAvg = totalMs > 0 ? Math.round((weightedFocusSum / totalMs) * 10) / 10 : 0;

      // Peak sustained streak at >= F:3 (in minutes)
      let peakStreakMs = 0;
      let currentStreakMs = 0;
      for (const seg of timeline) {
        if (!seg.isGap && seg.focusLevel >= 3) {
          currentStreakMs += seg.endMs - seg.startMs;
          peakStreakMs = Math.max(peakStreakMs, currentStreakMs);
        } else {
          currentStreakMs = 0;
        }
      }

      res.json({
        dayStartMs: midnightMs,
        nowMs,
        timeline,
        summary: {
          avgFocus,
          weightedAvg,
          pctTracked,
          peakStreakMins: Math.round(peakStreakMs / 60000),
        },
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─── Feed endpoints ───────────────────────────────────────────────────────

  server.get('/api/feeds/google-tasks', (req, res) => {
    try {
      const now = Date.now();
      const force = req.query.refresh === 'true';

      if (!force && feedCache.googleTasks.data && (now - feedCache.googleTasks.fetchedAt) < CACHE_TTL) {
        return res.json(feedCache.googleTasks.data);
      }

      const accessToken = getGoogleAccessToken();
      if (!accessToken) {
        return res.json({ error: 'Google credentials not configured', tasks: [] });
      }

      const tasks = fetchGoogleTasks(accessToken);
      feedCache.googleTasks = { data: { tasks }, fetchedAt: now };
      res.json({ tasks });
    } catch (error) {
      res.status(500).json({ error: error.message, tasks: [] });
    }
  });

  server.get('/api/feeds/jira', (req, res) => {
    try {
      const now = Date.now();
      const force = req.query.refresh === 'true';

      if (!force && feedCache.jira.data && (now - feedCache.jira.fetchedAt) < CACHE_TTL) {
        return res.json(feedCache.jira.data);
      }

      const tickets = fetchJiraTickets();
      if (tickets === null) {
        return res.json({ error: 'Jira credentials not configured', tickets: [] });
      }

      feedCache.jira = { data: { tickets }, fetchedAt: now };
      res.json({ tickets });
    } catch (error) {
      res.status(500).json({ error: error.message, tickets: [] });
    }
  });

  // ─── Metadata endpoints ───────────────────────────────────────────────────

  server.get('/api/contexts', (req, res) => {
    res.json({
      contexts: store.ALL_CONTEXTS,
      order: store.CONTEXT_ORDER,
      emojis: store.CONTEXT_EMOJI_MAP,
    });
  });

  server.get('/api/stats/today', (req, res) => {
    try {
      const current = store.loadCurrent();
      const completedCount = store.getCompletedTodayCount();
      const pendingCount = store.loadPending().length;
      const sums = store.calculateContextSums();
      const budget = store.getTimeBudgetBalance();

      res.json({
        completedCount,
        pendingCount,
        contextSums: sums,
        budget,
        hasActiveTask: !!(current.task && current.task.startedAt),
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  server.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ─── Next.js handles everything else ──────────────────────────────────────

  server.all('*', (req, res) => handle(req, res));

  server.listen(7777, () => {
    console.log('> Entries Dashboard ready on http://localhost:7777');
  });
});
