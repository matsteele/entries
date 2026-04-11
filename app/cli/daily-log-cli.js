#!/usr/bin/env node
/**
 * Daily Log CLI - Task tracking with split-file storage.
 * Uses task-store.js for all I/O across:
 *   tracking/pending.json, completed.json, routine.json, current.json
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const _pgPool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

/** Write a completed session to task_sessions table (fire-and-forget). */
function writeSessionToDB(task, session) {
  if (!_pgPool) return;
  const focusLevel = task.focusLevel !== undefined ? task.focusLevel
    : (task.activityContext === 'us' ? 0 : task.sourceType === 'routine' ? 1 : 2);
  _pgPool.query(
    `INSERT INTO task_sessions (task_id, task_title, context, focus_level, started_at, ended_at, source)
     VALUES ($1, $2, $3, $4, $5, $6, 'live')
     ON CONFLICT DO NOTHING`,
    [task.sourceId || task.id || `anon-${Date.now()}`, task.title, task.activityContext || 'prof',
     focusLevel, session.startedAt, session.endedAt]
  ).catch(() => {}); // fire-and-forget
}
const { createTimeTrackingCalendar, listCalendarEvents, CONTEXT_COLOR_MAP } = require('../backend/google-calendar');
const store = require('../backend/task-store');

const {
  BASE_DIR, CONTEXT_EMOJI_MAP, ALL_CONTEXTS,
  DEFAULT_PRIORITY, DEFAULT_FOCUS,
  loadPending, savePending, loadCompleted, saveCompleted,
  loadRoutine, saveRoutine, loadCurrent, saveCurrent,
  generateId, getLocalDate, getMidnightToday,
  calculateElapsedMinutes, calculateElapsedMinutesUntil, formatTimeSpent, parseCustomTime,
  categorizeWork, detectPriority, detectFocus, detectContext, normalizeContext,
  normalizePriority, normalizeFocus, priorityEmoji, priorityLabel, focusEmoji, focusLabel, extractTitle,
  getDisplayOrderedTasks, ensureRoutineTask, findRoutineTask,
  calculateContextSums,
  updateTaskInFile,
  getTodaySessions,
  incrementCompletedToday
} = store;

const TODAY = getLocalDate();

// ─── Google Tasks completion sync (best-effort) ────────────────────────────
function syncGoogleTaskCompletion(task) {
  if (!task?.googleTaskId || !task?.googleTaskListId) return;
  try {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) return;
    const { execSync } = require('child_process');
    const tokenRes = execSync(
      `curl -s -X POST https://oauth2.googleapis.com/token ` +
      `-d client_id="${GOOGLE_CLIENT_ID}" ` +
      `-d client_secret="${GOOGLE_CLIENT_SECRET}" ` +
      `-d refresh_token="${GOOGLE_REFRESH_TOKEN}" ` +
      `-d grant_type=refresh_token`,
      { encoding: 'utf8', timeout: 5000 }
    );
    const accessToken = JSON.parse(tokenRes).access_token;
    if (!accessToken) return;
    execSync(
      `curl -s -X PATCH ` +
      `-H "Authorization: Bearer ${accessToken}" ` +
      `-H "Content-Type: application/json" ` +
      `-d '{"status":"completed"}' ` +
      `"https://www.googleapis.com/tasks/v1/lists/${task.googleTaskListId}/tasks/${task.googleTaskId}"`,
      { encoding: 'utf8', timeout: 5000 }
    );
  } catch (e) { /* best-effort — don't block task completion */ }
}

// ─── Core helper: end the active session on current task ────────────────────

/**
 * End the current task's active session. Handles:
 * - Building session object
 * - Pushing calendar event (fire-and-forget)
 * - For routine: updating the source task in routine.json
 * - Returns rebuilt task data for pending tasks (caller saves)
 *
 * Does NOT modify current.json — caller does that.
 *
 * @param {object} current - The current state (from loadCurrent)
 * @param {Date} endTime - When the session ends
 * @returns {object|null} { session, elapsedMinutes, totalTimeSpent, taskData }
 */
function endCurrentSession(current, endTime) {
  if (!current.task || !current.task.startedAt) return null;

  const task = current.task;
  const endTimestamp = endTime.toISOString();
  const elapsedMinutes = calculateElapsedMinutesUntil(task.startedAt, endTime);
  const totalTimeSpent = (task.timeSpent || 0) + elapsedMinutes;

  const session = { startedAt: task.startedAt, endedAt: endTimestamp };

  // Persist session to Postgres (fire-and-forget)
  writeSessionToDB(task, session);

  // For routine tasks: update the source task in routine.json
  if (task.sourceType === 'routine' && task.sourceId) {
    updateTaskInFile(task.sourceId, (t) => {
      t.timeSpent = (t.timeSpent || 0) + elapsedMinutes;
      if (!t.sessions) t.sessions = [];
      t.sessions.push(session);
    });
  }

  // Build task data (used by pending tasks for put-back or completion)
  const taskData = {
    id: task.sourceId || generateId(),
    title: task.title,
    activityContext: task.activityContext || 'professional',
    category: task.category || categorizeWork(task.title),
    priority: normalizePriority(task.priority),
    timeSpent: totalTimeSpent,
    notes: task.notes || [],
    sessions: [...(task.sessions || []), session]
  };

  // Preserve metadata fields
  if (task.jiraTicket) taskData.jiraTicket = task.jiraTicket;
  if (task.jiraUrl) taskData.jiraUrl = task.jiraUrl;
  if (task.jiraStatus) taskData.jiraStatus = task.jiraStatus;
  if (task.googleTaskId) taskData.googleTaskId = task.googleTaskId;
  if (task.googleTaskListId) taskData.googleTaskListId = task.googleTaskListId;
  if (task.googleTaskListName) taskData.googleTaskListName = task.googleTaskListName;

  return { session, elapsedMinutes, totalTimeSpent, taskData };
}

// ─── Pending upsert helper ──────────────────────────────────────────────────

/** Replace existing pending task by ID, or push if not found. */
function upsertPending(pending, taskData) {
  const idx = pending.findIndex(t => t.id === taskData.id);
  if (idx !== -1) {
    pending[idx] = taskData;
  } else {
    pending.push(taskData);
  }
}

// ─── View helpers ───────────────────────────────────────────────────────────

function getViewTasks(current) {
  const viewMode = current.viewMode || 'novel';
  const tasks = viewMode === 'routine' ? loadRoutine() : loadPending();
  return getDisplayOrderedTasks(tasks, current.contextFilter);
}

/**
 * Resolve a task ID to its 1-based display number in the unfiltered list.
 * Searches pending first, then routine. Returns { number, viewMode } or null.
 * Temporarily sets current viewMode/contextFilter so the existing numbered
 * functions work correctly, and returns a cleanup function to restore state.
 */
function prepareByIdContext(taskId) {
  const pendingOrdered = getDisplayOrderedTasks(loadPending(), null);
  let idx = pendingOrdered.findIndex(t => t.id === taskId);
  if (idx !== -1) {
    return { number: idx + 1, viewMode: 'novel' };
  }
  const routineOrdered = getDisplayOrderedTasks(loadRoutine(), null);
  idx = routineOrdered.findIndex(t => t.id === taskId);
  if (idx !== -1) {
    return { number: idx + 1, viewMode: 'routine' };
  }
  return null;
}

function withIdContext(taskId, fn) {
  const resolved = prepareByIdContext(taskId);
  if (!resolved) {
    console.error(`\n❌ Task not found: ${taskId}\n`);
    process.exit(1);
  }
  const current = loadCurrent();
  const savedView = current.viewMode;
  const savedFilter = current.contextFilter;
  current.viewMode = resolved.viewMode;
  current.contextFilter = null;
  saveCurrent(current);
  fn(resolved.number);
  // Note: some functions (switchToTask) overwrite contextFilter themselves, which is correct.
  // For others (setTaskFocus, etc.) we restore the original filter.
  const after = loadCurrent();
  if (after.viewMode === resolved.viewMode && after.contextFilter === null) {
    after.viewMode = savedView;
    after.contextFilter = savedFilter;
    saveCurrent(after);
  }
}

// ─── Task switching ─────────────────────────────────────────────────────────

// ─── Report helpers ──────────────────────────────────────────────────────────

function computeFocusedMinutes(sessions) {
  let focused = 0;
  for (const s of sessions) {
    if (!s.session.startedAt || !s.session.endedAt) continue;
    const mins = (new Date(s.session.endedAt) - new Date(s.session.startedAt)) / 60000;
    focused += mins * (s.focusLevel || 0);
  }
  return focused;
}

function getTopTasksByTime(tasks, n = 3) {
  return tasks
    .filter(t => (t.timeSpent || 0) > 0)
    .sort((a, b) => (b.timeSpent || 0) - (a.timeSpent || 0))
    .slice(0, n);
}

function printDayReport() {
  const todayStr = getLocalDate();
  const sums = calculateContextSums();
  const daySums = sums.day || {};
  const totalMins = Object.values(daySums).reduce((a, b) => a + b, 0);

  // Focused minutes from today's sessions
  const sessions = getTodaySessions();
  const focusedMins = computeFocusedMinutes(sessions);

  // Top tasks: combine pending + completed for today
  const pending = loadPending();
  const completed = loadCompleted();
  const routine = loadRoutine();
  const current = loadCurrent();

  const allTasks = [...pending, ...completed, ...routine];
  if (current.task) allTasks.push(current.task);
  const todayTasks = allTasks.filter(t => {
    const sess = t.sessions || [];
    return sess.some(s => getLocalDate(new Date(s.startedAt)) === todayStr);
  });
  const topTasks = getTopTasksByTime(todayTasks, 3);

  console.log('\n📊 Daily Report — ' + todayStr);
  console.log('─'.repeat(40));
  console.log(`  Total tracked:    ${formatTimeSpent(totalMins)}`);
  console.log(`  Focused minutes:  ${formatTimeSpent(Math.round(focusedMins))}`);
  console.log('\n  By context:');
  for (const [ctx, mins] of Object.entries(daySums)) {
    if (mins < 1) continue;
    const emoji = CONTEXT_EMOJI_MAP[ctx] || '·';
    console.log(`    ${emoji} ${ctx.padEnd(14)} ${formatTimeSpent(mins)}`);
  }
  if (topTasks.length > 0) {
    console.log('\n  Top tasks:');
    topTasks.forEach((t, i) => {
      console.log(`    ${i + 1}. ${t.title} (${formatTimeSpent(t.timeSpent)})`);
    });
  }
  console.log('');
}

function printWeekReport() {
  const sums = calculateContextSums();
  const weekSums = sums.week || {};
  const totalMins = Object.values(weekSums).reduce((a, b) => a + b, 0);

  // Approximate focused minutes from completed+pending sessions in week window
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const pending = loadPending();
  const completed = loadCompleted();
  const routine = loadRoutine();
  const current = loadCurrent();
  const allTasks = [...pending, ...completed, ...routine];
  if (current.task) allTasks.push(current.task);

  let focusedMins = 0;
  const taskMinsMap = {};
  for (const task of allTasks) {
    let taskWeekMins = 0;
    for (const s of (task.sessions || [])) {
      if (!s.startedAt) continue;
      const start = new Date(s.startedAt);
      if (start < weekStart) continue;
      const end = s.endedAt ? new Date(s.endedAt) : now;
      const mins = (end - start) / 60000;
      taskWeekMins += mins;
      focusedMins += mins * (task.focusLevel || 0);
    }
    if (taskWeekMins > 0) {
      const key = task.title;
      taskMinsMap[key] = (taskMinsMap[key] || 0) + taskWeekMins;
    }
  }

  const topTasks = Object.entries(taskMinsMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  console.log('\n📊 Week Report — week of ' + weekStart.toISOString().slice(0, 10));
  console.log('─'.repeat(40));
  console.log(`  Total tracked:    ${formatTimeSpent(totalMins)}`);
  console.log(`  Focused minutes:  ${formatTimeSpent(Math.round(focusedMins))}`);
  console.log('\n  By context:');
  for (const [ctx, mins] of Object.entries(weekSums)) {
    if (mins < 1) continue;
    const emoji = CONTEXT_EMOJI_MAP[ctx] || '·';
    console.log(`    ${emoji} ${ctx.padEnd(14)} ${formatTimeSpent(mins)}`);
  }
  if (topTasks.length > 0) {
    console.log('\n  Top tasks:');
    topTasks.forEach(([title, mins], i) => {
      console.log(`    ${i + 1}. ${title} (${formatTimeSpent(Math.round(mins))})`);
    });
  }
  console.log('');
}

function switchToTask(taskNumber) {
  const current = loadCurrent();
  const now = new Date();
  const timestamp = now.toISOString();
  const viewMode = current.viewMode || 'novel';
  const displayTasks = getViewTasks(current);

  const taskIndex = taskNumber - 1;
  if (taskIndex < 0 || taskIndex >= displayTasks.length) {
    const filterStr = current.contextFilter ? current.contextFilter + ' ' : '';
    console.error(`\n❌ Invalid task number. You have ${displayTasks.length} ${filterStr}${viewMode} tasks.\n`);
    process.exit(1);
  }

  const targetTask = displayTasks[taskIndex];

  // End current session if active
  if (current.task) {
    const endResult = endCurrentSession(current, now);
    if (endResult && current.task.sourceType === 'pending') {
      const pending = loadPending();
      upsertPending(pending, endResult.taskData);
      savePending(pending);
      const emoji = CONTEXT_EMOJI_MAP[current.task.activityContext] || '💼';
      const timeStr = formatTimeSpent(endResult.totalTimeSpent);
      console.log(`\n⏸️  ${emoji} ${current.task.title} (${timeStr})`);
    } else if (endResult && current.task.sourceType === 'routine') {
      const emoji = CONTEXT_EMOJI_MAP[current.task.activityContext] || '💼';
      const timeStr = formatTimeSpent(endResult.totalTimeSpent);
      if (current.task.title === 'general') {
        console.log(`\n⏸️  ${emoji} ${current.task.activityContext} context time logged: ${timeStr}`);
      } else {
        console.log(`\n⏸️  ${emoji} ${current.task.title} (${timeStr})`);
      }
    }
  }

  // Clear current temporarily for sum calculation
  current.task = null;
  saveCurrent(current);

  // For pending (novel) view: splice from pending.json
  if (viewMode !== 'routine') {
    const pending = loadPending();
    const actualIdx = pending.findIndex(t => t.id === targetTask.id);
    if (actualIdx !== -1) {
      pending.splice(actualIdx, 1);
      savePending(pending);
    }
  }

  // Build new current task
  const newTask = {
    title: targetTask.title,
    activityContext: targetTask.activityContext || 'professional',
    startedAt: timestamp,
    timeSpent: targetTask.timeSpent || 0,
    sourceType: viewMode === 'routine' ? 'routine' : 'pending',
    sourceId: targetTask.id,
    notes: targetTask.notes || [],
    sessions: targetTask.sessions || [],
    category: targetTask.category || categorizeWork(targetTask.title),
    priority: targetTask.priority || 'medium',
    focusLevel: targetTask.focusLevel ?? null
  };

  if (targetTask.jiraTicket) newTask.jiraTicket = targetTask.jiraTicket;
  if (targetTask.jiraUrl) newTask.jiraUrl = targetTask.jiraUrl;
  if (targetTask.jiraStatus) newTask.jiraStatus = targetTask.jiraStatus;
  if (targetTask.googleTaskId) newTask.googleTaskId = targetTask.googleTaskId;

  current.task = newTask;
  current.contextFilter = targetTask.activityContext || 'professional';
  current.contextSums = calculateContextSums();
  saveCurrent(current);

  const emoji = CONTEXT_EMOJI_MAP[newTask.activityContext] || '💼';
  const timeStr = formatTimeSpent(targetTask.timeSpent || 0);
  if (targetTask.timeSpent && targetTask.timeSpent > 0) {
    console.log(`\n✅ ${emoji} : ${newTask.title} ${timeStr}\n`);
  } else {
    console.log(`\n✅ ${emoji} : ${newTask.title}\n`);
  }

  // Protocol surfacing: look up related protocols from DB (fire-and-forget)
  if (_pgPool && !targetTask.protocolHints) {
    const keywords = newTask.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (keywords.length > 0) {
      const pattern = '%' + keywords.slice(0, 3).join('%') + '%';
      _pgPool.query(
        `SELECT id, content FROM journals WHERE type = 'protocol' AND LOWER(content) ILIKE $1 LIMIT 3`,
        [pattern]
      ).then(res => {
        if (res.rows.length > 0) {
          console.log('📋 Related protocols:');
          res.rows.forEach(row => {
            // Extract protocol title from first line
            const firstLine = row.content.split('\n')[0].replace(/^Protocol:\s*/i, '').trim();
            console.log(`   · ${firstLine}`);
          });
          console.log('');
          // Cache hints on current task
          const c = loadCurrent();
          if (c.task) {
            c.task.protocolHints = res.rows.map(r => r.id);
            saveCurrent(c);
          }
        }
      }).catch(() => {});
    }
  }
}

// ─── Fuzzy search for tasks ─────────────────────────────────────────────────

/**
 * Find best matches for a search query across routine and pending tasks.
 * Uses priority-based matching: exact → substring → word → reverse.
 */
function findBestMatches(searchQuery, tasks) {
  // 1. Exact match (highest priority)
  const exact = tasks.filter(t => t.title.toLowerCase() === searchQuery);
  if (exact.length > 0) return exact;

  // 2. Substring match (task title contains query)
  const substring = tasks.filter(t => t.title.toLowerCase().includes(searchQuery));
  if (substring.length > 0) return substring;

  // 3. Word-based match (all words in query appear in title)
  const words = searchQuery.split(/\s+/);
  const wordMatches = tasks.filter(t => {
    const titleLower = t.title.toLowerCase();
    return words.every(word => titleLower.includes(word));
  });
  if (wordMatches.length > 0) return wordMatches;

  // 4. Reverse match (query contains task title)
  const reverse = tasks.filter(t => searchQuery.includes(t.title.toLowerCase()));
  if (reverse.length > 0) return reverse;

  return [];
}

/**
 * Fuzzy search across routine and pending tasks, then switch to the best match.
 * Searches all contexts and ignores current view mode.
 */
function fuzzySearchAndSwitch(query) {
  const current = loadCurrent();
  const searchQuery = query.toLowerCase().trim();

  // Load both routine and novel tasks, excluding 'general' placeholder
  const routine = loadRoutine().filter(t => t.title !== 'general');
  const pending = loadPending();
  const allTasks = [...routine, ...pending];

  if (allTasks.length === 0) {
    console.error('\n❌ No tasks available to search\n');
    process.exit(1);
  }

  // Search with priority matching
  const matches = findBestMatches(searchQuery, allTasks);

  if (matches.length === 0) {
    console.error(`\n❌ No tasks found matching "${query}"\n`);
    console.log('Run /t to see all tasks\n');
    process.exit(1);
  }

  // Auto-switch to first/best match
  const bestMatch = matches[0];

  // Determine if it's routine or pending
  const isRoutine = routine.some(t => t.id === bestMatch.id);

  // Switch view mode to match task type
  current.viewMode = isRoutine ? 'routine' : 'novel';
  current.contextFilter = null; // Clear filter to show all tasks
  saveCurrent(current);

  // Get display tasks with correct view mode
  const displayTasks = getViewTasks(current);
  const taskIndex = displayTasks.findIndex(t => t.id === bestMatch.id);

  if (taskIndex === -1) {
    console.error('\n❌ Error: Task not found in display list\n');
    process.exit(1);
  }

  // Print search result
  const contextEmoji = CONTEXT_EMOJI_MAP[bestMatch.activityContext] || '📋';
  console.log(`\n🔍 Found: ${contextEmoji} ${bestMatch.title}`);

  if (matches.length > 1) {
    console.log(`   (${matches.length} matches found, switching to best match)\n`);
  } else {
    console.log('');
  }

  // Switch to the task (1-indexed)
  switchToTask(taskIndex + 1);
}

// ─── Completing tasks ───────────────────────────────────────────────────────

function completeCurrentTask(newTaskDescription = null) {
  const current = loadCurrent();
  const now = new Date();

  if (!current.task) {
    console.log(`\n⚠️  No current task to complete.\n`);
    return;
  }

  const task = current.task;

  if (task.sourceType === 'routine') {
    // Gracefully move away from routine task instead of trying to complete it
    pauseCurrentTask();
    console.log(`\n⚠️  Routine tasks cannot be completed. Moved away from "${task.title}".\n`);
    return;
  }

  // Grab Google Task metadata before completion moves the task
  let googleMeta = null;
  if (task.sourceId) {
    const pending = loadPending();
    const src = pending.find(t => t.id === task.sourceId);
    if (src?.googleTaskId) googleMeta = src;
  }

  const endResult = endCurrentSession(current, now);

  if (endResult) {
    const completed = loadCompleted();
    completed.push(endResult.taskData);
    saveCompleted(completed);
  }

  current.task = null;
  current.contextSums = calculateContextSums();
  saveCurrent(current);

  incrementCompletedToday();
  syncGoogleTaskCompletion(googleMeta);

  const emoji = CONTEXT_EMOJI_MAP[task.activityContext] || '💼';
  const timeStr = formatTimeSpent(endResult ? endResult.totalTimeSpent : 0);
  console.log(`\n✅ Task completed: ${emoji} ${task.title} (${timeStr})`);

  if (newTaskDescription) {
    setCurrentTask(newTaskDescription);
  } else {
    console.log(`   No current task set.\n`);
  }
}

function completeTaskByNumber(taskNumber) {
  if (taskNumber === 0) {
    completeCurrentTask();
    return;
  }

  const current = loadCurrent();
  const viewMode = current.viewMode || 'novel';

  if (viewMode === 'routine') {
    console.error(`\n❌ Cannot complete routine tasks. Switch to novel view first.\n`);
    process.exit(1);
  }

  const pending = loadPending();
  const displayTasks = getDisplayOrderedTasks(pending, current.contextFilter);

  const taskIndex = taskNumber - 1;
  if (taskIndex < 0 || taskIndex >= displayTasks.length) {
    const filterStr = current.contextFilter ? current.contextFilter + ' ' : '';
    console.error(`\n❌ Invalid task number. You have ${displayTasks.length} ${filterStr}pending tasks.\n`);
    process.exit(1);
  }

  const taskToComplete = displayTasks[taskIndex];
  const actualIdx = pending.findIndex(t => t.id === taskToComplete.id);

  const completed = loadCompleted();
  completed.push({ ...taskToComplete });
  saveCompleted(completed);

  if (actualIdx !== -1) {
    pending.splice(actualIdx, 1);
    savePending(pending);
  }

  current.contextSums = calculateContextSums();
  saveCurrent(current);
  incrementCompletedToday();
  syncGoogleTaskCompletion(taskToComplete);

  const emoji = CONTEXT_EMOJI_MAP[taskToComplete.activityContext] || '💼';
  const timeStr = taskToComplete.timeSpent > 0 ? ` (${formatTimeSpent(taskToComplete.timeSpent)})` : '';
  console.log(`\n✅ Task #${taskNumber} completed: ${emoji} ${taskToComplete.title}${timeStr}\n`);
}

function parseTaskNumbers(taskNumbersStr) {
  const match = taskNumbersStr.match(/\[([0-9,\-\s]+)\]/);
  if (!match) {
    return null;
  }

  const parts = match[1].split(',');
  const numbers = new Set();

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(n => parseInt(n.trim()));
      if (!isNaN(start) && !isNaN(end)) {
        const min = Math.min(start, end);
        const max = Math.max(start, end);
        for (let i = min; i <= max; i++) {
          numbers.add(i);
        }
      }
    } else {
      const num = parseInt(trimmed);
      if (!isNaN(num)) {
        numbers.add(num);
      }
    }
  }

  return Array.from(numbers).sort((a, b) => b - a);
}

