#!/usr/bin/env node
/**
 * Task Store - Shared I/O module for the split-file task tracking system.
 *
 * Four JSON files:
 *   tracking/pending.json    — completable (novel) tasks
 *   tracking/completed.json  — completed tasks
 *   tracking/routine.json    — routine tasks (never complete) + "general" context tasks
 *   tracking/current.json    — active task + view state + cached context sums
 */

const fs = require('fs');
const path = require('path');

// ─── Paths ───────────────────────────────────────────────────────────────────

const BASE_DIR = process.env.ENTRIES_BASE_DIR || path.join(__dirname, '..', '..');
const TRACKING_DIR = path.join(BASE_DIR, 'tracking');
const PENDING_FILE = path.join(TRACKING_DIR, 'pending.json');
const COMPLETED_FILE = path.join(TRACKING_DIR, 'completed.json');
const ROUTINE_FILE = path.join(TRACKING_DIR, 'routine.json');
const CURRENT_FILE = path.join(TRACKING_DIR, 'current.json');
const TIME_LOG_FILE = path.join(TRACKING_DIR, 'time-logs', 'time-log.json');

// ─── Constants ───────────────────────────────────────────────────────────────

const CONTEXT_EMOJI_MAP = {
  personal: '🏠',
  social: '👥',
  professional: '💼',
  cultivo: '🌱',
  projects: '🚀',
  health: '💪',
  rest: '😴',
  learning: '📚',
  unstructured: '☀️'
};

const ALL_CONTEXTS = ['personal', 'social', 'professional', 'cultivo', 'projects', 'health', 'rest', 'learning', 'unstructured'];

const CONTEXT_ORDER = ['personal', 'health', 'rest', 'cultivo', 'professional', 'social', 'projects', 'learning', 'unstructured'];

// Priority: 1 (highest) to 5 (lowest), default 3
const DEFAULT_PRIORITY = 3;
const PRIORITY_EMOJI = { 1: '🔴', 2: '🟠', 3: '🟡', 4: '🔵', 5: '🟢' };
const PRIORITY_LABEL = { 1: 'HIGH', 2: 'MED-HI', 3: 'NORMAL', 4: 'LOW', 5: 'LOWEST' };

// Focus: 0 (trivial) to 5 (deep work), default 3
const DEFAULT_FOCUS = 3;
const FOCUS_EMOJI = { 0: '○', 1: '◔', 2: '◑', 3: '◕', 4: '●', 5: '⬤' };
const FOCUS_LABEL = { 0: 'TRIVIAL', 1: 'MINIMAL', 2: 'LIGHT', 3: 'MEDIUM', 4: 'HIGH', 5: 'DEEP' };

// ─── Generic JSON helpers ────────────────────────────────────────────────────

function readJsonFile(filePath, defaultValue) {
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      console.error(`⚠️  Warning: Could not parse ${path.basename(filePath)}. Using default.`);
    }
  }
  return defaultValue;
}

function writeJsonFile(filePath, data) {
  // Atomic write: write to temp file, then rename
  const tmpFile = filePath + '.tmp';
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpFile, filePath);
  } catch (error) {
    // Fallback to direct write if rename fails
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  }
}

// ─── Load / Save for each file ──────────────────────────────────────────────

function loadPending() {
  return readJsonFile(PENDING_FILE, []);
}

function savePending(tasks) {
  writeJsonFile(PENDING_FILE, tasks);
}

function loadCompleted() {
  return readJsonFile(COMPLETED_FILE, []);
}

function saveCompleted(tasks) {
  writeJsonFile(COMPLETED_FILE, tasks);
}

function loadRoutine() {
  return readJsonFile(ROUTINE_FILE, []);
}

function saveRoutine(tasks) {
  writeJsonFile(ROUTINE_FILE, tasks);
}

