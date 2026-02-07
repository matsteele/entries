#!/usr/bin/env node
/**
 * Time Tracker - Aggregate and track time spent per context
 * 
 * Structure: Single JSON file with nested year/week structure
 * {
 *   "2025": {
 *     "50": {
 *       "days": {
 *         "2025-12-09": { "cultivo": 2234, "personal": 0, ... }
 *       },
 *       "total": { "cultivo": 2234, "personal": 0, ... }
 *     }
 *   }
 * }
 */

const fs = require('fs');
const path = require('path');

const BASE_DIR = path.join(__dirname, '..', '..');
const LOG_DIR = path.join(BASE_DIR, 'tracking', 'daily-logs');
const TIME_LOG_DIR = path.join(BASE_DIR, 'tracking', 'time-logs');
const TIME_LOG_FILE = path.join(TIME_LOG_DIR, 'time-log.json');

// Ensure directory exists
if (!fs.existsSync(TIME_LOG_DIR)) {
  fs.mkdirSync(TIME_LOG_DIR, { recursive: true });
}

/**
 * Load the main time log file
 */
function loadTimeLog() {
  if (fs.existsSync(TIME_LOG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(TIME_LOG_FILE, 'utf8'));
    } catch (error) {
      console.error(`Error reading time log: ${error.message}`);
    }
  }
  return {};
}

/**
 * Save the main time log file
 */
function saveTimeLog(timeLog) {
  fs.writeFileSync(TIME_LOG_FILE, JSON.stringify(timeLog, null, 2), 'utf8');
}

/**
 * Get ISO week number and year for a date
 * Returns {year: 2025, week: 50}
 */
function getWeekInfo(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { year: d.getFullYear(), week: weekNo };
}

/**
 * Calculate total time per context for a daily log
 * Uses the context field if available, otherwise calculates from tasks
 */
function calculateDailyContextTime(dailyLog) {
  // If the log has a pre-calculated context field, use it
  if (dailyLog.context) {
    return dailyLog.context;
  }

  // Fallback: calculate from tasks
  const contextTimes = {
    personal: 0,
    social: 0,
    professional: 0,
    cultivo: 0,
    projects: 0,
    health: 0,
    unstructured: 0
  };

  if (!dailyLog || !dailyLog.dailyLog) return contextTimes;

  const log = dailyLog.dailyLog;

  // Add completed work time
  (log.completedWork || []).forEach(work => {
    const context = work.activityContext || 'professional';
    contextTimes[context] = (contextTimes[context] || 0) + (work.timeSpent || 0);
  });

  // Add pending tasks time (accumulated but not completed)
  (log.pendingTasks || []).forEach(task => {
    const context = task.activityContext || 'professional';
    contextTimes[context] = (contextTimes[context] || 0) + (task.timeSpent || 0);
  });

  // Add current task time (if exists and not context-only)
  if (log.currentTask && !log.currentTask.isContextOnly) {
    const context = log.currentTask.activityContext || 'professional';
    const startTime = new Date(log.currentTask.startedAt);
    const now = new Date();
    const elapsedMinutes = Math.floor((now - startTime) / 60000);
    const totalTime = (log.currentTask.timeSpent || 0) + elapsedMinutes;
    contextTimes[context] = (contextTimes[context] || 0) + totalTime;
  }

  return contextTimes;
}

/**
 * Add a day's time to the time log
 */
function addDayToWeek(date, contextTimes) {
  const weekInfo = getWeekInfo(date);
  const timeLog = loadTimeLog();

  // Ensure year exists
  if (!timeLog[weekInfo.year]) {
    timeLog[weekInfo.year] = {};
  }

  // Ensure week exists
  if (!timeLog[weekInfo.year][weekInfo.week]) {
    timeLog[weekInfo.year][weekInfo.week] = {
      days: {},
      total: {
        personal: 0,
        social: 0,
        professional: 0,
        cultivo: 0,
        projects: 0,
        health: 0,
        unstructured: 0
      }
    };
  }

  const weekData = timeLog[weekInfo.year][weekInfo.week];

  // Store daily breakdown
  weekData.days[date] = contextTimes;

  // Recalculate weekly totals from all days
  weekData.total = {
    personal: 0,
    social: 0,
    professional: 0,
    cultivo: 0,
    projects: 0,
    health: 0,
    unstructured: 0
  };

  Object.values(weekData.days).forEach(dayTimes => {
    Object.keys(dayTimes).forEach(context => {
      weekData.total[context] = (weekData.total[context] || 0) + dayTimes[context];
    });
  });

  saveTimeLog(timeLog);
  return weekData;
}

