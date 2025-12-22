#!/usr/bin/env node
/**
 * Daily Planning CLI - Session-based daily planning
 * Usage: node daily-cli.js <command> [args...]
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const BASE_DIR = path.join(__dirname, '..', '..');
const DAILY_PLAN_FILE = path.join(BASE_DIR, '.current_day_plan.json');
const PLANS_FILE = path.join(BASE_DIR, 'plans', 'data', 'plans.json');

// Load daily plan
function loadDailyPlan() {
  if (fs.existsSync(DAILY_PLAN_FILE)) {
    return JSON.parse(fs.readFileSync(DAILY_PLAN_FILE, 'utf8'));
  }
  return {
    date: null,
    started_at: null,
    reflection: '',
    priorities: [],
    time_blocks: [],
    logistics: [],
    health_notes: [],
    status: 'not_started'
  };
}

// Save daily plan
function saveDailyPlan(plan) {
  fs.writeFileSync(DAILY_PLAN_FILE, JSON.stringify(plan, null, 2), 'utf8');
}

// Load saved plans
function loadSavedPlans() {
  if (fs.existsSync(PLANS_FILE)) {
    return JSON.parse(fs.readFileSync(PLANS_FILE, 'utf8'));
  }
  return { plans: [] };
}


// Start daily planning with reflection
async function startDailyPlanning() {
  const today = new Date().toISOString().split('T')[0];
  const plan = loadDailyPlan();

  // Check if already planning for today
  if (plan.date === today && plan.status !== 'not_started') {
    console.log(`\n📅 Already planning for ${today}`);
    console.log(`Status: ${plan.status}\n`);
    console.log('Use "daily view" to see your plan or "daily start --reset" to restart.\n');
    return;
  }

  // Initialize new daily plan
  plan.date = today;
  plan.started_at = new Date().toISOString();
  plan.reflection = '';
  plan.priorities = [];
  plan.time_blocks = [];
  plan.logistics = [];
  plan.health_notes = [];
  plan.status = 'planning';

  console.log('\n' + '='.repeat(80));
  console.log(`📅 DAILY PLANNING - ${today}`);
  console.log('='.repeat(80));
  console.log('\n💭 Let\'s start with some reflection. Type or paste your thoughts.');
  console.log('   (Press Ctrl+D when done, or type "done" on a new line)\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  let reflection = '';

  rl.on('line', (line) => {
    if (line.trim().toLowerCase() === 'done') {
      rl.close();
    } else {
      reflection += line + '\n';
    }
  });

  rl.on('close', () => {
    plan.reflection = reflection.trim();
    saveDailyPlan(plan);
    updateMode('planning');

    console.log('\n✅ Reflection captured!\n');
    console.log('Next steps:');
    console.log('  - daily add-priority "<priority>"');
    console.log('  - daily add-block <time> "<activity>" [plan-id]');
    console.log('  - daily add-logistics "<item>"');
    console.log('  - daily add-health "<note>"');
    console.log('  - daily view');
    console.log('  - daily complete (when ready to start your day)\n');
  });
}

// Add priority
function addPriority(text) {
  const plan = loadDailyPlan();

  if (plan.status === 'not_started') {
    console.error('\n❌ No daily plan started. Run "daily start" first.\n');
    return;
  }

  plan.priorities.push({
    text: text,
    added_at: new Date().toISOString()
  });

  saveDailyPlan(plan);
  console.log(`\n✅ Priority added: ${text}\n`);
}

// Add time block
function addTimeBlock(time, activity, planId = null) {
  const plan = loadDailyPlan();

  if (plan.status === 'not_started') {
    console.error('\n❌ No daily plan started. Run "daily start" first.\n');
    return;
  }

  // Validate plan ID if provided
  if (planId) {
    const savedPlans = loadSavedPlans();
    const planExists = savedPlans.plans.some(p => p.id === planId);
    if (!planExists) {
      console.error(`\n❌ Plan ID not found: ${planId}\n`);
      return;
    }
  }

  plan.time_blocks.push({
    time: time,
    activity: activity,
    plan_id: planId,
    added_at: new Date().toISOString()
  });

  saveDailyPlan(plan);
  console.log(`\n✅ Time block added: ${time} - ${activity}${planId ? ` (${planId})` : ''}\n`);
}

// Add logistics item
function addLogistics(text) {
  const plan = loadDailyPlan();

  if (plan.status === 'not_started') {
    console.error('\n❌ No daily plan started. Run "daily start" first.\n');
    return;
  }

  plan.logistics.push({
    text: text,
    added_at: new Date().toISOString()
  });

  saveDailyPlan(plan);
  console.log(`\n✅ Logistics added: ${text}\n`);
}

// Add health note
function addHealthNote(text) {
  const plan = loadDailyPlan();

  if (plan.status === 'not_started') {
    console.error('\n❌ No daily plan started. Run "daily start" first.\n');
    return;
  }

  plan.health_notes.push({
    text: text,
    added_at: new Date().toISOString()
  });

  saveDailyPlan(plan);
  console.log(`\n✅ Health note added: ${text}\n`);
}

// View current daily plan
function viewDailyPlan() {
  const plan = loadDailyPlan();

  if (plan.status === 'not_started') {
    console.log('\n📅 No daily plan for today yet. Run "daily start" to begin.\n');
    return;
  }

  const savedPlans = loadSavedPlans();

  console.log('\n' + '='.repeat(80));
  console.log(`📅 DAILY PLAN - ${plan.date}`);
  console.log('='.repeat(80));
  console.log(`Status: ${plan.status}`);
  console.log('='.repeat(80));

  if (plan.reflection) {
    console.log('\n💭 Reflection:\n');
    console.log(plan.reflection);
    console.log('\n' + '-'.repeat(80));
  }

  if (plan.priorities.length > 0) {
    console.log('\n🎯 Priorities:\n');
    plan.priorities.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.text}`);
    });
    console.log('\n' + '-'.repeat(80));
  }

  if (plan.time_blocks.length > 0) {
    console.log('\n📅 Time Blocks:\n');
    plan.time_blocks.forEach(block => {
      let line = `  ${block.time} - ${block.activity}`;
      if (block.plan_id) {
        const linkedPlan = savedPlans.plans.find(p => p.id === block.plan_id);
        if (linkedPlan) {
          line += ` [${linkedPlan.title}]`;
        }
      }
      console.log(line);
    });
    console.log('\n' + '-'.repeat(80));
  }

  if (plan.logistics.length > 0) {
    console.log('\n📦 Logistics:\n');
    plan.logistics.forEach(item => {
      console.log(`  - ${item.text}`);
    });
    console.log('\n' + '-'.repeat(80));
  }

  if (plan.health_notes.length > 0) {
    console.log('\n💪 Health Notes:\n');
    plan.health_notes.forEach(note => {
      console.log(`  - ${note.text}`);
    });
    console.log('\n' + '-'.repeat(80));
  }

  console.log('');
}

// Complete daily planning
function completeDailyPlanning() {
  const plan = loadDailyPlan();

  if (plan.status === 'not_started') {
    console.error('\n❌ No daily plan started. Run "daily start" first.\n');
    return;
  }

  plan.status = 'active';
  saveDailyPlan(plan);

  console.log('\n✅ Daily plan complete!');
  console.log('\nYou can now:');
  console.log('  - Begin working on your priorities');
  console.log('  - Add journal entries as you work');
  console.log('  - View your plan anytime with "daily view"\n');
}

// Show usage
function showUsage() {
  console.log(`
Usage: node daily-cli.js <command> [args...]

Commands:
  start                           Start daily planning with reflection

  add-priority "<text>"           Add a priority for the day

  add-block <time> "<activity>" [plan-id]
                                  Add a time block (e.g., "9:00" "Work on X")
                                  Optional: link to a saved plan

  add-logistics "<text>"          Add a logistics item

  add-health "<text>"             Add a health note

  view                            View current daily plan

  complete                        Mark planning complete and begin your day

Examples:
  node daily-cli.js start
  node daily-cli.js add-priority "Make progress on cultivo tasks"
  node daily-cli.js add-block "9:00-11:00" "Work at Beano cafe" plan-1763101682932
  node daily-cli.js add-logistics "Book Airbnb before 10am"
  node daily-cli.js add-health "Rotator cuff - ice after workout"
  node daily-cli.js view
  node daily-cli.js complete
`);
}

// Main
const command = process.argv[2];
const args = process.argv.slice(3);

try {
  switch (command) {
    case 'start':
      startDailyPlanning();
      break;

    case 'add-priority':
      if (args.length < 1) {
        console.error('\n❌ Usage: add-priority "<text>"\n');
        process.exit(1);
      }
      addPriority(args.join(' '));
      break;

    case 'add-block':
      if (args.length < 2) {
        console.error('\n❌ Usage: add-block <time> "<activity>" [plan-id]\n');
        process.exit(1);
      }
      const time = args[0];
      const planId = args.length > 2 ? args[args.length - 1] : null;
      const activity = planId && planId.startsWith('plan-')
        ? args.slice(1, -1).join(' ')
        : args.slice(1).join(' ');
      addTimeBlock(time, activity, planId && planId.startsWith('plan-') ? planId : null);
      break;

    case 'add-logistics':
      if (args.length < 1) {
        console.error('\n❌ Usage: add-logistics "<text>"\n');
        process.exit(1);
      }
      addLogistics(args.join(' '));
      break;

    case 'add-health':
      if (args.length < 1) {
        console.error('\n❌ Usage: add-health "<text>"\n');
        process.exit(1);
      }
      addHealthNote(args.join(' '));
      break;

    case 'view':
      viewDailyPlan();
      break;

    case 'complete':
      completeDailyPlanning();
      break;

    default:
      showUsage();
  }
} catch (error) {
  console.error(`\n❌ Error: ${error.message}\n`);
  process.exit(1);
}
