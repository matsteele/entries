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
const { execSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { createCalendarEvent } = require('./google-calendar');
const {
  BASE_DIR, CONTEXT_EMOJI_MAP,
  loadPending, savePending,
  loadCurrent, saveCurrent,
  generateId, categorizeWork, formatTimeSpent,
  calculateContextSums, updateTaskInFile
} = require('./task-store');

// Constants
const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const HEARTBEAT_DIR = path.join(BASE_DIR, 'tracking', 'idle-monitor');
const HEARTBEAT_FILE = path.join(HEARTBEAT_DIR, 'heartbeat.json');

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

function autoPauseTask(current, endTime) {
  const task = current.task;
  if (!task) return;

  const startTime = new Date(task.startedAt);
  if (endTime < startTime) endTime = new Date(startTime);

  const endTimeISO = endTime.toISOString();
  const elapsedMinutes = Math.round((endTime - startTime) / 60000);

  // Build session
  const session = { startedAt: task.startedAt, endedAt: endTimeISO };
  try {
    const eventId = createCalendarEvent({
      title: task.title,
      activityContext: task.activityContext,
      timeSpent: elapsedMinutes,
      category: task.title === 'general' ? 'Context' : categorizeWork(task.title),
      details: { startedAt: task.startedAt, completedAt: endTimeISO }
    });
    if (eventId) session.calendarEventId = eventId;
  } catch (e) {
    // Calendar push is fire-and-forget
  }

  const totalTimeSpent = (task.timeSpent || 0) + elapsedMinutes;

  if (task.sourceType === 'pending') {
    // Put pending task back with session + auto-pause note
    let pending = loadPending();
    const taskData = {
      id: task.sourceId || generateId(),
      title: task.title,
      activityContext: task.activityContext || 'professional',
      category: categorizeWork(task.title),
      priority: 'medium',
      timeSpent: totalTimeSpent,
      notes: [...(task.notes || []), { text: 'Auto-paused (idle detected)', timestamp: endTimeISO }],
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

  // Clear current task (no automatic switch to unstructured)
  current.task = null;
  current.contextFilter = null;
  current.contextSums = calculateContextSums();
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

function showReturnFromIdleDialog(pendingTasks) {
  const taskItems = pendingTasks.slice(0, 10).map((task, idx) => {
    const emoji = CONTEXT_EMOJI_MAP[task.activityContext] || '💼';
    const timeStr = task.timeSpent > 0 ? ` (${formatTimeSpent(task.timeSpent)})` : '';
    const title = task.title || 'Untitled';
    const truncated = title.length > 55 ? title.substring(0, 52) + '...' : title;
    return `${idx + 1}. ${emoji} ${truncated}${timeStr}`;
  });

  const listItems = taskItems.map(item => `"${escapeAppleScript(item)}"`).join(', ');
  const defaultItem = `"${escapeAppleScript(taskItems[0])}"`;

  const script = `choose from list {${listItems}} with title "Welcome Back" with prompt "What are you working on?" default items {${defaultItem}}`;

  const result = runAppleScript(script, 60000);
  if (!result || result === 'false') return -1;

  const match = result.match(/^(\d+)\./);
  if (match) return parseInt(match[1], 10) - 1;
  return -1;
}

function switchToSelectedTask(current, pendingTasks, selectedIndex) {
  const timestamp = new Date().toISOString();
  if (selectedIndex < 0 || selectedIndex >= pendingTasks.length) return null;

  const selectedTask = pendingTasks[selectedIndex];

  // Remove from pending
  let pending = loadPending();
  const actualIndex = pending.findIndex(t => t.id === selectedTask.id);
  if (actualIndex === -1) return null;
  pending.splice(actualIndex, 1);
  savePending(pending);

  // Set as current
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
  current.contextSums = calculateContextSums();

  return selectedTask.title;
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

    const current = loadCurrent();

    const wasRoutine = current.task && current.task.sourceType === 'routine';

    if (current.task && !wasRoutine) {
      // Pause novel/pending tasks immediately when idle detected
      const taskDesc = current.task.title === 'general'
        ? `${current.task.activityContext} (context)`
        : `"${current.task.title}"`;

      autoPauseTask(current, lastHeartbeat);
      saveCurrent(current);

      log(`Auto-paused ${taskDesc} at ${lastHeartbeat.toLocaleTimeString()}`);

      // Show picker immediately for novel tasks
      const pending = loadPending();
      if (pending.length > 0) {
        log('Showing return-from-idle task picker');
        const selectedIndex = showReturnFromIdleDialog(pending);
        if (selectedIndex >= 0) {
          const reloaded = loadCurrent();
          const taskTitle = switchToSelectedTask(reloaded, pending, selectedIndex);
          if (taskTitle) {
            saveCurrent(reloaded);
            log(`Switched to "${taskTitle}" via return-from-idle picker`);
          }
        } else {
          log('User dismissed return-from-idle picker');
        }
      }
      saveHeartbeat({ lastHeartbeat: nowISO, lastAction: 'auto-pause' });
    } else if (wasRoutine) {
      // Routine task is active — don't pause it yet, mark that we're in idle
      log(`Idle detected with routine task running: "${current.task.title}"`);
      saveHeartbeat({ lastHeartbeat: nowISO, lastAction: 'idle-detected-routine' });
    } else {
      log('No active task found');
      saveHeartbeat({ lastHeartbeat: nowISO, lastAction: 'auto-pause' });
    }
  } else {
    // Normal heartbeat, no idle gap
    const current = loadCurrent();

    // If we were in idle with a routine task running, pause it now that user is back
    if (heartbeat.lastAction === 'idle-detected-routine' && current.task && current.task.sourceType === 'routine') {
      const taskDesc = current.task.title === 'general'
        ? `${current.task.activityContext} (context)`
        : `"${current.task.title}"`;

      // End the routine task at now (includes idle time, assuming you were doing that activity during idle)
      autoPauseTask(current, now);
      saveCurrent(current);

      log(`Paused routine task on return from idle: ${taskDesc}`);

      // Now show picker to switch to next task
      const pending = loadPending();
      if (pending.length > 0) {
        log('Showing return-from-idle task picker');
        const selectedIndex = showReturnFromIdleDialog(pending);
        if (selectedIndex >= 0) {
          const reloaded = loadCurrent();
          const taskTitle = switchToSelectedTask(reloaded, pending, selectedIndex);
          if (taskTitle) {
            saveCurrent(reloaded);
            log(`Switched to "${taskTitle}" via return-from-idle picker`);
          }
        } else {
          log('User dismissed return-from-idle picker');
        }
      }
    }

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
