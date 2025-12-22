#!/usr/bin/env node
/**
 * Journal CLI - Quick journaling and daily reflections
 * Usage: node journal-cli.js <command> [args...]
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const BASE_DIR = path.join(__dirname, '..', '..');
const DAILY_LOGS_FILE = path.join(BASE_DIR, 'journal', 'data', 'daily_logs.json');
const TEMPLATES_DIR = path.join(BASE_DIR, 'journal', 'templates');

// Load daily logs
function loadLogs() {
  if (fs.existsSync(DAILY_LOGS_FILE)) {
    return JSON.parse(fs.readFileSync(DAILY_LOGS_FILE, 'utf8'));
  }
  return { logs: [] };
}

// Save daily logs
function saveLogs(data) {
  fs.writeFileSync(DAILY_LOGS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Load template
function loadTemplate(templateName) {
  const templatePath = path.join(TEMPLATES_DIR, `${templateName}.md`);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templateName}`);
  }
  return fs.readFileSync(templatePath, 'utf8');
}

// Add a quick journal entry
function addEntry(text) {
  const data = loadLogs();
  const timestamp = new Date().toISOString();
  const date = timestamp.split('T')[0];

  const entry = {
    id: `log-${Date.now()}`,
    date: date,
    timestamp: timestamp,
    type: 'quick',
    content: text
  };

  data.logs.push(entry);
  saveLogs(data);

  console.log(`\n✅ Journal entry added (${date} ${timestamp.split('T')[1].substring(0, 8)})`);
  console.log(`   ${text}\n`);
}

// Create daily reflection
function dailyReflection() {
  const date = new Date().toISOString().split('T')[0];
  let template = loadTemplate('daily-reflection');

  template = template.replace(/\{date\}/g, date);

  console.log('\n' + '='.repeat(80));
  console.log('📔 DAILY REFLECTION TEMPLATE');
  console.log('='.repeat(80));
  console.log(template);
  console.log('='.repeat(80));
  console.log('\n💡 Tip: Copy this template and fill it in, then save as a journal entry.\n');
}

// View journal entries
function viewEntries(dateFilter) {
  const data = loadLogs();
  let logs = data.logs;

  if (dateFilter) {
    logs = logs.filter(l => l.date === dateFilter);
  } else {
    // Show last 10 entries
    logs = logs.slice(-10);
  }

  if (logs.length === 0) {
    console.log('\n📔 No journal entries found.\n');
    return;
  }

  console.log('\n' + '='.repeat(80));
  console.log('📔 JOURNAL ENTRIES');
  console.log('='.repeat(80));

  logs.forEach(log => {
    console.log(`\n[${log.date} ${log.timestamp.split('T')[1].substring(0, 8)}] ${log.type}`);
    console.log(log.content);
    console.log('-'.repeat(80));
  });

  console.log('');
}

// Show usage
function showUsage() {
  console.log(`
Usage: node journal-cli.js <command> [args...]

Commands:
  add "<text>"                    Add a quick journal entry

  daily                           Show daily reflection template

  view [date]                     View journal entries (optional: filter by date YYYY-MM-DD)
                                  Default: shows last 10 entries

  today                           View today's entries

Examples:
  node journal-cli.js add "Had a great breakthrough on the analysis refactor"
  node journal-cli.js daily
  node journal-cli.js view
  node journal-cli.js view 2025-11-14
  node journal-cli.js today
`);
}

// Main
const command = process.argv[2];
const args = process.argv.slice(3);

try {
  switch (command) {
    case 'add':
      if (args.length < 1) {
        console.error('\n❌ Usage: add "<text>"\n');
        process.exit(1);
      }
      addEntry(args.join(' '));
      break;

    case 'daily':
      dailyReflection();
      break;

    case 'view':
      viewEntries(args[0]);
      break;

    case 'today':
      const today = new Date().toISOString().split('T')[0];
      viewEntries(today);
      break;

    default:
      showUsage();
  }
} catch (error) {
  console.error(`\n❌ Error: ${error.message}\n`);
  process.exit(1);
}
