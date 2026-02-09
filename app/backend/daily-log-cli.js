#!/usr/bin/env node
/**
 * Daily Log CLI - Track current task, completed work, and pending tasks
 * Usage: node daily-log-cli.js <command> [args...]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const fs = require('fs');
const path = require('path');
const { createCalendarEvent, createTimeTrackingCalendar, listCalendarEvents, CONTEXT_COLOR_MAP } = require('./google-calendar');

// Constants
const BASE_DIR = path.join(__dirname, '..', '..');
const LOG_DIR = path.join(BASE_DIR, 'tracking', 'daily-logs');

// Context emoji mapping
const CONTEXT_EMOJI_MAP = {
  personal: '🏠',
  social: '👥',
  professional: '💼',
  cultivo: '🌱',
  projects: '🚀',
  health: '💪',
  unstructured: '☀️'
};

// Use local date (not UTC) to match statusline
function getLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
const TODAY = getLocalDate();

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Helper Functions
function getLogFilePath(date = TODAY) {
  return path.join(LOG_DIR, `daily-log-${date}.json`);
}

function loadDailyLog(date = TODAY) {
  const filePath = getLogFilePath(date);

  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      console.error(`\n⚠️  Warning: Could not parse log file. Creating new structure.\n`);
    }
  }

  // Default structure
  return {
    date: date,
    dailyLog: {
      completedWork: [],
      currentTask: null,
      pendingTasks: [],
      notes: [],
      contextFilter: null  // null = show all contexts
    },
    context: {
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

function saveDailyLog(logData) {
  const filePath = getLogFilePath(logData.date);

  // Ensure context field exists
  if (!logData.context) {
    logData.context = {
      personal: 0,
      social: 0,
      professional: 0,
      cultivo: 0,
      projects: 0,
      health: 0,
      unstructured: 0
    };
  }

  // Recalculate context totals from all tasks
  updateContextTotals(logData);

  try {
    fs.writeFileSync(filePath, JSON.stringify(logData, null, 2), 'utf8');
  } catch (error) {
    console.error(`\n❌ Error saving log file: ${error.message}\n`);
    process.exit(1);
  }
}

function updateContextTotals(logData) {
  // Reset totals
  const contextTotals = {
    personal: 0,
    social: 0,
    professional: 0,
    cultivo: 0,
    projects: 0,
    health: 0,
    unstructured: 0
  };

  const log = logData.dailyLog;

  // Add completed work time
  (log.completedWork || []).forEach(work => {
    const context = work.activityContext || 'professional';
    contextTotals[context] = (contextTotals[context] || 0) + (work.timeSpent || 0);
  });

  // Add pending tasks time (accumulated but not completed)
  (log.pendingTasks || []).forEach(task => {
    const context = task.activityContext || 'professional';
    contextTotals[context] = (contextTotals[context] || 0) + (task.timeSpent || 0);
  });

  // Add current task time (including context-only tracking)
  if (log.currentTask) {
    const context = log.currentTask.activityContext || 'professional';
    const startTime = new Date(log.currentTask.startedAt);
    const now = new Date();
    const elapsedMinutes = Math.floor((now - startTime) / 60000);
    const totalTime = (log.currentTask.timeSpent || 0) + elapsedMinutes;
    contextTotals[context] = (contextTotals[context] || 0) + totalTime;
  }

  // Update the context field
  logData.context = contextTotals;
}

function generateId() {
  return Date.now().toString();
}

function calculateElapsedMinutes(startTimestamp) {
  const now = new Date();
  const start = new Date(startTimestamp);
  const diffMs = now - start;
  return Math.round(diffMs / 60000); // Convert to minutes and round
}

function formatTimeSpent(minutes) {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function categorizeWork(description) {
  const lower = description.toLowerCase();

  const categories = {
    'Pull Request': ['pr #', 'pr#', 'pull request', 'merge', 'review comment'],
    'Feature': ['feature', 'implement', 'add ', 'new '],
    'Bug Fix': ['fix', 'bug', 'issue', 'error'],
    'Bug Investigation': ['investigate', 'debug', 'investigation'],
    'Refactor': ['refactor', 'improve', 'clean', 'reorganize'],
    'Documentation': ['doc', 'readme', 'comment', 'document'],
    'Testing': ['test', 'spec', 'unit test', 'integration test'],
    'Research': ['research', 'explore', 'investigate', 'looking for'],
    'Migration': ['migration', 'migrate']
  };

  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return category;
    }
  }

  return 'General';
}

function detectPriority(description) {
  const lower = description.toLowerCase();
  if (lower.includes('urgent') || lower.includes('asap') || lower.includes('critical')) return 'high';
  if (lower.includes('low') || lower.includes('whenever') || lower.includes('optional')) return 'low';
  return 'medium';
}

function detectContext(description) {
  const lower = description.toLowerCase();

  // Context keywords in priority order
  const cultivoKeywords = [
    'pr', 'pull request', 'feature', 'bug', 'test', 'migration', 'review',
    'deploy', 'sprint', 'jira', 'tsp-', 'cultivo', 'merge', 'commit',
    'branch', 'fix', 'develop', 'build', 'ci', 'cd', 'release',
    'implement', 'refactor'
  ];

  const healthKeywords = [
    'health', 'dentist', 'doctor', 'medical', 'sick', 'gym', 'workout',
    'exercise', 'therapy', 'physio', 'medication', 'vitamins', 'sleep',
    'stretch', 'yoga', 'run', 'walk', 'clinic', 'checkup', 'wellness'
  ];

  const personalKeywords = [
    'appointment', 'personal', 'family',
    'vacation', 'home', 'pet', 'errand', 'errands',
    'grocery', 'bank', 'car repair', 'car appointment', 'birthday'
  ];

  const socialKeywords = [
    'friends', 'meet', 'dinner', 'coffee', 'hangout', 'party', 'social',
    'drinks', 'lunch with', 'catch up', 'get together', 'gathering',
    'hang out', 'see friends', 'visit'
  ];

  const projectKeywords = [
    'trading', 'btx', 'side project', 'personal project', 'portfolio',
    'freelance', 'consulting', 'side hustle', 'startup', 'client work',
    'non-cultivo', 'business', 'investment', 'stocks', 'crypto',
    'trading bot', 'saas', 'product', 'side', 'project'
  ];

  const unstructuredKeywords = [
    'leisure', 'free time', 'relax', 'relaxing', 'tv', 'movie', 'gaming',
    'game', 'browse', 'browsing', 'youtube', 'scroll', 'scrolling',
    'unstructured', 'downtime', 'chill', 'netflix', 'reading for fun'
  ];

  const professionalKeywords = [
    'meeting', 'interview', 'job', 'career', 'resume', 'work',
    'presentation', 'conference', 'networking'
  ];

  // Check in priority order: cultivo -> health -> personal -> social -> projects -> unstructured -> professional
  for (const keyword of cultivoKeywords) {
    if (lower.includes(keyword)) {
      return 'cultivo';
    }
  }

  for (const keyword of healthKeywords) {
    if (lower.includes(keyword)) {
      return 'health';
    }
  }

  for (const keyword of personalKeywords) {
    if (lower.includes(keyword)) {
      return 'personal';
    }
  }

  for (const keyword of socialKeywords) {
    if (lower.includes(keyword)) {
      return 'social';
    }
  }

  for (const keyword of projectKeywords) {
    if (lower.includes(keyword)) {
      return 'projects';
    }
  }

  for (const keyword of unstructuredKeywords) {
    if (lower.includes(keyword)) {
      return 'unstructured';
    }
  }

  for (const keyword of professionalKeywords) {
    if (lower.includes(keyword)) {
      return 'professional';
    }
  }

  // Default to professional if unclear
  return 'professional';
}

// Map short context codes to full context names
function normalizeContext(contextCode) {
  const contextMap = {
    'per': 'personal',
    'soc': 'social',
    'prof': 'professional',
    'cul': 'cultivo',
    'proj': 'projects',
    'heal': 'health',
    'us': 'unstructured',
    // Also accept full names
    'personal': 'personal',
    'social': 'social',
    'professional': 'professional',
    'cultivo': 'cultivo',
    'projects': 'projects',
    'health': 'health',
    'unstructured': 'unstructured'
  };

  const normalized = contextMap[contextCode?.toLowerCase()];
  if (!normalized) {
    console.error(`\n❌ Invalid context code: ${contextCode}`);
    console.error(`   Valid codes: per, soc, prof, cul, proj, heal, us\n`);
    process.exit(1);
  }

  return normalized;
}

function extractTitle(description) {
  // If description is too long, take first sentence or first 80 chars
  const firstSentence = description.split(/[.!?]/)[0];
  if (firstSentence.length > 80) {
    return firstSentence.substring(0, 77) + '...';
  }
  return firstSentence;
}

function extractContext(description) {
  // If description has multiple sentences, use the rest as context
  const sentences = description.split(/[.!?]/).filter(s => s.trim());
  if (sentences.length > 1) {
    return sentences.slice(1).join('. ').trim();
  }
  return null;
}

// Command Functions
function setCurrentTask(description) {
  const logData = loadDailyLog();
  const timestamp = new Date().toISOString();

  // Auto-complete previous current task if it exists
  if (logData.dailyLog.currentTask) {
    const prevTask = logData.dailyLog.currentTask;
    const category = categorizeWork(prevTask.title);
    const elapsedMinutes = calculateElapsedMinutes(prevTask.startedAt);
    const timeSpent = (prevTask.timeSpent || 0) + elapsedMinutes;

    // Record final session
    const finalSession = { startedAt: prevTask.startedAt, endedAt: timestamp };
    const autoEventId = createCalendarEvent({
      title: prevTask.title,
      activityContext: prevTask.activityContext || 'professional',
      timeSpent: elapsedMinutes,
      category: category,
      details: { startedAt: prevTask.startedAt, completedAt: timestamp }
    });
    if (autoEventId) finalSession.calendarEventId = autoEventId;

    const completedEntry = {
      id: generateId(),
      timestamp: timestamp,
      category: category,
      title: prevTask.title,
      activityContext: prevTask.activityContext || 'professional',
      timeSpent: timeSpent,
      details: {
        startedAt: prevTask.startedAt,
        completedAt: timestamp,
        notes: prevTask.notes || []  // Preserve notes when auto-completing
      },
      sessions: [...(prevTask.sessions || []), finalSession]
    };

    if (prevTask.context && prevTask.context !== prevTask.title) {
      completedEntry.details.context = prevTask.context;
    }

    logData.dailyLog.completedWork.push(completedEntry);

    const contextEmojiMap = CONTEXT_EMOJI_MAP;
    const contextEmoji = contextEmojiMap[prevTask.activityContext] || '💼';
    const timeStr = formatTimeSpent(timeSpent);
    console.log(`\n✅ Previous task auto-completed: ${contextEmoji} ${prevTask.title} (${timeStr})`);
  }

  const title = extractTitle(description);
  const context = extractContext(description) || description;
  const activityContext = detectContext(description);

  logData.dailyLog.currentTask = {
    title: title,
    startedAt: timestamp,
    context: context,
    activityContext: activityContext,
    timeSpent: 0,
    notes: [],
    sessions: []
  };

  saveDailyLog(logData);

  const contextEmojiMap = CONTEXT_EMOJI_MAP;
  const contextEmoji = contextEmojiMap[activityContext] || '💼';
  console.log(`\n✅ Current task set:`);
  console.log(`   ${contextEmoji} [${activityContext.toUpperCase()}] ${title}`);
  if (context && context !== description) {
    console.log(`   Context: ${context}`);
  }
  console.log(`   Started: ${timestamp.split('T')[1].substring(0, 8)}\n`);
}

function completeCurrentTask(newTaskDescription = null) {
  const logData = loadDailyLog();
  const timestamp = new Date().toISOString();

  if (!logData.dailyLog.currentTask) {
    console.log(`\n⚠️  No current task to complete.\n`);
    return;
  }

  const currentTask = logData.dailyLog.currentTask;
  const category = categorizeWork(currentTask.title);
  const elapsedMinutes = calculateElapsedMinutes(currentTask.startedAt);
  const timeSpent = (currentTask.timeSpent || 0) + elapsedMinutes;

  // Record final session
  const finalSession = { startedAt: currentTask.startedAt, endedAt: timestamp };

  // Push final session to Google Calendar (fire-and-forget)
  const eventId = createCalendarEvent({
    title: currentTask.title,
    activityContext: currentTask.activityContext || 'professional',
    timeSpent: elapsedMinutes,
    category: category,
    details: { startedAt: currentTask.startedAt, completedAt: timestamp }
  });
  if (eventId) finalSession.calendarEventId = eventId;

  const completedEntry = {
    id: generateId(),
    timestamp: timestamp,
    category: category,
    title: currentTask.title,
    activityContext: currentTask.activityContext || 'professional',
    timeSpent: timeSpent,
    details: {
      startedAt: currentTask.startedAt,
      completedAt: timestamp,
      notes: currentTask.notes || []  // Preserve notes when completing
    },
    sessions: [...(currentTask.sessions || []), finalSession]
  };

  if (currentTask.context && currentTask.context !== currentTask.title) {
    completedEntry.details.context = currentTask.context;
  }

  logData.dailyLog.completedWork.push(completedEntry);

  const contextEmojiMap = CONTEXT_EMOJI_MAP;
  const contextEmoji = contextEmojiMap[completedEntry.activityContext] || '💼';
  const timeStr = formatTimeSpent(timeSpent);
  console.log(`\n✅ Task completed: ${contextEmoji} ${currentTask.title} (${timeStr})`);

  // Clear current task
  logData.dailyLog.currentTask = null;

  // If new task description provided, set it
  if (newTaskDescription) {
    const title = extractTitle(newTaskDescription);
    const context = extractContext(newTaskDescription) || newTaskDescription;
    const activityContext = detectContext(newTaskDescription);

    logData.dailyLog.currentTask = {
      title: title,
      startedAt: timestamp,
      context: context,
      activityContext: activityContext,
      timeSpent: 0,
      notes: [],
      sessions: []
    };

    const contextEmojiMap = CONTEXT_EMOJI_MAP;
    const newContextEmoji = contextEmojiMap[activityContext] || '💼';
    console.log(`\n✅ New current task set: ${newContextEmoji} [${activityContext.toUpperCase()}] ${title}\n`);
  } else {
    console.log(`   No current task set.\n`);
  }

  saveDailyLog(logData);
}

function addCompletedWork(description) {
  const logData = loadDailyLog();
  const timestamp = new Date().toISOString();
  const category = categorizeWork(description);
  const title = extractTitle(description);
  const activityContext = detectContext(description);

  const entry = {
    id: generateId(),
    timestamp: timestamp,
    category: category,
    title: title,
    activityContext: activityContext,
    timeSpent: 0,
    details: {}
  };

  // Try to extract PR number
  const prMatch = description.match(/pr\s*#?(\d+)/i);
  if (prMatch) {
    entry.details.prNumber = prMatch[1];
  }

  // Try to extract branch name
  const branchMatch = description.match(/branch[:\s]+([a-zA-Z0-9/_-]+)/i);
  if (branchMatch) {
    entry.details.branch = branchMatch[1];
  }

  // Add full description if it has more detail than title
  if (description.length > title.length) {
    entry.details.description = description;
  }

  logData.dailyLog.completedWork.push(entry);
  saveDailyLog(logData);

  const contextEmojiMap = CONTEXT_EMOJI_MAP;
  const contextEmoji = contextEmojiMap[activityContext] || '💼';
  console.log(`\n✅ Completed work added:`);
  console.log(`   ${contextEmoji} [${activityContext.toUpperCase()}] [${category}] ${title}`);
  console.log(`   Time: ${timestamp.split('T')[1].substring(0, 8)}\n`);
}

function addPendingTask(description) {
  const logData = loadDailyLog();
  const timestamp = new Date().toISOString();

  // Parse flags from end: check 'r' (routine) first, then context code
  let contextOverride = null;
  let cleanDesc = description;
  let isRoutine = false;

  // Check for routine flag 'r' at end FIRST (before context, since "task heal r" has r last)
  const routineMatch = cleanDesc.match(/\s+r$/i);
  if (routineMatch) {
    isRoutine = true;
    cleanDesc = cleanDesc.replace(/\s+r$/i, '').trim();
  }

  // Now try --c flag format (backward compatibility)
  const flagMatch = cleanDesc.match(/--c[=\s]+(per|soc|prof|cul|proj|heal|us|personal|social|professional|cultivo|projects|health|unstructured)/i);
  if (flagMatch) {
    contextOverride = normalizeContext(flagMatch[1]);
    cleanDesc = cleanDesc.replace(/--c[=\s]+(per|soc|prof|cul|proj|heal|us|personal|social|professional|cultivo|projects|health|unstructured)/gi, '').trim();
  } else {
    // Try simple trailing context code format: "task description cul"
    const simpleMatch = cleanDesc.match(/\s+(per|soc|prof|cul|proj|heal|us|personal|social|professional|cultivo|projects|health|unstructured)$/i);
    if (simpleMatch) {
      contextOverride = normalizeContext(simpleMatch[1]);
      cleanDesc = cleanDesc.replace(/\s+(per|soc|prof|cul|proj|heal|us|personal|social|professional|cultivo|projects|health|unstructured)$/i, '').trim();
    }
  }

  const priority = detectPriority(cleanDesc);

  // Clean description (remove priority keywords)
  cleanDesc = cleanDesc
    .replace(/\b(urgent|asap|critical|low|high|medium|whenever|optional)\b/gi, '')
    .trim();

  // Detect context priority:
  // 1. Use explicit override if provided (--c flag or trailing code)
  // 2. Use current contextFilter if set
  // 3. Fall back to auto-detection
  const activityContext = contextOverride || logData.dailyLog.contextFilter || detectContext(cleanDesc);
  const category = categorizeWork(cleanDesc);

  const entry = {
    id: generateId(),
    timestamp: timestamp,
    category: category,
    title: cleanDesc,
    activityContext: activityContext,
    timeSpent: 0
  };

  if (isRoutine) {
    entry.routine = true;
  }

  logData.dailyLog.pendingTasks.push(entry);
  saveDailyLog(logData);

  const contextEmoji = CONTEXT_EMOJI_MAP[activityContext] || '💼';
  const priorityEmoji = priority === 'high' ? '🔴' : priority === 'low' ? '🟢' : '🟡';
  const routineLabel = isRoutine ? ' [R]' : '';
  console.log(`\n✅ Pending task added${routineLabel}:`);
  console.log(`   ${contextEmoji} ${priorityEmoji} [${priority.toUpperCase()}] ${cleanDesc}\n`);
}

function addMultipleTasks(tasksArray, contextOverride, isRoutine) {
  const logData = loadDailyLog();
  const timestamp = new Date().toISOString();
  
  // Determine the context to use for all tasks
  let activityContext;
  if (contextOverride) {
    // Context explicitly provided as argument
    activityContext = normalizeContext(contextOverride);
  } else if (logData.dailyLog.contextFilter) {
    // Use current context filter if set
    activityContext = logData.dailyLog.contextFilter;
  } else {
    // Default to personal if no context specified and not in a filtered context
    activityContext = 'personal';
  }

  const added = [];

  for (const description of tasksArray) {
    if (!description || description.trim() === '') {
      continue;
    }

    const cleanDesc = description.trim();
    const priority = detectPriority(cleanDesc);
    
    // Clean description (remove priority keywords)
    const finalDesc = cleanDesc
      .replace(/\b(urgent|asap|critical|low|high|medium|whenever|optional)\b/gi, '')
      .trim();

    const category = categorizeWork(finalDesc);

    const entry = {
      id: generateId(),
      timestamp: timestamp,
      category: category,
      title: finalDesc,
      activityContext: activityContext,
      timeSpent: 0
    };

    if (isRoutine) {
      entry.routine = true;
    }

    logData.dailyLog.pendingTasks.push(entry);

    const contextEmoji = CONTEXT_EMOJI_MAP[activityContext] || '💼';
    const priorityEmoji = priority === 'high' ? '🔴' : priority === 'low' ? '🟢' : '🟡';
    const routineLabel = isRoutine ? ' [R]' : '';
    added.push(`${contextEmoji} ${priorityEmoji} ${finalDesc}${routineLabel}`);
  }

  saveDailyLog(logData);

  const contextEmoji = CONTEXT_EMOJI_MAP[activityContext] || '💼';
  console.log(`\n✅ Added ${added.length} task(s) to ${contextEmoji} ${activityContext}:`);
  added.forEach((task, idx) => console.log(`   ${idx + 1}. ${task}`));
  console.log('');
}

function addPendingTaskAndSwitch(description) {
  const logData = loadDailyLog();
  const timestamp = new Date().toISOString();

  // Parse flags from end: check 'r' (routine) first, then context code
  let contextOverride = null;
  let cleanDesc = description;
  let isRoutine = false;

  // Check for routine flag 'r' at end FIRST
  const routineMatch = cleanDesc.match(/\s+r$/i);
  if (routineMatch) {
    isRoutine = true;
    cleanDesc = cleanDesc.replace(/\s+r$/i, '').trim();
  }

  // Now try --c flag format (backward compatibility)
  const flagMatch = cleanDesc.match(/--c[=\s]+(per|soc|prof|cul|proj|heal|us|personal|social|professional|cultivo|projects|health|unstructured)/i);
  if (flagMatch) {
    contextOverride = normalizeContext(flagMatch[1]);
    cleanDesc = cleanDesc.replace(/--c[=\s]+(per|soc|prof|cul|proj|heal|us|personal|social|professional|cultivo|projects|health|unstructured)/gi, '').trim();
  } else {
    // Try simple trailing context code format: "task description cul"
    const simpleMatch = cleanDesc.match(/\s+(per|soc|prof|cul|proj|heal|us|personal|social|professional|cultivo|projects|health|unstructured)$/i);
    if (simpleMatch) {
      contextOverride = normalizeContext(simpleMatch[1]);
      cleanDesc = cleanDesc.replace(/\s+(per|soc|prof|cul|proj|heal|us|personal|social|professional|cultivo|projects|health|unstructured)$/i, '').trim();
    }
  }

  const priority = detectPriority(cleanDesc);

  // Clean description (remove priority keywords)
  cleanDesc = cleanDesc
    .replace(/\b(urgent|asap|critical|low|high|medium|whenever|optional)\b/gi, '')
    .trim();

  // Detect context priority:
  // 1. Use explicit override if provided (--c flag or trailing code)
  // 2. Use current contextFilter if set
  // 3. Fall back to auto-detection
  const activityContext = contextOverride || logData.dailyLog.contextFilter || detectContext(cleanDesc);
  const category = categorizeWork(cleanDesc);

  // If there's a current task, handle it
  if (logData.dailyLog.currentTask) {
    const prevTask = logData.dailyLog.currentTask;
    const elapsedMinutes = calculateElapsedMinutes(prevTask.startedAt);
    const timeSpent = (prevTask.timeSpent || 0) + elapsedMinutes;

    // Record session for the outgoing task
    const addSwitchEndTime = new Date().toISOString();
    const addSwitchSession = { startedAt: prevTask.startedAt, endedAt: addSwitchEndTime };
    const addSwitchEventId = createCalendarEvent({
      title: prevTask.title,
      activityContext: prevTask.activityContext,
      timeSpent: elapsedMinutes,
      category: prevTask.isContextOnly ? 'Context' : categorizeWork(prevTask.title),
      details: { startedAt: prevTask.startedAt, completedAt: addSwitchEndTime }
    });
    if (addSwitchEventId) addSwitchSession.calendarEventId = addSwitchEventId;

    if (prevTask.isContextOnly) {
      // Context-only task: log time to completed work
      const completedEntry = {
        id: generateId(),
        timestamp: addSwitchEndTime,
        category: 'Context',
        title: prevTask.title,
        activityContext: prevTask.activityContext,
        timeSpent: timeSpent,
        details: { startedAt: prevTask.startedAt, completedAt: addSwitchEndTime },
        sessions: [...(prevTask.sessions || []), addSwitchSession]
      };
      logData.dailyLog.completedWork.push(completedEntry);
      const contextEmoji = CONTEXT_EMOJI_MAP[prevTask.activityContext] || '💼';
      const timeStr = formatTimeSpent(timeSpent);
      console.log(`\n⏸️  ${contextEmoji} ${prevTask.activityContext} context time logged: ${timeStr}`);
    } else {
      // Regular task: move to pending
      const pendingEntry = {
        id: generateId(),
        title: prevTask.title,
        activityContext: prevTask.activityContext,
        category: categorizeWork(prevTask.title),
        priority: 'medium',
        timeSpent: timeSpent,
        notes: prevTask.notes || [],
        sessions: [...(prevTask.sessions || []), addSwitchSession]
      };

      // Preserve routine flag from current task
      if (prevTask.routine) {
        pendingEntry.routine = true;
      }

      logData.dailyLog.pendingTasks.push(pendingEntry);

      const contextEmojiMap = CONTEXT_EMOJI_MAP;
      const contextEmoji = contextEmojiMap[prevTask.activityContext] || '💼';
      const timeStr = formatTimeSpent(timeSpent);
      console.log(`\n⏸️  Previous task moved to pending: ${contextEmoji} ${prevTask.title} (${timeStr})`);
    }
  }

  // Set the new task as current
  logData.dailyLog.currentTask = {
    title: cleanDesc,
    startedAt: timestamp,
    context: cleanDesc,
    activityContext: activityContext,
    timeSpent: 0,
    notes: [],
    sessions: [],
    isContextOnly: false,  // Real task, not just context tracking
    routine: isRoutine
  };

  saveDailyLog(logData);

  const contextEmoji = CONTEXT_EMOJI_MAP[activityContext] || '💼';
  const priorityEmoji = priority === 'high' ? '🔴' : priority === 'low' ? '🟢' : '🟡';
  console.log(`\n✅ Task added and set as current:`);
  console.log(`   ${contextEmoji} [${activityContext.toUpperCase()}] ${cleanDesc}\n`);
}

// Helper function to get tasks in display order
function getDisplayOrderedTasks(allTasks, contextFilter, viewMode) {
  // First filter by view mode (routine vs novel)
  let filtered = allTasks;
  if (viewMode === 'routine') {
    filtered = allTasks.filter(t => t.routine === true);
  } else if (viewMode === 'novel') {
    filtered = allTasks.filter(t => !t.routine);
  }
  // If viewMode is null/undefined, show all (backward compat)

  if (contextFilter) {
    // Filtered mode: only return tasks matching the filter
    return filtered.filter(t => (t.activityContext || 'professional') === contextFilter);
  } else {
    // No filter: return tasks ordered by context groups
    const contextOrder = ['personal', 'health', 'cultivo', 'professional', 'social', 'projects', 'unstructured'];
    const displayOrderTasks = [];

    contextOrder.forEach(ctx => {
      const contextTasks = filtered.filter(task => (task.activityContext || 'professional') === ctx);
      displayOrderTasks.push(...contextTasks);
    });

    return displayOrderTasks;
  }
}

function switchToTask(taskNumber) {
  const logData = loadDailyLog();
  const timestamp = new Date().toISOString();

  // Get context filter and get tasks in display order
  const contextFilter = logData.dailyLog.contextFilter || null;
  const viewMode = logData.dailyLog.viewMode || 'novel';
  const pendingTasks = getDisplayOrderedTasks(logData.dailyLog.pendingTasks, contextFilter, viewMode);

  const taskIndex = taskNumber - 1;

  if (taskIndex < 0 || taskIndex >= pendingTasks.length) {
    console.error(`\n❌ Invalid task number. You have ${pendingTasks.length} ${contextFilter ? contextFilter : ''} pending tasks.\n`);
    process.exit(1);
  }

  const pendingTask = pendingTasks[taskIndex];

  // Find the actual index in the full pending tasks array
  const actualIndex = logData.dailyLog.pendingTasks.indexOf(pendingTask);

  // If there's a current task, move it to pending (don't complete it)
  if (logData.dailyLog.currentTask) {
    const prevTask = logData.dailyLog.currentTask;
    const elapsedMinutes = calculateElapsedMinutes(prevTask.startedAt);
    const timeSpent = (prevTask.timeSpent || 0) + elapsedMinutes;

    // If it's a context-only task, save the time to completed work instead of pending
    if (prevTask.isContextOnly) {
      const sessionEndTime = new Date().toISOString();
      const session = { startedAt: prevTask.startedAt, endedAt: sessionEndTime };

      // Push session to Google Calendar (fire-and-forget)
      const sessionEvent = createCalendarEvent({
        title: prevTask.title,
        activityContext: prevTask.activityContext,
        timeSpent: elapsedMinutes,
        category: 'Context',
        details: { startedAt: prevTask.startedAt, completedAt: sessionEndTime }
      });
      if (sessionEvent) session.calendarEventId = sessionEvent;

      const completedEntry = {
        id: generateId(),
        timestamp: sessionEndTime,
        category: 'Context',
        title: prevTask.title,
        activityContext: prevTask.activityContext,
        timeSpent: timeSpent,
        details: {
          startedAt: prevTask.startedAt,
          completedAt: sessionEndTime
        },
        sessions: [...(prevTask.sessions || []), session]
      };
      logData.dailyLog.completedWork.push(completedEntry);

      const contextEmojiMap = CONTEXT_EMOJI_MAP;
      const contextEmoji = contextEmojiMap[prevTask.activityContext] || '💼';
      const timeStr = formatTimeSpent(timeSpent);
      console.log(`\n⏸️  ${contextEmoji} ${prevTask.activityContext} context time logged: ${timeStr}`);
    } else {
      // Regular task - move to pending with session tracking
      const sessionEndTime = new Date().toISOString();
      const session = { startedAt: prevTask.startedAt, endedAt: sessionEndTime };

      // Push session to Google Calendar (fire-and-forget)
      const sessionEvent = createCalendarEvent({
        title: prevTask.title,
        activityContext: prevTask.activityContext,
        timeSpent: elapsedMinutes,
        category: categorizeWork(prevTask.title),
        details: { startedAt: prevTask.startedAt, completedAt: sessionEndTime }
      });
      if (sessionEvent) session.calendarEventId = sessionEvent;

      const pendingEntry = {
        id: generateId(),
        title: prevTask.title,
        activityContext: prevTask.activityContext,
        category: categorizeWork(prevTask.title),
        priority: 'medium',  // Default priority when moving current to pending
        timeSpent: timeSpent,
        notes: prevTask.notes || [],  // Preserve notes when switching tasks
        sessions: [...(prevTask.sessions || []), session]
      };

      // Preserve routine flag and jira fields
      if (prevTask.routine) pendingEntry.routine = true;
      if (prevTask.jiraTicket) pendingEntry.jiraTicket = prevTask.jiraTicket;
      if (prevTask.jiraUrl) pendingEntry.jiraUrl = prevTask.jiraUrl;

      logData.dailyLog.pendingTasks.push(pendingEntry);

      const contextEmojiMap = CONTEXT_EMOJI_MAP;
      const contextEmoji = contextEmojiMap[prevTask.activityContext] || '💼';
      const timeStr = formatTimeSpent(timeSpent);
      console.log(`\n⏸️  Previous task moved to pending: ${contextEmoji} ${prevTask.title} (${timeStr})`);
    }
  }

  // Remove the task from pending and set as current
  logData.dailyLog.pendingTasks.splice(actualIndex, 1);

  const taskTitle = pendingTask.title || pendingTask.task;
  const activityContext = pendingTask.activityContext || detectContext(taskTitle);

  const newCurrentTask = {
    title: taskTitle,
    startedAt: timestamp,
    context: taskTitle,
    activityContext: activityContext,
    timeSpent: pendingTask.timeSpent || 0,
    notes: pendingTask.notes || [],  // Preserve notes from pending task
    sessions: pendingTask.sessions || [],  // Carry over previous sessions
    isContextOnly: false,  // Real task, not just context tracking
    routine: pendingTask.routine || false
  };

  // Carry over jira fields from pending
  if (pendingTask.jiraTicket) newCurrentTask.jiraTicket = pendingTask.jiraTicket;
  if (pendingTask.jiraUrl) newCurrentTask.jiraUrl = pendingTask.jiraUrl;

  logData.dailyLog.currentTask = newCurrentTask;

  // Set context filter to match the task's context
  logData.dailyLog.contextFilter = activityContext;

  saveDailyLog(logData);

  const contextEmojiMap = CONTEXT_EMOJI_MAP;
  const contextEmoji = contextEmojiMap[activityContext] || '💼';
  const timeStr = formatTimeSpent(pendingTask.timeSpent || 0);
  
  // Simple output: emoji : task name (time if exists)
  if (pendingTask.timeSpent && pendingTask.timeSpent > 0) {
    console.log(`\n✅ ${contextEmoji} : ${taskTitle} ${timeStr}\n`);
  } else {
    console.log(`\n✅ ${contextEmoji} : ${taskTitle}\n`);
  }
}

function completeTaskByNumber(taskNumber) {
  // Handle 0 as current task
  if (taskNumber === 0) {
    completeCurrentTask();
    return;
  }

  const logData = loadDailyLog();
  const timestamp = new Date().toISOString();

  // Get context filter and get tasks in display order
  const contextFilter = logData.dailyLog.contextFilter || null;
  const viewMode = logData.dailyLog.viewMode || 'novel';
  const pendingTasks = getDisplayOrderedTasks(logData.dailyLog.pendingTasks, contextFilter, viewMode);

  const taskIndex = taskNumber - 1;

  if (taskIndex < 0 || taskIndex >= pendingTasks.length) {
    console.error(`\n❌ Invalid task number. You have ${pendingTasks.length} ${contextFilter ? contextFilter : ''} pending tasks.\n`);
    process.exit(1);
  }

  const taskToComplete = pendingTasks[taskIndex];

  if (taskToComplete.routine) {
    console.error(`\n❌ Cannot complete routine task "${taskToComplete.title}". Routine tasks persist across days.`);
    console.error(`   Use /t d-${taskNumber} to delete it instead.\n`);
    process.exit(1);
  }

  const actualIndex = logData.dailyLog.pendingTasks.indexOf(taskToComplete);

  const taskTitle = taskToComplete.title || taskToComplete.task;
  const category = taskToComplete.category || categorizeWork(taskTitle);
  const activityContext = taskToComplete.activityContext || detectContext(taskTitle);
  const timeSpent = taskToComplete.timeSpent || 0;

  // Pending task completion — no active session, carry over previous sessions
  const completedEntry = {
    id: generateId(),
    timestamp: timestamp,
    category: category,
    title: taskTitle,
    activityContext: activityContext,
    timeSpent: timeSpent,
    details: {
      completedAt: timestamp
    },
    sessions: taskToComplete.sessions || []
  };

  logData.dailyLog.completedWork.push(completedEntry);
  logData.dailyLog.pendingTasks.splice(actualIndex, 1);

  saveDailyLog(logData);

  const contextEmojiMap = CONTEXT_EMOJI_MAP;
  const contextEmoji = contextEmojiMap[activityContext] || '💼';
  const timeStr = timeSpent > 0 ? ` (${formatTimeSpent(timeSpent)})` : '';
  console.log(`\n✅ Task #${taskNumber} completed: ${contextEmoji} ${taskTitle}${timeStr}\n`);
}

function completeBulkTasks(taskNumbersStr) {
  // Parse task numbers from format like "[1,3,4,5]"
  const match = taskNumbersStr.match(/\[([0-9,\s]+)\]/);
  if (!match) {
    console.error('\n❌ Invalid format. Use: c-[1,3,4,5]\n');
    process.exit(1);
  }

  const taskNumbers = match[1]
    .split(',')
    .map(n => parseInt(n.trim()))
    .filter(n => !isNaN(n))
    .sort((a, b) => b - a); // Sort descending to avoid index shifting issues

  if (taskNumbers.length === 0) {
    console.error('\n❌ No valid task numbers provided\n');
    process.exit(1);
  }

  const logData = loadDailyLog();
  const timestamp = new Date().toISOString();
  const contextFilter = logData.dailyLog.contextFilter || null;
  const viewMode = logData.dailyLog.viewMode || 'novel';
  const pendingTasks = getDisplayOrderedTasks(logData.dailyLog.pendingTasks, contextFilter, viewMode);

  const completed = [];
  const errors = [];

  // Process in descending order to avoid index shifting
  for (const taskNumber of taskNumbers) {
    // Handle 0 as current task
    if (taskNumber === 0) {
      if (logData.dailyLog.currentTask) {
        const currentTask = logData.dailyLog.currentTask;
        const category = categorizeWork(currentTask.title);
        const elapsedMinutes = calculateElapsedMinutes(currentTask.startedAt);
        const timeSpent = (currentTask.timeSpent || 0) + elapsedMinutes;

        // Record final session
        const finalSession = { startedAt: currentTask.startedAt, endedAt: timestamp };
        const bulkEventId = createCalendarEvent({
          title: currentTask.title,
          activityContext: currentTask.activityContext || 'professional',
          timeSpent: elapsedMinutes,
          category: category,
          details: { startedAt: currentTask.startedAt, completedAt: timestamp }
        });
        if (bulkEventId) finalSession.calendarEventId = bulkEventId;

        const completedEntry = {
          id: generateId(),
          timestamp: timestamp,
          category: category,
          title: currentTask.title,
          activityContext: currentTask.activityContext || 'professional',
          timeSpent: timeSpent,
          details: {
            startedAt: currentTask.startedAt,
            completedAt: timestamp,
            notes: currentTask.notes || []
          },
          sessions: [...(currentTask.sessions || []), finalSession]
        };

        logData.dailyLog.completedWork.push(completedEntry);
        logData.dailyLog.currentTask = null;

        const contextEmoji = CONTEXT_EMOJI_MAP[completedEntry.activityContext] || '💼';
        completed.push(`#0 ${contextEmoji} ${currentTask.title}`);
      } else {
        errors.push(`#0 (no current task)`);
      }
      continue;
    }

    const taskIndex = taskNumber - 1;

    if (taskIndex < 0 || taskIndex >= pendingTasks.length) {
      errors.push(`#${taskNumber} (invalid)`);
      continue;
    }

    const taskToComplete = pendingTasks[taskIndex];

    // Skip routine tasks - they cannot be completed
    if (taskToComplete.routine) {
      errors.push(`#${taskNumber} "${taskToComplete.title}" (routine task - cannot complete)`);
      continue;
    }

    const actualIndex = logData.dailyLog.pendingTasks.indexOf(taskToComplete);

    const taskTitle = taskToComplete.title || taskToComplete.task;
    const category = taskToComplete.category || categorizeWork(taskTitle);
    const activityContext = taskToComplete.activityContext || detectContext(taskTitle);
    const timeSpent = taskToComplete.timeSpent || 0;

    const completedEntry = {
      id: generateId(),
      timestamp: timestamp,
      category: category,
      title: taskTitle,
      activityContext: activityContext,
      timeSpent: timeSpent,
      details: {
        completedAt: timestamp
      },
      sessions: taskToComplete.sessions || []
    };

    logData.dailyLog.completedWork.push(completedEntry);
    logData.dailyLog.pendingTasks.splice(actualIndex, 1);

    const contextEmoji = CONTEXT_EMOJI_MAP[activityContext] || '💼';
    completed.push(`#${taskNumber} ${contextEmoji} ${taskTitle}`);

    // Update pendingTasks array after removal for next iteration
    pendingTasks.splice(taskIndex, 1);
  }

  saveDailyLog(logData);

  console.log(`\n✅ Bulk completed ${completed.length} task(s):`);
  completed.forEach(task => console.log(`   ${task}`));
  
  if (errors.length > 0) {
    console.log(`\n⚠️  Skipped ${errors.length} task(s):`);
    errors.forEach(err => console.log(`   ${err}`));
  }
  console.log('');
}

function parseCustomTime(timeStr, startTimestamp) {
  // Parse time formats: "18:00", "6pm", "6:00pm", "18:00:00"
  if (!timeStr) return null;

  const now = new Date();
  let hours, minutes;

  // Remove spaces
  timeStr = timeStr.trim().toLowerCase();

  // Match 24-hour format: 18:00 or 18:00:00
  const match24 = timeStr.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match24) {
    hours = parseInt(match24[1]);
    minutes = parseInt(match24[2]);
  } else {
    // Match 12-hour format: 6pm, 6:00pm
    const match12 = timeStr.match(/^(\d{1,2})(?::(\d{2}))?([ap]m)$/);
    if (match12) {
      hours = parseInt(match12[1]);
      minutes = match12[2] ? parseInt(match12[2]) : 0;
      const meridiem = match12[3];

      // Convert to 24-hour
      if (meridiem === 'pm' && hours !== 12) {
        hours += 12;
      } else if (meridiem === 'am' && hours === 12) {
        hours = 0;
      }
    } else {
      console.error(`\n❌ Invalid time format: ${timeStr}`);
      console.error(`   Valid formats: 18:00, 6pm, 6:00pm\n`);
      process.exit(1);
    }
  }

  // Validate hours and minutes
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    console.error(`\n❌ Invalid time: ${timeStr}\n`);
    process.exit(1);
  }

  // Start with today's date (in local time)
  let customTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);

  // If the time appears to be in the future by more than 1 hour, assume it's yesterday
  const hoursDiff = (customTime - now) / (1000 * 60 * 60);
  if (hoursDiff > 1) {
    customTime = new Date(customTime.getTime() - 24 * 60 * 60 * 1000);
  }

  return customTime;
}

function calculateElapsedMinutesUntil(startTimestamp, endTimestamp) {
  const start = new Date(startTimestamp);
  const end = endTimestamp ? new Date(endTimestamp) : new Date();
  const diffMs = end - start;

  if (diffMs < 0) {
    console.error(`\n❌ End time is before start time. Task started at ${start.toLocaleTimeString()}\n`);
    process.exit(1);
  }

  return Math.round(diffMs / 60000); // Convert to minutes
}

function moveCurrentToPending(customEndTime = null) {
  // Just call pauseCurrentTask - they're the same operation
  pauseCurrentTask(customEndTime);
}

function pauseCurrentTask(customEndTime = null, addNote = null) {
  const logData = loadDailyLog();

  if (!logData.dailyLog.currentTask) {
    // Silent exit when no current task (useful for auto-pause scenarios)
    return;
  }

  const currentTask = logData.dailyLog.currentTask;

  // Use custom end time if provided, otherwise use now
  // Pass startedAt so parseCustomTime can handle cross-midnight scenarios
  const endTime = customEndTime ? parseCustomTime(customEndTime, currentTask.startedAt) : new Date();
  const timestamp = endTime.toISOString();

  // Calculate elapsed time until the specified end time
  const elapsedMinutes = calculateElapsedMinutesUntil(currentTask.startedAt, endTime);
  const timeSpent = (currentTask.timeSpent || 0) + elapsedMinutes;

  // Add note if provided or if backdating
  const notes = currentTask.notes || [];
  if (addNote) {
    notes.push({
      text: addNote,
      timestamp: timestamp
    });
  } else if (customEndTime) {
    notes.push({
      text: `Paused (backdated to ${endTime.toLocaleTimeString()})`,
      timestamp: timestamp
    });
  }

  const contextEmojiMap = CONTEXT_EMOJI_MAP;
  const contextEmoji = contextEmojiMap[currentTask.activityContext] || '💼';
  const timeStr = formatTimeSpent(timeSpent);

  // Record session ending at this point
  const session = { startedAt: currentTask.startedAt, endedAt: timestamp };

  // Push session to Google Calendar (fire-and-forget)
  const pauseEventId = createCalendarEvent({
    title: currentTask.title,
    activityContext: currentTask.activityContext,
    timeSpent: elapsedMinutes,
    category: currentTask.isContextOnly ? 'Context' : categorizeWork(currentTask.title),
    details: { startedAt: currentTask.startedAt, completedAt: timestamp }
  });
  if (pauseEventId) session.calendarEventId = pauseEventId;

  if (currentTask.isContextOnly) {
    // Context-only task: log time to completed work, don't add to pending
    const completedEntry = {
      id: generateId(),
      timestamp: timestamp,
      category: 'Context',
      title: currentTask.title,
      activityContext: currentTask.activityContext,
      timeSpent: timeSpent,
      details: { startedAt: currentTask.startedAt, completedAt: timestamp },
      sessions: [...(currentTask.sessions || []), session]
    };
    logData.dailyLog.completedWork.push(completedEntry);
    logData.dailyLog.currentTask = null;
    saveDailyLog(logData);
    console.log(`\n⏸️  ${contextEmoji} ${currentTask.activityContext} context time logged: ${timeStr}\n`);
  } else {
    const pendingEntry = {
      id: generateId(),
      title: currentTask.title,
      activityContext: currentTask.activityContext,
      category: categorizeWork(currentTask.title),
      priority: 'medium',
      timeSpent: timeSpent,
      notes: notes,
      sessions: [...(currentTask.sessions || []), session]
    };

    // Preserve routine flag
    if (currentTask.routine) {
      pendingEntry.routine = true;
    }

    logData.dailyLog.pendingTasks.push(pendingEntry);
    logData.dailyLog.currentTask = null;

    saveDailyLog(logData);

    if (addNote) {
      console.log(`\n⏸️  Task auto-paused: ${contextEmoji} ${currentTask.title} (${timeStr})\n`);
    } else if (customEndTime) {
      console.log(`\n⏸️  Task paused at ${endTime.toLocaleTimeString()}: ${contextEmoji} ${currentTask.title} (${timeStr})\n`);
    } else {
      console.log(`\n✅ Moved to pending: ${contextEmoji} ${currentTask.title} (${timeStr})\n`);
    }
  }
}

function pauseCurrentTaskWithNote() {
  // Used by sleep hook - adds auto-pause note
  pauseCurrentTask(null, 'Auto-paused (laptop sleep)');
}

/**
 * Reassign unstructured time to a task referenced by number.
 * When in unstructured context-only mode, this replaces the unstructured
 * time block with the referenced task. The view defaults to routine + all
 * contexts when entering unstructured, so task numbers reference routine tasks.
 *
 * Usage: /t last-N  (where N is a task number from the current view)
 *
 * Behavior:
 * - Routine task: logs time to completedWork, adds session to pending task
 * - Novel task: logs time to completedWork, adds session to pending task
 * - Starts a fresh unstructured block afterward
 */
