#!/usr/bin/env node
/**
 * Prompt Script - Generate zsh prompt for current task
 * Usage: node prompt.js
 * Output: [context: task name] or empty if no current task
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

// Context name and color mapping
const CONTEXT_NAMES = {
  personal: 'personal',
  social: 'social',
  professional: 'professional',
  cultivo: 'cultivo',
  projects: 'projects'
};

// ANSI color codes for contexts (same as statusline)
const CONTEXT_COLORS = {
  personal: '\x1b[43m',    // Yellow background
  social: '\x1b[44m',      // Blue background
  professional: '\x1b[100m', // Grey background
  cultivo: '\x1b[42m',     // Green background
  projects: '\x1b[45m'     // Magenta background
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const BLACK = '\x1b[30m';

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

// Main
const log = loadDailyLog();

if (!log || !log.dailyLog || !log.dailyLog.currentTask || log.dailyLog.currentTask.isContextOnly) {
  // No current task or it's just a context filter - output nothing
  process.exit(0);
}

const currentTask = log.dailyLog.currentTask;
const context = currentTask.activityContext || 'professional';
const contextName = CONTEXT_NAMES[context] || context;
const contextColor = CONTEXT_COLORS[context] || CONTEXT_COLORS.professional;
const taskTitle = currentTask.title;

// Output: [context: task name] with colored background
console.log(`${contextColor}${BLACK}${BOLD}[${contextName}: ${taskTitle}]${RESET}`);