/**
 * Get weekly total
 */
function getWeeklyTotal(year, week) {
  const timeLog = loadTimeLog();
  
  if (timeLog[year] && timeLog[year][week]) {
    return timeLog[year][week].total;
  }

  return {
    personal: 0,
    social: 0,
    professional: 0,
    cultivo: 0,
    projects: 0,
    health: 0,
    unstructured: 0
  };
}

/**
 * Get all weekly data for a month
 */
function getMonthlyTotal(year, month) {
  const monthlyTotals = {
    personal: 0,
    social: 0,
    professional: 0,
    cultivo: 0,
    projects: 0,
    health: 0,
    unstructured: 0
  };

  const timeLog = loadTimeLog();
  
  if (!timeLog[year]) return monthlyTotals;

  // Get all weeks that overlap with this month
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);

  const firstWeek = getWeekInfo(firstDay);
  const lastWeek = getWeekInfo(lastDay);

  // Sum up all weeks in the range
  for (let week = firstWeek.week; week <= lastWeek.week; week++) {
    const weekData = timeLog[year][week];
    if (!weekData) continue;
    
    // Only include days that are actually in this month
    Object.entries(weekData.days).forEach(([date, contextTimes]) => {
      const d = new Date(date);
      if (d.getMonth() === month - 1 && d.getFullYear() === year) {
        Object.keys(contextTimes).forEach(context => {
          monthlyTotals[context] = (monthlyTotals[context] || 0) + contextTimes[context];
        });
      }
    });
  }

  return monthlyTotals;
}

/**
 * Get yearly total
 */
function getYearlyTotal(year) {
  const yearlyTotals = {
    personal: 0,
    social: 0,
    professional: 0,
    cultivo: 0,
    projects: 0,
    health: 0,
    unstructured: 0
  };

  const timeLog = loadTimeLog();
  
  if (!timeLog[year]) return yearlyTotals;

  // Sum all weeks in the year
  Object.values(timeLog[year]).forEach(weekData => {
    Object.keys(weekData.total).forEach(context => {
      yearlyTotals[context] = (yearlyTotals[context] || 0) + (weekData.total[context] || 0);
    });
  });

  return yearlyTotals;
}

/**
 * Archive a day's time when starting a new day
 */
function archiveDayTime(date) {
  const logPath = path.join(LOG_DIR, `daily-log-${date}.json`);
  
  if (!fs.existsSync(logPath)) {
    console.error(`Daily log not found for ${date}`);
    return null;
  }

  const dailyLog = JSON.parse(fs.readFileSync(logPath, 'utf8'));
  const contextTimes = calculateDailyContextTime(dailyLog);

  // Add to time log
  const weekData = addDayToWeek(date, contextTimes);

  // Calculate and update time budget
  const budgetDelta = calculateTimeBudgetForDay(contextTimes);
  updateTimeBudget(date, budgetDelta);

  return { date, contextTimes, weekData, budgetDelta };
}

/**
 * Format minutes to readable string
 */