function reassignUnstructuredTime(taskNumber) {
  const logData = loadDailyLog();
  const timestamp = new Date().toISOString();

  // Must be in unstructured context-only mode
  const currentTask = logData.dailyLog.currentTask;
  if (!currentTask || !currentTask.isContextOnly || currentTask.activityContext !== 'unstructured') {
    console.error('\n❌ /t last-N only works when in unstructured mode.\n');
    process.exit(1);
  }

  // Resolve task number from current view (routine view, all contexts)
  const viewMode = logData.dailyLog.viewMode || 'novel';
  const contextFilter = logData.dailyLog.contextFilter || null;
  const pendingTasks = getDisplayOrderedTasks(logData.dailyLog.pendingTasks, contextFilter, viewMode);

  const taskIndex = taskNumber - 1;
  if (taskIndex < 0 || taskIndex >= pendingTasks.length) {
    console.error(`\n❌ Invalid task number. You have ${pendingTasks.length} tasks in the current view.\n`);
    process.exit(1);
  }

  const targetTask = pendingTasks[taskIndex];
  const actualIndex = logData.dailyLog.pendingTasks.indexOf(targetTask);

  // Calculate time for the unstructured block
  const blockStart = currentTask.startedAt;
  const blockEnd = timestamp;
  const elapsedMinutes = calculateElapsedMinutesUntil(blockStart, new Date());

  // Allow 0 minutes (just started) — the time block is still valid
  if (elapsedMinutes < 0) {
    console.error('\n❌ No unstructured time to reassign.\n');
    process.exit(1);
  }

  // Create a session for this time block
  const session = { startedAt: blockStart, endedAt: blockEnd };

  // Push to Google Calendar as the target task (not unstructured)
  const calEventId = createCalendarEvent({
    title: targetTask.title,
    activityContext: targetTask.activityContext || 'professional',
    timeSpent: elapsedMinutes,
    category: targetTask.routine ? 'Routine' : categorizeWork(targetTask.title),
    details: { startedAt: blockStart, completedAt: blockEnd }
  });
  if (calEventId) session.calendarEventId = calEventId;

  // Log to completedWork
  logData.dailyLog.completedWork.push({
    id: generateId(),
    timestamp: blockEnd,
    category: targetTask.routine ? 'Routine' : categorizeWork(targetTask.title),
    title: targetTask.title,
    activityContext: targetTask.activityContext || 'professional',
    timeSpent: elapsedMinutes,
    details: { startedAt: blockStart, completedAt: blockEnd },
    sessions: [session]
  });

  // Add session and time to the pending task too
  if (actualIndex !== -1) {
    const pending = logData.dailyLog.pendingTasks[actualIndex];
    pending.timeSpent = (pending.timeSpent || 0) + elapsedMinutes;
    if (!pending.sessions) pending.sessions = [];
    pending.sessions.push(session);
  }

  // Start a fresh unstructured block
  logData.dailyLog.currentTask = {
    title: 'unstructured',
    activityContext: 'unstructured',
    startedAt: timestamp,
    timeSpent: 0,
    isContextOnly: true,
    sessions: []
  };

  saveDailyLog(logData);

  const contextEmoji = CONTEXT_EMOJI_MAP[targetTask.activityContext] || '💼';
  const timeStr = formatTimeSpent(elapsedMinutes);
  const routineTag = targetTask.routine ? ' [R]' : '';
  console.log(`\n✅ Reassigned ${timeStr} → ${contextEmoji} ${targetTask.title}${routineTag}`);
  console.log(`   ☀️  Fresh unstructured block started\n`);
}

