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
 *
 * For today, context times are calculated live from session data in
 * the 4 split files (pending, completed, routine, current).
 * For historical dates, reads from archived daily-log files.
 */

const fs = require('fs');
const path = require('path');
const {
  BASE_DIR, TIME_LOG_FILE,
  loadCurrent, calculateContextSums, calculateElapsedMinutes, getLocalDate
} = require('../backend/task-store');

const ARCHIVE_DIR = path.join(BASE_DIR, 'tracking', 'archive', 'daily-logs');
const TIME_LOG_DIR = path.join(BASE_DIR, 'tracking', 'time-logs');

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
 * Calculate context times for today from live session data
 */
function calculateTodayContextTime() {
  // Use calculateContextSums which reads all 4 files and computes day/week/month
  const sums = calculateContextSums();

  // Add live elapsed for current task
  const current = loadCurrent();
  const dayTimes = { ...sums.day };

  if (current.task) {
    const ctx = current.task.activityContext || 'professional';
    const elapsed = calculateElapsedMinutes(current.task.startedAt);
    dayTimes[ctx] = (dayTimes[ctx] || 0) + elapsed;
  }

  return dayTimes;
}

/**
 * Calculate context times for a historical date from archived daily log
 */
function calculateHistoricalContextTime(date) {
  const contextTimes = {
    personal: 0, social: 0, professional: 0,
    cultivo: 0, projects: 0, health: 0, unstructured: 0
  };

  // Try archived daily-log file
  const logPath = path.join(ARCHIVE_DIR, `daily-log-${date}.json`);
  if (!fs.existsSync(logPath)) return null;

  try {
    const dailyLog = JSON.parse(fs.readFileSync(logPath, 'utf8'));

    // Use pre-calculated context field if available
    if (dailyLog.context) return dailyLog.context;

    // Fallback: calculate from tasks
    if (!dailyLog.dailyLog) return contextTimes;
    const log = dailyLog.dailyLog;

    (log.completedWork || []).forEach(work => {
      const context = work.activityContext || 'professional';
      contextTimes[context] = (contextTimes[context] || 0) + (work.timeSpent || 0);
    });
    (log.pendingTasks || []).forEach(task => {
      const context = task.activityContext || 'professional';
      contextTimes[context] = (contextTimes[context] || 0) + (task.timeSpent || 0);
    });

    return contextTimes;
  } catch (error) {
    console.error(`Error reading archived log for ${date}: ${error.message}`);
    return null;
  }
}

/**
 * Add a day's time to the time log
 */
function addDayToWeek(date, contextTimes) {
  const weekInfo = getWeekInfo(date);
  const timeLog = loadTimeLog();

  if (!timeLog[weekInfo.year]) timeLog[weekInfo.year] = {};

  if (!timeLog[weekInfo.year][weekInfo.week]) {
    timeLog[weekInfo.year][weekInfo.week] = {
      days: {},
      total: {
        personal: 0, social: 0, professional: 0,
        cultivo: 0, projects: 0, health: 0, unstructured: 0
      }
    };
  }

  const weekData = timeLog[weekInfo.year][weekInfo.week];
  weekData.days[date] = contextTimes;

  // Recalculate weekly totals from all days
  weekData.total = {
    personal: 0, social: 0, professional: 0,
    cultivo: 0, projects: 0, health: 0, unstructured: 0
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
    personal: 0, social: 0, professional: 0,
    cultivo: 0, projects: 0, health: 0, unstructured: 0
  };
}

/**
 * Get all weekly data for a month
 */
function getMonthlyTotal(year, month) {
  const monthlyTotals = {
    personal: 0, social: 0, professional: 0,
    cultivo: 0, projects: 0, health: 0, unstructured: 0
  };

  const timeLog = loadTimeLog();
  if (!timeLog[year]) return monthlyTotals;

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const firstWeek = getWeekInfo(firstDay);
  const lastWeek = getWeekInfo(lastDay);

  for (let week = firstWeek.week; week <= lastWeek.week; week++) {
    const weekData = timeLog[year][week];
    if (!weekData) continue;

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
    personal: 0, social: 0, professional: 0,
    cultivo: 0, projects: 0, health: 0, unstructured: 0
  };

  const timeLog = loadTimeLog();
  if (!timeLog[year]) return yearlyTotals;

  Object.values(timeLog[year]).forEach(weekData => {
    Object.keys(weekData.total).forEach(context => {
      yearlyTotals[context] = (yearlyTotals[context] || 0) + (weekData.total[context] || 0);
    });
  });

  return yearlyTotals;
}

