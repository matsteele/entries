#!/usr/bin/env node
/**
 * Statusline Script - Display current task and pending tasks with context emojis.
 * Reads from split-file storage via task-store.js.
 *
 * Output format:
 *   Line 1: compact inline task info (goes on prompt line)
 *   Line 2+: context header + task list (below prompt)
 */

const fs = require('fs');
const path = require('path');
const {
  BASE_DIR, CONTEXT_EMOJI_MAP,
  loadPending, loadRoutine, loadCurrent,
  calculateElapsedMinutes, formatTimeSpent,
  getDisplayOrderedTasks, getCompletedTodayCount
} = require('./task-store');

// ANSI color codes for contexts
const CONTEXT_BG = {
  personal: '\x1b[43m',      // Yellow background
  social: '\x1b[44m',        // Blue background
  professional: '\x1b[100m', // Grey background
  cultivo: '\x1b[42m',       // Green background
  projects: '\x1b[45m',      // Magenta background
  health: '\x1b[41m',        // Red background
  unstructured: '\x1b[103m'  // Bright yellow background
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const WHITE = '\x1b[97m';
const DIM = '\x1b[2m';
const BROWN = '\x1b[38;5;179m';
const GREEN = '\x1b[32m';

// ─── Load data from split files ─────────────────────────────────────────────

const current = loadCurrent();
const contextFilter = current.contextFilter || null;
const viewMode = current.viewMode || 'novel';

// Get the right task list based on view mode
const taskList = viewMode === 'routine' ? loadRoutine() : loadPending();
const pendingTasks = getDisplayOrderedTasks(taskList, contextFilter);
const allPending = loadPending();
const pendingCount = allPending.length;
const completedCount = getCompletedTodayCount();

// ─── Line 1: Compact inline (goes on prompt line) ──────────────────────────

const counters = `${GREEN}✓${completedCount}${RESET} ${DIM}□${pendingCount}${RESET}`;

if (current.task) {
  const context = current.task.activityContext || 'professional';
  const emoji = CONTEXT_EMOJI_MAP[context] || '💼';
  const bg = CONTEXT_BG[context] || CONTEXT_BG.professional;
  const isGeneral = current.task.title === 'general';
  const contextName = context.charAt(0).toUpperCase() + context.slice(1);

  const elapsedMinutes = calculateElapsedMinutes(current.task.startedAt);
  const totalTime = (current.task.timeSpent || 0) + elapsedMinutes;
  const timeStr = formatTimeSpent(totalTime);

  const taskLabel = isGeneral ? contextName.toLowerCase() : current.task.title;
  console.log(`${bg}${WHITE}${BOLD} ${emoji} : ${taskLabel} ${RESET} ${BROWN}${timeStr}${RESET}  ${counters}`);
} else {
  console.log(`${DIM}no task${RESET}  ${counters}`);
}

// ─── Line 2+: Context header + task list ────────────────────────────────────

// Calculate context total time from cached sums + live elapsed
let contextTotalTime = 0;
if (contextFilter && current.contextSums && current.contextSums.day) {
  contextTotalTime = current.contextSums.day[contextFilter] || 0;
  if (current.task) {
    const currentContext = current.task.activityContext || 'professional';
    if (currentContext === contextFilter) {
      contextTotalTime += calculateElapsedMinutes(current.task.startedAt);
    }
  }
}

if (pendingTasks.length > 0) {
  const modeLabel = viewMode === 'routine' ? '🔄 Routine' : 'Todos';

  if (contextFilter) {
    const contextName = contextFilter.charAt(0).toUpperCase() + contextFilter.slice(1);
    const bg = CONTEXT_BG[contextFilter] || CONTEXT_BG.professional;
    const emoji = CONTEXT_EMOJI_MAP[contextFilter] || '💼';
    const timeTag = contextTotalTime > 0 ? `  ${BROWN}${formatTimeSpent(contextTotalTime)}${RESET}` : '';
    const routineTag = viewMode === 'routine' ? ' (R)' : '';

    console.log(`${bg}${WHITE}${BOLD} ${emoji} ${contextName.toUpperCase()}${routineTag} ${RESET}${timeTag}:`);
  } else {
    const routineTag = viewMode === 'routine' ? ' (R)' : '';
    console.log(`${modeLabel}${routineTag}:`);
  }

  pendingTasks.forEach((task, idx) => {
    const title = task.title || 'null';
    const context = task.activityContext || 'professional';
    const emoji = CONTEXT_EMOJI_MAP[context] || '💼';
    const timeSpent = task.timeSpent || 0;

    if (timeSpent > 0) {
      console.log(`  ${idx + 1}. ${emoji} ${BROWN}${timeSpent}m${RESET} ${title}`);
    } else {
      console.log(`  ${idx + 1}. ${emoji} ${title}`);
    }
  });
} else {
  if (contextFilter) {
    const contextName = contextFilter.charAt(0).toUpperCase() + contextFilter.slice(1);
    const bg = CONTEXT_BG[contextFilter] || CONTEXT_BG.professional;
    const emoji = CONTEXT_EMOJI_MAP[contextFilter] || '💼';
    const routineTag = viewMode === 'routine' ? ' (R)' : '';

    console.log(`${bg}${WHITE}${BOLD} ${emoji} ${contextName.toUpperCase()}${routineTag} ${RESET}`);
    console.log('Todos:');
    console.log('  (No pending tasks)');
  }
}

// ─── Time budget balance ────────────────────────────────────────────────────

try {
  const TIME_LOG_FILE = path.join(BASE_DIR, 'tracking', 'time-logs', 'time-log.json');
  if (fs.existsSync(TIME_LOG_FILE)) {
    const timeLog = JSON.parse(fs.readFileSync(TIME_LOG_FILE, 'utf8'));
    if (timeLog.timeBudget && timeLog.timeBudget.balance !== undefined) {
      const balance = timeLog.timeBudget.balance;
      if (balance >= 0) {
        console.log(`☀️ +${formatTimeSpent(Math.round(balance))}`);
      } else {
        console.log(`🌙 -${formatTimeSpent(Math.round(Math.abs(balance)))}`);
      }
    }
  }
} catch (e) {
  // Silently ignore budget display errors
}
