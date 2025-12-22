#!/usr/bin/env node
/**
 * Plan CLI - Create and manage strategic plans
 * Usage: node plan-cli.js <command> [args...]
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const BASE_DIR = path.join(__dirname, '..', '..');
const PLANS_FILE = path.join(BASE_DIR, 'plans', 'data', 'plans.json');
const PLANS_DIR = path.join(BASE_DIR, 'plans', 'active');
const TEMPLATES_DIR = path.join(BASE_DIR, 'plans', 'templates');

// Load plans
function loadPlans() {
  if (fs.existsSync(PLANS_FILE)) {
    return JSON.parse(fs.readFileSync(PLANS_FILE, 'utf8'));
  }
  return { plans: [] };
}

// Save plans
function savePlans(data) {
  fs.writeFileSync(PLANS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Load template
function loadTemplate(templateType) {
  const templatePath = path.join(TEMPLATES_DIR, `${templateType}.md`);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templateType}`);
  }
  return fs.readFileSync(templatePath, 'utf8');
}

// Sanitize title for filename
function sanitizeFilename(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '')      // Remove leading/trailing hyphens
    .substring(0, 100);            // Limit length
}

// Create a new plan
function createPlan(type, title, contextId, objectiveId, projectId) {
  const data = loadPlans();
  const planId = `plan-${Date.now()}`;
  const date = new Date().toISOString().split('T')[0];

  // Load template
  let template = loadTemplate(type);

  // Replace placeholders
  template = template
    .replace(/\{plan_id\}/g, planId)
    .replace(/\{date\}/g, date)
    .replace(/\{context\}/g, contextId || 'Not specified')
    .replace(/\{objective\}/g, objectiveId || 'Not specified')
    .replace(/\{project\}/g, projectId || 'Not specified')
    .replace(/\[Project Name\]/g, title || 'Untitled Plan')
    .replace(/\[Feature Name\]/g, title || 'Untitled Feature');

  // Create plan metadata
  const planTitle = title || 'Untitled Plan';
  const filename = `plan-${sanitizeFilename(planTitle)}.md`;
  
  const plan = {
    id: planId,
    title: planTitle,
    type: type,
    status: 'draft',
    context_id: contextId || null,
    objective_id: objectiveId || null,
    project_id: projectId || null,
    created: date,
    updated: date,
    file: filename,
    generated_tasks: [],
    tags: []
  };

  // Save plan to active directory
  const planPath = path.join(PLANS_DIR, plan.file);
  fs.writeFileSync(planPath, template, 'utf8');

  // Add to plans data
  data.plans.push(plan);
  savePlans(data);

  console.log(`\n✅ Plan created: ${planId}`);
  console.log(`   Title: ${plan.title}`);
  console.log(`   Type: ${plan.type}`);
  console.log(`   File: plans/active/${plan.file}`);
  console.log(`\n📝 Edit the plan: plans/active/${plan.file}\n`);

  return plan;
}

// List all plans
function listPlans(status) {
  const data = loadPlans();
  let plans = data.plans;

  if (status) {
    plans = plans.filter(p => p.status === status);
  }

  if (plans.length === 0) {
    console.log('\n📋 No plans found.\n');
    return;
  }

  console.log('\n' + '='.repeat(80));
  console.log('📋 PLANS');
  console.log('='.repeat(80));

  plans.forEach(plan => {
    console.log(`\n${plan.id}`);
    console.log(`  Title: ${plan.title}`);
    console.log(`  Type: ${plan.type}`);
    console.log(`  Status: ${plan.status}`);
    if (plan.context_id) console.log(`  Context: ${plan.context_id}`);
    if (plan.project_id) console.log(`  Project: ${plan.project_id}`);
    console.log(`  Created: ${plan.created}`);
    console.log(`  Tasks: ${plan.generated_tasks.length}`);
  });

  console.log('\n' + '='.repeat(80) + '\n');
}

// View a plan
function viewPlan(planId) {
  const data = loadPlans();
  const plan = data.plans.find(p => p.id === planId);

  if (!plan) {
    console.error(`\n❌ Plan not found: ${planId}\n`);
    return;
  }

  const planPath = path.join(PLANS_DIR, plan.file);

  if (!fs.existsSync(planPath)) {
    console.error(`\n❌ Plan file not found: ${plan.file}\n`);
    return;
  }

  const content = fs.readFileSync(planPath, 'utf8');

  console.log('\n' + '='.repeat(80));
  console.log(`📄 ${plan.title}`);
  console.log('='.repeat(80));
  console.log(content);
  console.log('='.repeat(80) + '\n');
}

// Update plan status
function updateStatus(planId, newStatus) {
  const data = loadPlans();
  const plan = data.plans.find(p => p.id === planId);

  if (!plan) {
    console.error(`\n❌ Plan not found: ${planId}\n`);
    return;
  }

  plan.status = newStatus;
  plan.updated = new Date().toISOString().split('T')[0];
  savePlans(data);

  console.log(`\n✅ Plan ${planId} status updated to: ${newStatus}\n`);
}

// Delete a plan
function deletePlan(planId) {
  const data = loadPlans();
  const planIndex = data.plans.findIndex(p => p.id === planId);

  if (planIndex === -1) {
    console.error(`\n❌ Plan not found: ${planId}\n`);
    return;
  }

  const plan = data.plans[planIndex];
  const planPath = path.join(PLANS_DIR, plan.file);

  // Delete file
  if (fs.existsSync(planPath)) {
    fs.unlinkSync(planPath);
  }

  // Remove from data
  data.plans.splice(planIndex, 1);
  savePlans(data);

  console.log(`\n✅ Plan deleted: ${planId}\n`);
}

// Show usage
function showUsage() {
  console.log(`
Usage: node plan-cli.js <command> [args...]

Commands:
  create <type> <title> [context] [objective] [project]
                                  Create new plan from template
                                  Types: project-plan, feature-spec

  list [status]                   List all plans (optional: filter by status)

  view <plan-id>                  View plan content

  status <plan-id> <new-status>   Update plan status
                                  Status: draft, active, completed, archived

  delete <plan-id>                Delete a plan

  templates                       List available templates

Examples:
  node plan-cli.js create project-plan "Refactor Analysis Service" cultivo
  node plan-cli.js list
  node plan-cli.js list active
  node plan-cli.js view plan-1234567890
  node plan-cli.js status plan-1234567890 active
`);
}

// List templates
function listTemplates() {
  const templates = fs.readdirSync(TEMPLATES_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace('.md', ''));

  console.log('\n📑 Available Templates:\n');
  templates.forEach(t => console.log(`  - ${t}`));
  console.log('');
}

// Main
const command = process.argv[2];
const args = process.argv.slice(3);

try {
  switch (command) {
    case 'create':
      if (args.length < 2) {
        console.error('\n❌ Usage: create <type> <title> [context] [objective] [project]\n');
        process.exit(1);
      }
      createPlan(args[0], args[1], args[2], args[3], args[4]);
      break;

    case 'list':
      listPlans(args[0]);
      break;

    case 'view':
      if (args.length < 1) {
        console.error('\n❌ Usage: view <plan-id>\n');
        process.exit(1);
      }
      viewPlan(args[0]);
      break;

    case 'status':
      if (args.length < 2) {
        console.error('\n❌ Usage: status <plan-id> <new-status>\n');
        process.exit(1);
      }
      updateStatus(args[0], args[1]);
      break;

    case 'delete':
      if (args.length < 1) {
        console.error('\n❌ Usage: delete <plan-id>\n');
        process.exit(1);
      }
      deletePlan(args[0]);
      break;

    case 'templates':
      listTemplates();
      break;

    default:
      showUsage();
  }
} catch (error) {
  console.error(`\n❌ Error: ${error.message}\n`);
  process.exit(1);
}