const DEFAULT_CURRENT = {
  task: null,
  contextSums: {
    day: { personal: 0, social: 0, professional: 0, cultivo: 0, projects: 0, health: 0, unstructured: 0 },
    week: { personal: 0, social: 0, professional: 0, cultivo: 0, projects: 0, health: 0, unstructured: 0 },
    month: { personal: 0, social: 0, professional: 0, cultivo: 0, projects: 0, health: 0, unstructured: 0 }
  },
  contextFilter: null,
  viewMode: 'novel'
};

function loadCurrent() {
  const data = readJsonFile(CURRENT_FILE, null);
  if (!data) return JSON.parse(JSON.stringify(DEFAULT_CURRENT));
  // Ensure all fields exist
  if (!data.contextSums) data.contextSums = JSON.parse(JSON.stringify(DEFAULT_CURRENT.contextSums));
  if (data.contextFilter === undefined) data.contextFilter = null;
  if (!data.viewMode) data.viewMode = 'novel';
  return data;
}

function saveCurrent(state) {
  writeJsonFile(CURRENT_FILE, state);
}

// ─── ID generation ───────────────────────────────────────────────────────────

function generateId() {
  return Date.now().toString();
}

// ─── Date helpers ────────────────────────────────────────────────────────────

function getLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMidnightToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function getMondayThisWeek() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
  return monday;
}

function getFirstOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

// ─── Time calculation ────────────────────────────────────────────────────────

function calculateElapsedMinutes(startTimestamp) {
  const now = new Date();
  const start = new Date(startTimestamp);
  return Math.round((now - start) / 60000);
}

function calculateElapsedMinutesUntil(startTimestamp, endTimestamp) {
  const start = new Date(startTimestamp);
  const end = endTimestamp ? new Date(endTimestamp) : new Date();
  const diffMs = end - start;
  if (diffMs < 0) return 0;
  return Math.round(diffMs / 60000);
}

function formatTimeSpent(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function parseCustomTime(timeStr, startTimestamp) {
  if (!timeStr) return null;
  const now = new Date();
  let hours, minutes;
  timeStr = timeStr.trim().toLowerCase();

  const match24 = timeStr.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match24) {
    hours = parseInt(match24[1]);
    minutes = parseInt(match24[2]);
  } else {
    const match12 = timeStr.match(/^(\d{1,2})(?::(\d{2}))?([ap]m)$/);
    if (match12) {
      hours = parseInt(match12[1]);
      minutes = match12[2] ? parseInt(match12[2]) : 0;
      if (match12[3] === 'pm' && hours !== 12) hours += 12;
      else if (match12[3] === 'am' && hours === 12) hours = 0;
    } else {
      console.error(`\n❌ Invalid time format: ${timeStr}`);
      console.error(`   Valid formats: 18:00, 6pm, 6:00pm\n`);
      process.exit(1);
    }
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    console.error(`\n❌ Invalid time: ${timeStr}\n`);
    process.exit(1);
  }

  let customTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
  const hoursDiff = (customTime - now) / (1000 * 60 * 60);
  if (hoursDiff > 1) {
    customTime = new Date(customTime.getTime() - 24 * 60 * 60 * 1000);
  }
  return customTime;
}

// ─── Task classification helpers ─────────────────────────────────────────────

function categorizeWork(description) {
  const lower = (description || '').toLowerCase();
  const categories = {
    'Pull Request': ['pr #', 'pr#', 'pull request', 'merge', 'review comment'],
    'Feature': ['feature', 'implement', 'add ', 'new '],
    'Bug Fix': ['fix', 'bug', 'issue', 'error'],
    'Bug Investigation': ['investigate', 'debug', 'investigation'],
    'Refactor': ['refactor', 'improve', 'clean', 'reorganize'],
    'Documentation': ['doc', 'readme', 'comment', 'document'],
    'Testing': ['test', 'spec', 'unit test', 'integration test'],
    'Research': ['research', 'explore', 'investigate', 'looking for'],
    'Migration': ['migration', 'migrate']
  };
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => lower.includes(kw))) return category;
  }
  return 'General';
}

