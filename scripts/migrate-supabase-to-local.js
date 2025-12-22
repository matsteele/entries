#!/usr/bin/env node

/**
 * Migration script to import data from Supabase to local PostgreSQL
 *
 * Usage: node scripts/migrate-supabase-to-local.js
 */

const { Client } = require('pg');

// Local PostgreSQL connection
const localClient = new Client({
  host: 'localhost',
  database: 'entries',
  user: process.env.USER || 'matthewsteele',
  // No password needed for local trust authentication
});

// Supabase connection (read-only, for export)
const supabaseClient = new Client({
  host: 'hjajrstidftkjwqmdung.supabase.co',
  database: 'postgres',
  user: 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD,
  port: 5432,
  ssl: { rejectUnauthorized: false }
});

async function exportFromSupabase(tableName, batchSize = 100) {
  console.log(`\n📥 Exporting ${tableName} from Supabase...`);

  const countResult = await supabaseClient.query(`SELECT COUNT(*) as count FROM ${tableName}`);
  const totalRows = parseInt(countResult.rows[0].count);
  console.log(`   Total rows to export: ${totalRows}`);

  if (totalRows === 0) {
    console.log(`   ⚠️  No data to export from ${tableName}`);
    return [];
  }

  const allData = [];
  let offset = 0;

  while (offset < totalRows) {
    const result = await supabaseClient.query(
      `SELECT * FROM ${tableName} ORDER BY created_at LIMIT $1 OFFSET $2`,
      [batchSize, offset]
    );

    allData.push(...result.rows);
    offset += batchSize;

    const progress = Math.min(offset, totalRows);
    process.stdout.write(`\r   Progress: ${progress}/${totalRows} (${Math.round(progress/totalRows*100)}%)`);
  }

  console.log(`\n   ✅ Exported ${allData.length} rows from ${tableName}`);
  return allData;
}

async function importToLocal(tableName, data) {
  if (data.length === 0) {
    console.log(`\n📦 Skipping import for ${tableName} (no data)`);
    return;
  }

  console.log(`\n📦 Importing ${data.length} rows into local ${tableName}...`);

  // Get column names from first row
  const columns = Object.keys(data[0]);

  // Build INSERT query
  const placeholders = data.map((_, i) => {
    const rowPlaceholders = columns.map((_, j) => `$${i * columns.length + j + 1}`);
    return `(${rowPlaceholders.join(', ')})`;
  }).join(', ');

  const values = data.flatMap(row => columns.map(col => row[col]));

  const query = `
    INSERT INTO ${tableName} (${columns.join(', ')})
    VALUES ${placeholders}
    ON CONFLICT (${tableName === 'journal_metadata' ? 'journal_id' : 'id'}) DO UPDATE SET
    ${columns.filter(col => col !== 'id' && col !== 'journal_id').map(col => `${col} = EXCLUDED.${col}`).join(', ')}
  `;

  try {
    await localClient.query(query, values);
    console.log(`   ✅ Imported ${data.length} rows into ${tableName}`);
  } catch (error) {
    console.error(`   ❌ Error importing to ${tableName}:`, error.message);
    throw error;
  }
}

async function migrate() {
  console.log('🚀 Starting migration from Supabase to local PostgreSQL...\n');

  try {
    // Connect to both databases
    console.log('🔌 Connecting to Supabase...');
    await supabaseClient.connect();
    console.log('   ✅ Connected to Supabase');

    console.log('🔌 Connecting to local PostgreSQL...');
    await localClient.connect();
    console.log('   ✅ Connected to local PostgreSQL');

    // Migrate journals (exclude embedding column as it's pgvector and might have issues)
    const journals = await exportFromSupabase('journals');
    const journalsWithoutEmbedding = journals.map(({ embedding, ...rest }) => rest);
    await importToLocal('journals', journalsWithoutEmbedding);

    // Migrate plans
    const plans = await exportFromSupabase('plans');
    const plansWithoutEmbedding = plans.map(({ embedding, ...rest }) => rest);
    await importToLocal('plans', plansWithoutEmbedding);

    // Migrate protocols
    const protocols = await exportFromSupabase('protocols');
    const protocolsWithoutEmbedding = protocols.map(({ embedding, ...rest }) => rest);
    await importToLocal('protocols', protocolsWithoutEmbedding);

    // Migrate journal_metadata
    const metadata = await exportFromSupabase('journal_metadata');
    await importToLocal('journal_metadata', metadata);

    // Verify migration
    console.log('\n📊 Verifying migration...');
    const localJournals = await localClient.query('SELECT COUNT(*) FROM journals');
    const localPlans = await localClient.query('SELECT COUNT(*) FROM plans');
    const localProtocols = await localClient.query('SELECT COUNT(*) FROM protocols');
    const localMetadata = await localClient.query('SELECT COUNT(*) FROM journal_metadata');

    console.log(`\n✅ Migration complete!`);
    console.log(`   Journals: ${localJournals.rows[0].count}`);
    console.log(`   Plans: ${localPlans.rows[0].count}`);
    console.log(`   Protocols: ${localProtocols.rows[0].count}`);
    console.log(`   Metadata: ${localMetadata.rows[0].count}`);

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await supabaseClient.end();
    await localClient.end();
  }
}

// Run migration
migrate().catch(console.error);