/**
 * Log a Claude conversation session as tracked work.
 * Called by Claude (not terminal) — takes JSON with session details.
 *
 * @param {string} sessionJson - JSON string with:
 *   title: Task title (required)
 *   context: Context code e.g. "proj", "cul" (required)
 *   summary: Brief summary of work done (required)
 *   startedAt: ISO timestamp for session start (required)
 *   endedAt: ISO timestamp for session end (required)
 *   match: "current" | taskNumber (1-indexed) | "new" (required)
 *     - "current": session matches current task
 *     - number > 0: matches pending task N (all tasks view, no filter)
 *     - "new": no match, create new pending task
 */
function logSession(sessionJson) {
  let data;
  try {
    data = JSON.parse(sessionJson);
  } catch (e) {
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

  const logData = loadDailyLog();
  const now = new Date().toISOString();
  const elapsedMs = new Date(endedAt) - new Date(startedAt);
  const elapsedMinutes = Math.max(0, Math.round(elapsedMs / 60000));

  // Create session object
  const session = { startedAt, endedAt };

  // Push to Google Calendar (fire-and-forget)
  try {
    const calEventId = createCalendarEvent({
      title,
      activityContext: context,
      timeSpent: elapsedMinutes,
      category: categorizeWork(title),
      details: { startedAt, completedAt: endedAt }
    });
    if (calEventId) session.calendarEventId = calEventId;
  } catch (e) {
    // fire-and-forget
  }

  let matchType = 'new';
  let matchedTitle = null;

  if (match === 'current' && logData.dailyLog.currentTask) {
    // Add session to current task
    const cur = logData.dailyLog.currentTask;
    if (!cur.sessions) cur.sessions = [];
    cur.sessions.push(session);
    matchedTitle = cur.title;
    matchType = 'current';

  } else if (typeof match === 'number' && match > 0) {
    // Match pending task by index (all tasks, no view filter)
    const all = logData.dailyLog.pendingTasks;
    const display = getDisplayOrderedTasks(all, null, null);
    const idx = match - 1;
    if (idx >= 0 && idx < display.length) {
      const task = display[idx];
      const realIdx = all.indexOf(task);
      if (realIdx !== -1) {
        all[realIdx].timeSpent = (all[realIdx].timeSpent || 0) + elapsedMinutes;
        if (!all[realIdx].sessions) all[realIdx].sessions = [];
        all[realIdx].sessions.push(session);
        matchedTitle = task.title;
        matchType = task.routine ? 'routine' : 'pending';
      }
    } else {
      console.error(`\n❌ Task ${match} not found (${display.length} tasks available)\n`);
      process.exit(1);
    }

  } else {
    // No match — create new pending task
    logData.dailyLog.pendingTasks.push({
      id: generateId(),
      title,
      activityContext: context,
      category: categorizeWork(title),
      priority: 'medium',
      timeSpent: elapsedMinutes,
      sessions: [session],
      notes: [{ text: 'Logged from Claude session', timestamp: now }]
    });
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
    title,
    context,
    summary: summary || '',
    startedAt,
    endedAt,
    loggedAt: now,
    matchedTask: matchedTitle,
    matchType,
    calendarEventId: session.calendarEventId || null
  });

  fs.writeFileSync(sessionFile, JSON.stringify(sessionLog, null, 2), 'utf8');
  saveDailyLog(logData);

  const emoji = CONTEXT_EMOJI_MAP[context] || '💼';
  const timeStr = formatTimeSpent(elapsedMinutes);
  console.log(`\n📝 Session logged: ${emoji} ${title} (${timeStr})`);
  console.log(`   ${matchType === 'new' ? '➕ Created new task' : matchType === 'current' ? '🎯 Added to current task' : '📌 Added to: ' + matchedTitle}`);
  if (summary) console.log(`   📄 ${summary.substring(0, 120)}${summary.length > 120 ? '...' : ''}`);
  console.log('');
}