function detectPriority(description) {
  const lower = (description || '').toLowerCase();
  if (lower.includes('urgent') || lower.includes('asap') || lower.includes('critical')) return 1;
  if (lower.includes('low') || lower.includes('whenever') || lower.includes('optional')) return 5;
  return DEFAULT_PRIORITY;
}

function detectFocus(description) {
  const lower = (description || '').toLowerCase();
  if (lower.includes('deep work') || lower.includes('architect') || lower.includes('design system') || lower.includes('complex') || lower.includes('deep dive')) return 5;
  if (lower.includes('implement') || lower.includes('feature') || lower.includes('build') || lower.includes('develop') || lower.includes('investigate') || lower.includes('debug') || lower.includes('refactor')) return 4;
  if (lower.includes('review') || lower.includes('read') || lower.includes('meeting') || lower.includes('call') || lower.includes('standup') || lower.includes('discuss') || lower.includes('journal') || lower.includes('reflect') || lower.includes('write')) return 2;
  if (lower.includes('quick') || lower.includes('ping') || lower.includes('reply') || lower.includes('send') || lower.includes('update') || lower.includes('check in')) return 1;
  if (lower.includes('routine') || lower.includes('errand') || lower.includes('grocery') || lower.includes('admin') || lower.includes('log ') || lower.includes('track ')) return 0;
  return DEFAULT_FOCUS;
}

function normalizeFocus(value) {
  const n = parseInt(value);
  if (!isNaN(n) && n >= 0 && n <= 5) return n;
  return DEFAULT_FOCUS;
}

function focusEmoji(f) {
  return FOCUS_EMOJI[normalizeFocus(f)] ?? FOCUS_EMOJI[DEFAULT_FOCUS];
}

function focusLabel(f) {
  return FOCUS_LABEL[normalizeFocus(f)] ?? FOCUS_LABEL[DEFAULT_FOCUS];
}

function normalizePriority(value) {
  if (typeof value === 'number' && value >= 1 && value <= 5) return value;
  const map = { highest: 1, high: 1, 'med-high': 2, medium: 3, 'med-low': 4, low: 5, lowest: 5 };
  return map[String(value).toLowerCase()] || DEFAULT_PRIORITY;
}

function priorityEmoji(p) {
  return PRIORITY_EMOJI[normalizePriority(p)] || '🟡';
}

function priorityLabel(p) {
  return PRIORITY_LABEL[normalizePriority(p)] || 'NORMAL';
}

