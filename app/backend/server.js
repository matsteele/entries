/**
 * Express API for Entries Dashboard
 * Reads from split-file task store and provides REST endpoints for the frontend.
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const store = require('./task-store');

// ─── State tracking helpers ──────────────────────────────────────────────────

const STATES_DIR = path.join(__dirname, '../../tracking/states');

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function loadStateFile(dateStr) {
  const p = path.join(STATES_DIR, `${dateStr}.json`);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function computeStateDefaults(excludeDate, days = 14) {
  const sums = { focused: {}, stressed: {}, energy: {} };
  const counts = { focused: {}, stressed: {}, energy: {} };
  const today = new Date();
  for (let i = 1; i <= days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = localDateStr(d);
    if (ds === excludeDate) continue;
    const data = loadStateFile(ds);
    if (!data) continue;
    for (const metric of ['focused', 'stressed', 'energy']) {
      for (const [h, v] of Object.entries(data[metric] || {})) {
        sums[metric][h] = (sums[metric][h] || 0) + v;
        counts[metric][h] = (counts[metric][h] || 0) + 1;
      }
    }
  }
  const defaults = { focused: {}, stressed: {}, energy: {} };
  for (const metric of ['focused', 'stressed', 'energy']) {
    for (const h of Object.keys(sums[metric])) {
      defaults[metric][h] = Math.round(sums[metric][h] / counts[metric][h]);
    }
  }
  return defaults;
}

const app = express();
const PORT = 5002;

app.use(cors());
app.use(express.json());

// ─── Task endpoints ─────────────────────────────────────────────────────────

/** Current task + context sums + view state */
app.get('/api/tasks/current', (req, res) => {
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

/** Pending (novel) tasks */
app.get('/api/tasks/pending', (req, res) => {
  try {
    res.json(store.loadPending());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Routine tasks */
app.get('/api/tasks/routine', (req, res) => {
  try {
    res.json(store.loadRoutine());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Completed tasks */
app.get('/api/tasks/completed', (req, res) => {
  try {
    res.json(store.loadCompleted());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** All tasks combined for dashboard view */
app.get('/api/tasks/all', (req, res) => {
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

// ─── Time endpoints ─────────────────────────────────────────────────────────

/** Live context sums for today/week/month */
app.get('/api/time/sums', (req, res) => {
  try {
    const sums = store.calculateContextSums();
    const budget = store.getTimeBudgetBalance();
    res.json({ sums, budget });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Today's sessions for timeline view */
app.get('/api/time/sessions/today', (req, res) => {
  try {
    const sessions = store.getTodaySessions();
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Metadata endpoints ─────────────────────────────────────────────────────

/** Context definitions */
app.get('/api/contexts', (req, res) => {
  res.json({
    contexts: store.ALL_CONTEXTS,
    order: store.CONTEXT_ORDER,
    emojis: store.CONTEXT_EMOJI_MAP,
  });
});

/** Completed today count */
app.get('/api/stats/today', (req, res) => {
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

// ─── Protocol endpoints ──────────────────────────────────────────────────────

let pgPool = null;
try {
  const { Pool } = require('pg');
  pgPool = new Pool({ connectionString: 'postgresql://matthewsteele@localhost:5432/entries' });
} catch (e) {
  console.warn('pg not available:', e.message);
}

app.get('/api/protocols/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  if (!pgPool) return res.status(503).json({ error: 'Database not available' });
  try {
    const result = await pgPool.query(
      `SELECT id, date, content
       FROM journals
       WHERE type = 'protocol'
         AND content ILIKE $1
       ORDER BY date DESC
       LIMIT 3`,
      [`%${q}%`]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/protocols', async (req, res) => {
  try {
    const result = await pgPool.query(
      `SELECT id, date, LEFT(content, 120) as preview,
              REGEXP_REPLACE(content, E'\\n.*', '') as title
       FROM journals
       WHERE type = 'protocol'
       ORDER BY date DESC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── State tracking endpoints ────────────────────────────────────────────────

app.get('/api/states/:date', (req, res) => {
  try {
    const { date } = req.params;
    const data = loadStateFile(date);
    const defaults = computeStateDefaults(date);
    res.json({ date, data, defaults });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/states/:date', (req, res) => {
  try {
    const { date } = req.params;
    if (!fs.existsSync(STATES_DIR)) fs.mkdirSync(STATES_DIR, { recursive: true });
    fs.writeFileSync(path.join(STATES_DIR, `${date}.json`), JSON.stringify(req.body, null, 2));
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Health ─────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Start ──────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Dashboard API running on http://localhost:${PORT}`);
});
