#!/usr/bin/env node
/**
 * Statusline Script - Display current task and pending tasks with context emojis
 */

const fs = require('fs');
const path = require('path');

// Get today's date
function getLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const TODAY = getLocalDate();
const BASE_DIR = path.join(__dirname, '..', '..');
const LOG_DIR = path.join(BASE_DIR, 'daily-logs');
const LOG_FILE = path.join(LOG_DIR, `daily-log-${TODAY}.json`);

// Context emoji and color mapping
const CONTEXT_EMOJI = {
  personal: '🏠',
  social: '👥',
  professional: '💼',
  cultivo: '🌱',
  projects: '🚀'
};

// ANSI color codes for contexts
const CONTEXT_COLORS = {
  personal: '\x1b[43m',    // Yellow background
  social: '\x1b[44m',      // Blue background
  professional: '\x1b[100m', // Grey background (bright black)
  cultivo: '\x1b[42m',     // Green background
  projects: '\x1b[45m'     // Magenta background
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const BLACK = '\x1b[30m';
const BROWN = '\x1b[38;5;179m'; // Light brown for time display

// Format time spent
function formatTimeSpent(minutes) {
  if (!minutes || minutes === 0) return '';

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours > 0 && mins > 0) {
    return `(${hours}h ${mins}m)`;
  } else if (hours > 0) {
    return `(${hours}h)`;
  } else {
    return `(${mins}m)`;
  }
}

// Calculate elapsed time for current task
function calculateElapsedMinutes(startedAt) {
  const start = new Date(startedAt);
  const now = new Date();
  return Math.floor((now - start) / 1000 / 60);
}

// Load daily log
function loadDailyLog() {
  if (fs.existsSync(LOG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    } catch (error) {
      return null;
    }
  }
  return null;
}

// Format task for display
function formatTask(task, index) {
  const title = task.title || task.task || 'null';
  const context = task.activityContext || 'professional';
  const emoji = CONTEXT_EMOJI[context] || '💼';
  const timeSpent = task.timeSpent || 0;
  const timeStr = formatTimeSpent(timeSpent);

  return `${emoji} ${title}${timeStr ? ' ' + timeStr : ''}`;
}

// Main
const log = loadDailyLog();

if (!log || !log.dailyLog) {
  console.log('No active tasks');
  process.exit(0);
}

const dailyLog = log.dailyLog;
const contextFilter = dailyLog.contextFilter || null;

// Get pending tasks in display order (matching CLI logic)
const allPendingTasks = dailyLog.pendingTasks || [];

function getDisplayOrderedTasks(tasks, filter) {
  if (filter) {
    // Filtered mode: only return tasks matching the filter
    return tasks.filter(t => (t.activityContext || 'professional') === filter);
  } else {
    // No filter: return tasks ordered by context groups
    const contextOrder = ['personal', 'cultivo', 'professional', 'social', 'projects'];
    const displayOrderTasks = [];

    contextOrder.forEach(ctx => {
      const contextTasks = tasks.filter(task => (task.activityContext || 'professional') === ctx);
      displayOrderTasks.push(...contextTasks);
    });

    return displayOrderTasks;
  }
}

const pendingTasks = getDisplayOrderedTasks(allPendingTasks, contextFilter);

// Display current task if exists (but skip context-only tasks)
if (dailyLog.currentTask && !dailyLog.currentTask.isContextOnly) {
  const context = dailyLog.currentTask.activityContext || 'professional';
  const emoji = CONTEXT_EMOJI[context] || '💼';
  const taskTitle = dailyLog.currentTask.title;
  const elapsedMinutes = calculateElapsedMinutes(dailyLog.currentTask.startedAt);
  const totalTime = (dailyLog.currentTask.timeSpent || 0) + elapsedMinutes;
  const timeStr = formatTimeSpent(totalTime);
  
  // Simple format: emoji : task name (time in brown)
  if (timeStr) {
    console.log(`${emoji} : ${taskTitle} ${BROWN}${timeStr}${RESET}`);
  } else {
    console.log(`${emoji} : ${taskTitle}`);
  }
}

// Calculate total time for the active context (if filter is set)
let contextTotalTime = 0;
if (contextFilter) {
  // Sum time from completed work in this context
  const completedWork = dailyLog.completedWork || [];
  completedWork.forEach(work => {
    if ((work.activityContext || 'professional') === contextFilter) {
      contextTotalTime += work.timeSpent || 0;
    }
  });

  // Add time from pending tasks in this context
  allPendingTasks.forEach(task => {
    if ((task.activityContext || 'professional') === contextFilter) {
      contextTotalTime += task.timeSpent || 0;
    }
  });

  // Add time from current task if it's in this context
  if (dailyLog.currentTask && !dailyLog.currentTask.isContextOnly) {
    const currentContext = dailyLog.currentTask.activityContext || 'professional';
    if (currentContext === contextFilter) {
      const elapsedMinutes = calculateElapsedMinutes(dailyLog.currentTask.startedAt);
      contextTotalTime += (dailyLog.currentTask.timeSpent || 0) + elapsedMinutes;
    }
  }
}

// Display pending tasks
if (pendingTasks.length > 0) {
  // Show context filter header if active
  if (contextFilter) {
    const contextName = contextFilter.charAt(0).toUpperCase() + contextFilter.slice(1);
    const color = CONTEXT_COLORS[contextFilter] || CONTEXT_COLORS.professional;
    const emoji = CONTEXT_EMOJI[contextFilter] || '💼';
    
    // Colored box with context name
    console.log(`\n${color}${BLACK}${BOLD} ${emoji} ${contextName.toUpperCase()} ${RESET}`);
    if (contextTotalTime > 0) {
      console.log(`Total time: ${BROWN}${formatTimeSpent(contextTotalTime)}${RESET}`);
    }
    console.log('');
  }
  
  console.log('Todos:');

  // Show context emoji with total time if filter is active
  if (contextFilter) {
    const emoji = CONTEXT_EMOJI[contextFilter] || '💼';
    if (contextTotalTime > 0) {
      console.log(`  ${emoji} ${BROWN}${contextTotalTime}m${RESET}`);
    } else {
      console.log(`  ${emoji}`);
    }
  }

  pendingTasks.forEach((task, idx) => {
    const title = task.title || task.task || 'null';
    const context = task.activityContext || 'professional';
    const emoji = CONTEXT_EMOJI[context] || '💼';
    const timeSpent = task.timeSpent || 0;

    // Format: number, emoji, time (if > 0 in brown), title
    if (timeSpent > 0) {
      const mins = timeSpent;
      console.log(`  ${idx + 1}. ${emoji} ${BROWN}${mins}m${RESET} ${title}`);
    } else {
      console.log(`  ${idx + 1}. ${emoji} ${title}`);
    }
  });
} else {
  // Show context filter header even with no tasks
  if (contextFilter) {
    const contextName = contextFilter.charAt(0).toUpperCase() + contextFilter.slice(1);
    const color = CONTEXT_COLORS[contextFilter] || CONTEXT_COLORS.professional;
    const emoji = CONTEXT_EMOJI[contextFilter] || '💼';
    
    // Colored box with context name
    console.log(`\n${color}${BLACK}${BOLD} ${emoji} ${contextName.toUpperCase()} ${RESET}`);
    if (contextTotalTime > 0) {
      console.log(`Total time: ${BROWN}${formatTimeSpent(contextTotalTime)}${RESET}`);
    }
    console.log('');
    console.log('Todos:');
    console.log('  (No pending tasks)');
  } else if (!dailyLog.currentTask) {
    console.log('No tasks');
  }
}