function detectContext(description) {
  const lower = (description || '').toLowerCase();

  const cultivoKeywords = [
    'pr', 'pull request', 'feature', 'bug', 'test', 'migration', 'review',
    'deploy', 'sprint', 'jira', 'tsp-', 'cultivo', 'merge', 'commit',
    'branch', 'fix', 'develop', 'build', 'ci', 'cd', 'release',
    'implement', 'refactor'
  ];

  const restKeywords = [
    'sleeping', 'resting', 'nap', 'rest', 'wind down', 'bedtime', 'bed time',
    'winding down', 'sleep'
  ];
  const healthKeywords = [
    'health', 'dentist', 'doctor', 'medical', 'sick', 'gym', 'workout',
    'exercise', 'therapy', 'physio', 'medication', 'vitamins',
    'stretch', 'yoga', 'run', 'walk', 'clinic', 'checkup', 'wellness'
  ];
  const personalKeywords = [
    'appointment', 'personal', 'family', 'vacation', 'home', 'pet',
    'errand', 'errands', 'grocery', 'bank', 'car repair', 'car appointment', 'birthday'
  ];
  const socialKeywords = [
    'friends', 'meet', 'dinner', 'coffee', 'hangout', 'party', 'social',
    'drinks', 'lunch with', 'catch up', 'get together', 'gathering',
    'hang out', 'see friends', 'visit'
  ];
  const projectKeywords = [
    'trading', 'btx', 'side project', 'personal project', 'portfolio',
    'freelance', 'consulting', 'side hustle', 'startup', 'client work',
    'non-cultivo', 'business', 'investment', 'stocks', 'crypto',
    'trading bot', 'saas', 'product', 'side', 'project'
  ];
  const learningKeywords = [
    'learn', 'learning', 'study', 'studying', 'course', 'tutorial', 'lecture',
    'reading', 'book', 'research', 'explore', 'protocols', 'deep dive',
    'documentation', 'workshop', 'training', 'class', 'lesson', 'curriculum',
    'look at', 'watch talk', 'conference talk'
  ];
  const unstructuredKeywords = [
    'leisure', 'free time', 'relax', 'relaxing', 'tv', 'movie', 'gaming',
    'game', 'browse', 'browsing', 'youtube', 'scroll', 'scrolling',
    'unstructured', 'downtime', 'chill', 'netflix', 'reading for fun'
  ];
  const professionalKeywords = [
    'meeting', 'interview', 'job', 'career', 'resume', 'work',
    'presentation', 'conference', 'networking'
  ];

  const checks = [
    [cultivoKeywords, 'cultivo'],
    [restKeywords, 'rest'],
    [healthKeywords, 'health'],
    [personalKeywords, 'personal'],
    [socialKeywords, 'social'],
    [projectKeywords, 'projects'],
    [learningKeywords, 'learning'],
    [unstructuredKeywords, 'unstructured'],
    [professionalKeywords, 'professional']
  ];

  for (const [keywords, context] of checks) {
    if (keywords.some(kw => lower.includes(kw))) return context;
  }
  return 'professional';
}

function normalizeContext(contextCode) {
  const contextMap = {
    'per': 'personal', 'soc': 'social', 'prof': 'professional',
    'cul': 'cultivo', 'proj': 'projects', 'heal': 'health', 'rest': 'rest', 'learn': 'learning', 'us': 'unstructured',
    'personal': 'personal', 'social': 'social', 'professional': 'professional',
    'cultivo': 'cultivo', 'projects': 'projects', 'health': 'health', 'rest': 'rest', 'learning': 'learning', 'unstructured': 'unstructured'
  };
  const normalized = contextMap[contextCode?.toLowerCase()];
  if (!normalized) {
    console.error(`\n❌ Invalid context code: ${contextCode}`);
    console.error(`   Valid codes: per, soc, prof, cul, proj, heal, rest, learn, us\n`);
    process.exit(1);
  }
  return normalized;
}

function extractTitle(description) {
  const firstSentence = description.split(/[.!?]/)[0];
  if (firstSentence.length > 80) return firstSentence.substring(0, 77) + '...';
  return firstSentence;
}

function extractContext(description) {
  const sentences = description.split(/[.!?]/).filter(s => s.trim());
  if (sentences.length > 1) return sentences.slice(1).join('. ').trim();
  return null;
}

// ─── Display ordering ────────────────────────────────────────────────────────

/**
 * Get tasks in display order, filtered by viewMode and contextFilter.
 * In the new system, viewMode filters between pending (novel) and routine files,
 * so this function receives an already-correct array and just applies context filter + ordering.
 */
function getDisplayOrderedTasks(tasks, contextFilter) {
  // Hide "general" context-tracking tasks — they're internal plumbing
  const visible = tasks.filter(t => t.title !== 'general');
  const sortByPriority = (a, b) => normalizePriority(a.priority) - normalizePriority(b.priority);
  if (contextFilter) {
    return visible.filter(t => (t.activityContext || 'professional') === contextFilter).sort(sortByPriority);
  }
  // No filter: order by context groups, sorted by priority within each
  const displayOrderTasks = [];
  CONTEXT_ORDER.forEach(ctx => {
    const contextTasks = visible.filter(task => (task.activityContext || 'professional') === ctx);
    contextTasks.sort(sortByPriority);
    displayOrderTasks.push(...contextTasks);
  });
  return displayOrderTasks;
}