/**
 * Archive a day's time to the time log.
 * For today: calculates from live session data in 4 split files.
 * For historical: reads from archived daily-log files.
 */
function archiveDayTime(date) {
  let contextTimes;

  if (date === getLocalDate()) {
    // Today: calculate from live session data
    contextTimes = calculateTodayContextTime();
  } else {
    // Historical: try archived daily log
    contextTimes = calculateHistoricalContextTime(date);
    if (!contextTimes) {
      console.error(`No data found for ${date}`);
      return null;
    }
  }

  const weekData = addDayToWeek(date, contextTimes);
  const budgetDelta = calculateTimeBudgetForDay(contextTimes);
  updateTimeBudget(date, budgetDelta);

  return { date, contextTimes, weekData, budgetDelta };
}

// Time Budget Constants
const EARNING_RATE = 0.1;
const EARNING_CONTEXTS = ['personal', 'social', 'professional', 'cultivo', 'projects', 'learning'];
const SPENDING_CONTEXTS = ['unstructured'];

/**
 * Calculate time budget earned/spent for a day
 */
function calculateTimeBudgetForDay(contextTimes) {
  let structuredMinutes = 0;
  EARNING_CONTEXTS.forEach(ctx => {
    structuredMinutes += (contextTimes[ctx] || 0);
  });

  let unstructuredMinutes = 0;
  SPENDING_CONTEXTS.forEach(ctx => {
    unstructuredMinutes += (contextTimes[ctx] || 0);
  });

  const earnedMinutes = structuredMinutes * EARNING_RATE;
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

  timeLog.timeBudget.balance += budgetDelta.net;
  timeLog.timeBudget.balance = Math.round(timeLog.timeBudget.balance * 10) / 10;
  timeLog.timeBudget.lastUpdated = date;
  timeLog.timeBudget.history.push({
    date,
    earned: budgetDelta.earned,
    spent: budgetDelta.spent,
    net: budgetDelta.net
  });

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

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'archive': {
      const yesterday = args[1] || new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const result = archiveDayTime(yesterday);
      if (result) {
        console.log(`✅ Archived time for ${yesterday}`);
        displaySummary('Daily', result.contextTimes);
      }
      break;
    }

    case 'today': {
      const todayTimes = calculateTodayContextTime();
      displaySummary('Today (live)', todayTimes);
      break;
    }

    case 'week': {
      const weekInfo = getWeekInfo(new Date());
      const weeklyTotal = getWeeklyTotal(weekInfo.year, weekInfo.week);
      console.log(`\nWeek ${weekInfo.week}, ${weekInfo.year}`);
      displaySummary('Weekly', weeklyTotal);
      break;
    }

    case 'month': {
      const now = new Date();
      const monthlyTotals = getMonthlyTotal(now.getFullYear(), now.getMonth() + 1);
      const monthName = now.toLocaleString('default', { month: 'long' });
      console.log(`\n${monthName} ${now.getFullYear()}`);
      displaySummary('Monthly', monthlyTotals);
      break;
    }

    case 'year': {
      const year = parseInt(args[1]) || new Date().getFullYear();
      const yearlyTotals = getYearlyTotal(year);
      displaySummary(`${year}`, yearlyTotals);
      break;
    }

    default:
      console.log(`
Time Tracker - Track time spent per context

Usage:
  node time-tracker.js archive [date]  - Archive a day's time (default: yesterday)
  node time-tracker.js today           - Show today's time (live from sessions)
  node time-tracker.js week            - Show current week's time
  node time-tracker.js month           - Show current month's time
  node time-tracker.js year [year]     - Show year's time (default: current year)
      `);
  }
}

module.exports = {
  archiveDayTime,
  calculateTodayContextTime,
  getWeekInfo,
  getWeeklyTotal,
  getMonthlyTotal,
  getYearlyTotal,
  displaySummary,
  calculateTimeBudgetForDay,
  getTimeBudgetBalance
};