function completeBulkTasks(taskNumbersStr) {
  const taskNumbers = parseTaskNumbers(taskNumbersStr);
  if (!taskNumbers) {
    console.error('\n❌ Invalid format. Use: c-[1,3,4,5] or c-[1-3,5-7]\n');
    process.exit(1);
  }

  if (taskNumbers.length === 0) {
    console.error('\n❌ No valid task numbers provided\n');
    process.exit(1);
  }

  const current = loadCurrent();
  const viewMode = current.viewMode || 'novel';
  let pending = loadPending();
  const completed = loadCompleted();
  let displayTasks = getDisplayOrderedTasks(pending, current.contextFilter);

  const completedList = [];
  const errors = [];

  for (const taskNumber of taskNumbers) {
    if (taskNumber === 0) {
      if (current.task) {
        if (current.task.sourceType === 'routine') {
          errors.push('#0 (routine task - cannot complete)');
          continue;
        }
        const endResult = endCurrentSession(current, new Date());
        if (endResult) {
          completed.push(endResult.taskData);
          const emoji = CONTEXT_EMOJI_MAP[current.task.activityContext] || '💼';
          completedList.push(`#0 ${emoji} ${current.task.title}`);
        }
        current.task = null;
      } else {
        errors.push('#0 (no current task)');
      }
      continue;
    }

    if (viewMode === 'routine') {
      errors.push(`#${taskNumber} (routine tasks cannot be completed)`);
      continue;
    }

    const taskIndex = taskNumber - 1;
    if (taskIndex < 0 || taskIndex >= displayTasks.length) {
      errors.push(`#${taskNumber} (invalid)`);
      continue;
    }

    const taskToComplete = displayTasks[taskIndex];
    const actualIdx = pending.findIndex(t => t.id === taskToComplete.id);

    completed.push({ ...taskToComplete });
    if (actualIdx !== -1) pending.splice(actualIdx, 1);

    const emoji = CONTEXT_EMOJI_MAP[taskToComplete.activityContext] || '💼';
    completedList.push(`#${taskNumber} ${emoji} ${taskToComplete.title}`);

    displayTasks = getDisplayOrderedTasks(pending, current.contextFilter);
  }

  savePending(pending);
  saveCompleted(completed);
  current.contextSums = calculateContextSums();
  saveCurrent(current);

  // Increment completed counter for each task
  for (let i = 0; i < completedList.length; i++) incrementCompletedToday();

  console.log(`\n✅ Bulk completed ${completedList.length} task(s):`);
  completedList.forEach(t => console.log(`   ${t}`));
  if (errors.length > 0) {
    console.log(`\n⚠️  Skipped ${errors.length} task(s):`);
    errors.forEach(e => console.log(`   ${e}`));
  }
  console.log('');
}

// ─── Pausing ────────────────────────────────────────────────────────────────

function pauseCurrentTask(customEndTime = null, addNote = null) {
  const current = loadCurrent();

  if (!current.task) return;

  const task = current.task;
  const endTime = customEndTime ? parseCustomTime(customEndTime, task.startedAt) : new Date();
  const endResult = endCurrentSession(current, endTime);

  if (!endResult) return;

  if (addNote) {
    endResult.taskData.notes.push({ text: addNote, timestamp: endTime.toISOString() });
  } else if (customEndTime) {
    endResult.taskData.notes.push({
      text: `Paused (backdated to ${endTime.toLocaleTimeString()})`,
      timestamp: endTime.toISOString()
    });
  }

  // For pending: put task back
  if (task.sourceType === 'pending') {
    const pending = loadPending();
    upsertPending(pending, endResult.taskData);
    savePending(pending);
  }
  // For routine: already updated in endCurrentSession

  current.task = null;
  current.contextSums = calculateContextSums();
  saveCurrent(current);

  const emoji = CONTEXT_EMOJI_MAP[task.activityContext] || '💼';
  const timeStr = formatTimeSpent(endResult.totalTimeSpent);

  if (task.title === 'general') {
    console.log(`\n⏸️  ${emoji} ${task.activityContext} context time logged: ${timeStr}\n`);
  } else if (addNote) {
    console.log(`\n⏸️  Task auto-paused: ${emoji} ${task.title} (${timeStr})\n`);
  } else if (customEndTime) {
    console.log(`\n⏸️  Task paused at ${endTime.toLocaleTimeString()}: ${emoji} ${task.title} (${timeStr})\n`);
  } else {
    console.log(`\n✅ Moved to pending: ${emoji} ${task.title} (${timeStr})\n`);
  }
}

function moveCurrentToPending(customEndTime = null) {
  pauseCurrentTask(customEndTime);
}

function pauseCurrentTaskWithNote() {
  pauseCurrentTask(null, 'Auto-paused (laptop sleep)');
}

// ─── Adding tasks ───────────────────────────────────────────────────────────

function parseTaskFlags(description, currentContextFilter) {
  let contextOverride = null;
  let cleanDesc = description;
  let isRoutine = false;

  // Strip p:N and f:N flags first so they don't interfere with trailing context detection
  let priorityOverride = null;
  let focusOverride = null;
  const priorityFlagMatch = cleanDesc.match(/\bp:([1-5])\b/i);
  if (priorityFlagMatch) {
    priorityOverride = parseInt(priorityFlagMatch[1]);
    cleanDesc = cleanDesc.replace(/\bp:[1-5]\b/i, '').trim();
  }
  const focusFlagMatch = cleanDesc.match(/\bf:([0-5])\b/i);
  if (focusFlagMatch) {
    focusOverride = parseInt(focusFlagMatch[1]);
    cleanDesc = cleanDesc.replace(/\bf:[0-5]\b/i, '').trim();
  }

  // Check for routine flag 'r' at end FIRST
  const routineMatch = cleanDesc.match(/\s+r$/i);
  if (routineMatch) {
    isRoutine = true;
    cleanDesc = cleanDesc.replace(/\s+r$/i, '').trim();
  }

  // Try --c flag format
  const flagMatch = cleanDesc.match(/--c[=\s]+(per|soc|prof|cul|proj|heal|learn|us|personal|social|professional|cultivo|projects|health|learning|unstructured)/i);
  if (flagMatch) {
    contextOverride = normalizeContext(flagMatch[1]);
    cleanDesc = cleanDesc.replace(/--c[=\s]+(per|soc|prof|cul|proj|heal|learn|us|personal|social|professional|cultivo|projects|health|learning|unstructured)/gi, '').trim();
  } else {
    // Try trailing context code
    const simpleMatch = cleanDesc.match(/\s+(per|soc|prof|cul|proj|heal|learn|us|personal|social|professional|cultivo|projects|health|learning|unstructured)$/i);
    if (simpleMatch) {
      contextOverride = normalizeContext(simpleMatch[1]);
      cleanDesc = cleanDesc.replace(/\s+(per|soc|prof|cul|proj|heal|learn|us|personal|social|professional|cultivo|projects|health|learning|unstructured)$/i, '').trim();
    }
  }

  const priority = priorityOverride ?? detectPriority(cleanDesc);
  cleanDesc = cleanDesc.replace(/\b(urgent|asap|critical|low|high|medium|whenever|optional)\b/gi, '').trim();
  const focusLevel = focusOverride ?? detectFocus(cleanDesc);
  cleanDesc = cleanDesc.replace(/\b(deep work|deep dive|complex|quick|routine)\b/gi, '').trim();
  const activityContext = contextOverride || currentContextFilter || detectContext(cleanDesc);
  const category = categorizeWork(cleanDesc);

  return { cleanDesc, activityContext, category, priority, focusLevel, isRoutine };
}

function addPendingTask(description) {
  const current = loadCurrent();
  const { cleanDesc, activityContext, category, priority, focusLevel, isRoutine } = parseTaskFlags(description, current.contextFilter);

  const entry = {
    id: generateId(),
    title: cleanDesc,
    activityContext,
    category,
    priority,
    focusLevel,
    timeSpent: 0,
    sessions: [],
    notes: []
  };

  if (isRoutine) {
    entry.routine = true;
    const routine = loadRoutine();
    routine.push(entry);
    saveRoutine(routine);
  } else {
    const pending = loadPending();
    pending.push(entry);
    savePending(pending);
  }

  const contextEmoji = CONTEXT_EMOJI_MAP[activityContext] || '💼';
  const routineLabel = isRoutine ? ' [R]' : '';
  console.log(`\n✅ Pending task added${routineLabel}:`);
  console.log(`   ${contextEmoji} ${priorityEmoji(priority)} [${priorityLabel(priority)}] ${focusEmoji(focusLevel)} [F:${focusLevel}] ${cleanDesc}\n`);
}

function addMultipleTasks(tasksArray, contextOverride, isRoutine) {
  const current = loadCurrent();

  let activityContext;
  if (contextOverride) {
    activityContext = normalizeContext(contextOverride);
  } else if (current.contextFilter) {
    activityContext = current.contextFilter;
  } else {
    activityContext = 'personal';
  }

  const targetArr = isRoutine ? loadRoutine() : loadPending();
  const added = [];

  for (const description of tasksArray) {
    if (!description || description.trim() === '') continue;

    const cleanDesc = description.trim();
    const priority = detectPriority(cleanDesc);
    const focusLevel = detectFocus(cleanDesc);
    const finalDesc = cleanDesc.replace(/\b(urgent|asap|critical|low|high|medium|whenever|optional|deep work|deep dive|complex|quick|routine)\b/gi, '').trim();
    const category = categorizeWork(finalDesc);

    const entry = {
      id: generateId(),
      title: finalDesc,
      activityContext,
      category,
      priority,
      focusLevel,
      timeSpent: 0,
      sessions: [],
      notes: []
    };

    if (isRoutine) entry.routine = true;
    targetArr.push(entry);

    const contextEmoji = CONTEXT_EMOJI_MAP[activityContext] || '💼';
    const routineLabel = isRoutine ? ' [R]' : '';
    added.push(`${contextEmoji} ${priorityEmoji(priority)} ${finalDesc}${routineLabel}`);
  }

  if (isRoutine) saveRoutine(targetArr);
  else savePending(targetArr);

  const contextEmoji = CONTEXT_EMOJI_MAP[activityContext] || '💼';
  console.log(`\n✅ Added ${added.length} task(s) to ${contextEmoji} ${activityContext}:`);
  added.forEach((task, idx) => console.log(`   ${idx + 1}. ${task}`));
  console.log('');
}