// ─── Routine "general" context tasks ─────────────────────────────────────────

/**
 * Find or create a "general" routine task for a given context.
 * These replace the old isContextOnly mode.
 */
function ensureRoutineTask(context) {
  const routine = loadRoutine();
  let generalTask = routine.find(t => t.title === 'general' && t.activityContext === context);
  if (!generalTask) {
    generalTask = {
      id: generateId(),
      title: 'general',
      activityContext: context,
      category: 'General',
      timeSpent: 0,
      sessions: [],
      notes: [],
      routine: true
    };
    routine.push(generalTask);
    saveRoutine(routine);
  }
  return generalTask;
}

/**
 * Find a routine task by name, optionally filtered by context.
 * Returns { task, match } where match is 'exact', 'fuzzy', or 'created'.
 * Skips "general" tasks (internal plumbing).
 */
function findRoutineTask(taskName, context) {
  const routine = loadRoutine();
  const searchName = taskName.toLowerCase().trim();
  const candidates = context
    ? routine.filter(t => t.title !== 'general' && t.activityContext === context)
    : routine.filter(t => t.title !== 'general');

  // Exact match (case-insensitive)
  const exact = candidates.find(t => t.title.toLowerCase() === searchName);
  if (exact) return { task: exact, match: 'exact' };

  // Fuzzy: substring match
  const fuzzy = candidates.find(t => t.title.toLowerCase().includes(searchName));
  if (fuzzy) return { task: fuzzy, match: 'fuzzy' };

  // Reverse fuzzy: search term contains task title
  const reverse = candidates.find(t => searchName.includes(t.title.toLowerCase()));
  if (reverse) return { task: reverse, match: 'fuzzy' };

  // No match — create new routine task
  const newContext = context || detectContext(taskName);
  const newTask = {
    id: generateId(),
    title: taskName.trim(),
    activityContext: newContext,
    category: categorizeWork(taskName),
    timeSpent: 0,
    sessions: [],
    notes: [],
    routine: true
  };
  routine.push(newTask);
  saveRoutine(routine);
  return { task: newTask, match: 'created' };
}

// ─── Session gathering and sum calculation ───────────────────────────────────

function emptyContextSums() {
  return {
    personal: 0, social: 0, professional: 0,
    cultivo: 0, projects: 0, health: 0, unstructured: 0
  };
}

/**
 * Gather all sessions from a task array, returning [{session, activityContext}].
 */
function gatherSessions(tasks) {
  const results = [];
  for (const task of tasks) {
    const ctx = task.activityContext || 'professional';
    for (const session of (task.sessions || [])) {
      if (session.startedAt && session.endedAt) {
        results.push({ session, activityContext: ctx });
      }
    }
  }
  return results;
}

/**
 * Calculate how many minutes a session overlaps with a time window [windowStart, windowEnd].
 */
function sessionOverlapMinutes(session, windowStart, windowEnd) {
  const start = new Date(session.startedAt).getTime();
  const end = new Date(session.endedAt).getTime();
  const overlapStart = Math.max(start, windowStart.getTime());
  const overlapEnd = Math.min(end, windowEnd.getTime());
  if (overlapEnd <= overlapStart) return 0;
  return Math.round((overlapEnd - overlapStart) / 60000);
}

/**
 * Calculate context sums for day/week/month from all sessions across all files.
 * Includes the currently active session (current.task.startedAt → now).
 */
