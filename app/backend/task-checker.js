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

// Constants
const MIN_ELAPSED_MINUTES = 5;  // Don't show popup if task started < 5 min ago
const DIALOG_TIMEOUT = 120;     // Auto-dismiss after 2 minutes (treated as "continue")
const BASE_DIR = path.join(__dirname, '..', '..');
const LOG_DIR = path.join(BASE_DIR, 'tracking', 'daily-logs');
const STATE_DIR = path.join(BASE_DIR, 'tracking', 'idle-monitor');
const STATE_FILE = path.join(STATE_DIR, 'task-check.json');

const CONTEXT_EMOJI = {
  personal: '🏠',
  social: '👥',
  professional: '💼',
  cultivo: '🌱',
  projects: '🚀',
  health: '💪',
  unstructured: '☀️'
};

// --- Utility functions (copied from daily-log-cli.js since they aren't exported) ---

function getLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLogFilePath(date) {
  return path.join(LOG_DIR, `daily-log-${date}.json`);
}

function loadDailyLog(date) {
  const filePath = getLogFilePath(date);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      return null;
    }
  }
  return null;
}

function updateContextTotals(logData) {
  const contextTotals = {
    personal: 0, social: 0, professional: 0,
    cultivo: 0, projects: 0, health: 0, unstructured: 0
  };
  const log = logData.dailyLog;

  (log.completedWork || []).forEach(work => {
    const context = work.activityContext || 'professional';
    contextTotals[context] = (contextTotals[context] || 0) + (work.timeSpent || 0);
  });
  (log.pendingTasks || []).forEach(task => {
    const context = task.activityContext || 'professional';
    contextTotals[context] = (contextTotals[context] || 0) + (task.timeSpent || 0);
  });
  if (log.currentTask) {
    const context = log.currentTask.activityContext || 'professional';
    const startTime = new Date(log.currentTask.startedAt);
    const now = new Date();
    const elapsedMinutes = Math.floor((now - startTime) / 60000);
    const totalTime = (log.currentTask.timeSpent || 0) + elapsedMinutes;
    contextTotals[context] = (contextTotals[context] || 0) + totalTime;
  }
  logData.context = contextTotals;
}

function saveDailyLog(logData) {
  const filePath = getLogFilePath(logData.date);
  if (!logData.context) {
    logData.context = {
      personal: 0, social: 0, professional: 0,
      cultivo: 0, projects: 0, health: 0, unstructured: 0
    };
  }
  updateContextTotals(logData);
  fs.writeFileSync(filePath, JSON.stringify(logData, null, 2), 'utf8');
}

function generateId() {
  return Date.now().toString();
}

function categorizeWork(description) {
  const lower = (description || '').toLowerCase();
  const categories = {
    'Pull Request': ['pr #', 'pr#', 'pull request', 'merge', 'review comment'],
    'Feature': ['feature', 'implement', 'add ', 'new '],
    'Bug Fix': ['fix', 'bug', 'issue', 'error'],
    'Refactor': ['refactor', 'improve', 'clean', 'reorganize'],
    'Testing': ['test', 'spec', 'unit test'],
    'Research': ['research', 'explore', 'investigate'],
    'Migration': ['migration', 'migrate']
  };
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => lower.includes(kw))) return category;
  }
  return 'General';
}

