#!/usr/bin/env node
/**
 * Daily Log CLI - Track current task, completed work, and pending tasks
 * Usage: node daily-log-cli.js <command> [args...]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const fs = require('fs');
const path = require('path');

// Constants
const BASE_DIR = path.join(__dirname, '..', '..');
const LOG_DIR = path.join(BASE_DIR, 'daily-logs');

// Context emoji mapping
const CONTEXT_EMOJI_MAP = {
  personal: '🏠',
  social: '👥',
  professional: '💼',
  cultivo: '🌱',
  projects: '🚀'
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
      projects: 0
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
      projects: 0
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
    projects: 0
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

  // Add current task time (if exists and not context-only)
  if (log.currentTask && !log.currentTask.isContextOnly) {
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

  const personalKeywords = [
    'dentist', 'doctor', 'appointment', 'personal', 'family', 'health',
    'medical', 'vacation', 'sick', 'home', 'pet', 'errand', 'errands',
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

  const professionalKeywords = [
    'meeting', 'interview', 'job', 'career', 'resume', 'work',
    'presentation', 'conference', 'networking'
  ];

  // Check in priority order: cultivo -> personal -> social -> projects -> professional
  for (const keyword of cultivoKeywords) {
    if (lower.includes(keyword)) {
      return 'cultivo';
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
    // Also accept full names
    'personal': 'personal',
    'social': 'social',
    'professional': 'professional',
    'cultivo': 'cultivo',
    'projects': 'projects'
  };

  const normalized = contextMap[contextCode?.toLowerCase()];
  if (!normalized) {
    console.error(`\n❌ Invalid context code: ${contextCode}`);
    console.error(`   Valid codes: per, soc, prof, cul, proj\n`);
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
      }
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
    notes: []
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
    }
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
      notes: []
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

  // Parse context - supports both --c flag and simple trailing context code
  let contextOverride = null;
  let cleanDesc = description;

  // First try --c flag format (backward compatibility)
  const flagMatch = description.match(/--c[=\s]+(per|soc|prof|cul|proj|personal|social|professional|cultivo|projects)/i);
  if (flagMatch) {
    contextOverride = normalizeContext(flagMatch[1]);
    // Remove the --c flag from description
    cleanDesc = description.replace(/--c[=\s]+(per|soc|prof|cul|proj|personal|social|professional|cultivo|projects)/gi, '').trim();
  } else {
    // Try simple trailing context code format: "task description cul"
    const simpleMatch = description.match(/\s+(per|soc|prof|cul|proj|personal|social|professional|cultivo|projects)$/i);
    if (simpleMatch) {
      contextOverride = normalizeContext(simpleMatch[1]);
      // Remove the context code from description
      cleanDesc = description.replace(/\s+(per|soc|prof|cul|proj|personal|social|professional|cultivo|projects)$/i, '').trim();
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

  logData.dailyLog.pendingTasks.push(entry);
  saveDailyLog(logData);

  const contextEmoji = CONTEXT_EMOJI_MAP[activityContext] || '💼';
  const priorityEmoji = priority === 'high' ? '🔴' : priority === 'low' ? '🟢' : '🟡';
  console.log(`\n✅ Pending task added:`);
  console.log(`   ${contextEmoji} ${priorityEmoji} [${priority.toUpperCase()}] ${cleanDesc}\n`);
}

function addMultipleTasks(tasksArray, contextOverride) {
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

    logData.dailyLog.pendingTasks.push(entry);
    
    const contextEmoji = CONTEXT_EMOJI_MAP[activityContext] || '💼';
    const priorityEmoji = priority === 'high' ? '🔴' : priority === 'low' ? '🟢' : '🟡';
    added.push(`${contextEmoji} ${priorityEmoji} ${finalDesc}`);
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

  // Parse context - supports both --c flag and simple trailing context code
  let contextOverride = null;
  let cleanDesc = description;

  // First try --c flag format (backward compatibility)
  const flagMatch = description.match(/--c[=\s]+(per|soc|prof|cul|proj|personal|social|professional|cultivo|projects)/i);
  if (flagMatch) {
    contextOverride = normalizeContext(flagMatch[1]);
    cleanDesc = description.replace(/--c[=\s]+(per|soc|prof|cul|proj|personal|social|professional|cultivo|projects)/gi, '').trim();
  } else {
    // Try simple trailing context code format: "task description cul"
    const simpleMatch = description.match(/\s+(per|soc|prof|cul|proj|personal|social|professional|cultivo|projects)$/i);
    if (simpleMatch) {
      contextOverride = normalizeContext(simpleMatch[1]);
      cleanDesc = description.replace(/\s+(per|soc|prof|cul|proj|personal|social|professional|cultivo|projects)$/i, '').trim();
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

  // If there's a current task, move it to pending
  if (logData.dailyLog.currentTask) {
    const prevTask = logData.dailyLog.currentTask;
    const elapsedMinutes = calculateElapsedMinutes(prevTask.startedAt);
    const timeSpent = (prevTask.timeSpent || 0) + elapsedMinutes;

    const pendingEntry = {
      id: generateId(),
      title: prevTask.title,
      activityContext: prevTask.activityContext,
      category: categorizeWork(prevTask.title),
      priority: 'medium',
      timeSpent: timeSpent,
      notes: prevTask.notes || []
    };

    logData.dailyLog.pendingTasks.push(pendingEntry);

    const contextEmojiMap = CONTEXT_EMOJI_MAP;
    const contextEmoji = contextEmojiMap[prevTask.activityContext] || '💼';
    const timeStr = formatTimeSpent(timeSpent);
    console.log(`\n⏸️  Previous task moved to pending: ${contextEmoji} ${prevTask.title} (${timeStr})`);
  }

  // Set the new task as current
  logData.dailyLog.currentTask = {
    title: cleanDesc,
    startedAt: timestamp,
    context: cleanDesc,
    activityContext: activityContext,
    timeSpent: 0,
    notes: [],
    isContextOnly: false  // Real task, not just context tracking
  };

  saveDailyLog(logData);

  const contextEmoji = CONTEXT_EMOJI_MAP[activityContext] || '💼';
  const priorityEmoji = priority === 'high' ? '🔴' : priority === 'low' ? '🟢' : '🟡';
  console.log(`\n✅ Task added and set as current:`);
  console.log(`   ${contextEmoji} [${activityContext.toUpperCase()}] ${cleanDesc}\n`);
}

// Helper function to get tasks in display order
function getDisplayOrderedTasks(allTasks, contextFilter) {
  if (contextFilter) {
    // Filtered mode: only return tasks matching the filter
    return allTasks.filter(t => (t.activityContext || 'professional') === contextFilter);
  } else {
    // No filter: return tasks ordered by context groups
    const contextOrder = ['personal', 'cultivo', 'professional', 'social', 'projects'];
    const displayOrderTasks = [];

    contextOrder.forEach(ctx => {
      const contextTasks = allTasks.filter(task => (task.activityContext || 'professional') === ctx);
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
  const pendingTasks = getDisplayOrderedTasks(logData.dailyLog.pendingTasks, contextFilter);

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
      const completedEntry = {
        id: generateId(),
        timestamp: new Date().toISOString(),
        category: 'Context',
        title: prevTask.title,
        activityContext: prevTask.activityContext,
        timeSpent: timeSpent,
        details: {
          completedAt: new Date().toISOString()
        }
      };
      logData.dailyLog.completedWork.push(completedEntry);
      
      const contextEmojiMap = CONTEXT_EMOJI_MAP;
      const contextEmoji = contextEmojiMap[prevTask.activityContext] || '💼';
      const timeStr = formatTimeSpent(timeSpent);
      console.log(`\n⏸️  ${contextEmoji} ${prevTask.activityContext} context time logged: ${timeStr}`);
    } else {
      // Regular task - move to pending
      const pendingEntry = {
        id: generateId(),
        title: prevTask.title,
        activityContext: prevTask.activityContext,
        category: categorizeWork(prevTask.title),
        priority: 'medium',  // Default priority when moving current to pending
        timeSpent: timeSpent,
        notes: prevTask.notes || []  // Preserve notes when switching tasks
      };

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

  logData.dailyLog.currentTask = {
    title: taskTitle,
    startedAt: timestamp,
    context: taskTitle,
    activityContext: activityContext,
    timeSpent: pendingTask.timeSpent || 0,
    notes: pendingTask.notes || [],  // Preserve notes from pending task
    isContextOnly: false  // Real task, not just context tracking
  };

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
  const pendingTasks = getDisplayOrderedTasks(logData.dailyLog.pendingTasks, contextFilter);

  const taskIndex = taskNumber - 1;

  if (taskIndex < 0 || taskIndex >= pendingTasks.length) {
    console.error(`\n❌ Invalid task number. You have ${pendingTasks.length} ${contextFilter ? contextFilter : ''} pending tasks.\n`);
    process.exit(1);
  }

  const taskToComplete = pendingTasks[taskIndex];
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
    }
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
  const pendingTasks = getDisplayOrderedTasks(logData.dailyLog.pendingTasks, contextFilter);

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
          }
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
      }
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

  const pendingEntry = {
    id: generateId(),
    title: currentTask.title,
    activityContext: currentTask.activityContext,
    category: categorizeWork(currentTask.title),
    priority: 'medium',
    timeSpent: timeSpent,
    notes: notes
  };

  logData.dailyLog.pendingTasks.push(pendingEntry);
  logData.dailyLog.currentTask = null;

  saveDailyLog(logData);

  const contextEmojiMap = CONTEXT_EMOJI_MAP;
  const contextEmoji = contextEmojiMap[currentTask.activityContext] || '💼';
  const timeStr = formatTimeSpent(timeSpent);

  if (addNote) {
    console.log(`\n⏸️  Task auto-paused: ${contextEmoji} ${currentTask.title} (${timeStr})\n`);
  } else if (customEndTime) {
    console.log(`\n⏸️  Task paused at ${endTime.toLocaleTimeString()}: ${contextEmoji} ${currentTask.title} (${timeStr})\n`);
  } else {
    console.log(`\n✅ Moved to pending: ${contextEmoji} ${currentTask.title} (${timeStr})\n`);
  }
}

function pauseCurrentTaskWithNote() {
  // Used by sleep hook - adds auto-pause note
  pauseCurrentTask(null, 'Auto-paused (laptop sleep)');
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
    }
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
    notes: pendingTask.notes || []
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
  const pendingTasks = getDisplayOrderedTasks(logData.dailyLog.pendingTasks, contextFilter);

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
  const pendingTasks = getDisplayOrderedTasks(logData.dailyLog.pendingTasks, contextFilter);

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

function clearContextFilter() {
  const logData = loadDailyLog();
  logData.dailyLog.contextFilter = null;
  saveDailyLog(logData);

  console.log(`\n✅ Context filter cleared. Showing all tasks (${logData.dailyLog.pendingTasks.length} total)\n`);
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

    // Only move to pending if it's not a context-only task
    if (!prevTask.isContextOnly) {
      const pendingEntry = {
        id: generateId(),
        title: prevTask.title,
        activityContext: prevTask.activityContext,
        category: categorizeWork(prevTask.title),
        priority: 'medium',
        timeSpent: timeSpent,
        notes: prevTask.notes || []
      };

      logData.dailyLog.pendingTasks.push(pendingEntry);

      const contextEmojiMap = CONTEXT_EMOJI_MAP;
      const contextEmoji = contextEmojiMap[prevTask.activityContext] || '💼';
      const timeStr = formatTimeSpent(timeSpent);
      console.log(`\n⏸️  ${contextEmoji} ${prevTask.title} ${timeStr}`);
    }
  }

  // Clear current task and just set context filter
  logData.dailyLog.currentTask = null;
  logData.dailyLog.contextFilter = context;

  saveDailyLog(logData);

  const contextEmoji = CONTEXT_EMOJI_MAP[context] || '💼';
  const filteredTasks = logData.dailyLog.pendingTasks.filter(t =>
    (t.activityContext || 'professional') === context
  );
  console.log(`\n✅ ${contextEmoji} ${filteredTasks.length} task(s)\n`);
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
    console.log(`   ${contextEmoji} ${contextLabel} ${log.currentTask.title}`);
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
  const filteredTasks = contextFilter
    ? log.pendingTasks.filter(task => (task.activityContext || 'professional') === contextFilter)
    : log.pendingTasks;

  console.log('\n📋 PENDING TASKS:');
  if (contextFilter) {
    const contextEmoji = CONTEXT_EMOJI_MAP[contextFilter] || '💼';
    console.log(`   ${contextEmoji} Filtered by: ${contextFilter.toUpperCase()} (${filteredTasks.length}/${log.pendingTasks.length} tasks)`);
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
      const displayOrderTasks = getDisplayOrderedTasks(log.pendingTasks, null);

      let taskNum = 1;
      let currentContext = null;

      displayOrderTasks.forEach(task => {
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

function startNewDay() {
  // Find the last available day with a log file
  const lastAvailableDay = findLastAvailableDay();

  // Archive yesterday's time to weekly logs
  if (lastAvailableDay) {
    try {
      const timeTracker = require('./time-tracker');
      const result = timeTracker.archiveDayTime(lastAvailableDay);
      if (result) {
        console.log(`\n📊 Time archived for ${lastAvailableDay}:`);
        const { cultivo, personal, professional, projects, social } = result.contextTimes;
        const total = cultivo + personal + professional + projects + social;
        if (total > 0) {
          if (cultivo > 0) console.log(`   🌱 Cultivo: ${formatTimeSpent(cultivo)}`);
          if (personal > 0) console.log(`   🏠 Personal: ${formatTimeSpent(personal)}`);
          if (professional > 0) console.log(`   💼 Professional: ${formatTimeSpent(professional)}`);
          if (projects > 0) console.log(`   🚀 Projects: ${formatTimeSpent(projects)}`);
          if (social > 0) console.log(`   👥 Social: ${formatTimeSpent(social)}`);
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

  console.log('\n🔄 Fetching assigned Jira tickets from Cultivo...\n');

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
      jql: 'assignee=currentUser() AND status NOT IN (Done, Closed) ORDER BY updated DESC',
      maxResults: 20,
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

    // Get existing pending task titles to avoid duplicates
    const existingTasks = logData.dailyLog.pendingTasks
      .filter(t => t && t.title)
      .map(t => t.title.toLowerCase());

    console.log(`📋 Found ${data.issues.length} active ticket(s):\n`);

    for (const issue of data.issues) {
      const ticketKey = issue.key;
      const summary = issue.fields.summary;
      const status = issue.fields.status.name;
      const priority = issue.fields.priority?.name || 'Medium';
      const ticketUrl = `https://cultivo.atlassian.net/browse/${ticketKey}`;

      // Create task title with ticket number
      const taskTitle = `[${ticketKey}] ${summary}`;

      // Check if this ticket is already in pending tasks
      const isDuplicate = existingTasks.some(title =>
        title.includes(ticketKey.toLowerCase()) ||
        title.includes(summary.toLowerCase())
      );

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

    saveDailyLog(logData);

    console.log(`\n✅ Added ${addedCount} ticket(s) to pending tasks.`);

    if (addedCount > 0) {
      console.log(`\n💡 Use /t -N to switch to a task, or /t show to see all tasks.\n`);
    } else {
      console.log(`\n💡 All tickets are already in your pending tasks.\n`);
    }

  } catch (error) {
    console.error(`\n❌ Error fetching Jira tickets: ${error.message}\n`);
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

FEATURES:
  • Bulk operations automatically handle index shifting when deleting/completing
  • Multi-task add respects current context filter, defaults to personal
  • Context can be specified per-task or inherited from current filter
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
      
      // Check if the last argument is a context code
      let contextArg = null;
      let taskArgs = args;
      
      const lastArg = args[args.length - 1];
      const contextMatch = lastArg.match(/^(per|soc|prof|cul|proj|personal|social|professional|cultivo|projects)$/i);
      if (contextMatch) {
        contextArg = contextMatch[1];
        taskArgs = args.slice(0, -1);
      }
      
      if (taskArgs.length === 0) {
        console.error('\n❌ No tasks provided.\n');
        console.error('   Example: add "Buy groceries" "Call dentist" per\n');
        process.exit(1);
      }
      
      // Each argument is a task (shell already parsed quotes for us)
      addMultipleTasks(taskArgs, contextArg);
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

    case 'jira':
      pullJiraTickets();
      break;

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
      switchToContext(command);
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
