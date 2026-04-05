#!/usr/bin/env node
/**
 * Task Checker - Periodic 30-minute popup to confirm or switch tasks.
 *
 * Runs every 30 minutes via launchd. Shows a macOS dialog asking if the user
 * is still working on the current task, with options to continue, switch to
 * a pending task, or pause.
 *
 * Complements idle-monitor.js (which handles sleep/idle >5min).
 * This handles the "forgot to switch tasks" problem for active sessions.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');
const _pgPool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
function writeSessionToDB(task, session) {
  if (!_pgPool) return;
  const focusLevel = task.focusLevel !== undefined ? task.focusLevel
    : (task.activityContext === 'us' || task.activityContext === 'unstructured' ? 0 : task.sourceType === 'routine' ? 1 : 2);
  _pgPool.query(
    `INSERT INTO task_sessions (task_id, task_title, context, focus_level, started_at, ended_at, source)
     VALUES ($1, $2, $3, $4, $5, $6, 'live') ON CONFLICT DO NOTHING`,
    [task.sourceId || task.id || `anon-${Date.now()}`, task.title, task.activityContext || 'prof',
     focusLevel, session.startedAt, session.endedAt]
  ).catch(() => {});
}
const {
  BASE_DIR, CONTEXT_EMOJI_MAP,
  loadPending, savePending, loadCurrent, saveCurrent, loadCompleted, saveCompleted,
  generateId, categorizeWork, formatTimeSpent,
  calculateContextSums, updateTaskInFile
} = require('../backend/task-store');

// Constants
const MIN_ELAPSED_MINUTES = 5;  // Don't show popup if task started < 5 min ago
const DIALOG_TIMEOUT = 120;     // Auto-dismiss after 2 minutes (treated as "continue")
const STATE_DIR = path.join(BASE_DIR, 'tracking', 'idle-monitor');
const STATE_FILE = path.join(STATE_DIR, 'task-check.json');

// --- State management ---

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveState(data) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// --- Skip-condition check ---

function shouldSkip(current, state, now) {
  const task = current.task;

  if (!task) {
    return 'no current task';
  }

  // Skip routine tasks (sleeping, meals, etc.) — no check-in needed
  if (task.sourceType === 'routine') {
    return 'routine task';
  }

  // Task started less than MIN_ELAPSED_MINUTES ago
  const startTime = new Date(task.startedAt);
  const elapsedMs = now - startTime;
  if (elapsedMs < MIN_ELAPSED_MINUTES * 60 * 1000) {
    return 'task just started';
  }

  // Task was manually switched since last check (user is actively managing)
  if (state && state.lastTaskTitle && state.lastTaskTitle !== task.title) {
    return 'task changed since last check';
  }

  // Within snooze period
  if (state && state.snoozeUntil) {
    const snoozeEnd = new Date(state.snoozeUntil);
    if (now < snoozeEnd) {
      return 'snoozed';
    }
  }

  return null;
}

// --- AppleScript dialog functions ---

function escapeAppleScript(str) {
  return (str || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function runAppleScript(script, timeoutMs) {
  try {
    const result = execSync('osascript -', {
      input: script,
      encoding: 'utf8',
      timeout: timeoutMs
    }).trim();
    return result;
  } catch (error) {
    return null;
  }
}

function showCheckDialog(taskTitle, elapsedStr, hasPendingTasks) {
  const buttons = hasPendingTasks
    ? '{"Pause", "Done ✓", "Switch Task", "Still on it"}'
    : '{"Pause", "Done ✓", "Still on it"}';

  const message = `Current task: ${escapeAppleScript(taskTitle)}\\nElapsed: ${elapsedStr}\\n\\nStill working on this?`;

  const script = `display dialog "${message}" buttons ${buttons} default button "Still on it" with title "Task Check" giving up after ${DIALOG_TIMEOUT}`;

  const result = runAppleScript(script, (DIALOG_TIMEOUT + 10) * 1000);
  if (!result) return 'continue';

  if (result.includes('gave up:true')) return 'continue';
  if (result.includes('button returned:Still on it')) return 'continue';
  if (result.includes('button returned:Switch Task')) return 'switch';
  if (result.includes('button returned:Done ✓')) return 'complete';
  if (result.includes('button returned:Pause')) return 'pause';
  return 'continue';
}

function showTaskPickerDialog(pendingTasks) {
  const taskItems = pendingTasks.slice(0, 10).map((task, idx) => {
    const emoji = CONTEXT_EMOJI_MAP[task.activityContext] || '💼';
    const timeStr = task.timeSpent > 0 ? ` (${formatTimeSpent(task.timeSpent)})` : '';
    const title = task.title || 'Untitled';
    const truncated = title.length > 55 ? title.substring(0, 52) + '...' : title;
    return `${idx + 1}. ${emoji} ${truncated}${timeStr}`;
  });

  const listItems = taskItems.map(item => `"${escapeAppleScript(item)}"`).join(', ');
  const defaultItem = `"${escapeAppleScript(taskItems[0])}"`;

  const script = `choose from list {${listItems}} with title "Switch Task" with prompt "Select a pending task:" default items {${defaultItem}}`;

  const result = runAppleScript(script, 60000);
  if (!result || result === 'false') return -1;

  const match = result.match(/^(\d+)\./);
  if (match) return parseInt(match[1], 10) - 1;
  return -1;
}

// --- Task actions ---

function endCurrentAndRecord(current, endTimeISO) {
  const task = current.task;
  if (!task) return;

  const startTime = new Date(task.startedAt);
  const endTime = new Date(endTimeISO);
  const elapsedMinutes = Math.round((endTime - startTime) / 60000);

  // Build session
  const session = { startedAt: task.startedAt, endedAt: endTimeISO };
  writeSessionToDB(task, session);

  if (task.sourceType === 'pending') {
    // Put pending task back with session
    let pending = loadPending();
    const taskData = {
      id: task.sourceId || generateId(),
      title: task.title,
      activityContext: task.activityContext || 'professional',
      category: categorizeWork(task.title),
      priority: 'medium',
      timeSpent: (task.timeSpent || 0) + elapsedMinutes,
      notes: [...(task.notes || [])],
      sessions: [...(task.sessions || []), session]
    };
    if (task.jiraTicket) taskData.jiraTicket = task.jiraTicket;
    if (task.jiraUrl) taskData.jiraUrl = task.jiraUrl;
    pending.push(taskData);
    savePending(pending);
  } else if (task.sourceType === 'routine') {
    // Update routine task with session + time
    updateTaskInFile(task.sourceId, t => {
      t.timeSpent = (t.timeSpent || 0) + elapsedMinutes;
      if (!t.sessions) t.sessions = [];
      t.sessions.push(session);
    });
  }
}

function performTaskSwitch(current, pendingTasks, selectedIndex) {
  const timestamp = new Date().toISOString();
  if (selectedIndex < 0 || selectedIndex >= pendingTasks.length) return false;

  const selectedTask = pendingTasks[selectedIndex];

  // End current task and record session
  if (current.task) {
    current.task.notes = [...(current.task.notes || []), {
      text: 'Switched via task check-in',
      timestamp: timestamp
    }];
    endCurrentAndRecord(current, timestamp);
  }

  // Remove selected from pending and set as current
  let pending = loadPending();
  const actualIndex = pending.findIndex(t => t.id === selectedTask.id);
  if (actualIndex === -1) return false;
  pending.splice(actualIndex, 1);
  savePending(pending);

  current.task = {
    title: selectedTask.title,
    activityContext: selectedTask.activityContext || 'professional',
    startedAt: timestamp,
    timeSpent: selectedTask.timeSpent || 0,
    sourceType: 'pending',
    sourceId: selectedTask.id,
    notes: selectedTask.notes || [],
    sessions: selectedTask.sessions || []
  };
  if (selectedTask.jiraTicket) current.task.jiraTicket = selectedTask.jiraTicket;
  if (selectedTask.jiraUrl) current.task.jiraUrl = selectedTask.jiraUrl;

  current.contextFilter = selectedTask.activityContext || 'professional';

  // Recalculate sums (save with null task first to avoid double-count)
  const savedTask = current.task;
  current.task = null;
  current.contextSums = calculateContextSums();
  current.task = savedTask;

  return true;
}

function performComplete(current) {
  const timestamp = new Date().toISOString();
  const task = current.task;
  if (!task) return;

  current.task.notes = [...(task.notes || []), {
    text: 'Completed via task check-in',
    timestamp: timestamp
  }];

  const startTime = new Date(task.startedAt);
  const elapsedMinutes = Math.round((new Date(timestamp) - startTime) / 60000);
  const session = { startedAt: task.startedAt, endedAt: timestamp };
  writeSessionToDB(task, session);

  if (task.sourceType === 'pending') {
    // Remove from pending (if it was re-added) and move to completed
    let pending = loadPending();
    pending = pending.filter(t => t.id !== task.sourceId);
    savePending(pending);
  }

  const completed = loadCompleted();
  completed.push({
    id: task.sourceId || generateId(),
    title: task.title,
    activityContext: task.activityContext || 'professional',
    category: categorizeWork(task.title),
    timeSpent: (task.timeSpent || 0) + elapsedMinutes,
    completedAt: timestamp,
    notes: [...(task.notes || [])],
    sessions: [...(task.sessions || []), session],
    ...(task.jiraTicket && { jiraTicket: task.jiraTicket }),
    ...(task.jiraUrl && { jiraUrl: task.jiraUrl })
  });
  saveCompleted(completed);

  current.task = null;
  current.contextFilter = null;
  current.contextSums = calculateContextSums();
}

function performPause(current) {
  const timestamp = new Date().toISOString();
  if (!current.task) return;

  current.task.notes = [...(current.task.notes || []), {
    text: 'Paused via task check-in',
    timestamp: timestamp
  }];
  endCurrentAndRecord(current, timestamp);

  // Clear current task (no automatic switch to unstructured)
  current.task = null;
  current.contextFilter = null;
  current.contextSums = calculateContextSums();
}

// --- Logging ---

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] task-checker: ${message}`);
}

// --- Main ---

function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });

  const now = new Date();
  const current = loadCurrent();
  const state = loadState();

  const skipReason = shouldSkip(current, state, now);
  if (skipReason) {
    log(`Skipping: ${skipReason}`);
    saveState({
      lastCheck: now.toISOString(),
      lastTaskTitle: current.task?.title || null,
      snoozeUntil: state?.snoozeUntil || null
    });
    return;
  }

  const task = current.task;
  const startTime = new Date(task.startedAt);
  const elapsedMinutes = Math.round((now - startTime) / 60000);
  const totalTime = (task.timeSpent || 0) + elapsedMinutes;
  const elapsedStr = formatTimeSpent(totalTime);
  const emoji = CONTEXT_EMOJI_MAP[task.activityContext] || '💼';

  const taskTitle = task.title === 'general'
    ? `${emoji} ${task.activityContext} (context tracking)`
    : `${emoji} ${task.title}`;

  // Get pending tasks sorted: current context first, then by priority
  const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
  const currentContext = task.activityContext || 'professional';
  const pendingTasks = loadPending()
    .sort((a, b) => {
      const aMatch = (a.activityContext || 'professional') === currentContext ? 0 : 1;
      const bMatch = (b.activityContext || 'professional') === currentContext ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      const aPri = PRIORITY_ORDER[a.priority] ?? 1;
      const bPri = PRIORITY_ORDER[b.priority] ?? 1;
      return aPri - bPri;
    });
  const hasPendingTasks = pendingTasks.length > 0;

  log(`Showing check dialog for "${task.title}" (${elapsedStr})`);

  // Step 1: Show the main check dialog
  const action = showCheckDialog(taskTitle, elapsedStr, hasPendingTasks);

  if (action === 'continue') {
    log('User chose to continue');
    saveState({
      lastCheck: now.toISOString(),
      lastTaskTitle: task.title,
      snoozeUntil: null
    });
    return;
  }

  if (action === 'complete') {
    log('User marked task as complete');
    performComplete(current);
    saveCurrent(current);
    saveState({
      lastCheck: now.toISOString(),
      lastTaskTitle: null,
      snoozeUntil: null
    });
    return;
  }

  if (action === 'pause') {
    log('User chose to pause');
    performPause(current);
    saveCurrent(current);
    saveState({
      lastCheck: now.toISOString(),
      lastTaskTitle: 'general',
      snoozeUntil: null
    });
    return;
  }

  if (action === 'switch') {
    const selectedIndex = showTaskPickerDialog(pendingTasks);

    if (selectedIndex < 0) {
      log('User cancelled task picker');
      saveState({
        lastCheck: now.toISOString(),
        lastTaskTitle: task.title,
        snoozeUntil: null
      });
      return;
    }

    const selectedTask = pendingTasks[selectedIndex];
    log(`User switching to task: "${selectedTask.title}"`);

    if (performTaskSwitch(current, pendingTasks, selectedIndex)) {
      saveCurrent(current);
      saveState({
        lastCheck: now.toISOString(),
        lastTaskTitle: selectedTask.title,
        snoozeUntil: null
      });
    }
    return;
  }
}

try {
  main();
} catch (error) {
  log(`Error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
}
