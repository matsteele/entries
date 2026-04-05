#!/usr/bin/env node
/**
 * One-time migration: split daily-log-2026-02-09.json into the 4 new task files.
 */

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', '..');
const SOURCE = path.join(BASE, 'tracking', 'archive', 'daily-logs', 'daily-log-2026-02-09.json');

const log = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
const dl = log.dailyLog;

// Split pending tasks by routine flag
const routine = [];
const pending = [];

for (const task of dl.pendingTasks) {
  if (!task.sessions) task.sessions = [];
  if (!task.notes) task.notes = [];
  delete task.timestamp; // legacy field

  if (task.routine) {
    routine.push(task);
  } else {
    pending.push(task);
  }
}

// Handle current task: create a pending entry and reference it
const ct = dl.currentTask;
let currentJson;

if (ct) {
  const taskId = Date.now().toString();
  pending.push({
    id: taskId,
    title: ct.title,
    activityContext: ct.activityContext || 'professional',
    category: 'General',
    priority: 'medium',
    timeSpent: ct.timeSpent || 0,
    sessions: ct.sessions || [],
    notes: ct.notes || []
  });

  currentJson = {
    task: {
      title: ct.title,
      activityContext: ct.activityContext || 'professional',
      startedAt: ct.startedAt,
      timeSpent: ct.timeSpent || 0,
      sourceType: 'pending',
      sourceId: taskId,
      notes: ct.notes || []
    },
    contextSums: {
      day: { personal: 0, social: 0, professional: 0, cultivo: 0, projects: 0, health: 0, unstructured: 0 },
      week: { personal: 0, social: 0, professional: 0, cultivo: 0, projects: 0, health: 0, unstructured: 0 },
      month: { personal: 0, social: 0, professional: 0, cultivo: 0, projects: 0, health: 0, unstructured: 0 }
    },
    contextFilter: dl.contextFilter || null,
    viewMode: dl.viewMode || 'novel'
  };
} else {
  currentJson = {
    task: null,
    contextSums: {
      day: { personal: 0, social: 0, professional: 0, cultivo: 0, projects: 0, health: 0, unstructured: 0 },
      week: { personal: 0, social: 0, professional: 0, cultivo: 0, projects: 0, health: 0, unstructured: 0 },
      month: { personal: 0, social: 0, professional: 0, cultivo: 0, projects: 0, health: 0, unstructured: 0 }
    },
    contextFilter: null,
    viewMode: 'novel'
  };
}

// Completed work (strip legacy details, keep sessions)
const completed = (dl.completedWork || []).map(w => ({
  id: w.id,
  title: w.title,
  activityContext: w.activityContext || 'professional',
  category: w.category || 'General',
  timeSpent: w.timeSpent || 0,
  sessions: w.sessions || [],
  notes: (w.details && w.details.notes) || []
}));

// Write files
const trackDir = path.join(BASE, 'tracking');
fs.writeFileSync(path.join(trackDir, 'pending.json'), JSON.stringify(pending, null, 2));
fs.writeFileSync(path.join(trackDir, 'completed.json'), JSON.stringify(completed, null, 2));
fs.writeFileSync(path.join(trackDir, 'routine.json'), JSON.stringify(routine, null, 2));
fs.writeFileSync(path.join(trackDir, 'current.json'), JSON.stringify(currentJson, null, 2));

console.log('Migration complete:');
console.log('  pending.json:', pending.length, 'tasks');
console.log('  completed.json:', completed.length, 'entries');
console.log('  routine.json:', routine.length, 'tasks');
console.log('  current.json:', currentJson.task ? currentJson.task.title : '(no active task)');