function formatTimeSpent(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

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

function shouldSkip(logData, state, now) {
  const currentTask = logData.dailyLog.currentTask;

  if (!currentTask) {
    return 'no current task';
  }

  // Already in unstructured context-only (idle/break time)
  if (currentTask.isContextOnly && currentTask.activityContext === 'unstructured') {
    return 'already in unstructured mode';
  }

  // Task started less than MIN_ELAPSED_MINUTES ago
  const startTime = new Date(currentTask.startedAt);
  const elapsedMs = now - startTime;
  if (elapsedMs < MIN_ELAPSED_MINUTES * 60 * 1000) {
    return 'task just started';
  }

  // Task was manually switched since last check (user is actively managing)
  if (state && state.lastTaskTitle && state.lastTaskTitle !== currentTask.title) {
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

function showCheckDialog(taskTitle, elapsedStr, hasPendingTasks) {
  const buttons = hasPendingTasks
    ? '{"Pause", "Switch Task", "Still on it"}'
    : '{"Pause", "Still on it"}';

  const message = `Current task: ${escapeAppleScript(taskTitle)}\\nElapsed: ${elapsedStr}\\n\\nStill working on this?`;

  const script = `display dialog "${message}" buttons ${buttons} default button "Still on it" with title "Task Check" giving up after ${DIALOG_TIMEOUT}`;

  try {
    const result = execSync(`osascript -e '${script}'`, {
      encoding: 'utf8',
      timeout: (DIALOG_TIMEOUT + 10) * 1000
    }).trim();

    if (result.includes('gave up:true')) return 'continue';
    if (result.includes('button returned:Still on it')) return 'continue';
    if (result.includes('button returned:Switch Task')) return 'switch';
    if (result.includes('button returned:Pause')) return 'pause';
    return 'continue';
  } catch (error) {
    // User pressed Escape, dialog error, or timeout
    return 'continue';
  }
}

function showTaskPickerDialog(pendingTasks) {
  const taskItems = pendingTasks.slice(0, 10).map((task, idx) => {
    const emoji = CONTEXT_EMOJI[task.activityContext] || '💼';
    const timeStr = task.timeSpent > 0 ? ` (${formatTimeSpent(task.timeSpent)})` : '';
    const title = task.title || 'Untitled';
    const truncated = title.length > 55 ? title.substring(0, 52) + '...' : title;
    return `${idx + 1}. ${emoji} ${truncated}${timeStr}`;
  });

  const listItems = taskItems.map(item => `"${escapeAppleScript(item)}"`).join(', ');
  const defaultItem = `"${escapeAppleScript(taskItems[0])}"`;

  const script = `choose from list {${listItems}} with title "Switch Task" with prompt "Select a pending task:" default items {${defaultItem}}`;

  try {
    const result = execSync(`osascript -e '${script}'`, {
      encoding: 'utf8',
      timeout: 60000
    }).trim();

    if (result === 'false') return -1;

    const match = result.match(/^(\d+)\./);
    if (match) return parseInt(match[1], 10) - 1;
    return -1;
  } catch (error) {
    return -1;
  }
}

// --- Task actions ---

function performTaskSwitch(logData, pendingTasks, selectedIndex) {
  const timestamp = new Date().toISOString();
  const allPending = logData.dailyLog.pendingTasks;

  if (selectedIndex < 0 || selectedIndex >= pendingTasks.length) return false;

  const selectedTask = pendingTasks[selectedIndex];
  const actualIndex = allPending.indexOf(selectedTask);
  if (actualIndex === -1) return false;

  // Move current task to pending (with accumulated time)
  const currentTask = logData.dailyLog.currentTask;
  if (currentTask) {
    const startTime = new Date(currentTask.startedAt);
    const elapsedMinutes = Math.round((new Date() - startTime) / 60000);
    const timeSpent = (currentTask.timeSpent || 0) + elapsedMinutes;

    if (currentTask.isContextOnly) {
      logData.dailyLog.completedWork.push({
        id: generateId(),
        timestamp: timestamp,
        category: 'Context',
        title: currentTask.title,
        activityContext: currentTask.activityContext,
        timeSpent: timeSpent,
        details: { startedAt: currentTask.startedAt, completedAt: timestamp }
      });
    } else {
      const pendingEntry = {
        id: generateId(),
        title: currentTask.title,
        activityContext: currentTask.activityContext,
        category: categorizeWork(currentTask.title),
        priority: 'medium',
        timeSpent: timeSpent,
        notes: [...(currentTask.notes || []), {
          text: 'Switched via task check-in',
          timestamp: timestamp
        }]
      };
      if (currentTask.routine) pendingEntry.routine = true;
      if (currentTask.jiraTicket) pendingEntry.jiraTicket = currentTask.jiraTicket;
      if (currentTask.jiraUrl) pendingEntry.jiraUrl = currentTask.jiraUrl;
      allPending.push(pendingEntry);
    }
  }

  // Remove selected task from pending and set as current
  allPending.splice(actualIndex, 1);

  logData.dailyLog.currentTask = {
    title: selectedTask.title,
    startedAt: timestamp,
    context: selectedTask.title,
    activityContext: selectedTask.activityContext || 'professional',
    timeSpent: selectedTask.timeSpent || 0,
    notes: selectedTask.notes || [],
    isContextOnly: false
  };
  if (selectedTask.routine) logData.dailyLog.currentTask.routine = true;
  if (selectedTask.jiraTicket) logData.dailyLog.currentTask.jiraTicket = selectedTask.jiraTicket;
  if (selectedTask.jiraUrl) logData.dailyLog.currentTask.jiraUrl = selectedTask.jiraUrl;

  logData.dailyLog.contextFilter = selectedTask.activityContext || 'professional';
  return true;
}

function performPause(logData) {
  const timestamp = new Date().toISOString();
  const currentTask = logData.dailyLog.currentTask;
  if (!currentTask) return;

  const startTime = new Date(currentTask.startedAt);
  const elapsedMinutes = Math.round((new Date() - startTime) / 60000);
  const timeSpent = (currentTask.timeSpent || 0) + elapsedMinutes;

  if (currentTask.isContextOnly) {
    logData.dailyLog.completedWork.push({
      id: generateId(),
      timestamp: timestamp,
      category: 'Context',
      title: currentTask.title,
      activityContext: currentTask.activityContext,
      timeSpent: timeSpent,
      details: { startedAt: currentTask.startedAt, completedAt: timestamp }
    });
  } else {
    const pendingEntry = {
      id: generateId(),
      title: currentTask.title,
      activityContext: currentTask.activityContext,
      category: categorizeWork(currentTask.title),
      priority: 'medium',
      timeSpent: timeSpent,
      notes: [...(currentTask.notes || []), {
        text: 'Paused via task check-in',
        timestamp: timestamp
      }]
    };
    if (currentTask.routine) pendingEntry.routine = true;
    if (currentTask.jiraTicket) pendingEntry.jiraTicket = currentTask.jiraTicket;
    if (currentTask.jiraUrl) pendingEntry.jiraUrl = currentTask.jiraUrl;
    logData.dailyLog.pendingTasks.push(pendingEntry);
  }

  logData.dailyLog.currentTask = {
    title: 'unstructured',
    activityContext: 'unstructured',
    startedAt: timestamp,
    timeSpent: 0,
    isContextOnly: true
  };
  logData.dailyLog.contextFilter = 'unstructured';
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
  const today = getLocalDate(now);
  const logData = loadDailyLog(today);

  if (!logData) {
    log('No daily log for today, skipping');
    saveState({ lastCheck: now.toISOString(), lastTaskTitle: null, snoozeUntil: null });
    return;
  }

  const state = loadState();

  const skipReason = shouldSkip(logData, state, now);
  if (skipReason) {
    log(`Skipping: ${skipReason}`);
    saveState({
      lastCheck: now.toISOString(),
      lastTaskTitle: logData.dailyLog.currentTask?.title || null,
      snoozeUntil: state?.snoozeUntil || null
    });
    return;
  }

  const currentTask = logData.dailyLog.currentTask;
  const startTime = new Date(currentTask.startedAt);
  const elapsedMinutes = Math.round((now - startTime) / 60000);
  const totalTime = (currentTask.timeSpent || 0) + elapsedMinutes;
  const elapsedStr = formatTimeSpent(totalTime);
  const emoji = CONTEXT_EMOJI[currentTask.activityContext] || '💼';

  const taskTitle = currentTask.isContextOnly
    ? `${emoji} ${currentTask.activityContext} (context tracking)`
    : `${emoji} ${currentTask.title}`;

  // Get non-routine pending tasks, sorted: current context first, then by priority
  const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
  const currentContext = currentTask.activityContext || 'professional';
  const pendingTasks = (logData.dailyLog.pendingTasks || [])
    .filter(t => !t.routine)
    .sort((a, b) => {
      const aMatch = (a.activityContext || 'professional') === currentContext ? 0 : 1;
      const bMatch = (b.activityContext || 'professional') === currentContext ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      const aPri = PRIORITY_ORDER[a.priority] ?? 1;
      const bPri = PRIORITY_ORDER[b.priority] ?? 1;
      return aPri - bPri;
    });
  const hasPendingTasks = pendingTasks.length > 0;

  log(`Showing check dialog for "${currentTask.title}" (${elapsedStr})`);

  // Step 1: Show the main check dialog
  const action = showCheckDialog(taskTitle, elapsedStr, hasPendingTasks);

  if (action === 'continue') {
    log('User chose to continue');
    saveState({
      lastCheck: now.toISOString(),
      lastTaskTitle: currentTask.title,
      snoozeUntil: null
    });
    return;
  }

  if (action === 'pause') {
    log('User chose to pause');
    performPause(logData);
    saveDailyLog(logData);
    saveState({
      lastCheck: now.toISOString(),
      lastTaskTitle: 'unstructured',
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
        lastTaskTitle: currentTask.title,
        snoozeUntil: null
      });
      return;
    }

    const selectedTask = pendingTasks[selectedIndex];
    log(`User switching to task: "${selectedTask.title}"`);

    if (performTaskSwitch(logData, pendingTasks, selectedIndex)) {
      saveDailyLog(logData);
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
