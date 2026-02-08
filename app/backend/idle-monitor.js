#!/usr/bin/env node
/**
 * Idle Monitor - Heartbeat-based idle detection for auto-pausing tasks.
 *
 * Runs every 2 minutes via launchd. Writes a heartbeat timestamp each run.
 * If the gap between heartbeats exceeds IDLE_THRESHOLD (5 min), it means
 * the computer was asleep/idle. In that case, the current task is paused
 * (backdated to the last heartbeat) and tracking switches to unstructured.
 */

const fs = require('fs');
const path = require('path');

// Constants
const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const BASE_DIR = path.join(__dirname, '..', '..');
const LOG_DIR = path.join(BASE_DIR, 'tracking', 'daily-logs');
const HEARTBEAT_DIR = path.join(BASE_DIR, 'tracking', 'idle-monitor');
const HEARTBEAT_FILE = path.join(HEARTBEAT_DIR, 'heartbeat.json');

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

function createDailyLog(date) {
  return {
    date: date,
    dailyLog: {
      completedWork: [],
      currentTask: null,
      pendingTasks: [],
      notes: [],
      contextFilter: null
    },
    context: {
      personal: 0, social: 0, professional: 0,
      cultivo: 0, projects: 0, health: 0, unstructured: 0
    }
  };
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

// --- Heartbeat functions ---

function loadHeartbeat() {
  if (!fs.existsSync(HEARTBEAT_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveHeartbeat(data) {
  fs.mkdirSync(HEARTBEAT_DIR, { recursive: true });
  fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// --- Core logic ---

function findActiveTaskLog(now) {
  const today = getLocalDate(now);

  // Check today first
  const todayLog = loadDailyLog(today);
  if (todayLog && todayLog.dailyLog.currentTask) {
    return { logData: todayLog, logDate: today };
  }

  // Check up to 3 days back
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = getLocalDate(d);
    const logData = loadDailyLog(dateStr);
    if (logData && logData.dailyLog.currentTask) {
      return { logData, logDate: dateStr };
    }
  }

  return null;
}

function autoPauseTask(logData, endTime) {
  const currentTask = logData.dailyLog.currentTask;
  const startTime = new Date(currentTask.startedAt);

  // If the task was started after the heartbeat (e.g., user switched tasks
  // between heartbeats), use the task's own start time (0 elapsed)
  if (endTime < startTime) {
    endTime = new Date(startTime);
  }

  const endTimeISO = endTime.toISOString();
  const diffMs = endTime - startTime;
  const elapsedMinutes = Math.round(diffMs / 60000);
  const timeSpent = (currentTask.timeSpent || 0) + elapsedMinutes;

  if (currentTask.isContextOnly) {
    // Context-only: log time to completedWork
    logData.dailyLog.completedWork.push({
      id: generateId(),
      timestamp: endTimeISO,
      category: 'Context',
      title: currentTask.title,
      activityContext: currentTask.activityContext,
      timeSpent: timeSpent,
      details: { startedAt: currentTask.startedAt, completedAt: endTimeISO }
    });
  } else {
    // Regular task: move to pending with auto-pause note
    const pendingEntry = {
      id: generateId(),
      title: currentTask.title,
      activityContext: currentTask.activityContext,
      category: categorizeWork(currentTask.title),
      priority: 'medium',
      timeSpent: timeSpent,
      notes: [...(currentTask.notes || []), {
        text: 'Auto-paused (idle detected)',
        timestamp: endTimeISO
      }]
    };
    if (currentTask.routine) pendingEntry.routine = true;
    if (currentTask.jiraTicket) pendingEntry.jiraTicket = currentTask.jiraTicket;
    if (currentTask.jiraUrl) pendingEntry.jiraUrl = currentTask.jiraUrl;

    logData.dailyLog.pendingTasks.push(pendingEntry);
  }

  // Switch to unstructured context-only tracking starting at heartbeat time
  logData.dailyLog.currentTask = {
    title: 'unstructured',
    activityContext: 'unstructured',
    startedAt: endTimeISO,
    timeSpent: 0,
    isContextOnly: true
  };
  logData.dailyLog.contextFilter = 'unstructured';
}

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] idle-monitor: ${message}`);
}

// --- Main ---

function main() {
  fs.mkdirSync(HEARTBEAT_DIR, { recursive: true });

  const now = new Date();
  const nowISO = now.toISOString();

  const heartbeat = loadHeartbeat();

  if (!heartbeat) {
    saveHeartbeat({ lastHeartbeat: nowISO, lastAction: 'init' });
    log('Heartbeat initialized');
    return;
  }

  const lastHeartbeat = new Date(heartbeat.lastHeartbeat);
  const gapMs = now - lastHeartbeat;

  if (gapMs > IDLE_THRESHOLD_MS) {
    const gapMinutes = Math.round(gapMs / 60000);
    log(`Idle gap detected: ${gapMinutes} minutes`);

    const activeLog = findActiveTaskLog(now);

    if (activeLog) {
      const { logData, logDate } = activeLog;
      const currentTask = logData.dailyLog.currentTask;

      // Skip if already unstructured context-only
      if (currentTask.isContextOnly && currentTask.activityContext === 'unstructured') {
        log('Already in unstructured mode, skipping');
      } else {
        const taskDesc = currentTask.isContextOnly
          ? `${currentTask.activityContext} (context)`
          : `"${currentTask.title}"`;

        autoPauseTask(logData, lastHeartbeat);
        saveDailyLog(logData);

        // If paused on a previous day, set up today's log too
        const today = getLocalDate(now);
        if (logDate !== today) {
          let todayLog = loadDailyLog(today);
          if (!todayLog) todayLog = createDailyLog(today);
          if (!todayLog.dailyLog.currentTask) {
            todayLog.dailyLog.currentTask = {
              title: 'unstructured',
              activityContext: 'unstructured',
              startedAt: lastHeartbeat.toISOString(),
              timeSpent: 0,
              isContextOnly: true
            };
            todayLog.dailyLog.contextFilter = 'unstructured';
            saveDailyLog(todayLog);
          }
        }

        log(`Auto-paused ${taskDesc} at ${lastHeartbeat.toLocaleTimeString()}, switched to unstructured`);
      }
    } else {
      log('No active task found, skipping');
    }

    saveHeartbeat({ lastHeartbeat: nowISO, lastAction: 'auto-pause' });
  } else {
    // Normal heartbeat, no idle detected
    saveHeartbeat({ lastHeartbeat: nowISO, lastAction: 'heartbeat' });
  }
}

try {
  main();
} catch (error) {
  log(`Error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
}
