#!/usr/bin/env node
/**
 * Prompt Script - Generate zsh prompt for current task.
 * Reads from current.json via task-store.js.
 * Output: [context: task name] or empty if no current task
 */

const { CONTEXT_EMOJI_MAP, loadCurrent } = require('./task-store');

// ANSI color codes for contexts
const CONTEXT_COLORS = {
  personal: '\x1b[43m',
  social: '\x1b[44m',
  professional: '\x1b[100m',
  cultivo: '\x1b[42m',
  projects: '\x1b[45m',
  health: '\x1b[41m',
  unstructured: '\x1b[103m'
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const BLACK = '\x1b[30m';

const current = loadCurrent();

if (!current.task) {
  process.exit(0);
}

const context = current.task.activityContext || 'professional';
const contextName = context;
const contextColor = CONTEXT_COLORS[context] || CONTEXT_COLORS.professional;

// "general" context tasks show just the context (old isContextOnly behavior)
if (current.task.title === 'general') {
  const emoji = CONTEXT_EMOJI_MAP[context] || '💼';
  console.log(`${contextColor}${BLACK}${BOLD}[${emoji} ${contextName}]${RESET}`);
} else {
  const taskTitle = current.task.title;
  console.log(`${contextColor}${BLACK}${BOLD}[${contextName}: ${taskTitle}]${RESET}`);
}