function addPendingTaskAndSwitch(description) {
  const current = loadCurrent();
  const now = new Date();
  const timestamp = now.toISOString();

  const { cleanDesc, activityContext, category, priority, focusLevel, isRoutine } = parseTaskFlags(description, current.contextFilter);
  const newId = generateId();

  // End current session if active
  if (current.task) {
    const endResult = endCurrentSession(current, now);
    if (endResult && current.task.sourceType === 'pending') {
      const pending = loadPending();
      upsertPending(pending, endResult.taskData);
      savePending(pending);
      const emoji = CONTEXT_EMOJI_MAP[current.task.activityContext] || '💼';
      const timeStr = formatTimeSpent(endResult.totalTimeSpent);
      console.log(`\n⏸️  Previous task moved to pending: ${emoji} ${current.task.title} (${timeStr})`);
    } else if (endResult && current.task.sourceType === 'routine') {
      const emoji = CONTEXT_EMOJI_MAP[current.task.activityContext] || '💼';
      const timeStr = formatTimeSpent(endResult.totalTimeSpent);
      if (current.task.title === 'general') {
        console.log(`\n⏸️  ${emoji} ${current.task.activityContext} context time logged: ${timeStr}`);
      } else {
        console.log(`\n⏸️  ${emoji} ${current.task.title} (${timeStr})`);
      }
    }
  }

  // Clear current for sum calculation
  current.task = null;
  saveCurrent(current);

  // If routine, also add to routine.json (so it persists on switch-away)
  if (isRoutine) {
    const routine = loadRoutine();
    routine.push({
      id: newId,
      title: cleanDesc,
      activityContext,
      category,
      priority,
      focusLevel,
      timeSpent: 0,
      sessions: [],
      notes: [],
      routine: true
    });
    saveRoutine(routine);
  }

  // Set as current
  current.task = {
    title: cleanDesc,
    activityContext,
    startedAt: timestamp,
    timeSpent: 0,
    sourceType: isRoutine ? 'routine' : 'pending',
    sourceId: newId,
    notes: [],
    sessions: [],
    category,
    priority,
    focusLevel
  };
  current.contextFilter = activityContext;
  current.contextSums = calculateContextSums();
  saveCurrent(current);

  const contextEmoji = CONTEXT_EMOJI_MAP[activityContext] || '💼';
  console.log(`\n✅ Task added and set as current:`);
  console.log(`   ${contextEmoji} [${activityContext.toUpperCase()}] ${cleanDesc}\n`);
}

// ─── Complete and switch ────────────────────────────────────────────────────

function completeCurrentAndSwitch(taskNumber) {
  const current = loadCurrent();
  const now = new Date();

  if (!current.task) {
    console.log(`\n⚠️  No current task to complete.\n`);
    return;
  }

  const task = current.task;

  if (task.sourceType === 'routine') {
    // Can't complete routine — just end session
    endCurrentSession(current, now);
    console.log(`\n⏸️  Routine task "${task.title}" session ended.`);
  } else {
    const endResult = endCurrentSession(current, now);
    if (endResult) {
      const completed = loadCompleted();
      completed.push(endResult.taskData);
      saveCompleted(completed);
    }
    const emoji = CONTEXT_EMOJI_MAP[task.activityContext] || '💼';
    const timeStr = formatTimeSpent(endResult ? endResult.totalTimeSpent : 0);
    console.log(`\n✅ Task completed: ${emoji} ${task.title} (${timeStr})`);
  }

  // Clear and switch
  current.task = null;
  saveCurrent(current);

  const viewMode = current.viewMode || 'novel';
  const tasks = viewMode === 'routine' ? loadRoutine() : loadPending();
  const displayTasks = getDisplayOrderedTasks(tasks, current.contextFilter);

  const taskIndex = taskNumber - 1;
  if (taskIndex < 0 || taskIndex >= displayTasks.length) {
    console.error(`\n❌ Invalid task number. You have ${displayTasks.length} tasks.\n`);
    process.exit(1);
  }

  const targetTask = displayTasks[taskIndex];

  if (viewMode !== 'routine') {
    const pending = loadPending();
    const actualIdx = pending.findIndex(t => t.id === targetTask.id);
    if (actualIdx !== -1) {
      pending.splice(actualIdx, 1);
      savePending(pending);
    }
  }

  const timestamp = new Date().toISOString();
  const newTask = {
    title: targetTask.title,
    activityContext: targetTask.activityContext || 'professional',
    startedAt: timestamp,
    timeSpent: targetTask.timeSpent || 0,
    sourceType: viewMode === 'routine' ? 'routine' : 'pending',
    sourceId: targetTask.id,
    notes: targetTask.notes || [],
    sessions: targetTask.sessions || [],
    category: targetTask.category || categorizeWork(targetTask.title),
    priority: normalizePriority(targetTask.priority)
  };
  if (targetTask.jiraTicket) newTask.jiraTicket = targetTask.jiraTicket;
  if (targetTask.jiraUrl) newTask.jiraUrl = targetTask.jiraUrl;

  current.task = newTask;
  current.contextFilter = targetTask.activityContext || 'professional';
  current.contextSums = calculateContextSums();
  saveCurrent(current);

  const emoji = CONTEXT_EMOJI_MAP[newTask.activityContext] || '💼';
  const timeStr = formatTimeSpent(targetTask.timeSpent || 0);
  console.log(`\n✅ Switched to: ${emoji} [${newTask.activityContext.toUpperCase()}] ${newTask.title}`);
  if (targetTask.timeSpent > 0) {
    console.log(`   ⏱️  Previous work time: ${timeStr}\n`);
  } else {
    console.log('');
  }
}

// ─── Deleting tasks ─────────────────────────────────────────────────────────

function deleteTask(taskNumber) {
  if (taskNumber === 0) {
    const current = loadCurrent();
    if (!current.task) {
      console.log(`\n⚠️  No current task to delete.\n`);
      return;
    }
    const taskTitle = current.task.title;
    current.task = null;
    saveCurrent(current);
    console.log(`\n🗑️  Current task deleted: ${taskTitle}\n`);
    return;
  }

  const current = loadCurrent();
  const viewMode = current.viewMode || 'novel';
  const allTasks = viewMode === 'routine' ? loadRoutine() : loadPending();
  const displayTasks = getDisplayOrderedTasks(allTasks, current.contextFilter);

  const taskIndex = taskNumber - 1;
  if (taskIndex < 0 || taskIndex >= displayTasks.length) {
    const filterStr = current.contextFilter ? current.contextFilter + ' ' : '';
    console.error(`\n❌ Invalid task number. You have ${displayTasks.length} ${filterStr}tasks.\n`);
    process.exit(1);
  }

  const taskToDelete = displayTasks[taskIndex];
  const actualIdx = allTasks.findIndex(t => t.id === taskToDelete.id);
  const taskTitle = taskToDelete.title;

  if (actualIdx !== -1) allTasks.splice(actualIdx, 1);

  if (viewMode === 'routine') saveRoutine(allTasks);
  else savePending(allTasks);

  console.log(`\n🗑️  Task #${taskNumber} deleted: ${taskTitle}\n`);
}

function deleteBulkTasks(taskNumbersStr) {
  const taskNumbers = parseTaskNumbers(taskNumbersStr);
  if (!taskNumbers) {
    console.error('\n❌ Invalid format. Use: d-[2,3,4,5] or d-[1-3,5-7]\n');
    process.exit(1);
  }

  if (taskNumbers.length === 0) {
    console.error('\n❌ No valid task numbers provided\n');
    process.exit(1);
  }

  const current = loadCurrent();
  const viewMode = current.viewMode || 'novel';
  let allTasks = viewMode === 'routine' ? loadRoutine() : loadPending();
  let displayTasks = getDisplayOrderedTasks(allTasks, current.contextFilter);

  const deleted = [];
  const errors = [];

  for (const taskNumber of taskNumbers) {
    if (taskNumber === 0) {
      if (current.task) {
        deleted.push(`#0 ${current.task.title}`);
        current.task = null;
      } else {
        errors.push('#0 (no current task)');
      }
      continue;
    }

    const taskIndex = taskNumber - 1;
    if (taskIndex < 0 || taskIndex >= displayTasks.length) {
      errors.push(`#${taskNumber} (invalid)`);
      continue;
    }

    const taskToDelete = displayTasks[taskIndex];
    const actualIdx = allTasks.findIndex(t => t.id === taskToDelete.id);
    deleted.push(`#${taskNumber} ${taskToDelete.title}`);
    if (actualIdx !== -1) allTasks.splice(actualIdx, 1);

    displayTasks = getDisplayOrderedTasks(allTasks, current.contextFilter);
  }

  if (viewMode === 'routine') saveRoutine(allTasks);
  else savePending(allTasks);
  saveCurrent(current);

  console.log(`\n🗑️  Bulk deleted ${deleted.length} task(s):`);
  deleted.forEach(t => console.log(`   ${t}`));
  if (errors.length > 0) {
    console.log(`\n⚠️  Skipped ${errors.length} task(s):`);
    errors.forEach(e => console.log(`   ${e}`));
  }
  console.log('');
}

// ─── View mode and context ──────────────────────────────────────────────────

function toggleViewMode() {
  const current = loadCurrent();
  const newMode = (current.viewMode || 'novel') === 'novel' ? 'routine' : 'novel';
  current.viewMode = newMode;
  saveCurrent(current);

  const tasks = newMode === 'routine' ? loadRoutine() : loadPending();
  const filteredTasks = getDisplayOrderedTasks(tasks, current.contextFilter);
  const filterStr = current.contextFilter ? ` (${current.contextFilter})` : '';
  const modeEmoji = newMode === 'routine' ? '🔄' : '✨';
  console.log(`\n${modeEmoji} View mode: ${newMode.toUpperCase()}${filterStr} (${filteredTasks.length} tasks)\n`);
}

function modifyTaskContext(taskNumber, newContextCode) {
  const newContext = normalizeContext(newContextCode);

  if (taskNumber === 0) {
    const current = loadCurrent();
    if (!current.task) {
      console.log('\n⚠️  No current task to modify.\n');
      return;
    }
    const oldContext = current.task.activityContext || 'professional';
    current.task.activityContext = newContext;
    current.contextFilter = newContext;
    saveCurrent(current);

    const newEmoji = CONTEXT_EMOJI_MAP[newContext] || '💼';
    const oldEmoji = CONTEXT_EMOJI_MAP[oldContext] || '💼';
    console.log(`\n✅ Current task context modified:`);
    console.log(`   ${oldEmoji} [${oldContext.toUpperCase()}] → ${newEmoji} [${newContext.toUpperCase()}]`);
    console.log(`   ${current.task.title}\n`);
    return;
  }

  const current = loadCurrent();
  const viewMode = current.viewMode || 'novel';
  const allTasks = viewMode === 'routine' ? loadRoutine() : loadPending();
  const displayTasks = getDisplayOrderedTasks(allTasks, current.contextFilter);

  if (taskNumber < 1 || taskNumber > displayTasks.length) {
    console.error(`\n❌ Invalid task number: ${taskNumber}\n`);
    return;
  }

  const selectedTask = displayTasks[taskNumber - 1];
  const actualIdx = allTasks.findIndex(t => t.id === selectedTask.id);
  const oldContext = selectedTask.activityContext || 'professional';

  allTasks[actualIdx].activityContext = newContext;

  if (viewMode === 'routine') saveRoutine(allTasks);
  else savePending(allTasks);

  const newEmoji = CONTEXT_EMOJI_MAP[newContext] || '💼';
  const oldEmoji = CONTEXT_EMOJI_MAP[oldContext] || '💼';
  console.log(`\n✅ Task context modified:`);
  console.log(`   ${oldEmoji} [${oldContext.toUpperCase()}] → ${newEmoji} [${newContext.toUpperCase()}]`);
  console.log(`   ${selectedTask.title}\n`);
}

// ─── Set priority ───────────────────────────────────────────────────────────

function setTaskPriority(taskNumber, newPriority) {
  const pri = parseInt(newPriority);
  if (isNaN(pri) || pri < 1 || pri > 5) {
    console.error(`\n❌ Invalid priority: ${newPriority}`);
    console.error(`   Valid values: 1 (high) to 5 (low), default 3\n`);
    return;
  }

  if (taskNumber === 0) {
    const current = loadCurrent();
    if (!current.task) {
      console.log('\n⚠️  No current task to modify.\n');
      return;
    }
    const oldPri = normalizePriority(current.task.priority);
    current.task.priority = pri;
    saveCurrent(current);
    // Also update the source task
    if (current.task.sourceId) {
      updateTaskInFile(current.task.sourceId, (t) => { t.priority = pri; });
    }
    console.log(`\n✅ Current task priority: ${priorityEmoji(oldPri)} ${priorityLabel(oldPri)} → ${priorityEmoji(pri)} ${priorityLabel(pri)}`);
    console.log(`   ${current.task.title}\n`);
    return;
  }

  const current = loadCurrent();
  const viewMode = current.viewMode || 'novel';
  const allTasks = viewMode === 'routine' ? loadRoutine() : loadPending();
  const displayTasks = getDisplayOrderedTasks(allTasks, current.contextFilter);

  if (taskNumber < 1 || taskNumber > displayTasks.length) {
    console.error(`\n❌ Invalid task number: ${taskNumber}\n`);
    return;
  }

  const selectedTask = displayTasks[taskNumber - 1];
  const actualIdx = allTasks.findIndex(t => t.id === selectedTask.id);
  const oldPri = normalizePriority(selectedTask.priority);

  allTasks[actualIdx].priority = pri;

  if (viewMode === 'routine') saveRoutine(allTasks);
  else savePending(allTasks);

  console.log(`\n✅ Task priority: ${priorityEmoji(oldPri)} ${priorityLabel(oldPri)} → ${priorityEmoji(pri)} ${priorityLabel(pri)}`);
  console.log(`   ${selectedTask.title}\n`);
}

// ─── Set focus level ─────────────────────────────────────────────────────────

function setTaskFocus(taskNumber, newFocus) {
  const foc = parseInt(newFocus);
  if (isNaN(foc) || foc < 0 || foc > 5) {
    console.error(`\n❌ Invalid focus level: ${newFocus}`);
    console.error(`   Valid values: 0 (trivial) to 5 (deep work)\n`);
    return;
  }

  if (taskNumber === 0) {
    const current = loadCurrent();
    if (!current.task) { console.log('\n⚠️  No current task to modify.\n'); return; }
    const oldFoc = normalizeFocus(current.task.focusLevel);
    current.task.focusLevel = foc;
    saveCurrent(current);
    if (current.task.sourceId) {
      updateTaskInFile(current.task.sourceId, (t) => { t.focusLevel = foc; });
    }
    console.log(`\n✅ Current task focus: ${focusEmoji(oldFoc)} [F:${oldFoc}] → ${focusEmoji(foc)} [F:${foc}] ${focusLabel(foc)}`);
    console.log(`   ${current.task.title}\n`);
    return;
  }

  const current = loadCurrent();
  const viewMode = current.viewMode || 'novel';
  const allTasks = viewMode === 'routine' ? loadRoutine() : loadPending();
  const displayTasks = getDisplayOrderedTasks(allTasks, current.contextFilter);

  if (taskNumber < 1 || taskNumber > displayTasks.length) {
    console.error(`\n❌ Invalid task number: ${taskNumber}\n`);
    return;
  }

  const selectedTask = displayTasks[taskNumber - 1];
  const actualIdx = allTasks.findIndex(t => t.id === selectedTask.id);
  const oldFoc = normalizeFocus(selectedTask.focusLevel);

  allTasks[actualIdx].focusLevel = foc;

  if (viewMode === 'routine') saveRoutine(allTasks);
  else savePending(allTasks);

  console.log(`\n✅ Task focus: ${focusEmoji(oldFoc)} [F:${oldFoc}] → ${focusEmoji(foc)} [F:${foc}] ${focusLabel(foc)}`);
  console.log(`   ${selectedTask.title}\n`);
}

// ─── Context switching ──────────────────────────────────────────────────────

function switchToContext(contextCode) {
  const context = normalizeContext(contextCode);
  const current = loadCurrent();
  const now = new Date();
  const timestamp = now.toISOString();

  // End current session if active
  if (current.task) {
    const endResult = endCurrentSession(current, now);
    if (endResult && current.task.sourceType === 'pending') {
      const pending = loadPending();
      upsertPending(pending, endResult.taskData);
      savePending(pending);
      const emoji = CONTEXT_EMOJI_MAP[current.task.activityContext] || '💼';
      const timeStr = formatTimeSpent(endResult.totalTimeSpent);
      console.log(`\n⏸️  ${emoji} ${current.task.title} ${timeStr}`);
    }
  }

  // Clear current for sum calculation
  current.task = null;
  saveCurrent(current);

  // Switch to "general" routine task for this context
  const generalTask = ensureRoutineTask(context);

  current.task = {
    title: 'general',
    activityContext: context,
    startedAt: timestamp,
    timeSpent: generalTask.timeSpent || 0,
    sourceType: 'routine',
    sourceId: generalTask.id,
    notes: [],
    sessions: generalTask.sessions || []
  };

  if (context === 'unstructured') {
    current.contextFilter = null;
    current.viewMode = 'routine';
  } else {
    current.contextFilter = context;
  }

  current.contextSums = calculateContextSums();
  saveCurrent(current);

  const contextEmoji = CONTEXT_EMOJI_MAP[context] || '💼';
  if (context === 'unstructured') {
    const routine = loadRoutine();
    console.log(`\n${contextEmoji} UNSTRUCTURED — tracking time (${routine.length} routine task(s) visible, use /t last HH:MM to set end time or /t last-N to reassign)\n`);
  } else {
    const pending = loadPending();
    const filteredTasks = pending.filter(t => (t.activityContext || 'professional') === context);
    console.log(`\n${contextEmoji} ${context.toUpperCase()} — tracking time (${filteredTasks.length} task(s))\n`);
  }
}