function calculateContextSums() {
  const now = new Date();
  const todayStart = getMidnightToday();
  const weekStart = getMondayThisWeek();
  const monthStart = getFirstOfMonth();

  const sums = {
    day: emptyContextSums(),
    week: emptyContextSums(),
    month: emptyContextSums()
  };

  // Gather sessions from all files
  const pending = loadPending();
  const routine = loadRoutine();
  const completed = loadCompleted();

  // Performance: only scan completed tasks with sessions in the last 31 days
  const cutoff = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
  const recentCompleted = completed.filter(t => {
    const sessions = t.sessions || [];
    if (sessions.length === 0) return false;
    const lastSession = sessions[sessions.length - 1];
    return new Date(lastSession.endedAt || lastSession.startedAt) >= cutoff;
  });

  const allSessions = [
    ...gatherSessions(pending),
    ...gatherSessions(routine),
    ...gatherSessions(recentCompleted)
  ];

  // Include the active session
  const current = loadCurrent();
  if (current.task && current.task.startedAt) {
    allSessions.push({
      session: { startedAt: current.task.startedAt, endedAt: now.toISOString() },
      activityContext: current.task.activityContext || 'professional'
    });
  }

  // Calculate overlaps
  for (const { session, activityContext } of allSessions) {
    const dayMinutes = sessionOverlapMinutes(session, todayStart, now);
    const weekMinutes = sessionOverlapMinutes(session, weekStart, now);
    const monthMinutes = sessionOverlapMinutes(session, monthStart, now);

    if (dayMinutes > 0) sums.day[activityContext] = (sums.day[activityContext] || 0) + dayMinutes;
    if (weekMinutes > 0) sums.week[activityContext] = (sums.week[activityContext] || 0) + weekMinutes;
    if (monthMinutes > 0) sums.month[activityContext] = (sums.month[activityContext] || 0) + monthMinutes;
  }

  return sums;
}

/**
 * Get all sessions from today only (for calendar sync + time budget).
 * Returns [{session, activityContext, taskTitle, taskId, sourceFile}].
 */
function getTodaySessions() {
  const todayStr = getLocalDate();
  const todayStart = getMidnightToday();
  const results = [];

  function scanFile(tasks, sourceFile) {
    for (const task of tasks) {
      (task.sessions || []).forEach((session, sessionIdx) => {
        if (!session.startedAt) return;
        const sessionDate = getLocalDate(new Date(session.startedAt));
        // Include sessions that started today OR overlap with today
        if (sessionDate === todayStr || (session.endedAt && new Date(session.endedAt) >= todayStart)) {
          results.push({
            session,
            activityContext: task.activityContext || 'professional',
            taskTitle: task.title,
            taskId: task.id,
            focusLevel: task.focusLevel ?? DEFAULT_FOCUS,
            sourceFile,
            sessionIdx,
          });
        }
      });
    }
  }

  scanFile(loadPending(), 'pending');
  scanFile(loadRoutine(), 'routine');
  scanFile(loadCompleted(), 'completed');

  // Include historical + active sessions from current task
  const current = loadCurrent();
  if (current.task) {
    // Historical sessions carried over when task was switched to
    (current.task.sessions || []).forEach((session, sessionIdx) => {
      if (!session.startedAt) return;
      const sessionDate = getLocalDate(new Date(session.startedAt));
      if (sessionDate === todayStr || (session.endedAt && new Date(session.endedAt) >= todayStart)) {
        results.push({
          session,
          activityContext: current.task.activityContext || 'professional',
          taskTitle: current.task.title,
          taskId: current.task.sourceId,
          focusLevel: current.task.focusLevel ?? 3,
          sourceFile: 'current',
          sessionIdx,
        });
      }
    });
    // Live active session
    if (current.task.startedAt) {
      const sessionDate = getLocalDate(new Date(current.task.startedAt));
      if (sessionDate === todayStr || new Date(current.task.startedAt) >= todayStart) {
        results.push({
          session: { startedAt: current.task.startedAt, endedAt: new Date().toISOString() },
          activityContext: current.task.activityContext || 'professional',
          taskTitle: current.task.title,
          taskId: current.task.sourceId,
          focusLevel: current.task.focusLevel ?? 3,
          sourceFile: 'current'
        });
      }
    }
  }

  return results;
}

// ─── Time budget (session-based) ─────────────────────────────────────────────