function formatTime(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Display time summary
 */
function displaySummary(type, data) {
  console.log(`\n📊 ${type} Time Summary:`);
  console.log('─'.repeat(50));
  
  const contexts = [
    { key: 'cultivo', emoji: '🌱', name: 'Cultivo' },
    { key: 'personal', emoji: '🏠', name: 'Personal' },
    { key: 'health', emoji: '💪', name: 'Health' },
    { key: 'professional', emoji: '💼', name: 'Professional' },
    { key: 'projects', emoji: '🚀', name: 'Projects' },
    { key: 'social', emoji: '👥', name: 'Social' },
    { key: 'unstructured', emoji: '☀️', name: 'Unstructured' }
  ];

  let total = 0;
  contexts.forEach(({ key, emoji, name }) => {
    const minutes = data[key] || 0;
    if (minutes > 0) {
      total += minutes;
      console.log(`${emoji} ${name.padEnd(15)} ${formatTime(minutes)}`);
    }
  });

  console.log('─'.repeat(50));
  console.log(`Total: ${formatTime(total)}\n`);
}

// Time Budget Constants
const EARNING_RATE = 0.1;        // 1hr structured work = 0.1hr (6min) earned
const EARLY_MORNING_BONUS = 0.1; // additional rate before 9am (total 0.2x)
const EARNING_CONTEXTS = ['personal', 'social', 'professional', 'cultivo', 'projects'];
const SPENDING_CONTEXTS = ['unstructured'];
// health is neutral - neither earns nor spends

/**
 * Calculate time budget earned/spent for a day
 */
function calculateTimeBudgetForDay(contextTimes) {
  // Calculate total structured time (in minutes)
  let structuredMinutes = 0;
  EARNING_CONTEXTS.forEach(ctx => {
    structuredMinutes += (contextTimes[ctx] || 0);
  });

  // Calculate unstructured time spent (in minutes)
  let unstructuredMinutes = 0;
  SPENDING_CONTEXTS.forEach(ctx => {
    unstructuredMinutes += (contextTimes[ctx] || 0);
  });

  // Earned = structured time * earning rate
  const earnedMinutes = structuredMinutes * EARNING_RATE;
  // Spent = unstructured time at 1x rate
  const spentMinutes = unstructuredMinutes;

  return {
    earned: Math.round(earnedMinutes * 10) / 10,
    spent: Math.round(spentMinutes * 10) / 10,
    net: Math.round((earnedMinutes - spentMinutes) * 10) / 10
  };
}

/**
 * Update the persistent time budget balance
 */
function updateTimeBudget(date, budgetDelta) {
  const timeLog = loadTimeLog();

  if (!timeLog.timeBudget) {
    timeLog.timeBudget = {
      balance: 0,
      lastUpdated: null,
      history: []
    };
  }

  // Idempotent: remove old entry for this date if exists
  const existingEntry = timeLog.timeBudget.history.find(h => h.date === date);
  if (existingEntry) {
    timeLog.timeBudget.balance -= existingEntry.net;
    timeLog.timeBudget.history = timeLog.timeBudget.history.filter(h => h.date !== date);
  }

  // Add new entry
  timeLog.timeBudget.balance += budgetDelta.net;
  timeLog.timeBudget.balance = Math.round(timeLog.timeBudget.balance * 10) / 10;
  timeLog.timeBudget.lastUpdated = date;
  timeLog.timeBudget.history.push({
    date,
    earned: budgetDelta.earned,
    spent: budgetDelta.spent,
    net: budgetDelta.net
  });

  // Keep only last 30 days of history
  if (timeLog.timeBudget.history.length > 30) {
    timeLog.timeBudget.history = timeLog.timeBudget.history.slice(-30);
  }

  saveTimeLog(timeLog);
}

/**
 * Get the current time budget balance
 */
function getTimeBudgetBalance() {
  const timeLog = loadTimeLog();
  if (!timeLog.timeBudget) {
    return { balance: 0, lastUpdated: null };
  }
  return {
    balance: timeLog.timeBudget.balance,
    lastUpdated: timeLog.timeBudget.lastUpdated
  };
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'archive':
      // Archive yesterday's time
      const yesterday = args[1] || new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const result = archiveDayTime(yesterday);
      if (result) {
        console.log(`✅ Archived time for ${yesterday}`);
        displaySummary('Daily', result.contextTimes);
      }
      break;

    case 'week':
      // Show current week
      const weekInfo = getWeekInfo(new Date());
      const weeklyTotal = getWeeklyTotal(weekInfo.year, weekInfo.week);
      console.log(`\nWeek ${weekInfo.week}, ${weekInfo.year}`);
      displaySummary('Weekly', weeklyTotal);
      break;

    case 'month':
      // Show current month
      const now = new Date();
      const monthlyTotals = getMonthlyTotal(now.getFullYear(), now.getMonth() + 1);
      const monthName = now.toLocaleString('default', { month: 'long' });
      console.log(`\n${monthName} ${now.getFullYear()}`);
      displaySummary('Monthly', monthlyTotals);
      break;

    case 'year':
      // Show current year
      const year = parseInt(args[1]) || new Date().getFullYear();
      const yearlyTotals = getYearlyTotal(year);
      displaySummary(`${year}`, yearlyTotals);
      break;

    default:
      console.log(`
Time Tracker - Track time spent per context

Usage:
  node time-tracker.js archive [date]  - Archive a day's time (default: yesterday)
  node time-tracker.js week            - Show current week's time
  node time-tracker.js month           - Show current month's time
  node time-tracker.js year [year]     - Show year's time (default: current year)
      `);
  }
}

module.exports = {
  calculateDailyContextTime,
  archiveDayTime,
  getWeekInfo,
  getWeeklyTotal,
  getMonthlyTotal,
  getYearlyTotal,
  displaySummary,
  calculateTimeBudgetForDay,
  getTimeBudgetBalance
};