function switchToRoutineTask(contextCode, taskName) {
  const context = contextCode ? normalizeContext(contextCode) : null;
  const { task: routineTask, match } = findRoutineTask(taskName, context);

  const current = loadCurrent();
  const now = new Date();
  const timestamp = now.toISOString();

  // End current session if active
  if (current.task) {
    const endResult = endCurrentSession(current, now);
    if (endResult && current.task.sourceType === 'pending') {
      const pending = loadPending();
      upsertPending(pending, endResult.taskData);
      savePending(pending);
      const emoji = CONTEXT_EMOJI_MAP[current.task.activityContext] || '💼';
      const timeStr = formatTimeSpent(endResult.totalTimeSpent);
      console.log(`\n⏸️  ${emoji} ${current.task.title} ${timeStr}`);
    }
  }

  // Clear current for sum calculation
  current.task = null;
  saveCurrent(current);

  // Set routine task as current
  current.task = {
    title: routineTask.title,
    activityContext: routineTask.activityContext,
    startedAt: timestamp,
    timeSpent: routineTask.timeSpent || 0,
    sourceType: 'routine',
    sourceId: routineTask.id,
    notes: [],
    sessions: routineTask.sessions || []
  };

  current.contextFilter = routineTask.activityContext;
  current.contextSums = calculateContextSums();
  current.viewMode = 'routine';
  saveCurrent(current);

  const emoji = CONTEXT_EMOJI_MAP[routineTask.activityContext] || '💼';
  const timeStr = routineTask.timeSpent > 0 ? ` ${formatTimeSpent(routineTask.timeSpent)}` : '';
  if (match === 'created') {
    console.log(`\n✨ Created routine: ${emoji} ${routineTask.title}${timeStr}`);
  } else if (match === 'fuzzy') {
    console.log(`\n🔄 ${emoji} ${routineTask.title}${timeStr} (fuzzy match)`);
  } else {
    console.log(`\n🔄 ${emoji} ${routineTask.title}${timeStr}`);
  }
}

function clearContextFilter() {
  const current = loadCurrent();

  // End current session if active
  if (current.task) {
    const now = new Date();
    const endResult = endCurrentSession(current, now);
    if (endResult && current.task.sourceType === 'pending') {
      const pending = loadPending();
      upsertPending(pending, endResult.taskData);
      savePending(pending);
    }
  }

  current.task = null;
  current.contextFilter = null;
  current.viewMode = 'novel';
  current.contextSums = calculateContextSums();
  saveCurrent(current);

  console.log('\n📋 Filter cleared — showing all contexts\n');
}

// ─── Reassign idle time ─────────────────────────────────────────────────────

function reassignUnstructuredTime(taskNumber) {
  const current = loadCurrent();
  const now = new Date();
  const timestamp = now.toISOString();

  if (current.task) {
    console.error('\n❌ /t last-N only works when no task is active (blank state after idle/pause).\n');
    process.exit(1);
  }

  // Find the most recent session end time (= when idle/pause started)
  const todaySessions = getTodaySessions();
  const completedSessions = todaySessions
    .filter(s => s.session.endedAt && s.sourceFile !== 'current')
    .sort((a, b) => new Date(b.session.endedAt) - new Date(a.session.endedAt));

  if (completedSessions.length === 0) {
    console.error('\n❌ No completed sessions found today. Cannot determine idle start time.\n');
    process.exit(1);
  }

  const blockStart = completedSessions[0].session.endedAt;
  const elapsedMinutes = calculateElapsedMinutesUntil(blockStart, now);

  const displayTasks = getViewTasks(current);
  const taskIndex = taskNumber - 1;
  if (taskIndex < 0 || taskIndex >= displayTasks.length) {
    console.error(`\n❌ Invalid task number. You have ${displayTasks.length} tasks in the current view.\n`);
    process.exit(1);
  }

  const targetTask = displayTasks[taskIndex];
  const session = { startedAt: blockStart, endedAt: timestamp };

  // Persist session to Postgres (fire-and-forget)
  writeSessionToDB(targetTask, session);

  // Add session + time to the target task (stays in its file — pending or routine)
  updateTaskInFile(targetTask.id, (t) => {
    t.timeSpent = (t.timeSpent || 0) + elapsedMinutes;
    if (!t.sessions) t.sessions = [];
    t.sessions.push(session);
  });

  // Current stays null
  current.contextSums = calculateContextSums();
  saveCurrent(current);

  const emoji = CONTEXT_EMOJI_MAP[targetTask.activityContext] || '💼';
  const timeStr = formatTimeSpent(elapsedMinutes);
  const routineTag = targetTask.routine ? ' [R]' : '';
  console.log(`\n✅ Reassigned ${timeStr} → ${emoji} ${targetTask.title}${routineTag}`);
  console.log(`   (from ${new Date(blockStart).toLocaleTimeString()} to now)\n`);
}

// ─── Set last task end time ─────────────────────────────────────────────────

function setLastTaskEndTime(timeStr) {
  // Parse HH:MM or H:MM format
  const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!timeMatch) {
    console.error('\n❌ Usage: /t last HH:MM  (e.g., /t last 6:50)\n');
    process.exit(1);
  }

  const hours = parseInt(timeMatch[1]);
  const minutes = parseInt(timeMatch[2]);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    console.error('\n❌ Invalid time. Use HH:MM format (00:00 - 23:59)\n');
    process.exit(1);
  }

  const current = loadCurrent();

  if (current.task) {
    console.error('\n❌ /t last HH:MM only works when no task is active (blank state after idle/pause).\n');
    process.exit(1);
  }

  // Find the most recent session
  const todaySessions = getTodaySessions();
  const completedSessions = todaySessions
    .filter(s => s.session.endedAt && s.sourceFile !== 'current')
    .sort((a, b) => new Date(b.session.endedAt) - new Date(a.session.endedAt));

  if (completedSessions.length === 0) {
    console.error('\n❌ No completed sessions found today.\n');
    process.exit(1);
  }

  const mostRecent = completedSessions[0];
  const startTime = new Date(mostRecent.session.startedAt);

  // Create new end time with the specified hours/minutes, keeping same date
  const newEndTime = new Date(startTime);
  newEndTime.setHours(hours, minutes, 0, 0);

  // Validate that end time is after start time
  if (newEndTime <= startTime) {
    console.error('\n❌ End time must be after start time.\n');
    process.exit(1);
  }

  const newEndTimestamp = newEndTime.toISOString();
  const oldEndTime = new Date(mostRecent.session.endedAt);
  const newElapsedMinutes = calculateElapsedMinutesUntil(mostRecent.session.startedAt, newEndTime);
  const oldElapsedMinutes = calculateElapsedMinutesUntil(mostRecent.session.startedAt, oldEndTime);
  const minuteDiff = newElapsedMinutes - oldElapsedMinutes;

  // Get the task that owns this session
  const taskId = mostRecent.taskId;
  const sourceFile = mostRecent.sourceFile;

  // Update task in its file
  updateTaskInFile(taskId, (t) => {
    t.timeSpent = (t.timeSpent || 0) + minuteDiff;
    if (!t.sessions) t.sessions = [];
    // Find and update the matching session
    const sessionIndex = t.sessions.findIndex(s => s.endedAt === mostRecent.session.endedAt);
    if (sessionIndex >= 0) {
      t.sessions[sessionIndex].endedAt = newEndTimestamp;
    }
  });

  current.contextSums = calculateContextSums();
  saveCurrent(current);

  // Get task info for display
  const taskData = sourceFile === 'routine' ?
    loadRoutine().find(t => t.id === taskId) :
    loadPending().find(t => t.id === taskId);

  const emoji = taskData ? (CONTEXT_EMOJI_MAP[taskData.activityContext] || '💼') : '💼';
  const oldTimeStr = formatTimeSpent(oldElapsedMinutes);
  const newTimeStr = formatTimeSpent(newElapsedMinutes);
  const taskTitle = taskData ? taskData.title : 'Unknown task';

  console.log(`\n✅ Updated last task end time:`);
  console.log(`   ${emoji} ${taskTitle}`);
  console.log(`   ${oldEndTime.toLocaleTimeString()} → ${newEndTime.toLocaleTimeString()}`);
  console.log(`   Duration: ${oldTimeStr} → ${newTimeStr}\n`);
}

// ─── Reassign last session ───────────────────────────────────────────────────

/**
 * Finds the most recently-ended session across pending, routine, and completed tasks.
 * Returns { taskId, sourceFile, session, sessionIndex } or null.
 */
function findMostRecentSession() {
  const pending = loadPending();
  const routine = loadRoutine();
  const completed = loadCompleted();

  let best = null;

  const check = (tasks, sourceFile) => {
    for (const task of tasks) {
      const sessions = task.sessions || [];
      sessions.forEach((s, idx) => {
        if (!s.endedAt) return;
        if (!best || new Date(s.endedAt) > new Date(best.session.endedAt)) {
          best = { taskId: task.id, sourceFile, task, session: s, sessionIndex: idx };
        }
      });
    }
  };

  check(pending, 'pending');
  check(routine, 'routine');
  check(completed, 'completed');

  // Also check current.json for an active session
  const current = loadCurrent();
  if (current.task) {
    const curSessions = current.task.sessions || [];
    // The active session startedAt is current.task.startedAt; no endedAt yet — skip for "last"
    curSessions.forEach((s, idx) => {
      if (!s.endedAt) return;
      if (!best || new Date(s.endedAt) > new Date(best.session.endedAt)) {
        best = { taskId: current.task.sourceId, sourceFile: 'current', task: current.task, session: s, sessionIndex: idx };
      }
    });
  }

  return best;
}

/**
 * Reassign the most recent completed session to a target task.
 * Removes the session+time from the source task and adds to target.
 * targetSpec: { type: 'number', value: N } | { type: 'fuzzy', query: string } | { type: 'new', description: string }
 */
function reassignLastSession(targetSpec) {
  const current = loadCurrent();
  const now = new Date();
  const timestamp = now.toISOString();

  const mostRecent = findMostRecentSession();
  if (!mostRecent) {
    console.error('\n❌ No completed sessions found to reassign.\n');
    process.exit(1);
  }

  const { taskId: sourceTaskId, sourceFile, session, task: sourceTask } = mostRecent;
  const elapsedMinutes = calculateElapsedMinutesUntil(session.startedAt, new Date(session.endedAt));

  // Determine target task
  let targetTask = null;
  let targetIsNew = false;
  let newTaskDesc = null;
  let newTaskId = null;

  if (targetSpec.type === 'number') {
    const displayTasks = getViewTasks(current);
    const taskIndex = targetSpec.value - 1;
    if (taskIndex < 0 || taskIndex >= displayTasks.length) {
      console.error(`\n❌ Invalid task number. You have ${displayTasks.length} tasks in the current view.\n`);
      process.exit(1);
    }
    targetTask = displayTasks[taskIndex];
  } else if (targetSpec.type === 'fuzzy') {
    const routine = loadRoutine().filter(t => t.title !== 'general');
    const pending = loadPending();
    const allTasks = [...routine, ...pending];
    const matches = findBestMatches(targetSpec.query.toLowerCase().trim(), allTasks);
    if (matches.length === 0) {
      console.error(`\n❌ No tasks found matching "${targetSpec.query}"\n`);
      process.exit(1);
    }
    targetTask = matches[0];
    const emoji = CONTEXT_EMOJI_MAP[targetTask.activityContext] || '📋';
    console.log(`\n🔍 Found: ${emoji} ${targetTask.title}`);
  } else if (targetSpec.type === 'new') {
    // Create new task and assign session to it
    targetIsNew = true;
    newTaskDesc = targetSpec.description;
  }

  // 1. Remove session from source task
  if (sourceFile === 'pending') {
    const pending = loadPending();
    const idx = pending.findIndex(t => t.id === sourceTaskId);
    if (idx !== -1) {
      pending[idx].sessions = (pending[idx].sessions || []).filter((_, i) => i !== mostRecent.sessionIndex);
      pending[idx].timeSpent = Math.max(0, (pending[idx].timeSpent || 0) - elapsedMinutes);
      savePending(pending);
    }
  } else if (sourceFile === 'routine') {
    const routine = loadRoutine();
    const idx = routine.findIndex(t => t.id === sourceTaskId);
    if (idx !== -1) {
      routine[idx].sessions = (routine[idx].sessions || []).filter((_, i) => i !== mostRecent.sessionIndex);
      routine[idx].timeSpent = Math.max(0, (routine[idx].timeSpent || 0) - elapsedMinutes);
      saveRoutine(routine);
    }
  } else if (sourceFile === 'completed') {
    const completed = loadCompleted();
    const idx = completed.findIndex(t => t.id === sourceTaskId);
    if (idx !== -1) {
      completed[idx].sessions = (completed[idx].sessions || []).filter((_, i) => i !== mostRecent.sessionIndex);
      completed[idx].timeSpent = Math.max(0, (completed[idx].timeSpent || 0) - elapsedMinutes);
      saveCompleted(completed);
    }
  }

  // 2. Add session to target task
  if (targetIsNew) {
    // Parse flags from description
    const { cleanDesc, activityContext, category, priority, focusLevel, isRoutine } = parseTaskFlags(newTaskDesc, current.contextFilter);
    newTaskId = generateId();
    const newTaskObj = {
      id: newTaskId,
      title: cleanDesc,
      activityContext,
      category,
      priority,
      focusLevel: focusLevel ?? null,
      timeSpent: elapsedMinutes,
      sessions: [session],
      notes: [],
      routine: isRoutine || false
    };

    if (isRoutine) {
      const routine = loadRoutine();
      routine.push(newTaskObj);
      saveRoutine(routine);
    } else {
      const pending = loadPending();
      pending.unshift(newTaskObj);
      savePending(pending);
    }

    // Also push to Postgres (fire-and-forget)
    writeSessionToDB(newTaskObj, session);

    const emoji = CONTEXT_EMOJI_MAP[activityContext] || '💼';
    const timeStr = formatTimeSpent(elapsedMinutes);
    const sourceEmoji = CONTEXT_EMOJI_MAP[sourceTask.activityContext] || '💼';
    console.log(`\n✅ Reassigned ${timeStr} → new task: ${emoji} ${cleanDesc}`);
    console.log(`   (from ${sourceEmoji} ${sourceTask.title || 'previous task'}, ${new Date(session.startedAt).toLocaleTimeString()} – ${new Date(session.endedAt).toLocaleTimeString()})`);

    // If user wants to make this the current task (like addS), switch to it now
    // Don't auto-switch — just create and assign
  } else {
    // Add session + time to existing target task
    updateTaskInFile(targetTask.id, (t) => {
      t.timeSpent = (t.timeSpent || 0) + elapsedMinutes;
      if (!t.sessions) t.sessions = [];
      t.sessions.push(session);
    });

    writeSessionToDB(targetTask, session);

    const emoji = CONTEXT_EMOJI_MAP[targetTask.activityContext] || '💼';
    const timeStr = formatTimeSpent(elapsedMinutes);
    const sourceEmoji = CONTEXT_EMOJI_MAP[sourceTask.activityContext] || '💼';
    console.log(`\n✅ Reassigned ${timeStr} → ${emoji} ${targetTask.title}`);
    console.log(`   (from ${sourceEmoji} ${sourceTask.title || 'previous task'}, ${new Date(session.startedAt).toLocaleTimeString()} – ${new Date(session.endedAt).toLocaleTimeString()})`);
  }

  current.contextSums = calculateContextSums();
  saveCurrent(current);
  console.log('');
}

// ─── Notes ──────────────────────────────────────────────────────────────────

function addNoteToCurrentTask(noteText) {
  const current = loadCurrent();
  if (!current.task) {
    console.log(`\n⚠️  No current task to add note to.\n`);
    return;
  }

  if (!current.task.notes) current.task.notes = [];
  const timestamp = new Date().toISOString();
  current.task.notes.push({ text: noteText, timestamp });
  saveCurrent(current);

  console.log(`\n📝 Note added to current task:`);
  console.log(`   "${noteText}"`);
  console.log(`   Time: ${timestamp.split('T')[1].substring(0, 8)}\n`);
}

function addNoteToPendingTask(taskNumber, noteText) {
  const current = loadCurrent();
  const viewMode = current.viewMode || 'novel';
  const allTasks = viewMode === 'routine' ? loadRoutine() : loadPending();
  const displayTasks = getDisplayOrderedTasks(allTasks, current.contextFilter);

  const taskIndex = taskNumber - 1;
  if (taskIndex < 0 || taskIndex >= displayTasks.length) {
    console.error(`\n❌ Invalid task number. You have ${displayTasks.length} tasks.\n`);
    process.exit(1);
  }

  const task = displayTasks[taskIndex];
  const actualIdx = allTasks.findIndex(t => t.id === task.id);

  if (!allTasks[actualIdx].notes) allTasks[actualIdx].notes = [];
  const timestamp = new Date().toISOString();
  allTasks[actualIdx].notes.push({ text: noteText, timestamp });

  if (viewMode === 'routine') saveRoutine(allTasks);
  else savePending(allTasks);

  console.log(`\n📝 Note added to task #${taskNumber}:`);
  console.log(`   Task: ${task.title}`);
  console.log(`   Note: "${noteText}"`);
  console.log(`   Time: ${timestamp.split('T')[1].substring(0, 8)}\n`);
}