const EARNING_RATE = 0.1;
const EARNING_CONTEXTS = ['personal', 'social', 'professional', 'cultivo', 'projects', 'learning'];
const SPENDING_CONTEXTS = ['unstructured'];

function calculateTimeBudgetForToday() {
  const sums = calculateContextSums();
  const todaySums = sums.day;

  let structuredMinutes = 0;
  EARNING_CONTEXTS.forEach(ctx => { structuredMinutes += todaySums[ctx] || 0; });

  let unstructuredMinutes = 0;
  SPENDING_CONTEXTS.forEach(ctx => { unstructuredMinutes += todaySums[ctx] || 0; });

  return {
    earned: Math.round(structuredMinutes * EARNING_RATE * 10) / 10,
    spent: Math.round(unstructuredMinutes * 10) / 10,
    net: Math.round((structuredMinutes * EARNING_RATE - unstructuredMinutes) * 10) / 10
  };
}

/**
 * Get the current time budget balance (historical + today).
 */
function getTimeBudgetBalance() {
  const timeLog = readJsonFile(TIME_LOG_FILE, {});
  const historicalBalance = timeLog.timeBudget?.balance || 0;
  const lastUpdated = timeLog.timeBudget?.lastUpdated || null;

  // Add today's delta (if not already archived)
  const todayStr = getLocalDate();
  const todayBudget = calculateTimeBudgetForToday();

  // If today was already archived (shouldn't happen without /t start), use historical
  if (lastUpdated === todayStr) {
    return { balance: historicalBalance, lastUpdated };
  }

  return {
    balance: Math.round((historicalBalance + todayBudget.net) * 10) / 10,
    lastUpdated: todayStr
  };
}

// ─── Completed today counter ─────────────────────────────────────────────────

/**
 * Get the number of tasks completed today.
 * Stored in current.json as completedToday: { date, count }.
 * Resets automatically when the date changes.
 */
function getCompletedTodayCount() {
  const current = loadCurrent();
  const todayStr = getLocalDate();
  if (current.completedToday && current.completedToday.date === todayStr) {
    return current.completedToday.count || 0;
  }
  return 0;
}

/**
 * Increment the completed-today counter. Resets if date is stale.
 */
function incrementCompletedToday() {
  const current = loadCurrent();
  const todayStr = getLocalDate();
  if (!current.completedToday || current.completedToday.date !== todayStr) {
    current.completedToday = { date: todayStr, count: 1 };
  } else {
    current.completedToday.count = (current.completedToday.count || 0) + 1;
  }
  saveCurrent(current);
}

// ─── Task lookup helpers ─────────────────────────────────────────────────────

/**
 * Find a task by ID across pending, routine, and completed.
 * Returns { task, sourceFile } or null.
 */
function findTaskById(id) {
  const pending = loadPending();
  const found = pending.find(t => t.id === id);
  if (found) return { task: found, sourceFile: 'pending' };

  const routine = loadRoutine();
  const foundR = routine.find(t => t.id === id);
  if (foundR) return { task: foundR, sourceFile: 'routine' };

  const completed = loadCompleted();
  const foundC = completed.find(t => t.id === id);
  if (foundC) return { task: foundC, sourceFile: 'completed' };

  return null;
}

/**
 * Update a task in its source file by ID. Calls the appropriate save function.
 * Returns true if found and saved.
 */
function updateTaskInFile(id, updateFn) {
  // Try pending
  const pending = loadPending();
  const pIdx = pending.findIndex(t => t.id === id);
  if (pIdx !== -1) {
    updateFn(pending[pIdx]);
    savePending(pending);
    return true;
  }

  // Try routine
  const routine = loadRoutine();
  const rIdx = routine.findIndex(t => t.id === id);
  if (rIdx !== -1) {
    updateFn(routine[rIdx]);
    saveRoutine(routine);
    return true;
  }

  return false;
}

