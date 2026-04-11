#!/usr/bin/env node
// Migrate existing sessions from completed.json into task_sessions table
// Focus defaults: routine=1, novel=2, unstructured=0
// Run: node app/migrations/backfill-sessions.js

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const COMPLETED_PATH = path.join(__dirname, '../../tracking/completed.json');
const ROUTINE_PATH = path.join(__dirname, '../../tracking/routine.json');

function getFocusDefault(task) {
  if (task.activityContext === 'us' || task.activityContext === 'unstructured') return 0;
  if (task.focusLevel !== undefined && task.focusLevel !== null) return task.focusLevel;
  return 2; // novel default
}

function getRoutineFocusDefault(task) {
  if (task.focusLevel !== undefined && task.focusLevel !== null) return task.focusLevel;
  return 1; // routine default
}

async function main() {
  const completed = JSON.parse(fs.readFileSync(COMPLETED_PATH, 'utf8'));
  const routine = JSON.parse(fs.readFileSync(ROUTINE_PATH, 'utf8'));

  let inserted = 0;
  let skipped = 0;

  const processTask = async (task, isRoutine) => {
    const sessions = task.sessions || [];
    const focusLevel = isRoutine ? getRoutineFocusDefault(task) : getFocusDefault(task);
    const context = task.activityContext || 'prof';

    for (const session of sessions) {
      if (!session.startedAt || !session.endedAt) { skipped++; continue; }

      const result = await pool.query(
        `INSERT INTO task_sessions (task_id, task_title, context, focus_level, started_at, ended_at, source)
         VALUES ($1, $2, $3, $4, $5, $6, 'migrated')
         ON CONFLICT DO NOTHING`,
        [
          task.id || 'unknown',
          task.title || 'Unknown',
          context,
          focusLevel,
          session.startedAt,
          session.endedAt,
        ]
      );
      if (result.rowCount > 0) inserted++;
      else skipped++;
    }
  };

  console.log(`Migrating ${completed.length} completed tasks...`);
  for (const task of completed) await processTask(task, false);

  console.log(`Migrating ${routine.length} routine tasks...`);
  for (const task of routine) await processTask(task, true);

  console.log(`✅ Done: ${inserted} sessions inserted, ${skipped} skipped`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