// ─── Session logging ────────────────────────────────────────────────────────

function logSession(sessionJson) {
  let data;
  try { data = JSON.parse(sessionJson); } catch (e) {
    console.error('\n❌ Invalid JSON for log-session\n');
    process.exit(1);
  }

  const { title, summary, startedAt, endedAt } = data;
  const context = data.context ? normalizeContext(data.context) : 'professional';
  const match = data.match;

  if (!title || !startedAt || !endedAt) {
    console.error('\n❌ Required fields: title, startedAt, endedAt\n');
    process.exit(1);
  }

  const now = new Date().toISOString();
  const elapsedMs = new Date(endedAt) - new Date(startedAt);
  const elapsedMinutes = Math.max(0, Math.round(elapsedMs / 60000));

  const session = { startedAt, endedAt };

  // Persist session to Postgres (fire-and-forget)
  writeSessionToDB({ title, activityContext: context, focusLevel: undefined }, session);

  let matchType = 'new';
  let matchedTitle = null;

  if (match === 'current') {
    const current = loadCurrent();
    if (current.task) {
      if (!current.task.sessions) current.task.sessions = [];
      current.task.sessions.push(session);
      matchedTitle = current.task.title;
      matchType = 'current';
      saveCurrent(current);
    }
  } else if (typeof match === 'number' && match > 0) {
    const pending = loadPending();
    const routine = loadRoutine();
    const all = [...pending, ...routine];
    const display = getDisplayOrderedTasks(all, null);
    const idx = match - 1;
    if (idx >= 0 && idx < display.length) {
      const task = display[idx];
      updateTaskInFile(task.id, (t) => {
        t.timeSpent = (t.timeSpent || 0) + elapsedMinutes;
        if (!t.sessions) t.sessions = [];
        t.sessions.push(session);
      });
      matchedTitle = task.title;
      matchType = task.routine ? 'routine' : 'pending';
    } else {
      console.error(`\n❌ Task ${match} not found (${display.length} tasks available)\n`);
      process.exit(1);
    }
  } else {
    const pending = loadPending();
    pending.push({
      id: generateId(),
      title,
      activityContext: context,
      category: categorizeWork(title),
      priority: DEFAULT_PRIORITY,
      timeSpent: elapsedMinutes,
      sessions: [session],
      notes: [{ text: 'Logged from Claude session', timestamp: now }]
    });
    savePending(pending);
    matchedTitle = title;
    matchType = 'new';
  }

  // Write session log file
  const sessionsDir = path.join(BASE_DIR, 'tracking', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  const sessionFile = path.join(sessionsDir, `session-${TODAY}.json`);

  let sessionLog = { date: TODAY, sessions: [] };
  if (fs.existsSync(sessionFile)) {
    try { sessionLog = JSON.parse(fs.readFileSync(sessionFile, 'utf8')); } catch (e) {}
  }

  sessionLog.sessions.push({
    id: generateId(),
    title, context,
    summary: summary || '',
    startedAt, endedAt,
    loggedAt: now,
    matchedTask: matchedTitle,
    matchType,
    calendarEventId: session.calendarEventId || null
  });

  fs.writeFileSync(sessionFile, JSON.stringify(sessionLog, null, 2), 'utf8');

  const emoji = CONTEXT_EMOJI_MAP[context] || '💼';
  const timeStr = formatTimeSpent(elapsedMinutes);
  console.log(`\n📝 Session logged: ${emoji} ${title} (${timeStr})`);
  console.log(`   ${matchType === 'new' ? '➕ Created new task' : matchType === 'current' ? '🎯 Added to current task' : '📌 Added to: ' + matchedTitle}`);
  if (summary) console.log(`   📄 ${summary.substring(0, 120)}${summary.length > 120 ? '...' : ''}`);
  console.log('');
}

// ─── Legacy: set current task (redirects to add-and-switch) ─────────────────

function setCurrentTask(description) {
  addPendingTaskAndSwitch(description);
}

function addCompletedWork(description) {
  const title = extractTitle(description);
  const activityContext = detectContext(description);
  const category = categorizeWork(description);

  const completed = loadCompleted();
  completed.push({
    id: generateId(),
    title,
    activityContext,
    category,
    timeSpent: 0,
    sessions: [],
    notes: []
  });
  saveCompleted(completed);

  const contextEmoji = CONTEXT_EMOJI_MAP[activityContext] || '💼';
  console.log(`\n✅ Completed work added:`);
  console.log(`   ${contextEmoji} [${activityContext.toUpperCase()}] [${category}] ${title}\n`);
}

// ─── Display ────────────────────────────────────────────────────────────────

function showDailyLog(date) {
  // For historical dates, fall back to archived daily logs
  if (date && date !== TODAY) {
    const archiveFile = path.join(BASE_DIR, 'tracking', 'archive', 'daily-logs', `daily-log-${date}.json`);
    if (fs.existsSync(archiveFile)) {
      const logData = JSON.parse(fs.readFileSync(archiveFile, 'utf8'));
      console.log(`\n📊 (Archived) DAILY LOG - ${date}`);
      const log = logData.dailyLog;
      console.log('\n✅ COMPLETED WORK:');
      (log.completedWork || []).forEach((work, idx) => {
        const emoji = CONTEXT_EMOJI_MAP[work.activityContext] || '💼';
        const timeStr = work.timeSpent ? ` (${formatTimeSpent(work.timeSpent)})` : '';
        console.log(`   ${idx + 1}. ${emoji} ${work.title}${timeStr}`);
      });
      console.log('\n📋 PENDING TASKS:');
      (log.pendingTasks || []).forEach((task, idx) => {
        const emoji = CONTEXT_EMOJI_MAP[task.activityContext] || '💼';
        const timeStr = task.timeSpent > 0 ? ` (${formatTimeSpent(task.timeSpent)})` : '';
        console.log(`   ${idx + 1}. ${emoji} ${task.title}${timeStr}`);
      });
      console.log('');
      return;
    }
    console.log(`\n⚠️  No log found for ${date}\n`);
    return;
  }

  // Today: read from 4 files
  const current = loadCurrent();
  const pending = loadPending();
  const routine = loadRoutine();
  const completed = loadCompleted();

  console.log('\n' + '='.repeat(80));
  console.log(`📊 DAILY LOG - ${TODAY}`);
  console.log('='.repeat(80));

  // Current Task
  console.log('\n🎯 CURRENT TASK:');
  if (current.task) {
    const t = current.task;
    const emoji = CONTEXT_EMOJI_MAP[t.activityContext] || '💼';
    const contextLabel = `[${(t.activityContext || 'professional').toUpperCase()}]`;
    const elapsedMinutes = calculateElapsedMinutes(t.startedAt);
    const totalTime = (t.timeSpent || 0) + elapsedMinutes;
    const timeStr = formatTimeSpent(totalTime);

    if (t.title === 'general') {
      console.log(`   ${emoji} ${contextLabel} (context tracking)`);
    } else {
      console.log(`   ${emoji} ${contextLabel} ${t.title}`);
    }
    console.log(`   Started: ${t.startedAt.split('T')[1].substring(0, 8)}`);
    console.log(`   ⏱️  Time spent: ${timeStr}`);
    if (t.notes && t.notes.length > 0) {
      console.log(`   Notes:`);
      t.notes.forEach((note, idx) => {
        const noteTime = note.timestamp.split('T')[1].substring(0, 8);
        console.log(`      ${idx + 1}. [${noteTime}] ${note.text}`);
      });
    }
  } else {
    console.log('   (No current task)');
  }

  // Completed Work
  console.log('\n✅ COMPLETED WORK:');
  if (completed.length === 0) {
    console.log('   (No completed work yet)');
  } else {
    completed.forEach((work, idx) => {
      const emoji = CONTEXT_EMOJI_MAP[work.activityContext] || '💼';
      const contextLabel = `[${(work.activityContext || 'professional').toUpperCase()}]`;
      const timeStr = work.timeSpent ? ` (${formatTimeSpent(work.timeSpent)})` : '';
      const category = work.category || 'General';
      console.log(`   ${idx + 1}. ${emoji} ${contextLabel} [${category}] ${work.title}${timeStr}`);
    });
  }

  // Pending / Routine Tasks
  const viewMode = current.viewMode || 'novel';
  const contextFilter = current.contextFilter || null;
  const viewTasks = viewMode === 'routine' ? routine : pending;
  const filteredTasks = getDisplayOrderedTasks(viewTasks, contextFilter);

  const modeLabel = viewMode === 'routine' ? '🔄 ROUTINE' : 'PENDING';
  console.log(`\n📋 ${modeLabel} TASKS:`);
  if (contextFilter) {
    const emoji = CONTEXT_EMOJI_MAP[contextFilter] || '💼';
    console.log(`   ${emoji} Filtered by: ${contextFilter.toUpperCase()} (${filteredTasks.length} tasks)`);
  }

  if (filteredTasks.length === 0) {
    console.log('   (No tasks)');
  } else {
    let taskNum = 1;
    let currentContext = null;

    filteredTasks.forEach(task => {
      const taskContext = task.activityContext || 'professional';
      if (!contextFilter && taskContext !== currentContext) {
        const emoji = CONTEXT_EMOJI_MAP[taskContext] || '💼';
        console.log(`   ${emoji}`);
        currentContext = taskContext;
      }

      const pri = normalizePriority(task.priority);
      const foc = task.focusLevel != null ? normalizeFocus(task.focusLevel) : DEFAULT_FOCUS;
      const timeStr = task.timeSpent > 0 ? ` [⏱️  ${formatTimeSpent(task.timeSpent)}]` : '';
      const routineTag = task.routine ? ' [R]' : '';
      const priTag = pri !== DEFAULT_PRIORITY ? ` ${priorityEmoji(pri)} [${priorityLabel(pri)}]` : '';
      const focTag = foc !== DEFAULT_FOCUS ? ` ${focusEmoji(foc)} [F:${foc}]` : '';
      console.log(`   ${taskNum}.${priTag}${focTag} ${task.title}${timeStr}${routineTag}`);
      if (task.notes && task.notes.length > 0) {
        task.notes.forEach((note, noteIdx) => {
          const noteTime = note.timestamp.split('T')[1].substring(0, 8);
          console.log(`      ${noteIdx + 1}. [${noteTime}] ${note.text}`);
        });
      }
      taskNum++;
    });
  }

  // Time by Context Summary
  const sums = current.contextSums?.day || calculateContextSums().day;
  const totalTime = Object.values(sums).reduce((sum, time) => sum + time, 0);

  if (totalTime > 0) {
    console.log('\n⏱️  TIME BY CONTEXT (today):');
    const sortedContexts = Object.entries(sums)
      .filter(([_, time]) => time > 0)
      .sort((a, b) => b[1] - a[1]);

    sortedContexts.forEach(([ctx, minutes]) => {
      const emoji = CONTEXT_EMOJI_MAP[ctx] || '💼';
      const timeStr = formatTimeSpent(minutes);
      const percentage = Math.round((minutes / totalTime) * 100);
      console.log(`   ${emoji} ${ctx.charAt(0).toUpperCase() + ctx.slice(1).padEnd(12)} ${timeStr.padEnd(8)} (${percentage}%)`);
    });

    console.log(`   ${'─'.repeat(30)}`);
    console.log(`   Total:${' '.repeat(9)}${formatTimeSpent(totalTime)}`);
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

// ─── Calendar sync ──────────────────────────────────────────────────────────

function syncCalendar(dates = [TODAY], quiet = false) {
  if (!process.env.GOOGLE_CALENDAR_ID) {
    if (!quiet) console.log('\n⚠️  No GOOGLE_CALENDAR_ID set. Run setup-gcal and init-gcal first.\n');
    return;
  }

  if (!quiet) console.log('\n🔄 Syncing with Google Calendar...');

  let totalPushed = 0;
  let totalPulled = 0;
  let totalUpdated = 0;
  let totalDeleted = 0;

  for (const date of dates) {
    // For historical dates, try archived daily logs (old format)
    if (date !== TODAY) {
      const archiveFile = path.join(BASE_DIR, 'tracking', 'archive', 'daily-logs', `daily-log-${date}.json`);
      if (!fs.existsSync(archiveFile)) continue;
      // Skip archived dates for now — sync only applies to live files
      continue;
    }

    // Load all files
    let pending = loadPending();
    let routine = loadRoutine();
    let completed = loadCompleted();
    let current = loadCurrent();

    let modified = false;

    // Collect all session-bearing items
    const sessionItems = [];
    pending.forEach(item => {
      sessionItems.push({ source: 'pending', item });
    });
    routine.forEach(item => {
      sessionItems.push({ source: 'routine', item });
    });
    completed.forEach(item => {
      sessionItems.push({ source: 'completed', item });
    });
    if (current.task) {
      sessionItems.push({ source: 'current', item: current.task });
    }

    // Gather sessions that fall on this date
    const allSessionRefs = [];
    for (const ref of sessionItems) {
      const sessions = ref.item.sessions || [];
      sessions.forEach((session, sIdx) => {
        if (!session.startedAt) return;
        const sessionDate = getLocalDate(new Date(session.startedAt));
        const dateStart = getMidnightToday();
        if (sessionDate === date || (session.endedAt && new Date(session.endedAt) >= dateStart)) {
          allSessionRefs.push({ ...ref, sessionIdx: sIdx, session });
        }
      });
    }

    // --- PULL: fetch calendar events and reconcile ---
    const dayStart = new Date(`${date}T00:00:00`);
    const dayEnd = new Date(`${date}T23:59:59`);
    dayStart.setHours(dayStart.getHours() - 2);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const calEvents = listCalendarEvents(dayStart.toISOString(), dayEnd.toISOString());
    const calEventMap = new Map();
    for (const ev of calEvents) calEventMap.set(ev.id, ev);

    // Reconcile synced sessions
    const syncedRefs = allSessionRefs.filter(r => r.session.calendarEventId);
    const sessionsToDelete = [];

    for (const ref of syncedRefs) {
      const { session } = ref;
      const calEvent = calEventMap.get(session.calendarEventId);

      if (!calEvent) {
        const duration = Math.round((new Date(session.endedAt) - new Date(session.startedAt)) / 60000);
        sessionsToDelete.push({ ...ref, duration });
        continue;
      }

      const calStart = calEvent.start?.dateTime;
      const calEnd = calEvent.end?.dateTime;
      if (!calStart || !calEnd) continue;

      const truncSec = (iso) => iso.replace(/\.\d{3}Z$/, '.000Z');
      const localStart = truncSec(new Date(session.startedAt).toISOString());
      const localEnd = truncSec(new Date(session.endedAt).toISOString());
      const remoteStart = truncSec(new Date(calStart).toISOString());
      const remoteEnd = truncSec(new Date(calEnd).toISOString());

      if (localStart !== remoteStart || localEnd !== remoteEnd) {
        const oldDuration = Math.round((new Date(session.endedAt) - new Date(session.startedAt)) / 60000);
        session.startedAt = remoteStart;
        session.endedAt = remoteEnd;
        const newDuration = Math.round((new Date(remoteEnd) - new Date(remoteStart)) / 60000);
        const timeDiff = newDuration - oldDuration;

        ref.item.timeSpent = Math.max(0, (ref.item.timeSpent || 0) + timeDiff);
        modified = true;
        totalUpdated++;

        if (!quiet) {
          const emoji = CONTEXT_EMOJI_MAP[ref.item.activityContext] || '💼';
          console.log(`   ${emoji} ${ref.item.title}: ${oldDuration}m → ${newDuration}m (calendar)`);
        }
      }
    }

    // Apply session deletions
    if (sessionsToDelete.length > 0) {
      sessionsToDelete.sort((a, b) => b.sessionIdx - a.sessionIdx);
      for (const del of sessionsToDelete) {
        const { item, sessionIdx, duration } = del;
        if (item.sessions) item.sessions.splice(sessionIdx, 1);
        item.timeSpent = Math.max(0, (item.timeSpent || 0) - duration);

        if (!quiet) {
          const emoji = CONTEXT_EMOJI_MAP[del.item.activityContext] || '💼';
          console.log(`   ${emoji} ${del.item.title}: -${duration}m (deleted from calendar)`);
        }
        totalDeleted++;
        modified = true;
      }
    }

    // --- IMPORT: calendar events not tracked locally ---
    if (calEvents.length > 0) {
      const localEventIds = new Set();
      for (const ref of allSessionRefs) {
        if (ref.session.calendarEventId) localEventIds.add(ref.session.calendarEventId);
      }

      const untrackedEvents = calEvents.filter(ev => {
        if (localEventIds.has(ev.id)) return false;
        if (!ev.start?.dateTime || !ev.end?.dateTime) return false;
        const durMin = Math.round((new Date(ev.end.dateTime) - new Date(ev.start.dateTime)) / 60000);
        if (durMin < 1) return false;
        const evDateStr = getLocalDate(new Date(ev.start.dateTime));
        if (evDateStr !== date) return false;
        return true;
      });

      for (const ev of untrackedEvents) {
        const evStart = new Date(ev.start.dateTime).toISOString();
        const evEnd = new Date(ev.end.dateTime).toISOString();
        const durMin = Math.round((new Date(evEnd) - new Date(evStart)) / 60000);

        // Strip emoji prefix
        const rawTitle = (ev.summary || '').replace(/^[\p{Emoji}\p{Emoji_Presentation}\p{Emoji_Modifier_Base}\p{Emoji_Component}\uFE0F\u200D]+\s*/u, '').trim();
        if (!rawTitle) continue;
        const titleLower = rawTitle.toLowerCase();

        // Match to existing task
        const allTasks = [...routine, ...pending];
        let matchedTask = allTasks.find(t => t.title.toLowerCase() === titleLower);
        if (!matchedTask) {
          matchedTask = allTasks.find(t =>
            titleLower.includes(t.title.toLowerCase()) || t.title.toLowerCase().includes(titleLower)
          );
        }

        // Determine context
        let activityContext = 'unstructured';
        const contextAliases = {
          fitness: 'health', exercise: 'health', sleep: 'health', sleeping: 'health',
          meals: 'health', hygiene: 'health',
          transit: 'personal', errands: 'personal', planning: 'personal', journaling: 'personal',
          leisure: 'unstructured', 'social media': 'unstructured',
          study: 'learning', studying: 'learning', course: 'learning', tutorial: 'learning',
          research: 'learning', reading: 'learning'
        };

        if (matchedTask) {
          activityContext = matchedTask.activityContext || 'professional';
        } else if (ALL_CONTEXTS.includes(titleLower)) {
          activityContext = titleLower;
        } else if (contextAliases[titleLower]) {
          activityContext = contextAliases[titleLower];
        } else if (ev.colorId) {
          const colorToContext = {};
          for (const [ctx, cid] of Object.entries(CONTEXT_COLOR_MAP)) {
            colorToContext[cid] = ctx;
          }
          activityContext = colorToContext[ev.colorId] || 'unstructured';
        }

        const session = { startedAt: evStart, endedAt: evEnd, calendarEventId: ev.id };

        if (matchedTask) {
          if (!matchedTask.sessions) matchedTask.sessions = [];
          matchedTask.sessions.push(session);
          matchedTask.timeSpent = (matchedTask.timeSpent || 0) + durMin;
        }

        modified = true;
        totalPulled++;

        if (!quiet) {
          const emoji = CONTEXT_EMOJI_MAP[activityContext] || '💼';
          const matchInfo = matchedTask ? `→ ${matchedTask.title}` : '(new)';
          console.log(`   ${emoji} ${rawTitle}: ${durMin}m ${matchInfo}`);
        }
      }
    }

    if (modified) {
      savePending(pending);
      saveRoutine(routine);
      saveCompleted(completed);
      if (current.task) saveCurrent(current);
    }
  }

  if (!quiet) {
    const parts = [];
    if (totalPushed > 0) parts.push(`${totalPushed} pushed`);
    if (totalPulled > 0) parts.push(`${totalPulled} imported from calendar`);
    if (totalUpdated > 0) parts.push(`${totalUpdated} updated from calendar`);
    if (totalDeleted > 0) parts.push(`${totalDeleted} deleted (removed from calendar)`);
    if (parts.length === 0) parts.push('already in sync');
    console.log(`   ✅ ${parts.join(', ')}\n`);
  }
}

// ─── Jira pull ──────────────────────────────────────────────────────────────

function pullJiraTickets() {
  const { execSync } = require('child_process');

  console.log('\n🔄 Syncing with Jira tickets...\n');

  try {
    const jiraEmail = process.env.ATLASSIAN_EMAIL;
    const jiraToken = process.env.ATLASSIAN_API_TOKEN;
    const jiraDomain = process.env.ATLASSIAN_DOMAIN || 'cultivo.atlassian.net';

    if (!jiraEmail || !jiraToken) {
      console.error('❌ Error: ATLASSIAN_EMAIL and ATLASSIAN_API_TOKEN must be set in .env file');
      return;
    }

    const jiraCredentials = `${jiraEmail}:${jiraToken}`;
    const jiraUrl = `https://${jiraDomain}/rest/api/3/search/jql`;
    const jqlPayload = JSON.stringify({
      jql: 'assignee=currentUser() AND status in (Ready, "In Progress") ORDER BY updated DESC',
      maxResults: 50,
      fields: ['summary', 'status', 'priority', 'issuetype', 'updated']
    });

    const curlCommand = `curl -s -u "${jiraCredentials}" -H "Content-Type: application/json" --data '${jqlPayload}' "${jiraUrl}"`;
    const response = execSync(curlCommand, { encoding: 'utf8' });
    const data = JSON.parse(response);

    if (!data.issues || data.issues.length === 0) {
      console.log('✅ No active Jira tickets assigned to you.\n');
      return;
    }

    let pending = loadPending();
    let addedCount = 0;
    let removedCount = 0;

    const jiraTicketMap = new Map();
    for (const issue of data.issues) {
      jiraTicketMap.set(issue.key, issue.fields.status.name);
    }

    const existingJiraTickets = new Set(
      pending.filter(t => t && t.jiraTicket).map(t => t.jiraTicket)
    );

    console.log(`📋 Found ${data.issues.length} ticket(s) assigned to you:\n`);

    const excludedStatuses = ['Done', 'Deployed', "Won't Do", 'Closed'];

    // Clean up completed/stale tickets
    console.log('🧹 Cleaning up completed and stale tickets:\n');
    const completed = loadCompleted();

    pending = pending.filter(task => {
      if (!task || !task.jiraTicket) return true;

      if (jiraTicketMap.has(task.jiraTicket)) {
        const jiraStatus = jiraTicketMap.get(task.jiraTicket);
        if (excludedStatuses.includes(jiraStatus)) {
          removedCount++;
          const statusEmoji = jiraStatus === 'Done' ? '✅' : jiraStatus === 'Deployed' ? '🚀' : '⏭️';
          console.log(`   ${statusEmoji} ${task.jiraTicket}: ${task.title.replace(/^\[.*?\]\s/, '')} (${jiraStatus})`);
          return false;
        }
      } else {
        if (task.timeSpent > 0) {
          completed.push({
            id: task.id || generateId(),
            title: task.title.replace(/^\[.*?\]\s/, ''),
            activityContext: task.activityContext || 'cultivo',
            category: task.category || 'General',
            timeSpent: task.timeSpent,
            sessions: task.sessions || [],
            notes: task.notes || [],
            jiraTicket: task.jiraTicket,
            jiraUrl: task.jiraUrl
          });
          console.log(`   🔄 ${task.jiraTicket}: ${task.title.replace(/^\[.*?\]\s/, '')} (moved to completed - ${task.timeSpent}m spent)`);
        } else {
          console.log(`   🗑️  ${task.jiraTicket}: ${task.title.replace(/^\[.*?\]\s/, '')} (removed - no time spent)`);
        }
        removedCount++;
        return false;
      }
      return true;
    });

    if (removedCount === 0) console.log('   (no completed or stale tickets)\n');
    else console.log('');

    // Add new active tickets
    console.log('➕ Adding new active tickets to pending tasks:\n');

    for (const issue of data.issues) {
      const ticketKey = issue.key;
      const summary = issue.fields.summary;
      const status = issue.fields.status.name;
      const priority = issue.fields.priority?.name || 'Medium';
      const ticketUrl = `https://cultivo.atlassian.net/browse/${ticketKey}`;

      if (excludedStatuses.includes(status)) {
        const statusEmoji = status === 'Done' ? '✅' : status === 'Deployed' ? '🚀' : '⏭️';
        console.log(`   ${statusEmoji} ${ticketKey}: ${summary} (${status})`);
        continue;
      }

      const taskTitle = `[${ticketKey}] ${summary}`;
      if (existingJiraTickets.has(ticketKey)) {
        console.log(`   ⏭️  ${ticketKey}: ${summary} (already in pending)`);
        continue;
      }

      pending.push({
        id: Date.now().toString() + Math.random().toString(36).substring(2, 11),
        title: taskTitle,
        activityContext: 'cultivo',
        category: 'General',
        priority: normalizePriority(priority),
        timeSpent: 0,
        sessions: [],
        notes: [],
        jiraTicket: ticketKey,
        jiraUrl: ticketUrl,
        jiraStatus: status
      });
      addedCount++;

      const jiraPri = normalizePriority(priority);
      console.log(`   ${priorityEmoji(jiraPri)} ${ticketKey}: ${summary}`);
      console.log(`      Status: ${status} | Priority: ${priorityLabel(jiraPri)}`);
    }

    if (addedCount === 0) console.log('   (no new tickets to add)\n');
    else console.log('');

    savePending(pending);
    saveCompleted(completed);

    console.log(`📊 Sync complete:`);
    console.log(`   🧹 Cleaned up ${removedCount} completed/stale ticket(s)`);
    console.log(`   ➕ Added ${addedCount} new ticket(s)`);
    console.log(`   📋 Total pending: ${pending.length}\n`);

    if (addedCount > 0 || removedCount > 0) {
      console.log(`💡 Use /t -N to switch to a task, or /t show to see all tasks.\n`);
    }

  } catch (error) {
    console.error(`\n❌ Error syncing Jira tickets: ${error.message}\n`);
    process.exit(1);
  }
}

// ─── Google Tasks pull ──────────────────────────────────────────────────────

function mapGoogleListToContext(listName) {
  const lower = (listName || '').toLowerCase();
  const listContextMap = {
    'health': 'health', 'personal': 'personal', 'cultivo': 'cultivo',
    'projects': 'projects', 'social': 'social', 'society': 'social',
    'professional': 'professional', 'learning': 'learning', 'edu': 'projects'
  };
  return listContextMap[lower] || null;
}

function pullGoogleTasks() {
  const { execSync } = require('child_process');

  console.log('\n🔄 Pulling Google Tasks due today...\n');

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      console.error('❌ Error: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN must be set in .env file');
      return;
    }

    const tokenResponse = execSync(
      `curl -s -X POST https://oauth2.googleapis.com/token ` +
      `-d client_id="${clientId}" ` +
      `-d client_secret="${clientSecret}" ` +
      `-d refresh_token="${refreshToken}" ` +
      `-d grant_type=refresh_token`,
      { encoding: 'utf8' }
    );
    const tokenData = JSON.parse(tokenResponse);

    if (!tokenData.access_token) {
      console.error('❌ Failed to get access token from Google OAuth');
      if (tokenData.error) console.error(`   Error: ${tokenData.error} - ${tokenData.error_description}`);
      return;
    }

    const accessToken = tokenData.access_token;

    const listsResponse = execSync(
      `curl -s -H "Authorization: Bearer ${accessToken}" ` +
      `"https://www.googleapis.com/tasks/v1/users/@me/lists"`,
      { encoding: 'utf8' }
    );
    const listsData = JSON.parse(listsResponse);

    if (!listsData.items || listsData.items.length === 0) {
      console.log('✅ No task lists found.\n');
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dueMin = today.toISOString();
    const dueMax = tomorrow.toISOString();

    let pending = loadPending();
    let addedCount = 0;
    let skippedCount = 0;

    const existingGoogleTaskIds = new Set(
      pending.filter(t => t && t.googleTaskId).map(t => t.googleTaskId)
    );

    console.log(`📋 Checking ${listsData.items.length} task list(s) for tasks due today:\n`);

    for (const list of listsData.items) {
      const tasksResponse = execSync(
        `curl -s -H "Authorization: Bearer ${accessToken}" ` +
        `"https://www.googleapis.com/tasks/v1/lists/${list.id}/tasks?dueMin=${encodeURIComponent(dueMin)}&dueMax=${encodeURIComponent(dueMax)}&showCompleted=false&showHidden=false"`,
        { encoding: 'utf8' }
      );
      const tasksData = JSON.parse(tasksResponse);

      if (!tasksData.items || tasksData.items.length === 0) continue;

      const listEmoji = CONTEXT_EMOJI_MAP[mapGoogleListToContext(list.title)] || '📝';
      console.log(`${listEmoji} ${list.title}:`);

      for (const task of tasksData.items) {
        if (task.status === 'completed') continue;

        if (existingGoogleTaskIds.has(task.id)) {
          console.log(`   ⏭️  ${task.title} (already in pending)`);
          skippedCount++;
          continue;
        }

        let context = mapGoogleListToContext(list.title);
        if (!context) context = detectContext(task.title || '');

        pending.push({
          id: Date.now().toString() + Math.random().toString(36).substring(2, 11),
          title: task.title,
          activityContext: context,
          category: 'General',
          priority: DEFAULT_PRIORITY,
          timeSpent: 0,
          sessions: [],
          notes: task.notes ? [{ text: task.notes, timestamp: new Date().toISOString() }] : [],
          googleTaskId: task.id,
          googleTaskListId: list.id,
          googleTaskListName: list.title
        });
        existingGoogleTaskIds.add(task.id);
        addedCount++;

        const contextEmoji = CONTEXT_EMOJI_MAP[context] || '📝';
        console.log(`   ➕ ${task.title} (${contextEmoji} ${context})`);
      }
    }

    savePending(pending);

    console.log(`\n📊 Google Tasks sync complete:`);
    console.log(`   ➕ Added ${addedCount} task(s)`);
    console.log(`   ⏭️  Skipped ${skippedCount} duplicate(s)`);
    console.log(`   📋 Total pending: ${pending.length}\n`);

    if (addedCount > 0) {
      console.log(`💡 Use /t -N to switch to a task, or /t show to see all tasks.\n`);
    }

  } catch (error) {
    console.error(`\n❌ Error pulling Google Tasks: ${error.message}\n`);
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════
// REST PROGRAM - Sleep Tracking
// ═══════════════════════════════════════════════════════════════

const SLEEP_DIR = path.join(BASE_DIR, 'tracking', 'sleep');
const STRATEGIES_FILE = path.join(SLEEP_DIR, 'strategies.json');

function loadStrategies() {
  if (fs.existsSync(STRATEGIES_FILE)) {
    return JSON.parse(fs.readFileSync(STRATEGIES_FILE, 'utf8')).strategies;
  }
  return [];
}

function loadSleepLog(date = TODAY) {
  const filePath = path.join(SLEEP_DIR, `sleep-log-${date}.json`);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return null;
}

function saveSleepLog(sleepData) {
  if (!fs.existsSync(SLEEP_DIR)) {
    fs.mkdirSync(SLEEP_DIR, { recursive: true });
  }
  const filePath = path.join(SLEEP_DIR, `sleep-log-${sleepData.date}.json`);
  fs.writeFileSync(filePath, JSON.stringify(sleepData, null, 2), 'utf8');
}

function displayBedtimeProtocol() {
  console.log('\n🌙 Bedtime Protocol');
  console.log('────────────────────');
  console.log('  ☐ Phone at door/desk (Home is Sacred)');
  console.log('  ☐ No screens in bed');
  console.log('  ☐ Room dark & cool');
  console.log('  ☐ Meditation / breathing');
  console.log('  ☐ Gratitude reflection');
  console.log('  ☐ Supplements if planned');
}

function displayMorningProtocol() {
  console.log('\n🌅 Morning Protocol');
  console.log('────────────────────');
  console.log('  ☐ Hydrate (glass of water)');
  console.log('  ☐ Morning writing (5-min stream of consciousness)');
  console.log('  ☐ Plan the day');
  console.log('  ☐ Leave home');
}

function displayStrategies(strategies, selectedIds = []) {
  const selectedSet = new Set(selectedIds);
  strategies.forEach(s => {
    const check = selectedSet.has(s.id) ? ' ✓' : '';
    const pad = s.id < 10 ? ' ' : '';
    console.log(`  ${pad}${s.id}. ${s.name}${check}`);
  });
}

function parseStrategyInput(input, strategies) {
  if (!input || input.trim() === '') return [];
  const ids = input.split(',')
    .map(s => parseInt(s.trim()))
    .filter(n => !isNaN(n) && strategies.some(s => s.id === n));
  return [...new Set(ids)];
}

// Non-interactive rest/wake for Claude Code journaling sessions
function restLogNonInteractive() {
  const current = loadCurrent();
  const now = new Date();
  const timestamp = now.toISOString();

  // If already sleeping, just confirm
  if (current.task && current.task.title === 'sleeping') {
    console.log('😴 Already in rest mode.');
    console.log(JSON.stringify({ status: 'already_resting', restStarted: current.task.startedAt }));
    return;
  }

  // End current session
  if (current.task) {
    const endResult = endCurrentSession(current, now);
    if (endResult && current.task.sourceType === 'pending') {
      const pending = loadPending();
      upsertPending(pending, endResult.taskData);
      savePending(pending);
    }
    const emoji = CONTEXT_EMOJI_MAP[current.task.activityContext] || '💼';
    const timeStr = formatTimeSpent(endResult ? endResult.totalTimeSpent : 0);
    console.log(`⏸️  Paused: ${emoji} ${current.task.title} (${timeStr})`);
  }

  // Find or create sleeping routine task
  const routine = loadRoutine();
  let sleepTask = routine.find(t => t.title === 'sleeping' && t.routine);

  if (!sleepTask) {
    sleepTask = {
      id: generateId(),
      title: 'sleeping',
      activityContext: 'health',
      category: 'General',
      timeSpent: 0,
      sessions: [],
      notes: [],
      routine: true
    };
    routine.push(sleepTask);
    saveRoutine(routine);
  }

  current.task = {
    title: 'sleeping',
    activityContext: 'health',
    startedAt: timestamp,
    timeSpent: sleepTask.timeSpent || 0,
    sourceType: 'routine',
    sourceId: sleepTask.id,
    notes: [],
    sessions: sleepTask.sessions || []
  };
  current.contextFilter = 'health';
  current.contextSums = calculateContextSums();
  saveCurrent(current);

  // Create sleep log (without strategies — Claude journaling handles that)
  const sleepLog = {
    date: TODAY,
    restStarted: timestamp,
    wakeTime: null,
    durationMinutes: null,
    quality: null,
    notes: null,
    strategies: { planned: [], actual: [] },
    strategiesUsed: [],
    medicationUsed: false,
    supplementsUsed: []
  };
  saveSleepLog(sleepLog);

  console.log(`😴 Rest mode started at ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  console.log(JSON.stringify({ status: 'rest_started', restStarted: timestamp, date: TODAY }));
}

function wakeLogNonInteractive() {
  const current = loadCurrent();
  const wakeTime = new Date();
  const wakeTimestamp = wakeTime.toISOString();

  // Find sleep log from today or yesterday
  let sleepLog = loadSleepLog(TODAY);
  if (!sleepLog) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = getLocalDate(yesterday);
    sleepLog = loadSleepLog(yStr);
  }

  if (!sleepLog || !sleepLog.restStarted) {
    sleepLog = {
      date: TODAY, restStarted: null, wakeTime: wakeTimestamp,
      durationMinutes: null, quality: null, notes: null,
      strategies: { planned: [], actual: [] },
      strategiesUsed: [], medicationUsed: false, supplementsUsed: []
    };
  }

  let durationMinutes = null;
  if (sleepLog.restStarted) {
    durationMinutes = Math.round((wakeTime - new Date(sleepLog.restStarted)) / 60000);
  }

  sleepLog.wakeTime = wakeTimestamp;
  sleepLog.durationMinutes = durationMinutes;
  saveSleepLog(sleepLog);

  // End sleeping session
  if (current.task && current.task.title === 'sleeping') {
    endCurrentSession(current, wakeTime);
    current.task = null;
    current.contextFilter = null;
    current.contextSums = calculateContextSums();
    saveCurrent(current);
  }

  const durationStr = durationMinutes !== null ? formatTimeSpent(durationMinutes) : 'unknown duration';
  const bedtimeStr = sleepLog.restStarted
    ? new Date(sleepLog.restStarted).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'unknown';
  console.log(`☀️  Good morning! Slept ${durationStr} (bed: ${bedtimeStr}, wake: ${wakeTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`);
  console.log(JSON.stringify({
    status: 'wake_logged',
    wakeTime: wakeTimestamp,
    restStarted: sleepLog.restStarted,
    durationMinutes,
    date: sleepLog.date
  }));
}

function enterRestMode() {
  const current = loadCurrent();
  const now = new Date();
  const timestamp = now.toISOString();
  const strategies = loadStrategies();

  // If already sleeping, just show protocol
  if (current.task && current.task.title === 'sleeping') {
    console.log('\n😴 Already in rest mode.');
    displayBedtimeProtocol();
    promptForStrategies(strategies, timestamp);
    return;
  }

  // End current session
  if (current.task) {
    const endResult = endCurrentSession(current, now);
    if (endResult && current.task.sourceType === 'pending') {
      const pending = loadPending();
      upsertPending(pending, endResult.taskData);
      savePending(pending);
    }
    const emoji = CONTEXT_EMOJI_MAP[current.task.activityContext] || '💼';
    const timeStr = formatTimeSpent(endResult ? endResult.totalTimeSpent : 0);
    console.log(`\n⏸️  Paused: ${emoji} ${current.task.title} (${timeStr})`);
  }

  // Find sleeping routine task
  const routine = loadRoutine();
  const sleepTask = routine.find(t => t.title === 'sleeping' && t.routine);

  if (!sleepTask) {
    // Create sleeping routine task
    const newSleepTask = {
      id: generateId(),
      title: 'sleeping',
      activityContext: 'health',
      category: 'General',
      timeSpent: 0,
      sessions: [],
      notes: [],
      routine: true
    };
    routine.push(newSleepTask);
    saveRoutine(routine);

    current.task = {
      title: 'sleeping',
      activityContext: 'health',
      startedAt: timestamp,
      timeSpent: 0,
      sourceType: 'routine',
      sourceId: newSleepTask.id,
      notes: [],
      sessions: []
    };
  } else {
    current.task = {
      title: 'sleeping',
      activityContext: 'health',
      startedAt: timestamp,
      timeSpent: sleepTask.timeSpent || 0,
      sourceType: 'routine',
      sourceId: sleepTask.id,
      notes: [],
      sessions: sleepTask.sessions || []
    };
  }

  current.contextFilter = 'health';
  current.contextSums = calculateContextSums();
  saveCurrent(current);

  displayBedtimeProtocol();
  promptForStrategies(strategies, timestamp);
}

function promptForStrategies(strategies, timestamp) {
  const readline = require('readline');

  console.log('\nSelect sleep strategies (comma-separated numbers, Enter to skip):');
  displayStrategies(strategies);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  rl.question('\n> ', (answer) => {
    const selectedIds = parseStrategyInput(answer, strategies);
    const selectedNames = selectedIds.map(id => strategies.find(s => s.id === id)?.name).filter(Boolean);
    const medicationStrategies = selectedIds
      .map(id => strategies.find(s => s.id === id))
      .filter(s => s && (s.category === 'medication' || s.category === 'supplement'));

    const sleepLog = {
      date: TODAY,
      restStarted: timestamp,
      wakeTime: null,
      durationMinutes: null,
      quality: null,
      notes: null,
      strategies: { planned: selectedIds, actual: [...selectedIds] },
      strategiesUsed: selectedNames,
      medicationUsed: medicationStrategies.some(s => s.category === 'medication'),
      supplementsUsed: medicationStrategies.filter(s => s.category === 'supplement').map(s => s.name)
    };

    saveSleepLog(sleepLog);

    if (selectedNames.length > 0) {
      console.log(`\n😴 Rest mode started. Selected: ${selectedNames.join(', ')}`);
    } else {
      console.log('\n😴 Rest mode started.');
    }
    console.log('💤 Good night! Run /t wake when you get up.\n');
    rl.close();
  });
}

function exitRestMode() {
  const readline = require('readline');
  const current = loadCurrent();
  const wakeTime = new Date();
  const wakeTimestamp = wakeTime.toISOString();
  const strategies = loadStrategies();

  let sleepLog = loadSleepLog(TODAY);
  if (!sleepLog) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = getLocalDate(yesterday);
    sleepLog = loadSleepLog(yStr);
  }

  if (!sleepLog || !sleepLog.restStarted) {
    console.log('\n⚠️  No /t rest record found. Creating wake-only record.');
    sleepLog = {
      date: TODAY, restStarted: null, wakeTime: wakeTimestamp,
      durationMinutes: null, quality: null, notes: null,
      strategies: { planned: [], actual: [] },
      strategiesUsed: [], medicationUsed: false, supplementsUsed: []
    };
  }

  let durationMinutes = null;
  if (sleepLog.restStarted) {
    durationMinutes = Math.round((wakeTime - new Date(sleepLog.restStarted)) / 60000);
  }

  console.log('\n☀️  Good morning! Sleep summary:');
  console.log('────────────────────────────────');
  if (sleepLog.restStarted) {
    console.log(`  Went to bed: ${new Date(sleepLog.restStarted).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  }
  console.log(`  Woke up:     ${wakeTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  if (durationMinutes !== null) {
    console.log(`  Duration:    ${formatTimeSpent(durationMinutes)}`);
  }
  if (sleepLog.strategiesUsed && sleepLog.strategiesUsed.length > 0) {
    console.log(`\n  Strategies planned: ${sleepLog.strategiesUsed.join(', ')}`);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  rl.question('\nSleep quality (1-5, 5=excellent): ', (qualityAnswer) => {
    const quality = parseInt(qualityAnswer);
    const validQuality = (!isNaN(quality) && quality >= 1 && quality <= 5) ? quality : null;

    const plannedIds = sleepLog.strategies?.planned || [];
    console.log('\nStrategies used at bedtime:');
    displayStrategies(strategies, plannedIds);

    rl.question('\nAdd more strategies? (comma-separated numbers, Enter to keep as-is): ', (stratAnswer) => {
      let actualIds = [...plannedIds];
      const additionalIds = parseStrategyInput(stratAnswer, strategies);
      if (additionalIds.length > 0) {
        actualIds = [...new Set([...actualIds, ...additionalIds])];
      }

      const actualNames = actualIds.map(id => strategies.find(s => s.id === id)?.name).filter(Boolean);
      const medicationStrategies = actualIds
        .map(id => strategies.find(s => s.id === id))
        .filter(s => s && (s.category === 'medication' || s.category === 'supplement'));

      rl.question('\nNotes (Enter to skip): ', (notesAnswer) => {
        const notes = notesAnswer.trim() || null;

        sleepLog.wakeTime = wakeTimestamp;
        sleepLog.durationMinutes = durationMinutes;
        sleepLog.quality = validQuality;
        sleepLog.notes = notes;
        sleepLog.strategies.actual = actualIds;
        sleepLog.strategiesUsed = actualNames;
        sleepLog.medicationUsed = medicationStrategies.some(s => s.category === 'medication');
        sleepLog.supplementsUsed = medicationStrategies.filter(s => s.category === 'supplement').map(s => s.name);

        saveSleepLog(sleepLog);

        // End sleeping session and switch to unstructured
        if (current.task && current.task.title === 'sleeping') {
          endCurrentSession(current, wakeTime);
          // routine task already updated in endCurrentSession

          // Clear current task (user picks what to do next)
          current.task = null;
          current.contextFilter = null;
          current.contextSums = calculateContextSums();
          saveCurrent(current);
        }

        const qualityStr = validQuality ? `quality ${validQuality}/5` : 'no quality rated';
        const durationStr = durationMinutes !== null ? formatTimeSpent(durationMinutes) : 'unknown duration';
        console.log(`\n✅ Sleep logged: ${durationStr}, ${qualityStr}`);
        if (actualNames.length > 0) {
          console.log(`   Strategies: ${actualNames.join(', ')}`);
        }

        displayMorningProtocol();
        console.log('');
        rl.close();
      });
    });
  });
}

function showSleepStats(days = 7) {
  const sleepLogs = [];

  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = getLocalDate(d);
    const log = loadSleepLog(dateStr);
    if (log && log.wakeTime) sleepLogs.push(log);
  }

  if (sleepLogs.length === 0) {
    console.log('\n📊 No sleep data found for the last ' + days + ' days.');
    console.log('   Use /t rest and /t wake to start tracking.\n');
    return;
  }

  console.log(`\n📊 Sleep Report (Last ${days} days, ${sleepLogs.length} nights logged)`);
  console.log('──────────────────────────────────────────────');

  const durations = sleepLogs.filter(l => l.durationMinutes != null).map(l => l.durationMinutes);
  if (durations.length > 0) {
    const avgDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    console.log(`  Avg Duration:  ${formatTimeSpent(avgDuration)}`);
  }

  const qualities = sleepLogs.filter(l => l.quality).map(l => l.quality);
  if (qualities.length > 0) {
    const avgQuality = (qualities.reduce((a, b) => a + b, 0) / qualities.length).toFixed(1);
    console.log(`  Avg Quality:   ${avgQuality}/5`);
  }

  const bedtimes = sleepLogs.filter(l => l.restStarted).map(l => new Date(l.restStarted));
  if (bedtimes.length > 0) {
    const minutesPastMidnight = bedtimes.map(d => {
      let mins = d.getHours() * 60 + d.getMinutes();
      if (mins < 720) mins += 1440;
      return mins;
    });
    const avgMinutes = Math.round(minutesPastMidnight.reduce((a, b) => a + b, 0) / minutesPastMidnight.length) % 1440;
    const avgH = Math.floor(avgMinutes / 60);
    const avgM = avgMinutes % 60;
    const period = avgH >= 12 ? 'PM' : 'AM';
    const displayH = avgH > 12 ? avgH - 12 : (avgH === 0 ? 12 : avgH);
    console.log(`  Avg Bedtime:   ${displayH}:${String(avgM).padStart(2, '0')} ${period}`);
  }

  const wakeTimes = sleepLogs.filter(l => l.wakeTime).map(l => new Date(l.wakeTime));
  if (wakeTimes.length > 0) {
    const wakeMinutes = wakeTimes.map(d => d.getHours() * 60 + d.getMinutes());
    const avgWake = Math.round(wakeMinutes.reduce((a, b) => a + b, 0) / wakeMinutes.length);
    const wH = Math.floor(avgWake / 60);
    const wM = avgWake % 60;
    const wPeriod = wH >= 12 ? 'PM' : 'AM';
    const wDisplayH = wH > 12 ? wH - 12 : (wH === 0 ? 12 : wH);
    console.log(`  Avg Wake:      ${wDisplayH}:${String(wM).padStart(2, '0')} ${wPeriod}`);
  }

  if (qualities.length > 0) {
    const bestLog = sleepLogs.reduce((best, l) => (l.quality && (!best || l.quality > best.quality)) ? l : best, null);
    const worstLog = sleepLogs.reduce((worst, l) => (l.quality && (!worst || l.quality < worst.quality)) ? l : worst, null);

    if (bestLog) {
      const bestDate = new Date(bestLog.date + 'T12:00:00');
      const bestDateStr = bestDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const bestDur = bestLog.durationMinutes ? formatTimeSpent(bestLog.durationMinutes) : '?';
      console.log(`\n  Best night:    ${bestDateStr} (${bestDur}, quality ${bestLog.quality})`);
    }
    if (worstLog && worstLog !== bestLog) {
      const worstDate = new Date(worstLog.date + 'T12:00:00');
      const worstDateStr = worstDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const worstDur = worstLog.durationMinutes ? formatTimeSpent(worstLog.durationMinutes) : '?';
      console.log(`  Worst night:   ${worstDateStr} (${worstDur}, quality ${worstLog.quality})`);
    }
  }

  const strategies = loadStrategies();
  const strategyStats = {};
  sleepLogs.forEach(log => {
    (log.strategies?.actual || []).forEach(id => {
      const s = strategies.find(st => st.id === id);
      if (s && log.quality) {
        if (!strategyStats[s.name]) strategyStats[s.name] = { totalQuality: 0, count: 0 };
        strategyStats[s.name].totalQuality += log.quality;
        strategyStats[s.name].count++;
      }
    });
  });

  const sortedStrategies = Object.entries(strategyStats)
    .map(([name, stats]) => ({ name, avgQuality: (stats.totalQuality / stats.count).toFixed(1), count: stats.count }))
    .sort((a, b) => b.avgQuality - a.avgQuality);

  if (sortedStrategies.length > 0) {
    console.log('\n  Strategy effectiveness:');
    sortedStrategies.forEach(s => {
      console.log(`    ${s.name}: avg quality ${s.avgQuality} (used ${s.count}x)`);
    });
  }

  const medNights = sleepLogs.filter(l => l.medicationUsed).length;
  const suppNights = sleepLogs.filter(l => l.supplementsUsed && l.supplementsUsed.length > 0).length;
  if (medNights > 0 || suppNights > 0) {
    console.log('\n  Aid usage:');
    if (medNights > 0) console.log(`    Medication: ${medNights}/${sleepLogs.length} nights`);
    if (suppNights > 0) console.log(`    Supplements: ${suppNights}/${sleepLogs.length} nights`);
  }

  console.log('');
}

// ─── Usage ──────────────────────────────────────────────────────────────────

function showUsage() {
  console.log(`
Daily Log CLI - Track your work progress (split-file storage)

TASK MANAGEMENT:
  /t add "task" [context] [r]    Add task (context code, trailing r = routine)
  /t add "t1" "t2" [ctx] [r]    Add multiple tasks
  /t addS "task" [context]       Add task and switch to it
  /t -N                          Switch to task N
  /t c-N                         Complete task N (0 = current)
  /t cs-N                        Complete current + switch to N
  /t d-N                         Delete task N (0 = current)
  /t c-[1,3,4,5]                 Bulk complete
  /t d-[2,3,4,5]                 Bulk delete
  /t p [time]                    Pause current task
  /t m-N <ctx>                   Modify task N context
  /t pri-N <1-5>                 Set priority (1=high, 3=normal, 5=low)
  /t focus-N <0-5>              Set focus level (0=trivial, 3=medium, 5=deep work)
  /t note "text"                 Add note to current task
  /t note-pending N "text"       Add note to task N
  /t r                           Toggle routine/novel view

CONTEXT:
  /t per|soc|prof|cul|proj|heal|learn|us   Switch context
  /t all                              Clear filter, pause current task
  /t last HH:MM                       Set end time of last task (e.g., /t last 6:50)
  /t last N                           Reassign last session to task N
  /t last ? query                     Reassign last session via fuzzy search
  /t last "string"                    Create new task and assign last session to it
  /t last-N                           Reassign idle time to task N (legacy)

INTEGRATIONS:
  /t jira                        Pull Jira tickets
  /t pull-goog                   Pull Google Tasks due today
  /t sync [yesterday]            Sync with Google Calendar
  /t log-session '{...}'         Log Claude session

SLEEP:
  /t rest                        Enter rest mode
  /t wake                        Exit rest mode
  /t sleep:stats [days]          Show sleep analytics

OTHER:
  /t show [date]                 Show daily log
  /t help                        Show this help
`);
}

// ─── Command dispatcher ─────────────────────────────────────────────────────

const command = process.argv[2];
const args = process.argv.slice(3);

try {
  // Handle bulk commands first
  if (command && command.startsWith('c-[')) {
    completeBulkTasks(command.substring(2));
    process.exit(0);
  }

  if (command && command.startsWith('d-[')) {
    deleteBulkTasks(command.substring(2));
    process.exit(0);
  }

  // Handle modify-context: m-N
  if (command && command.startsWith('m-')) {
    const taskNumber = parseInt(command.substring(2));
    if (isNaN(taskNumber)) {
      console.error('\n❌ Usage: m-N <context>\n');
      process.exit(1);
    }
    if (args.length < 1) {
      console.error('\n❌ Missing context argument\n');
      console.error('   Valid contexts: per, soc, prof, cul, proj, heal, us\n');
      process.exit(1);
    }
    modifyTaskContext(taskNumber, args[0]);
    process.exit(0);
  }

  // Handle set-priority: pri-N <1-5>
  if (command && command.startsWith('pri-')) {
    const taskNumber = parseInt(command.substring(4));
    if (isNaN(taskNumber)) {
      console.error('\n❌ Usage: pri-N <1-5>  (1=high, 3=normal, 5=low)\n');
      process.exit(1);
    }
    if (args.length < 1) {
      console.error('\n❌ Missing priority value\n');
      console.error('   Usage: pri-N <1-5>  (1=high, 3=normal, 5=low)\n');
      process.exit(1);
    }
    setTaskPriority(taskNumber, args[0]);
    process.exit(0);
  }

  // Handle set-focus: focus-N <0-5>
  if (command && command.startsWith('focus-')) {
    const taskNumber = parseInt(command.substring(6));
    if (isNaN(taskNumber)) {
      console.error('\n❌ Usage: focus-N <0-5>  (0=trivial, 3=medium, 5=deep work)\n');
      process.exit(1);
    }
    if (args.length < 1) {
      console.error('\n❌ Missing focus level\n');
      console.error('   Usage: focus-N <0-5>  (0=trivial, 3=medium, 5=deep work)\n');
      process.exit(1);
    }
    setTaskFocus(taskNumber, args[0]);
    process.exit(0);
  }

  // Handle last HH:MM: set end time of last task
  // Handle last N: reassign last session to task N
  // Handle last ? query: reassign last session via fuzzy search
  // Handle last "string": create new task and assign last session to it
  if (command === 'last' && args.length > 0) {
    const timeArg = args[0];
    // HH:MM format → set end time
    if (timeArg.match(/^\d{1,2}:\d{2}$/)) {
      setLastTaskEndTime(timeArg);
      process.exit(0);
    }
    // Integer → reassign to task N
    if (timeArg.match(/^\d+$/) && !args[1]) {
      reassignLastSession({ type: 'number', value: parseInt(timeArg) });
      process.exit(0);
    }
    // ? query → fuzzy search reassign
    if (timeArg === '?') {
      const query = args.slice(1).join(' ').trim();
      if (!query) {
        console.error('\n❌ Usage: /t last ? <search query>\n');
        process.exit(1);
      }
      reassignLastSession({ type: 'fuzzy', query });
      process.exit(0);
    }
    // Otherwise treat as a new task description (like addS)
    const description = args.join(' ').trim();
    reassignLastSession({ type: 'new', description });
    process.exit(0);
  }

  // Handle last-N: reassign unstructured time (legacy, kept for backward compat)
  if (command && command.startsWith('last-')) {
    const taskNumber = parseInt(command.substring(5));
    if (isNaN(taskNumber) || taskNumber < 1) {
      console.error('\n❌ Usage: last-N (reassign unstructured time to task N)\n');
      process.exit(1);
    }
    reassignUnstructuredTime(taskNumber);
    process.exit(0);
  }

  // Handle -N: switch to task N
  if (command && command.match(/^-\d+$/)) {
    const taskNumber = parseInt(command.substring(1));
    if (taskNumber < 1) {
      console.error('\n❌ Usage: -N (switch to task N)\n');
      process.exit(1);
    }
    switchToTask(taskNumber);
    process.exit(0);
  }

  // Handle c-N: complete task N
  if (command && command.match(/^c-\d+$/)) {
    const taskNumber = parseInt(command.substring(2));
    if (isNaN(taskNumber)) {
      console.error('\n❌ Usage: c-N (complete task N, 0 = current)\n');
      process.exit(1);
    }
    completeTaskByNumber(taskNumber);
    process.exit(0);
  }

  // Handle cs-N: complete current and switch to N
  if (command && command.match(/^cs-\d+$/)) {
    const taskNumber = parseInt(command.substring(3));
    if (isNaN(taskNumber) || taskNumber < 1) {
      console.error('\n❌ Usage: cs-N (complete current, switch to task N)\n');
      process.exit(1);
    }
    completeCurrentAndSwitch(taskNumber);
    process.exit(0);
  }

  // Handle d-N: delete task N
  if (command && command.match(/^d-\d+$/)) {
    const taskNumber = parseInt(command.substring(2));
    if (isNaN(taskNumber)) {
      console.error('\n❌ Usage: d-N (delete task N, 0 = current)\n');
      process.exit(1);
    }
    deleteTask(taskNumber);
    process.exit(0);
  }

  // Handle ?: fuzzy search for tasks
  if (command === '?') {
    const query = args.join(' ').trim();
    if (!query) {
      console.error('\n❌ Usage: /t ? <search query>\n');
      process.exit(1);
    }
    fuzzySearchAndSwitch(query);
    process.exit(0);
  }

  switch (command) {
    case 'current':
      if (args.length < 1) {
        console.error('\n❌ Usage: current "<task description>"\n');
        process.exit(1);
      }
      setCurrentTask(args.join(' '));
      break;

    case 'complete':
      if (args.length === 0) {
        completeCurrentTask();
      } else {
        addCompletedWork(args.join(' '));
      }
      break;

    case 'complete-current':
      completeCurrentTask(args.length > 0 ? args.join(' ') : null);
      break;

    case 'complete-switch':
      if (args.length < 1 || isNaN(args[0])) {
        console.error('\n❌ Usage: complete-switch <task-number>\n');
        process.exit(1);
      }
      completeCurrentAndSwitch(parseInt(args[0]));
      break;

    case 'pending':
      if (args.length < 1) {
        console.error('\n❌ Usage: pending "<task description>"\n');
        process.exit(1);
      }
      addPendingTask(args.join(' '));
      break;

    case 'add': {
      if (args.length < 1) {
        console.error('\n❌ Usage: add "task 1" "task 2" ... [context] [r]\n');
        process.exit(1);
      }

      let contextArg = null;
      let taskArgs = [...args];
      let isRoutineAdd = false;

      if (taskArgs.length > 0 && taskArgs[taskArgs.length - 1].toLowerCase() === 'r') {
        isRoutineAdd = true;
        taskArgs = taskArgs.slice(0, -1);
      }

      if (taskArgs.length > 0) {
        const lastArg = taskArgs[taskArgs.length - 1];
        const contextMatch = lastArg.match(/^(per|soc|prof|cul|proj|heal|learn|us|personal|social|professional|cultivo|projects|health|learning|unstructured)$/i);
        if (contextMatch) {
          contextArg = contextMatch[1];
          taskArgs = taskArgs.slice(0, -1);
        }
      }

      if (taskArgs.length === 0) {
        console.error('\n❌ No tasks provided.\n');
        process.exit(1);
      }

      addMultipleTasks(taskArgs, contextArg, isRoutineAdd);
      break;
    }

    case 'add-switch':
    case 'pending-switch':
      if (args.length < 1) {
        console.error('\n❌ Usage: add-switch "<task description>" [context]\n');
        process.exit(1);
      }
      addPendingTaskAndSwitch(args.join(' '));
      break;

    case 'show':
      showDailyLog(args[0] || TODAY);
      break;

    case 'switch-to':
      if (args.length < 1 || isNaN(args[0])) {
        console.error('\n❌ Usage: switch-to <task-number>\n');
        process.exit(1);
      }
      switchToTask(parseInt(args[0]));
      break;

    case 'complete-task':
      if (args.length < 1 || isNaN(args[0])) {
        console.error('\n❌ Usage: complete-task <task-number>\n');
        process.exit(1);
      }
      completeTaskByNumber(parseInt(args[0]));
      break;

    case 'set-pending':
      moveCurrentToPending();
      break;

    case 'pause-current':
      pauseCurrentTaskWithNote();
      break;

    case 'p':
    case 'p-0':
      pauseCurrentTask(args.length > 0 ? args[0] : null);
      break;

    case 'delete-task':
      if (args.length < 1 || isNaN(args[0])) {
        console.error('\n❌ Usage: delete-task <task-number>\n');
        process.exit(1);
      }
      deleteTask(parseInt(args[0]));
      break;

    // ─── ID-based commands (used by frontend API) ───────────────────────────
    case 'switch-to-id':
      if (!args[0]) { console.error('\n❌ Usage: switch-to-id <task-id>\n'); process.exit(1); }
      withIdContext(args[0], (n) => switchToTask(n));
      break;

    case 'complete-task-id':
      if (!args[0]) { console.error('\n❌ Usage: complete-task-id <task-id>\n'); process.exit(1); }
      withIdContext(args[0], (n) => completeTaskByNumber(n));
      break;

    case 'delete-task-id':
      if (!args[0]) { console.error('\n❌ Usage: delete-task-id <task-id>\n'); process.exit(1); }
      withIdContext(args[0], (n) => deleteTask(n));
      break;

    case 'focus-id':
      if (!args[0] || args.length < 2) { console.error('\n❌ Usage: focus-id <task-id> <0-5>\n'); process.exit(1); }
      withIdContext(args[0], (n) => setTaskFocus(n, args[1]));
      break;

    case 'pri-id':
      if (!args[0] || args.length < 2) { console.error('\n❌ Usage: pri-id <task-id> <1-5>\n'); process.exit(1); }
      withIdContext(args[0], (n) => setTaskPriority(n, args[1]));
      break;

    case 'note':
      if (args.length < 1) {
        console.error('\n❌ Usage: note "<note text>"\n');
        process.exit(1);
      }
      addNoteToCurrentTask(args.join(' '));
      break;

    case 'note-pending':
      if (args.length < 2 || isNaN(args[0])) {
        console.error('\n❌ Usage: note-pending <task-number> "<note text>"\n');
        process.exit(1);
      }
      addNoteToPendingTask(parseInt(args[0]), args.slice(1).join(' '));
      break;

    case 'modify-context':
      if (args.length < 2 || isNaN(args[0])) {
        console.error('\n❌ Usage: modify-context <task-number> <context>\n');
        process.exit(1);
      }
      modifyTaskContext(parseInt(args[0]), args[1]);
      break;

    case 'pull-jira':
    case 'jira':
      pullJiraTickets();
      break;

    case 'pull-goog':
      pullGoogleTasks();
      break;

    case 'sync': {
      const syncDates = [TODAY];
      if (args[0] === 'all' || args[0] === 'yesterday') {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        syncDates.unshift(getLocalDate(yesterday));
      }
      syncCalendar(syncDates);
      break;
    }

    case 'log-session':
      if (args.length < 1) {
        console.error('\n❌ Usage: log-session \'{"title":"...","context":"proj","summary":"...","startedAt":"ISO","endedAt":"ISO","match":"current"|N|"new"}\'\n');
        process.exit(1);
      }
      logSession(args.join(' '));
      break;

    case 'setup-gcal': {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        console.error('\n❌ GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env\n');
        process.exit(1);
      }
      const http = require('http');
      const GCAL_PORT = 8976;
      const redirectUri = `http://127.0.0.1:${GCAL_PORT}`;
      const scopes = encodeURIComponent('https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/tasks');
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scopes}&access_type=offline&prompt=consent`;

      console.log('\n📋 Google Calendar OAuth Setup\n');
      console.log('Opening browser for authorization...\n');

      const gcalServer = http.createServer((req, res) => {
        const reqUrl = new URL(req.url, redirectUri);
        const code = reqUrl.searchParams.get('code');
        const authError = reqUrl.searchParams.get('error');

        if (authError) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h2>Authorization failed</h2><p>You can close this tab.</p>');
          console.error(`\n❌ Authorization error: ${authError}\n`);
          gcalServer.close();
          return;
        }

        if (!code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<p>Waiting for authorization...</p>');
          return;
        }

        const { execSync: execSyncLocal } = require('child_process');
        try {
          const tokenResponse = execSyncLocal(
            `curl -s -X POST https://oauth2.googleapis.com/token ` +
            `-d code="${code}" ` +
            `-d client_id="${clientId}" ` +
            `-d client_secret="${clientSecret}" ` +
            `-d redirect_uri="${redirectUri}" ` +
            `-d grant_type=authorization_code`,
            { encoding: 'utf8' }
          );
          const tokenData = JSON.parse(tokenResponse);
          if (tokenData.refresh_token) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h2>Authorization successful!</h2><p>You can close this tab.</p>');
            console.log('✅ Got refresh token! Add this to your .env:\n');
            console.log(`GOOGLE_CALENDAR_REFRESH_TOKEN=${tokenData.refresh_token}\n`);
          } else if (tokenData.error) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`<h2>Error</h2><p>${tokenData.error}: ${tokenData.error_description}</p>`);
            console.error(`\n❌ Error: ${tokenData.error} - ${tokenData.error_description}\n`);
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h2>No refresh token returned</h2><p>Try again.</p>');
            console.log('\n⚠️  No refresh token returned.');
          }
        } catch (e) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`<h2>Error</h2><p>${e.message}</p>`);
          console.error(`\n❌ Token exchange failed: ${e.message}\n`);
        }
        gcalServer.close();
      });

      gcalServer.listen(GCAL_PORT, () => {
        console.log(`Listening on ${redirectUri} for callback...\n`);
        const { exec: execOpen } = require('child_process');
        execOpen(`open "${authUrl}"`);
      });
      break;
    }

    case 'init-gcal': {
      console.log('\n📅 Creating "Time Tracking" calendar...\n');
      const calId = createTimeTrackingCalendar();
      if (calId) {
        console.log('✅ Calendar created! Add this to your .env:\n');
        console.log(`GOOGLE_CALENDAR_ID=${calId}\n`);
      }
      break;
    }

    case 'report': {
      const subArg = args[0] || 'day';
      if (subArg === 'week') {
        printWeekReport();
      } else {
        printDayReport();
      }
      break;
    }

    case 'report-week':
      printWeekReport();
      break;

    case 'help':
    case '--help':
    case '-h':
      showUsage();
      break;

    // Quick context switching (with optional : taskName for routine tasks)
    case 'per': case 'personal':
    case 'soc': case 'social':
    case 'prof': case 'professional':
    case 'cul': case 'cultivo':
    case 'proj': case 'projects':
    case 'heal': case 'health':
    case 'rest':
    case 'learn': case 'learning':
    case 'us': case 'unstructured': {
      // Check for ": taskName" pattern → switch to named routine task
      const colonIdx = args.indexOf(':');
      if (colonIdx !== -1) {
        const taskName = args.slice(colonIdx + 1).join(' ').trim();
        if (taskName) {
          switchToRoutineTask(command, taskName);
        } else {
          switchToContext(command);
        }
      } else if (args.length > 0 && args[0].toLowerCase() === 'r') {
        switchToContext(command);
        toggleViewMode();
      } else {
        switchToContext(command);
      }
      break;
    }

    // Switch to routine task without context: /t : food
    case 'switch-routine':
    case ':': {
      const routineName = args.join(' ').trim();
      if (routineName) {
        switchToRoutineTask(null, routineName);
      } else {
        console.log('\n❌ Usage: /t : <task name>\n');
      }
      break;
    }

    case 'r':
      toggleViewMode();
      break;

    case 'all':
      clearContextFilter();
      break;

    case 'rest':
      enterRestMode();
      break;

    case 'wake':
      exitRestMode();
      break;

    case 'rest-log':
      restLogNonInteractive();
      break;

    case 'wake-log':
      wakeLogNonInteractive();
      break;

    case 'sleep:stats':
      showSleepStats(args.length > 0 ? parseInt(args[0]) || 7 : 7);
      break;

    default:
      console.error(`\n❌ Unknown command: ${command}\n`);
      showUsage();
      process.exit(1);
  }
} catch (error) {
  console.error(`\n❌ Error: ${error.message}\n`);
  process.exit(1);
}

// Drain the pg pool so the process can exit promptly
if (_pgPool) _pgPool.end().catch(() => {});