/**
 * Update a session's timestamps and/or focusLevel in its source JSON file.
 * Also updates the task's focusLevel if provided (applies to all sessions).
 * Returns true if found and saved.
 *
 * @param {string} taskId
 * @param {string} sourceFile - 'pending' | 'routine' | 'completed'
 * @param {number} sessionIdx
 * @param {object} updates - { startedAt?, endedAt?, focusLevel? }
 */
function updateSession(taskId, sourceFile, sessionIdx, updates) {
  const loaders = { pending: loadPending, routine: loadRoutine, completed: loadCompleted };
  const savers  = { pending: savePending, routine: saveRoutine, completed: saveCompleted };

  const loader = loaders[sourceFile];
  const saver  = savers[sourceFile];
  if (!loader) return false;

  const tasks = loader();
  const task = tasks.find(t => t.id === taskId);
  if (!task || !task.sessions || !task.sessions[sessionIdx]) return false;

  const session = task.sessions[sessionIdx];
  if (updates.startedAt !== undefined) session.startedAt = updates.startedAt;
  if (updates.endedAt   !== undefined) session.endedAt   = updates.endedAt;
  if (updates.focusLevel !== undefined) task.focusLevel  = updates.focusLevel;

  saver(tasks);
  return true;
}

function deleteSession(taskId, sourceFile, sessionIdx) {
  const loaders = { pending: loadPending, routine: loadRoutine, completed: loadCompleted };
  const savers  = { pending: savePending, routine: saveRoutine, completed: saveCompleted };

  const loader = loaders[sourceFile];
  const saver  = savers[sourceFile];
  if (!loader) return false;

  const tasks = loader();
  const task = tasks.find(t => t.id === taskId);
  if (!task || !task.sessions || !task.sessions[sessionIdx]) return false;

  task.sessions.splice(sessionIdx, 1);
  saver(tasks);
  return true;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  // Paths
  BASE_DIR,
  TRACKING_DIR,
  PENDING_FILE,
  COMPLETED_FILE,
  ROUTINE_FILE,
  CURRENT_FILE,
  TIME_LOG_FILE,

  // Constants
  CONTEXT_EMOJI_MAP,
  ALL_CONTEXTS,
  CONTEXT_ORDER,
  DEFAULT_PRIORITY,
  PRIORITY_EMOJI,
  PRIORITY_LABEL,

  // I/O
  loadPending, savePending,
  loadCompleted, saveCompleted,
  loadRoutine, saveRoutine,
  loadCurrent, saveCurrent,
  readJsonFile, writeJsonFile,

  // ID / dates
  generateId,
  getLocalDate,
  getMidnightToday,
  getMondayThisWeek,
  getFirstOfMonth,

  // Time
  calculateElapsedMinutes,
  calculateElapsedMinutesUntil,
  formatTimeSpent,
  parseCustomTime,

  // Classification
  categorizeWork,
  detectPriority,
  detectFocus,
  detectContext,
  normalizeContext,
  normalizePriority,
  normalizeFocus,
  priorityEmoji,
  priorityLabel,
  focusEmoji,
  focusLabel,
  extractTitle,
  extractContext,

  // Focus constants
  DEFAULT_FOCUS,
  FOCUS_EMOJI,
  FOCUS_LABEL,

  // Display
  getDisplayOrderedTasks,

  // Routine / context
  ensureRoutineTask,
  findRoutineTask,

  // Sums
  emptyContextSums,
  gatherSessions,
  sessionOverlapMinutes,
  calculateContextSums,
  getTodaySessions,

  // Time budget
  EARNING_RATE,
  EARNING_CONTEXTS,
  SPENDING_CONTEXTS,
  calculateTimeBudgetForToday,
  getTimeBudgetBalance,

  // Completed today
  getCompletedTodayCount,
  incrementCompletedToday,

  // Lookup
  findTaskById,
  updateTaskInFile,

  // Session editing
  updateSession,
  deleteSession,
};