function completeCurrentAndSwitch(taskNumber) {
  const logData = loadDailyLog();
  const timestamp = new Date().toISOString();

  // First, complete the current task
  if (!logData.dailyLog.currentTask) {
    console.log(`\n⚠️  No current task to complete.\n`);
    return;
  }

  const currentTask = logData.dailyLog.currentTask;
  const category = categorizeWork(currentTask.title);
  const elapsedMinutes = calculateElapsedMinutes(currentTask.startedAt);
  const timeSpent = (currentTask.timeSpent || 0) + elapsedMinutes;

  // Record final session for the completing task
  const finalSession = { startedAt: currentTask.startedAt, endedAt: timestamp };

  // Push final session to Google Calendar (fire-and-forget)
  const calEventId = createCalendarEvent({
    title: currentTask.title,
    activityContext: currentTask.activityContext || 'professional',
    timeSpent: elapsedMinutes,
    category: category,
    details: { startedAt: currentTask.startedAt, completedAt: timestamp }
  });
  if (calEventId) finalSession.calendarEventId = calEventId;

  const completedEntry = {
    id: generateId(),
    timestamp: timestamp,
    category: category,
    title: currentTask.title,
    activityContext: currentTask.activityContext || 'professional',
    timeSpent: timeSpent,
    details: {
      startedAt: currentTask.startedAt,
      completedAt: timestamp,
      notes: currentTask.notes || []
    },
    sessions: [...(currentTask.sessions || []), finalSession]
  };

  if (currentTask.context && currentTask.context !== currentTask.title) {
    completedEntry.details.context = currentTask.context;
  }

  logData.dailyLog.completedWork.push(completedEntry);

  const contextEmojiMap = CONTEXT_EMOJI_MAP;
  const contextEmoji = contextEmojiMap[completedEntry.activityContext] || '💼';
  const timeStr = formatTimeSpent(timeSpent);
  console.log(`\n✅ Task completed: ${contextEmoji} ${currentTask.title} (${timeStr})`);

  // Now switch to the pending task
  const taskIndex = taskNumber - 1;

  if (taskIndex < 0 || taskIndex >= logData.dailyLog.pendingTasks.length) {
    console.error(`\n❌ Invalid task number. You have ${logData.dailyLog.pendingTasks.length} pending tasks.\n`);
    process.exit(1);
  }

  const pendingTask = logData.dailyLog.pendingTasks[taskIndex];

  // Remove the task from pending and set as current
  logData.dailyLog.pendingTasks.splice(taskIndex, 1);

  const activityContext = pendingTask.activityContext || detectContext(pendingTask.title || pendingTask.task);

  logData.dailyLog.currentTask = {
    title: pendingTask.title || pendingTask.task,
    startedAt: timestamp,
    context: pendingTask.title || pendingTask.task,
    activityContext: activityContext,
    timeSpent: pendingTask.timeSpent || 0,
    notes: pendingTask.notes || [],
    sessions: pendingTask.sessions || []  // Carry over sessions from pending
  };

  saveDailyLog(logData);

  const newContextEmoji = contextEmojiMap[activityContext] || '💼';
  const newTimeStr = formatTimeSpent(pendingTask.timeSpent || 0);
  console.log(`\n✅ Switched to task #${taskNumber}: ${newContextEmoji} [${activityContext.toUpperCase()}] ${pendingTask.title || pendingTask.task}`);
  if (pendingTask.timeSpent && pendingTask.timeSpent > 0) {
    console.log(`   ⏱️  Previous work time: ${newTimeStr}\n`);
  } else {
    console.log('');
  }
}

function deleteTask(taskNumber) {
  // Handle 0 as current task
  if (taskNumber === 0) {
    const logData = loadDailyLog();
    if (!logData.dailyLog.currentTask) {
      console.log(`\n⚠️  No current task to delete.\n`);
      return;
    }
    const taskTitle = logData.dailyLog.currentTask.title;
    logData.dailyLog.currentTask = null;
    saveDailyLog(logData);
    console.log(`\n🗑️  Current task deleted: ${taskTitle}\n`);
    return;
  }

  const logData = loadDailyLog();

  // Get context filter and get tasks in display order
  const contextFilter = logData.dailyLog.contextFilter || null;
  const viewMode = logData.dailyLog.viewMode || 'novel';
  const pendingTasks = getDisplayOrderedTasks(logData.dailyLog.pendingTasks, contextFilter, viewMode);

  const taskIndex = taskNumber - 1;

  if (taskIndex < 0 || taskIndex >= pendingTasks.length) {
    console.error(`\n❌ Invalid task number. You have ${pendingTasks.length} ${contextFilter ? contextFilter : ''} pending tasks.\n`);
    process.exit(1);
  }

  const taskToDelete = pendingTasks[taskIndex];
  const actualIndex = logData.dailyLog.pendingTasks.indexOf(taskToDelete);
  const taskTitle = taskToDelete.title || taskToDelete.task;
  
  logData.dailyLog.pendingTasks.splice(actualIndex, 1);

  saveDailyLog(logData);

  console.log(`\n🗑️  Task #${taskNumber} deleted: ${taskTitle}\n`);
}

