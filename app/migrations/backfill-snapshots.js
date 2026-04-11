#!/usr/bin/env node
// Backfill daily_time_snapshots from time-log.json (legacy data, no focus level)
// Run: node app/migrations/backfill-snapshots.js

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TIME_LOG_PATH = path.join(__dirname, '../../tracking/time-logs/time-log.json');

async function main() {
  const raw = JSON.parse(fs.readFileSync(TIME_LOG_PATH, 'utf8'));

  const rows = [];

  // Structure: { year: { week: { days: { YYYY-MM-DD: { context: minutes } } } } }
  for (const year of Object.values(raw)) {
    for (const week of Object.values(year)) {
      const days = week.days || {};
      for (const [date, contexts] of Object.entries(days)) {
        // Normalize context keys to lowercase short codes
        const normalized = {
          cul: contexts.cultivo || 0,
          prof: contexts.professional || 0,
          per: contexts.personal || 0,
          soc: contexts.social || 0,
          proj: contexts.projects || 0,
          heal: contexts.health || 0,
          us: contexts.unstructured || 0,
        };
        rows.push({ date, context_minutes: normalized });
      }
    }
  }

  console.log(`Backfilling ${rows.length} daily snapshots...`);

  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const result = await pool.query(
      `INSERT INTO daily_time_snapshots (date, context_minutes, source)
       VALUES ($1, $2, 'legacy')
       ON CONFLICT (date) DO NOTHING`,
      [row.date, JSON.stringify(row.context_minutes)]
    );
    if (result.rowCount > 0) inserted++;
    else skipped++;
  }

  console.log(`✅ Done: ${inserted} inserted, ${skipped} skipped (already existed)`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
