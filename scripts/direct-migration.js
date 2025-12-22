#!/usr/bin/env node

/**
 * Direct migration script - exports Supabase data to SQL and imports to local PostgreSQL
 * This bypasses the need for MCP password by using pg_dump-like approach
 *
 * Usage: node scripts/direct-migration.js export
 *        node scripts/direct-migration.js import
 */

const { Client } = require('pg');
const fs = require('fs').promises;

const command = process.argv[2];

// Supabase connection (using publicly available info from previous context)
const supabaseClient = new Client({
  host: 'hjajrstidftkjwqmdung.supabase.co',
  database: 'postgres',
  user: 'postgres.hjajrstidftkjwqmdung',
  password: process.env.SUPABASE_PASSWORD,
  port: 6543, // Supabase pooler port
  ssl: { rejectUnauthorized: false }
});

// Local PostgreSQL connection
const localClient = new Client({
  host: 'localhost',
  database: 'entries',
  user: process.env.USER || 'matthewsteele',
});

async function exportTable(client, tableName) {
  console.log(`\n📥 Exporting ${tableName}...`);
  
  const countResult = await client.query(`SELECT COUNT(*) as count FROM ${tableName}`);
  const count = parseInt(countResult.rows[0].count);
  console.log(`   Total rows: ${count}`);
  
  if (count === 0) {
    console.log(`   ⚠️  No data to export`);
    return [];
  }
  
  // Get all data (excluding embedding column if it exists)
  const result = await client.query(`
    SELECT ${tableName === 'journal_metadata' ? '*' : 'id, date, content, type, context, summary, word_count, created_at, updated_at'}
    FROM ${tableName}
    ORDER BY created_at
  `);
  
  console.log(`   ✅ Exported ${result.rows.length} rows`);
  return result.rows;
}

async function importTable(client, tableName, data) {
  if (data.length === 0) {
    console.log(`\n📦 Skipping ${tableName} (no data)`);
    return;
  }
  
  console.log(`\n📦 Importing ${tableName}...`);
  console.log(`   Total rows to import: ${data.length}`);
  
  const columns = Object.keys(data[0]);
  const batchSize = 50; // Smaller batches to avoid parameter limits
  let imported = 0;
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    
    // Build INSERT query
    const placeholders = batch.map((_, batchIdx) => {
      const rowPlaceholders = columns.map((_, colIdx) => 
        `$${batchIdx * columns.length + colIdx + 1}`
      );
      return `(${rowPlaceholders.join(', ')})`;
    }).join(', ');
    
    const values = batch.flatMap(row => columns.map(col => row[col]));
    
    const conflictKey = tableName === 'journal_metadata' ? 'journal_id' : 'id';
    const updateCols = columns.filter(col => col !== 'id' && col !== 'journal_id');
    
    const query = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES ${placeholders}
      ON CONFLICT (${conflictKey}) DO UPDATE SET
      ${updateCols.map(col => `${col} = EXCLUDED.${col}`).join(', ')}
    `;
    
    try {
      await client.query(query, values);
      imported += batch.length;
      process.stdout.write(`\r   Progress: ${imported}/${data.length} (${Math.round(imported/data.length*100)}%)`);
    } catch (error) {
      console.error(`\n   ❌ Error importing batch ${i}-${i+batch.length}:`, error.message);
      // Continue with next batch
    }
  }
  
  console.log(`\n   ✅ Imported ${imported} rows`);
}

async function exportAll() {
  console.log('🚀 Exporting data from Supabase...\n');
  
  try {
    console.log('🔌 Connecting to Supabase...');
    await supabaseClient.connect();
    console.log('   ✅ Connected');
    
    const tables = ['journals', 'plans', 'protocols', 'journal_metadata'];
    const exports = {};
    
    for (const table of tables) {
      exports[table] = await exportTable(supabaseClient, table);
    }
    
    // Save to file
    const exportFile = '/tmp/supabase_export.json';
    await fs.writeFile(exportFile, JSON.stringify(exports, null, 2));
    console.log(`\n💾 Saved export to ${exportFile}`);
    
    console.log('\n✅ Export complete!');
    console.log('   Run: node scripts/direct-migration.js import');
    
  } catch (error) {
    console.error('\n❌ Export failed:', error.message);
    throw error;
  } finally {
    await supabaseClient.end();
  }
}

async function importAll() {
  console.log('🚀 Importing data to local PostgreSQL...\n');
  
  try {
    // Load export file
    const exportFile = '/tmp/supabase_export.json';
    const rawData = await fs.readFile(exportFile, 'utf8');
    const exports = JSON.parse(rawData);
    
    console.log('🔌 Connecting to local PostgreSQL...');
    await localClient.connect();
    console.log('   ✅ Connected');
    
    // Import tables
    await importTable(localClient, 'journals', exports.journals);
    await importTable(localClient, 'plans', exports.plans);
    await importTable(localClient, 'protocols', exports.protocols);
    await importTable(localClient, 'journal_metadata', exports.journal_metadata);
    
    // Verify
    console.log('\n📊 Verifying import...');
    const counts = {
      journals: await localClient.query('SELECT COUNT(*) FROM journals'),
      plans: await localClient.query('SELECT COUNT(*) FROM plans'),
      protocols: await localClient.query('SELECT COUNT(*) FROM protocols'),
      metadata: await localClient.query('SELECT COUNT(*) FROM journal_metadata')
    };
    
    console.log(`\n✅ Import complete!`);
    console.log(`   Journals: ${counts.journals.rows[0].count}`);
    console.log(`   Plans: ${counts.plans.rows[0].count}`);
    console.log(`   Protocols: ${counts.protocols.rows[0].count}`);
    console.log(`   Metadata: ${counts.metadata.rows[0].count}`);
    
  } catch (error) {
    console.error('\n❌ Import failed:', error.message);
    throw error;
  } finally {
    await localClient.end();
  }
}

// Main
if (command === 'export') {
  exportAll().catch(console.error);
} else if (command === 'import') {
  importAll().catch(console.error);
} else {
  console.log('Usage: node scripts/direct-migration.js [export|import]');
  process.exit(1);
}