function deleteBulkTasks(taskNumbersStr) {
  // Parse task numbers from format like "[2,3,4,5]"
  const match = taskNumbersStr.match(/\[([0-9,\s]+)\]/);
  if (!match) {
    console.error('\n❌ Invalid format. Use: d-[2,3,4,5]\n');
    process.exit(1);
  }

  const taskNumbers = match[1]
    .split(',')
    .map(n => parseInt(n.trim()))
    .filter(n => !isNaN(n))
    .sort((a, b) => b - a); // Sort descending to avoid index shifting issues

  if (taskNumbers.length === 0) {
    console.error('\n❌ No valid task numbers provided\n');
    process.exit(1);
  }

  const logData = loadDailyLog();
  const contextFilter = logData.dailyLog.contextFilter || null;
  const viewMode = logData.dailyLog.viewMode || 'novel';
  const pendingTasks = getDisplayOrderedTasks(logData.dailyLog.pendingTasks, contextFilter, viewMode);

  const deleted = [];
  const errors = [];

  // Process in descending order to avoid index shifting
  for (const taskNumber of taskNumbers) {
    // Handle 0 as current task
    if (taskNumber === 0) {
      if (logData.dailyLog.currentTask) {
        const taskTitle = logData.dailyLog.currentTask.title;
        logData.dailyLog.currentTask = null;
        deleted.push(`#0 ${taskTitle}`);
      } else {
        errors.push(`#0 (no current task)`);
      }
      continue;
    }

    const taskIndex = taskNumber - 1;

    if (taskIndex < 0 || taskIndex >= pendingTasks.length) {
      errors.push(`#${taskNumber} (invalid)`);
      continue;
    }

    const taskToDelete = pendingTasks[taskIndex];
    const actualIndex = logData.dailyLog.pendingTasks.indexOf(taskToDelete);
    const taskTitle = taskToDelete.title || taskToDelete.task;
    
    logData.dailyLog.pendingTasks.splice(actualIndex, 1);
    deleted.push(`#${taskNumber} ${taskTitle}`);

    // Update pendingTasks array after removal for next iteration
    pendingTasks.splice(taskIndex, 1);
  }

  saveDailyLog(logData);

  console.log(`\n🗑️  Bulk deleted ${deleted.length} task(s):`);
  deleted.forEach(task => console.log(`   ${task}`));
  
  if (errors.length > 0) {
    console.log(`\n⚠️  Skipped ${errors.length} task(s):`);
    errors.forEach(err => console.log(`   ${err}`));
  }
  console.log('');
}

function toggleViewMode() {
  const logData = loadDailyLog();
  const currentMode = logData.dailyLog.viewMode || 'novel';
  const newMode = currentMode === 'novel' ? 'routine' : 'novel';
  logData.dailyLog.viewMode = newMode;
  saveDailyLog(logData);

  const modeEmoji = newMode === 'routine' ? '🔄' : '✨';
  const contextFilter = logData.dailyLog.contextFilter || null;
  const filteredTasks = getDisplayOrderedTasks(
    logData.dailyLog.pendingTasks,
    contextFilter,
    newMode
  );
  const filterStr = contextFilter ? ` (${contextFilter})` : '';
  console.log(`\n${modeEmoji} View mode: ${newMode.toUpperCase()}${filterStr} (${filteredTasks.length} tasks)\n`);
}

function modifyTaskContext(taskNumber, newContextCode) {
  // Normalize the context code
  const newContext = normalizeContext(newContextCode);
  
  // Handle 0 as current task
  if (taskNumber === 0) {
    const logData = loadDailyLog();
    
    if (!logData.dailyLog.currentTask) {
      console.log('\n⚠️  No current task to modify.\n');
      return;
    }
    
    const oldContext = logData.dailyLog.currentTask.activityContext || 'professional';
    logData.dailyLog.currentTask.activityContext = newContext;
    
    // Also update the context filter to match the new context
    logData.dailyLog.contextFilter = newContext;
    
    saveDailyLog(logData);
    
    const newContextEmoji = CONTEXT_EMOJI_MAP[newContext] || '💼';
    const oldContextEmoji = CONTEXT_EMOJI_MAP[oldContext] || '💼';
    console.log(`\n✅ Current task context modified:`);
    console.log(`   ${oldContextEmoji} [${oldContext.toUpperCase()}] → ${newContextEmoji} [${newContext.toUpperCase()}]`);
    console.log(`   ${logData.dailyLog.currentTask.title}\n`);
    return;
  }

  // Handle pending tasks
  const logData = loadDailyLog();
  const contextFilter = logData.dailyLog.contextFilter || null;
  const allPendingTasks = logData.dailyLog.pendingTasks || [];
  const viewMode = logData.dailyLog.viewMode || 'novel';
  const displayTasks = getDisplayOrderedTasks(allPendingTasks, contextFilter, viewMode);

  if (taskNumber < 1 || taskNumber > displayTasks.length) {
    console.error(`\n❌ Invalid task number: ${taskNumber}\n`);
    console.error(`   Valid range: ${contextFilter ? `1-${displayTasks.length} (filtered to ${contextFilter})` : `1-${displayTasks.length}`}\n`);
    return;
  }

  const selectedTask = displayTasks[taskNumber - 1];
  const indexInAll = allPendingTasks.findIndex(t => t.id === selectedTask.id);

  const oldContext = selectedTask.activityContext || 'professional';
  allPendingTasks[indexInAll].activityContext = newContext;

  saveDailyLog(logData);

  const newContextEmoji = CONTEXT_EMOJI_MAP[newContext] || '💼';
  const oldContextEmoji = CONTEXT_EMOJI_MAP[oldContext] || '💼';
  console.log(`\n✅ Task context modified:`);
  console.log(`   ${oldContextEmoji} [${oldContext.toUpperCase()}] → ${newContextEmoji} [${newContext.toUpperCase()}]`);
  console.log(`   ${selectedTask.title}\n`);
}

function clearContextFilter() {
  const logData = loadDailyLog();
  const timestamp = new Date().toISOString();

  // If there's a current task, move it to pending (unless it's a context-only task)
  if (logData.dailyLog.currentTask) {
    const prevTask = logData.dailyLog.currentTask;
    const elapsedMinutes = calculateElapsedMinutes(prevTask.startedAt);
    const timeSpent = (prevTask.timeSpent || 0) + elapsedMinutes;

    // Record session for outgoing task
    const sessionEvent = { startedAt: prevTask.startedAt, endedAt: timestamp };
    const eventId = createCalendarEvent({
      title: prevTask.title,
      activityContext: prevTask.activityContext,
      timeSpent: elapsedMinutes,
      category: prevTask.isContextOnly ? 'Context' : categorizeWork(prevTask.title),
      details: { startedAt: prevTask.startedAt, completedAt: timestamp }
    });
    if (eventId) sessionEvent.calendarEventId = eventId;

    if (prevTask.isContextOnly) {
      // Context-only task: log to completed work
      const completedEntry = {
        id: generateId(),
        timestamp: timestamp,
        category: 'Context',
        title: prevTask.title,
        activityContext: prevTask.activityContext,
        timeSpent: timeSpent,
        details: { startedAt: prevTask.startedAt, completedAt: timestamp },
        sessions: [...(prevTask.sessions || []), sessionEvent]
      };
      logData.dailyLog.completedWork.push(completedEntry);
    } else {
      // Regular task: move to pending
      const pendingEntry = {
        id: generateId(),
        title: prevTask.title,
        activityContext: prevTask.activityContext,
        category: categorizeWork(prevTask.title),
        priority: 'medium',
        timeSpent: timeSpent,
        notes: prevTask.notes || [],
        sessions: [...(prevTask.sessions || []), sessionEvent]
      };

      logData.dailyLog.pendingTasks.push(pendingEntry);
    }
  }

  // Switch to unstructured context (shows all tasks in routine view)
  logData.dailyLog.currentTask = {
    title: 'unstructured',
    activityContext: 'unstructured',
    startedAt: timestamp,
    timeSpent: 0,
    isContextOnly: true,
    sessions: []
  };
  logData.dailyLog.contextFilter = null;
  logData.dailyLog.viewMode = 'routine';

  saveDailyLog(logData);

  const routineTasks = logData.dailyLog.pendingTasks.filter(t => t.routine === true);
  console.log(`\n☀️ UNSTRUCTURED — showing all tasks (${routineTasks.length} routine task(s) visible, use /t last-N to reassign)\n`);
}

function switchToContext(contextCode) {
  const context = normalizeContext(contextCode);
  const logData = loadDailyLog();
  const timestamp = new Date().toISOString();

  // If there's a current task, move it to pending (unless it's a context-only task)
  if (logData.dailyLog.currentTask) {
    const prevTask = logData.dailyLog.currentTask;
    const elapsedMinutes = calculateElapsedMinutes(prevTask.startedAt);
    const timeSpent = (prevTask.timeSpent || 0) + elapsedMinutes;

    // Record session for outgoing task
    const ctxSwitchSession = { startedAt: prevTask.startedAt, endedAt: timestamp };
    const ctxSwitchEventId = createCalendarEvent({
      title: prevTask.title,
      activityContext: prevTask.activityContext,
      timeSpent: elapsedMinutes,
      category: prevTask.isContextOnly ? 'Context' : categorizeWork(prevTask.title),
      details: { startedAt: prevTask.startedAt, completedAt: timestamp }
    });
    if (ctxSwitchEventId) ctxSwitchSession.calendarEventId = ctxSwitchEventId;

    if (prevTask.isContextOnly) {
      // Context-only task: log to completed work
      const completedEntry = {
        id: generateId(),
        timestamp: timestamp,
        category: 'Context',
        title: prevTask.title,
        activityContext: prevTask.activityContext,
        timeSpent: timeSpent,
        details: { startedAt: prevTask.startedAt, completedAt: timestamp },
        sessions: [...(prevTask.sessions || []), ctxSwitchSession]
      };
      logData.dailyLog.completedWork.push(completedEntry);
    } else {
      // Regular task: move to pending
      const pendingEntry = {
        id: generateId(),
        title: prevTask.title,
        activityContext: prevTask.activityContext,
        category: categorizeWork(prevTask.title),
        priority: 'medium',
        timeSpent: timeSpent,
        notes: prevTask.notes || [],
        sessions: [...(prevTask.sessions || []), ctxSwitchSession]
      };

      logData.dailyLog.pendingTasks.push(pendingEntry);

      const contextEmojiMap = CONTEXT_EMOJI_MAP;
      const contextEmoji = contextEmojiMap[prevTask.activityContext] || '💼';
      const timeStr = formatTimeSpent(timeSpent);
      console.log(`\n⏸️  ${contextEmoji} ${prevTask.title} ${timeStr}`);
    }
  }

  // Set a context-only tracking task so time tracks to this context
  logData.dailyLog.currentTask = {
    title: context,
    activityContext: context,
    startedAt: timestamp,
    timeSpent: 0,
    isContextOnly: true,
    sessions: []
  };
  // When entering unstructured, show all contexts + routine view
  // so user can quickly reference routine tasks with /t last-N
  if (context === 'unstructured') {
    logData.dailyLog.contextFilter = null;
    logData.dailyLog.viewMode = 'routine';
  } else {
    logData.dailyLog.contextFilter = context;
  }

  saveDailyLog(logData);

  const contextEmoji = CONTEXT_EMOJI_MAP[context] || '💼';
  if (context === 'unstructured') {
    const routineTasks = logData.dailyLog.pendingTasks.filter(t => t.routine === true);
    console.log(`\n${contextEmoji} UNSTRUCTURED — tracking time (${routineTasks.length} routine task(s) visible, use /t last-N to reassign)\n`);
  } else {
    const filteredTasks = logData.dailyLog.pendingTasks.filter(t =>
      (t.activityContext || 'professional') === context
    );
    console.log(`\n${contextEmoji} ${context.toUpperCase()} — tracking time (${filteredTasks.length} task(s))\n`);
  }
}

function calculateTimeByContext(log) {
  const contextTimes = {
    personal: 0,
    social: 0,
    professional: 0,
    cultivo: 0,
    projects: 0
  };

  // Add completed work time
  log.completedWork.forEach(work => {
    const context = work.activityContext || 'professional';
    contextTimes[context] = (contextTimes[context] || 0) + (work.timeSpent || 0);
  });

  // Add current task time
  if (log.currentTask) {
    const context = log.currentTask.activityContext || 'professional';
    const elapsedMinutes = calculateElapsedMinutes(log.currentTask.startedAt);
    const totalTime = (log.currentTask.timeSpent || 0) + elapsedMinutes;
    contextTimes[context] = (contextTimes[context] || 0) + totalTime;
  }

  return contextTimes;
}

function showDailyLog(date = TODAY) {
  const logData = loadDailyLog(date);
  const log = logData.dailyLog;

  console.log('\n' + '='.repeat(80));
  console.log(`📊 DAILY LOG - ${logData.date}`);
  console.log('='.repeat(80));

  // Current Task
  console.log('\n🎯 CURRENT TASK:');
  if (log.currentTask) {
    const contextEmojiMap = CONTEXT_EMOJI_MAP;
    const contextEmoji = contextEmojiMap[log.currentTask.activityContext] || '💼';
    const contextLabel = log.currentTask.activityContext ? `[${log.currentTask.activityContext.toUpperCase()}]` : '';
    const elapsedMinutes = calculateElapsedMinutes(log.currentTask.startedAt);
    const totalTime = (log.currentTask.timeSpent || 0) + elapsedMinutes;
    const timeStr = formatTimeSpent(totalTime);
    if (log.currentTask.isContextOnly) {
      console.log(`   ${contextEmoji} ${contextLabel} (context tracking)`);
    } else {
      console.log(`   ${contextEmoji} ${contextLabel} ${log.currentTask.title}`);
    }
    console.log(`   Started: ${log.currentTask.startedAt.split('T')[1].substring(0, 8)}`);
    console.log(`   ⏱️  Time spent: ${timeStr}`);
    if (log.currentTask.context) {
      console.log(`   Context: ${log.currentTask.context}`);
    }
    if (log.currentTask.notes && log.currentTask.notes.length > 0) {
      console.log(`   Notes:`);
      log.currentTask.notes.forEach((note, idx) => {
        const noteTime = note.timestamp.split('T')[1].substring(0, 8);
        console.log(`      ${idx + 1}. [${noteTime}] ${note.text}`);
      });
    }
  } else {
    console.log('   (No current task)');
  }

  // Completed Work
  console.log('\n✅ COMPLETED WORK:');
  if (log.completedWork.length === 0) {
    console.log('   (No completed work yet)');
  } else {
    log.completedWork.forEach((work, idx) => {
      const time = work.timestamp.split('T')[1].substring(0, 8);
      const contextEmojiMap = CONTEXT_EMOJI_MAP;
      const contextEmoji = contextEmojiMap[work.activityContext] || '💼';
      const contextLabel = work.activityContext ? `[${work.activityContext.toUpperCase()}]` : '';
      const timeSpentStr = work.timeSpent ? ` (${formatTimeSpent(work.timeSpent)})` : '';
      console.log(`   ${idx + 1}. [${time}] ${contextEmoji} ${contextLabel} [${work.category}] ${work.title}${timeSpentStr}`);
      if (work.details.prNumber) {
        console.log(`      PR #${work.details.prNumber}`);
      }
      if (work.details.branch) {
        console.log(`      Branch: ${work.details.branch}`);
      }
      if (work.details.notes && work.details.notes.length > 0) {
        console.log(`      Notes:`);
        work.details.notes.forEach((note, noteIdx) => {
          const noteTime = note.timestamp.split('T')[1].substring(0, 8);
          console.log(`         ${noteIdx + 1}. [${noteTime}] ${note.text}`);
        });
      }
    });
  }

  // Pending Tasks
  const contextFilter = log.contextFilter || null;
  const viewMode = logData.dailyLog.viewMode || 'novel';
  const filteredTasks = getDisplayOrderedTasks(log.pendingTasks, contextFilter, viewMode);

  console.log('\n📋 PENDING TASKS:');
  if (contextFilter) {
    const contextEmoji = CONTEXT_EMOJI_MAP[contextFilter] || '💼';
    const totalTasksInContext = log.pendingTasks.filter(task => (task.activityContext || 'professional') === contextFilter).length;
    console.log(`   ${contextEmoji} Filtered by: ${contextFilter.toUpperCase()} (${filteredTasks.length}/${totalTasksInContext} tasks - view mode: ${viewMode})`);
  }

  if (filteredTasks.length === 0) {
    console.log('   (No pending tasks)');
  } else {
    if (contextFilter) {
      // Filtered view: show only filtered tasks with sequential numbering
      filteredTasks.forEach((task, idx) => {
        const priority = task.priority || 'medium';
        const taskTitle = task.title || task.task;
        const activityContext = task.activityContext || 'professional';
        const contextEmoji = CONTEXT_EMOJI_MAP[activityContext] || '💼';
        const priorityEmoji = priority === 'high' ? '🔴' : priority === 'low' ? '🟢' : '🟡';
        const timeSpentStr = task.timeSpent && task.timeSpent > 0 ? ` [⏱️  ${formatTimeSpent(task.timeSpent)}]` : '';

        // Use sequential numbering 1, 2, 3...
        console.log(`   ${idx + 1}. ${contextEmoji} ${priorityEmoji} [${priority.toUpperCase()}] ${taskTitle}${timeSpentStr}`);
        if (task.notes && task.notes.length > 0) {
          console.log(`      Notes:`);
          task.notes.forEach((note, noteIdx) => {
            const noteTime = note.timestamp.split('T')[1].substring(0, 8);
            console.log(`         ${noteIdx + 1}. [${noteTime}] ${note.text}`);
          });
        }
      });
    } else {
      // No filter: group tasks by context with emoji separators
      // filteredTasks already has viewMode applied, just use it directly
      let taskNum = 1;
      let currentContext = null;

      filteredTasks.forEach(task => {
        const taskContext = task.activityContext || 'professional';

        // Print emoji separator when context changes
        if (taskContext !== currentContext) {
          const contextEmoji = CONTEXT_EMOJI_MAP[taskContext] || '💼';
          console.log(`   ${contextEmoji}`);
          currentContext = taskContext;
        }

        const priority = task.priority || 'medium';
        const taskTitle = task.title || task.task;
        const priorityEmoji = priority === 'high' ? '🔴' : priority === 'low' ? '🟢' : '🟡';
        const timeSpentStr = task.timeSpent && task.timeSpent > 0 ? ` [⏱️  ${formatTimeSpent(task.timeSpent)}]` : '';

        console.log(`   ${taskNum}. ${priorityEmoji} [${priority.toUpperCase()}] ${taskTitle}${timeSpentStr}`);
        if (task.notes && task.notes.length > 0) {
          console.log(`      Notes:`);
          task.notes.forEach((note, noteIdx) => {
            const noteTime = note.timestamp.split('T')[1].substring(0, 8);
            console.log(`         ${noteIdx + 1}. [${noteTime}] ${note.text}`);
          });
        }
        taskNum++;
      });
    }
  }

  // Time by Context Summary
  const contextTimes = calculateTimeByContext(log);
  const totalTime = Object.values(contextTimes).reduce((sum, time) => sum + time, 0);

  if (totalTime > 0) {
    console.log('\n⏱️  TIME BY CONTEXT:');

    // Sort contexts by time spent (descending)
    const sortedContexts = Object.entries(contextTimes)
      .filter(([_, time]) => time > 0)
      .sort((a, b) => b[1] - a[1]);

    sortedContexts.forEach(([context, minutes]) => {
      const contextEmoji = CONTEXT_EMOJI_MAP[context] || '💼';
      const timeStr = formatTimeSpent(minutes);
      const percentage = Math.round((minutes / totalTime) * 100);
      console.log(`   ${contextEmoji} ${context.charAt(0).toUpperCase() + context.slice(1).padEnd(12)} ${timeStr.padEnd(8)} (${percentage}%)`);
    });

    console.log(`   ${'─'.repeat(30)}`);
    console.log(`   Total:${' '.repeat(9)}${formatTimeSpent(totalTime)}`);
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

function findLastAvailableDay() {
  // Get all log files in the directory
  const files = fs.readdirSync(LOG_DIR)
    .filter(f => f.startsWith('daily-log-') && f.endsWith('.json'))
    .map(f => f.replace('daily-log-', '').replace('.json', ''))
    .filter(date => date < TODAY) // Only dates before today
    .sort()
    .reverse(); // Most recent first

  return files.length > 0 ? files[0] : null;
}

/**
 * Sync sessions with Google Calendar (bidirectional).
 * - Push: sessions without calendarEventId → create events
 * - Pull: sessions with calendarEventId → fetch from calendar, update local if times differ (calendar wins)
 * @param {string[]} dates - Array of date strings (YYYY-MM-DD) to sync
 * @param {boolean} quiet - If true, minimal output (for auto-sync on start/end)
 */
function syncCalendar(dates = [TODAY], quiet = false) {
  if (!process.env.GOOGLE_CALENDAR_ID) {
    if (!quiet) console.log('\n⚠️  No GOOGLE_CALENDAR_ID set. Run setup-gcal and init-gcal first.\n');
    return;
  }

  if (!quiet) console.log('\n🔄 Syncing with Google Calendar...');

  let totalPushed = 0;
  let totalPulled = 0;
  let totalUpdated = 0;

  for (const date of dates) {
    const logData = loadDailyLog(date);
    if (!logData) continue;

    let modified = false;

    // Collect all session-bearing items: completedWork, pendingTasks, currentTask
    const sessionItems = [];

    (logData.dailyLog.completedWork || []).forEach((item, idx) => {
      sessionItems.push({ source: 'completedWork', index: idx, item });
    });
    (logData.dailyLog.pendingTasks || []).forEach((item, idx) => {
      sessionItems.push({ source: 'pendingTasks', index: idx, item });
    });
    if (logData.dailyLog.currentTask) {
      sessionItems.push({ source: 'currentTask', index: 0, item: logData.dailyLog.currentTask });
    }

    // Gather all sessions and their calendarEventIds
    const allSessionRefs = []; // { itemRef, sessionIdx, session }
    for (const ref of sessionItems) {
      const sessions = ref.item.sessions || [];
      sessions.forEach((session, sIdx) => {
        allSessionRefs.push({ ...ref, sessionIdx: sIdx, session });
      });
    }

    // --- PUSH: sessions without calendarEventId ---
    const unsynced = allSessionRefs.filter(r => !r.session.calendarEventId);
    for (const ref of unsynced) {
      const { item, session } = ref;
      if (!session.startedAt || !session.endedAt) continue;

      const durationMs = new Date(session.endedAt) - new Date(session.startedAt);
      const durationMin = Math.round(durationMs / 60000);
      if (durationMin < 1) continue; // Skip sub-minute sessions

      const eventId = createCalendarEvent({
        title: item.title,
        activityContext: item.activityContext,
        timeSpent: durationMin,
        category: item.category || 'General',
        details: { startedAt: session.startedAt, completedAt: session.endedAt }
      });

      if (eventId) {
        session.calendarEventId = eventId;
        modified = true;
        totalPushed++;
      }
    }

    // --- PULL: fetch calendar events and reconcile ---
    // Determine time range for this date
    const dayStart = new Date(`${date}T00:00:00`);
    const dayEnd = new Date(`${date}T23:59:59`);
    // Extend range slightly to catch cross-midnight events
    dayStart.setHours(dayStart.getHours() - 2);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const calEvents = listCalendarEvents(dayStart.toISOString(), dayEnd.toISOString());

    if (calEvents.length > 0) {
      // Build map: eventId → calendar event
      const calEventMap = new Map();
      for (const ev of calEvents) {
        calEventMap.set(ev.id, ev);
      }

      // Collect all local calendarEventIds (from sessions AND top-level item fields)
      // Also scan adjacent days to avoid cross-midnight duplicates
      const localEventIds = new Set();
      const collectIdsFromLog = (log) => {
        if (!log) return;
        for (const item of (log.dailyLog.completedWork || [])) {
          if (item.calendarEventId) localEventIds.add(item.calendarEventId);
          for (const s of (item.sessions || [])) {
            if (s.calendarEventId) localEventIds.add(s.calendarEventId);
          }
        }
        for (const item of (log.dailyLog.pendingTasks || [])) {
          if (item.calendarEventId) localEventIds.add(item.calendarEventId);
          for (const s of (item.sessions || [])) {
            if (s.calendarEventId) localEventIds.add(s.calendarEventId);
          }
        }
        if (log.dailyLog.currentTask) {
          if (log.dailyLog.currentTask.calendarEventId) localEventIds.add(log.dailyLog.currentTask.calendarEventId);
          for (const s of (log.dailyLog.currentTask.sessions || [])) {
            if (s.calendarEventId) localEventIds.add(s.calendarEventId);
          }
        }
      };
      collectIdsFromLog(logData);
      // Check adjacent days for cross-midnight events
      const prevDate = new Date(`${date}T12:00:00`);
      prevDate.setDate(prevDate.getDate() - 1);
      const nextDate = new Date(`${date}T12:00:00`);
      nextDate.setDate(nextDate.getDate() + 1);
      collectIdsFromLog(loadDailyLog(getLocalDate(prevDate)));
      collectIdsFromLog(loadDailyLog(getLocalDate(nextDate)));

      // Reconcile existing synced sessions
      const syncedRefs = allSessionRefs.filter(r => r.session.calendarEventId);
      for (const ref of syncedRefs) {
        const { session } = ref;
        const calEvent = calEventMap.get(session.calendarEventId);

        if (!calEvent) {
          // Event was deleted from calendar — clear the reference
          delete session.calendarEventId;
          modified = true;
          continue;
        }

        // Compare times (calendar wins)
        const calStart = calEvent.start?.dateTime;
        const calEnd = calEvent.end?.dateTime;
        if (!calStart || !calEnd) continue;

        // Normalize to compare — truncate to seconds (Google Calendar drops milliseconds)
        const truncSec = (iso) => iso.replace(/\.\d{3}Z$/, '.000Z');
        const localStart = truncSec(new Date(session.startedAt).toISOString());
        const localEnd = truncSec(new Date(session.endedAt).toISOString());
        const remoteStart = truncSec(new Date(calStart).toISOString());
        const remoteEnd = truncSec(new Date(calEnd).toISOString());

        if (localStart !== remoteStart || localEnd !== remoteEnd) {
          // Calendar was modified — update local session
          const oldDuration = Math.round((new Date(session.endedAt) - new Date(session.startedAt)) / 60000);
          session.startedAt = remoteStart;
          session.endedAt = remoteEnd;
          const newDuration = Math.round((new Date(remoteEnd) - new Date(remoteStart)) / 60000);
          const timeDiff = newDuration - oldDuration;

          // Update the task's total timeSpent
          ref.item.timeSpent = (ref.item.timeSpent || 0) + timeDiff;
          if (ref.item.timeSpent < 0) ref.item.timeSpent = 0;

          modified = true;
          totalUpdated++;

          if (!quiet) {
            const emoji = CONTEXT_EMOJI_MAP[ref.item.activityContext] || '💼';
            console.log(`   ${emoji} ${ref.item.title}: ${oldDuration}m → ${newDuration}m (calendar)`);
          }
        }
      }

      // --- IMPORT: calendar events not tracked locally ---
      const untrackedEvents = calEvents.filter(ev => {
        if (localEventIds.has(ev.id)) return false;
        // Must have dateTime (skip all-day events)
        if (!ev.start?.dateTime || !ev.end?.dateTime) return false;
        // Must have meaningful duration
        const durMin = Math.round((new Date(ev.end.dateTime) - new Date(ev.start.dateTime)) / 60000);
        if (durMin < 1) return false;
        // Only import events that START on the target date (local time)
        const evStartLocal = new Date(ev.start.dateTime);
        const evDateStr = `${evStartLocal.getFullYear()}-${String(evStartLocal.getMonth() + 1).padStart(2, '0')}-${String(evStartLocal.getDate()).padStart(2, '0')}`;
        if (evDateStr !== date) return false;
        return true;
      });

      for (const ev of untrackedEvents) {
        const evStart = new Date(ev.start.dateTime).toISOString();
        const evEnd = new Date(ev.end.dateTime).toISOString();
        const durMin = Math.round((new Date(evEnd) - new Date(evStart)) / 60000);

        // Strip emoji prefix from calendar summary (e.g. "🏠 transit" → "transit")
        const rawTitle = (ev.summary || '').replace(/^[\p{Emoji}\p{Emoji_Presentation}\p{Emoji_Modifier_Base}\p{Emoji_Component}\uFE0F\u200D]+\s*/u, '').trim();
        if (!rawTitle) continue;
        const titleLower = rawTitle.toLowerCase();

        // Match to existing task — check routine tasks first, then all pending
        const pendingTasks = logData.dailyLog.pendingTasks || [];
        const routineTasks = pendingTasks.filter(t => t.routine);
        const novelTasks = pendingTasks.filter(t => !t.routine);

        let matchedTask = null;

        // Exact title match (case-insensitive) — routine first
        matchedTask = routineTasks.find(t => t.title.toLowerCase() === titleLower);
        if (!matchedTask) {
          matchedTask = novelTasks.find(t => t.title.toLowerCase() === titleLower);
        }

        // Partial/contains match — routine first
        if (!matchedTask) {
          matchedTask = routineTasks.find(t =>
            titleLower.includes(t.title.toLowerCase()) || t.title.toLowerCase().includes(titleLower)
          );
        }
        if (!matchedTask) {
          matchedTask = novelTasks.find(t =>
            titleLower.includes(t.title.toLowerCase()) || t.title.toLowerCase().includes(titleLower)
          );
        }

        // Determine context from matched task, title, or calendar color
        let activityContext = 'unstructured';
        const contextNames = ['personal', 'social', 'professional', 'cultivo', 'projects', 'health', 'unstructured'];
        const contextAliases = {
          fitness: 'health', exercise: 'health', sleep: 'health', sleeping: 'health',
          meals: 'health', hygiene: 'health',
          transit: 'personal', errands: 'personal', planning: 'personal', journaling: 'personal',
          leisure: 'unstructured', 'social media': 'unstructured'
        };

        if (matchedTask) {
          activityContext = matchedTask.activityContext || 'professional';
        } else if (contextNames.includes(titleLower)) {
          activityContext = titleLower;
        } else if (contextAliases[titleLower]) {
          activityContext = contextAliases[titleLower];
        } else if (ev.colorId) {
          // Reverse-map calendar color to context
          const colorToContext = {};
          for (const [ctx, cid] of Object.entries(CONTEXT_COLOR_MAP)) {
            colorToContext[cid] = ctx;
          }
          activityContext = colorToContext[ev.colorId] || 'unstructured';
        }

        const session = {
          startedAt: evStart,
          endedAt: evEnd,
          calendarEventId: ev.id
        };

        // Add session + time to matched pending task
        if (matchedTask) {
          if (!matchedTask.sessions) matchedTask.sessions = [];
          matchedTask.sessions.push(session);
          matchedTask.timeSpent = (matchedTask.timeSpent || 0) + durMin;
        }

        // Add completedWork entry for the time block
        logData.dailyLog.completedWork.push({
          id: `gcal_${ev.id}`,
          timestamp: evEnd,
          category: matchedTask ? (matchedTask.routine ? 'Routine' : categorizeWork(rawTitle)) : 'General',
          title: rawTitle,
          activityContext: activityContext,
          timeSpent: durMin,
          details: {
            startedAt: evStart,
            completedAt: evEnd,
            notes: [{ text: 'Synced from Google Calendar', timestamp: new Date().toISOString() }]
          },
          sessions: [session]
        });

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
      saveDailyLog(logData);
    }
  }

  if (!quiet) {
    const parts = [];
    if (totalPushed > 0) parts.push(`${totalPushed} pushed`);
    if (totalPulled > 0) parts.push(`${totalPulled} imported from calendar`);
    if (totalUpdated > 0) parts.push(`${totalUpdated} updated from calendar`);
    if (totalPushed === 0 && totalPulled === 0 && totalUpdated === 0) parts.push('already in sync');
    console.log(`   ✅ ${parts.join(', ')}\n`);
  }
}

function startNewDay() {
  // Find the last available day with a log file
  const lastAvailableDay = findLastAvailableDay();

  // Sync yesterday's calendar data before archiving
  if (lastAvailableDay) {
    syncCalendar([lastAvailableDay], true);
  }

  // Archive yesterday's time to weekly logs
  if (lastAvailableDay) {
    try {
      const timeTracker = require('./time-tracker');
      const result = timeTracker.archiveDayTime(lastAvailableDay);
      if (result) {
        console.log(`\n📊 Time archived for ${lastAvailableDay}:`);
        const ct = result.contextTimes;
        const contextDisplay = [
          { key: 'cultivo', emoji: '🌱', name: 'Cultivo' },
          { key: 'personal', emoji: '🏠', name: 'Personal' },
          { key: 'health', emoji: '💪', name: 'Health' },
          { key: 'professional', emoji: '💼', name: 'Professional' },
          { key: 'projects', emoji: '🚀', name: 'Projects' },
          { key: 'social', emoji: '👥', name: 'Social' },
          { key: 'unstructured', emoji: '☀️', name: 'Unstructured' }
        ];
        contextDisplay.forEach(({ key, emoji, name }) => {
          if (ct[key] > 0) console.log(`   ${emoji} ${name}: ${formatTimeSpent(ct[key])}`);
        });

        // Show time budget update
        if (result.budgetDelta) {
          const bd = result.budgetDelta;
          const balance = timeTracker.getTimeBudgetBalance();
          console.log(`\n💰 Time Budget:`);
          console.log(`   Earned: +${formatTimeSpent(Math.round(bd.earned))}`);
          console.log(`   Spent:  -${formatTimeSpent(Math.round(bd.spent))}`);
          const balSign = balance.balance >= 0 ? '+' : '-';
          console.log(`   Balance: ${balSign}${formatTimeSpent(Math.round(Math.abs(balance.balance)))}`);
        }
      }
    } catch (error) {
      console.error(`⚠️  Could not archive time: ${error.message}`);
    }
  }

  // Load or create today's log
  const todayLog = loadDailyLog(TODAY);

  // Check if today already has data
  const hasCurrentTask = todayLog.dailyLog.currentTask !== null;
  const hasCompletedWork = todayLog.dailyLog.completedWork.length > 0;
  const hasPendingTasks = todayLog.dailyLog.pendingTasks.length > 0;

  if (hasCurrentTask || hasCompletedWork || hasPendingTasks) {
    console.log(`\n⚠️  Warning: Today's log (${TODAY}) already has data:`);
    if (hasCurrentTask) console.log(`   - Current task: ${todayLog.dailyLog.currentTask.title}`);
    if (hasCompletedWork) console.log(`   - ${todayLog.dailyLog.completedWork.length} completed work item(s)`);
    if (hasPendingTasks) console.log(`   - ${todayLog.dailyLog.pendingTasks.length} pending task(s)`);
    console.log(`\n   Tasks from yesterday will be ADDED to existing tasks.\n`);
  }

  // If no previous day found, just save today's empty log
  if (!lastAvailableDay) {
    console.log(`\n✅ New day started: ${TODAY}`);
    console.log(`   No previous daily logs found.\n`);
    saveDailyLog(todayLog);
    return;
  }

  // Load the last available day's log
  const previousLog = loadDailyLog(lastAvailableDay);
  const previousPendingTasks = previousLog.dailyLog.pendingTasks || [];
  const previousCurrentTask = previousLog.dailyLog.currentTask;

  // Carry over current task from yesterday (only if today doesn't already have one)
  if (previousCurrentTask && !hasCurrentTask) {
    // Update the startedAt timestamp to today (preserve accumulated timeSpent)
    todayLog.dailyLog.currentTask = {
      ...previousCurrentTask,
      startedAt: new Date().toISOString()
    };

    const contextEmojiMap = CONTEXT_EMOJI_MAP;
    const contextEmoji = contextEmojiMap[previousCurrentTask.activityContext] || '💼';
    const timeSpentStr = previousCurrentTask.timeSpent && previousCurrentTask.timeSpent > 0 ? ` (${formatTimeSpent(previousCurrentTask.timeSpent)})` : '';
    console.log(`\n✅ New day started: ${TODAY}`);
    console.log(`   📌 Carried over current task from ${lastAvailableDay}:`);
    console.log(`      ${contextEmoji} ${previousCurrentTask.title}${timeSpentStr}`);
  } else {
    console.log(`\n✅ New day started: ${TODAY}`);
  }

  // Add previous day's pending tasks to today
  if (previousPendingTasks.length > 0) {
    todayLog.dailyLog.pendingTasks.push(...previousPendingTasks);
    console.log(`\n   Carried over ${previousPendingTasks.length} pending task(s) from ${lastAvailableDay}:\n`);

    previousPendingTasks.forEach((task, idx) => {
      // Handle both old schema (priority/task) and new schema (category/title/activityContext)
      const priority = task.priority || 'medium';
      const taskTitle = task.title || task.task;
      const activityContext = task.activityContext || 'professional';
      const contextEmoji = CONTEXT_EMOJI_MAP[activityContext] || '💼';
      const priorityEmoji = priority === 'high' ? '🔴' : priority === 'low' ? '🟢' : '🟡';
      const timeSpentStr = task.timeSpent && task.timeSpent > 0 ? ` [⏱️  ${formatTimeSpent(task.timeSpent)}]` : '';
      console.log(`   ${idx + 1}. ${contextEmoji} ${priorityEmoji} [${priority.toUpperCase()}] ${taskTitle}${timeSpentStr}`);
    });

    console.log(`\n   Total pending tasks for today: ${todayLog.dailyLog.pendingTasks.length}`);
  } else if (!previousCurrentTask || hasCurrentTask) {
    console.log(`   No pending tasks from ${lastAvailableDay}`);
  }

  console.log('');
  saveDailyLog(todayLog);
}

function addNoteToCurrentTask(noteText) {
  const logData = loadDailyLog();
  const timestamp = new Date().toISOString();

  if (!logData.dailyLog.currentTask) {
    console.log(`\n⚠️  No current task to add note to.\n`);
    return;
  }

  if (!logData.dailyLog.currentTask.notes) {
    logData.dailyLog.currentTask.notes = [];
  }

  const note = {
    text: noteText,
    timestamp: timestamp
  };

  logData.dailyLog.currentTask.notes.push(note);
  saveDailyLog(logData);

  console.log(`\n📝 Note added to current task:`);
  console.log(`   "${noteText}"`);
  console.log(`   Time: ${timestamp.split('T')[1].substring(0, 8)}\n`);
}

function addNoteToPendingTask(taskNumber, noteText) {
  const logData = loadDailyLog();
  const timestamp = new Date().toISOString();

  const taskIndex = taskNumber - 1;

  if (taskIndex < 0 || taskIndex >= logData.dailyLog.pendingTasks.length) {
    console.error(`\n❌ Invalid task number. You have ${logData.dailyLog.pendingTasks.length} pending tasks.\n`);
    process.exit(1);
  }

  const pendingTask = logData.dailyLog.pendingTasks[taskIndex];

  if (!pendingTask.notes) {
    pendingTask.notes = [];
  }

  const note = {
    text: noteText,
    timestamp: timestamp
  };

  pendingTask.notes.push(note);
  saveDailyLog(logData);

  const taskTitle = pendingTask.title || pendingTask.task;
  console.log(`\n📝 Note added to pending task #${taskNumber}:`);
  console.log(`   Task: ${taskTitle}`);
  console.log(`   Note: "${noteText}"`);
  console.log(`   Time: ${timestamp.split('T')[1].substring(0, 8)}\n`);
}

function addNoteToCompletedWork(workId, noteText) {
  const logData = loadDailyLog();
  const timestamp = new Date().toISOString();

  const work = logData.dailyLog.completedWork.find(w => w.id === workId);

  if (!work) {
    console.error(`\n❌ Completed work with ID ${workId} not found.\n`);
    process.exit(1);
  }

  if (!work.details.notes) {
    work.details.notes = [];
  }

  const note = {
    text: noteText,
    timestamp: timestamp
  };

  work.details.notes.push(note);
  saveDailyLog(logData);

  console.log(`\n📝 Note added to completed work:`);
  console.log(`   Work: ${work.title}`);
  console.log(`   Note: "${noteText}"`);
  console.log(`   Time: ${timestamp.split('T')[1].substring(0, 8)}\n`);
}

function pullJiraTickets() {
  const { execSync } = require('child_process');

  console.log('\n🔄 Syncing with Jira tickets...\n');

  try {
    // Fetch tickets from Jira API
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

    const logData = loadDailyLog();
    let addedCount = 0;
    let removedCount = 0;

    // Create a map of all Jira tickets by key and their status
    const jiraTicketMap = new Map();
    for (const issue of data.issues) {
      jiraTicketMap.set(issue.key, issue.fields.status.name);
    }

    // Get existing Jira ticket numbers from pending tasks to avoid duplicates
    const existingJiraTickets = new Set(
      logData.dailyLog.pendingTasks
        .filter(t => t && t.jiraTicket)
        .map(t => t.jiraTicket)
    );

    console.log(`📋 Found ${data.issues.length} ticket(s) assigned to you:\n`);

    // Statuses that should not be added to pending tasks
    const excludedStatuses = ['Done', 'Deployed', "Won't Do", 'Closed'];

    // Remove tasks that are now done in Jira and clean up stale tickets (two-way sync)
    console.log('🧹 Cleaning up completed and stale tickets:\n');
    const initialLength = logData.dailyLog.pendingTasks.length;

    logData.dailyLog.pendingTasks = logData.dailyLog.pendingTasks.filter(task => {
      if (!task || !task.jiraTicket) return true; // Keep non-Jira tasks

      if (jiraTicketMap.has(task.jiraTicket)) {
        // Task still exists in Jira, check if it's completed
        const jiraStatus = jiraTicketMap.get(task.jiraTicket);
        if (excludedStatuses.includes(jiraStatus)) {
          removedCount++;
          const statusEmoji = jiraStatus === 'Done' ? '✅' : jiraStatus === 'Deployed' ? '🚀' : '⏭️';
          console.log(`   ${statusEmoji} ${task.jiraTicket}: ${task.title.replace(/^\[.*?\]\s/, '')} (${jiraStatus})`);
          return false;
        }
      } else {
        // Task no longer in Jira (stale) - move to completed if time spent, otherwise remove
        if (task.timeSpent > 0) {
          logData.dailyLog.completedWork.push({
            id: task.id || generateId(),
            timestamp: new Date().toISOString(),
            title: task.title.replace(/^\[.*?\]\s/, ''),
            activityContext: task.activityContext || 'cultivo',
            category: task.category || 'General',
            timeSpent: task.timeSpent,
            jiraTicket: task.jiraTicket,
            jiraUrl: task.jiraUrl,
            details: {
              completedAt: new Date().toISOString(),
              notes: task.notes
            }
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

    if (removedCount === 0) {
      console.log('   (no completed or stale tickets)\n');
    } else {
      console.log('');
    }

    // Add new active tickets (one-way from Jira)
    console.log('➕ Adding new active tickets to pending tasks:\n');

    for (const issue of data.issues) {
      const ticketKey = issue.key;
      const summary = issue.fields.summary;
      const status = issue.fields.status.name;
      const priority = issue.fields.priority?.name || 'Medium';
      const ticketUrl = `https://cultivo.atlassian.net/browse/${ticketKey}`;

      // Skip excluded statuses
      if (excludedStatuses.includes(status)) {
        const statusEmoji = status === 'Done' ? '✅' : status === 'Deployed' ? '🚀' : '⏭️';
        console.log(`   ${statusEmoji} ${ticketKey}: ${summary} (${status})`);
        continue;
      }

      // Create task title with ticket number
      const taskTitle = `[${ticketKey}] ${summary}`;

      // Check if this ticket is already in pending tasks by ticket number
      const isDuplicate = existingJiraTickets.has(ticketKey);

      if (isDuplicate) {
        console.log(`   ⏭️  ${ticketKey}: ${summary} (already in pending)`);
        continue;
      }

      // Add as pending task with Jira metadata
      const newTask = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        title: taskTitle,
        activityContext: 'cultivo',
        category: 'General',
        priority: priority.toLowerCase(),
        timeSpent: 0,
        jiraTicket: ticketKey,
        jiraUrl: ticketUrl,
        jiraStatus: status,
        notes: []
      };

      logData.dailyLog.pendingTasks.push(newTask);
      addedCount++;

      const priorityEmoji = priority === 'Highest' ? '🔴' : priority === 'High' ? '🟠' : priority === 'Medium' ? '🟡' : '🟢';
      console.log(`   ${priorityEmoji} ${ticketKey}: ${summary}`);
      console.log(`      Status: ${status} | Priority: ${priority}`);
    }

    if (addedCount === 0) {
      console.log('   (no new tickets to add)\n');
    } else {
      console.log('');
    }

    saveDailyLog(logData);

    console.log(`📊 Sync complete:`);
    console.log(`   🧹 Cleaned up ${removedCount} completed/stale ticket(s)`);
    console.log(`   ➕ Added ${addedCount} new ticket(s)`);
    console.log(`   📋 Total pending: ${logData.dailyLog.pendingTasks.length}\n`);

    if (addedCount > 0 || removedCount > 0) {
      console.log(`💡 Use /t -N to switch to a task, or /t show to see all tasks.\n`);
    }

  } catch (error) {
    console.error(`\n❌ Error syncing Jira tickets: ${error.message}\n`);
    process.exit(1);
  }
}

function mapGoogleListToContext(listName) {
  const lower = (listName || '').toLowerCase();
  const listContextMap = {
    'health': 'health',
    'personal': 'personal',
    'cultivo': 'cultivo',
    'projects': 'projects',
    'social': 'social',
    'society': 'social',
    'professional': 'professional',
    'edu': 'projects'
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

    // Step 1: Exchange refresh token for access token
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

    // Step 2: List all task lists
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

    // Step 3: Calculate today's date range in RFC 3339
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dueMin = today.toISOString();
    const dueMax = tomorrow.toISOString();

    const logData = loadDailyLog();
    let addedCount = 0;
    let skippedCount = 0;

    // Get existing Google Task IDs to avoid duplicates
    const existingGoogleTaskIds = new Set(
      logData.dailyLog.pendingTasks
        .filter(t => t && t.googleTaskId)
        .map(t => t.googleTaskId)
    );

    console.log(`📋 Checking ${listsData.items.length} task list(s) for tasks due today:\n`);

    for (const list of listsData.items) {
      // Step 4: Fetch tasks due today from each list
      const tasksResponse = execSync(
        `curl -s -H "Authorization: Bearer ${accessToken}" ` +
        `"https://www.googleapis.com/tasks/v1/lists/${list.id}/tasks?dueMin=${encodeURIComponent(dueMin)}&dueMax=${encodeURIComponent(dueMax)}&showCompleted=false&showHidden=false"`,
        { encoding: 'utf8' }
      );
      const tasksData = JSON.parse(tasksResponse);

      if (!tasksData.items || tasksData.items.length === 0) {
        continue;
      }

      const listEmoji = CONTEXT_EMOJI_MAP[mapGoogleListToContext(list.title)] || '📝';
      console.log(`${listEmoji} ${list.title}:`);

      for (const task of tasksData.items) {
        // Skip completed tasks
        if (task.status === 'completed') continue;

        // Deduplicate
        if (existingGoogleTaskIds.has(task.id)) {
          console.log(`   ⏭️  ${task.title} (already in pending)`);
          skippedCount++;
          continue;
        }

        // Map list name to context
        let context = mapGoogleListToContext(list.title);
        if (!context) {
          context = detectContext(task.title || '');
        }

        const newTask = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          title: task.title,
          activityContext: context,
          category: 'General',
          priority: 'medium',
          timeSpent: 0,
          googleTaskId: task.id,
          googleTaskListId: list.id,
          googleTaskListName: list.title,
          notes: task.notes ? [task.notes] : []
        };

        logData.dailyLog.pendingTasks.push(newTask);
        existingGoogleTaskIds.add(task.id);
        addedCount++;

        const contextEmoji = CONTEXT_EMOJI_MAP[context] || '📝';
        console.log(`   ➕ ${task.title} (${contextEmoji} ${context})`);
      }
    }

    saveDailyLog(logData);

    console.log(`\n📊 Google Tasks sync complete:`);
    console.log(`   ➕ Added ${addedCount} task(s)`);
    console.log(`   ⏭️  Skipped ${skippedCount} duplicate(s)`);
    console.log(`   📋 Total pending: ${logData.dailyLog.pendingTasks.length}\n`);

    if (addedCount > 0) {
      console.log(`💡 Use /t -N to switch to a task, or /t show to see all tasks.\n`);
    }

  } catch (error) {
    console.error(`\n❌ Error pulling Google Tasks: ${error.message}\n`);
    process.exit(1);
  }
}

function showUsage() {
  console.log(`
Daily Log CLI - Track your work progress

USAGE:
  npm run log:start-day
      Start a new day by carrying over pending tasks from yesterday
      Example: npm run log:start-day
      Use at the beginning of each day to migrate uncompleted tasks

  npm run log:current "<task description>"
      Set or update your current task (auto-completes previous task)
      Example: npm run log:current "Implementing daily log CLI script"

  npm run log:complete-current ["<new task description>"]
      Complete current task, optionally set new task immediately
      Example: npm run log:complete-current
      Example: npm run log:complete-current "Next task to work on"

  npm run log:complete "<work description>"
      Add completed work to today's log
      Example: npm run log:complete "PR #1234: Fixed authentication bug"

  npm run log:pending "<task description>"
      Add a pending task (use 'urgent', 'high', 'low' for priority)
      Example: npm run log:pending "Review migration scripts - urgent"

  /t add "task 1" "task 2" ... [context]
      Add multiple tasks at once (defaults to personal context if no filter set)
      Example: /t add "Buy groceries" "Call dentist" per
      Example: /t add "Review PR" "Fix bug" cul

  /t m-N <context>
      Modify task context (0 for current task, N for pending task)
      Contexts: per, soc, prof, cul, proj
      Example: /t m-0 cul (change current task to cultivo)
      Example: /t m-2 per (change pending task #2 to personal)

  /t c-[1,3,4,5]
      Complete multiple tasks by number (handles index shifting automatically)
      Example: /t c-[1,3,4,5]
      Example: /t c-[0,2,3] (0 = current task)

  /t d-[2,3,4,5]
      Delete multiple tasks by number (handles index shifting automatically)
      Example: /t d-[2,3,4,5]
      Example: /t d-[0,1] (0 = current task)

  npm run log:show [date]
      Display daily log (defaults to today)
      Example: npm run log:show
      Example: npm run log:show 2025-11-18

  npm run log:modify-context <task-number> <context>
      Modify task context (terminal command version)
      Example: npm run log:modify-context 0 cul
      Example: npm run log:modify-context 2 per

FEATURES:
  • Bulk operations automatically handle index shifting when deleting/completing
  • Multi-task add respects current context filter, defaults to personal
  • Context can be specified per-task or inherited from current filter
  • Modify task context after creation with m-N command
  • Auto-completes previous task when setting new current task
  • Auto-categorizes completed work (PR, Feature, Bug, etc.)
  • Auto-detects priorities (high, medium, low)
  • Extracts PR numbers and branch names
  • Timestamps all entries
  • Smart context extraction

`);
}

// Main
const command = process.argv[2];
const args = process.argv.slice(3);

try {
  // Handle bulk commands first (c-[...], d-[...])
  if (command && command.startsWith('c-[')) {
    completeBulkTasks(command.substring(2));
    process.exit(0);
  }
  
  if (command && command.startsWith('d-[')) {
    deleteBulkTasks(command.substring(2));
    process.exit(0);
  }

  // Handle modify-context command: m-N where N is task number
  if (command && command.startsWith('m-')) {
    const taskNumber = parseInt(command.substring(2));
    if (isNaN(taskNumber)) {
      console.error('\n❌ Invalid task number in m-N command\n');
      console.error('   Usage: m-N <context>\n');
      console.error('   Example: m-0 cul (modify current task)\n');
      console.error('   Example: m-2 per (modify pending task #2)\n');
      process.exit(1);
    }
    if (args.length < 1) {
      console.error('\n❌ Missing context argument\n');
      console.error('   Usage: m-N <context>\n');
      console.error('   Valid contexts: per, soc, prof, cul, proj, heal, us\n');
      process.exit(1);
    }
    modifyTaskContext(taskNumber, args[0]);
    process.exit(0);
  }

  // Handle last-N command: reassign unstructured time to task N
  if (command && command.startsWith('last-')) {
    const taskNumber = parseInt(command.substring(5));
    if (isNaN(taskNumber) || taskNumber < 1) {
      console.error('\n❌ Invalid task number in last-N command\n');
      console.error('   Usage: last-N (reassign unstructured time to task N)\n');
      process.exit(1);
    }
    reassignUnstructuredTime(taskNumber);
    process.exit(0);
  }

  switch (command) {
    case 'start-day':
      startNewDay();
      break;

    case 'current':
      if (args.length < 1) {
        console.error('\n❌ Usage: current "<task description>"\n');
        process.exit(1);
      }
      setCurrentTask(args.join(' '));
      break;

    case 'complete':
      // If no args, complete current task (clearer interface)
      // If args provided, add as completed work (legacy)
      if (args.length === 0) {
        completeCurrentTask();
      } else {
        addCompletedWork(args.join(' '));
      }
      break;

    case 'complete-current':
      // Optional: can provide new task description
      completeCurrentTask(args.length > 0 ? args.join(' ') : null);
      break;

    case 'complete':
      // Complete just the current task (shorthand for complete-current)
      completeCurrentTask();
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

    case 'add':
      // Handle multi-task add: /t add "first task" "second task" [context]
      if (args.length < 1) {
        console.error('\n❌ Usage: add "task 1" "task 2" ... [context]\n');
        console.error('   Example: add "Buy groceries" "Call dentist" per\n');
        console.error('   Example: add "Review PR" "Fix bug" cul\n');
        process.exit(1);
      }
      
      // Parse trailing flags: [context] [r]
      // Order: check for 'r' (routine) first since it's always last, then context
      let contextArg = null;
      let taskArgs = [...args];
      let isRoutineAdd = false;

      // Check if last arg is 'r' for routine
      if (taskArgs.length > 0 && taskArgs[taskArgs.length - 1].toLowerCase() === 'r') {
        isRoutineAdd = true;
        taskArgs = taskArgs.slice(0, -1);
      }

      // Check if (new) last arg is a context code
      if (taskArgs.length > 0) {
        const lastArg = taskArgs[taskArgs.length - 1];
        const contextMatch = lastArg.match(/^(per|soc|prof|cul|proj|heal|us|personal|social|professional|cultivo|projects|health|unstructured)$/i);
        if (contextMatch) {
          contextArg = contextMatch[1];
          taskArgs = taskArgs.slice(0, -1);
        }
      }

      if (taskArgs.length === 0) {
        console.error('\n❌ No tasks provided.\n');
        console.error('   Example: add "Buy groceries" "Call dentist" per\n');
        process.exit(1);
      }

      // Each argument is a task (shell already parsed quotes for us)
      addMultipleTasks(taskArgs, contextArg, isRoutineAdd);
      break;

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
      // Used by sleep hook - adds auto-pause note
      pauseCurrentTaskWithNote();
      break;

    case 'p':
      // Pause current task with optional custom end time
      // Usage: p [time]
      // Examples: p, p 18:00, p 6pm
      pauseCurrentTask(args.length > 0 ? args[0] : null);
      break;

    case 'p-0':
      // Alias for 'p' - kept for backwards compatibility
      pauseCurrentTask(args.length > 0 ? args[0] : null);
      break;

    case 'delete-task':
      if (args.length < 1 || isNaN(args[0])) {
        console.error('\n❌ Usage: delete-task <task-number>\n');
        process.exit(1);
      }
      deleteTask(parseInt(args[0]));
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

    case 'note-completed':
      if (args.length < 2) {
        console.error('\n❌ Usage: note-completed <work-id> "<note text>"\n');
        process.exit(1);
      }
      addNoteToCompletedWork(args[0], args.slice(1).join(' '));
      break;

    case 'modify-context':
      if (args.length < 2 || isNaN(args[0])) {
        console.error('\n❌ Usage: modify-context <task-number> <context>\n');
        console.error('   Valid contexts: per, soc, prof, cul, proj, heal, us\n');
        console.error('   Example: modify-context 0 cul (modify current task)\n');
        console.error('   Example: modify-context 2 per (modify pending task #2)\n');
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
      // Sync today by default; sync yesterday too if arg provided
      const syncDates = [TODAY];
      if (args[0] === 'all' || args[0] === 'yesterday') {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
        syncDates.unshift(yStr);
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

        // Exchange code for tokens
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
            console.log('\n⚠️  No refresh token returned. Response:');
            console.log(JSON.stringify(tokenData, null, 2));
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

    case 'help':
    case '--help':
    case '-h':
      showUsage();
      break;

    // Quick context switching
    case 'per':
    case 'personal':
    case 'soc':
    case 'social':
    case 'prof':
    case 'professional':
    case 'cul':
    case 'cultivo':
    case 'proj':
    case 'projects':
    case 'heal':
    case 'health':
    case 'us':
    case 'unstructured':
      switchToContext(command);
      // Check if 'r' argument is present to toggle view mode
      if (args.length > 0 && args[0].toLowerCase() === 'r') {
        toggleViewMode();
      }
      break;

    case 'r':
      toggleViewMode();
      break;

    case 'all':
      clearContextFilter();
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
