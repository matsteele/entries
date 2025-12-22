#!/usr/bin/env node

/**
 * Batch export script - exports data from Supabase using small batches
 * Saves to JSON files that can then be imported to local PostgreSQL
 */

const { Client } = require('pg');
const fs = require('fs').promises;

const BATCH_SIZE = 100;
const OUTPUT_DIR = '/tmp/supabase_export';

// Local PostgreSQL to import into
const localConfig = {
  host: 'localhost',
  database: 'entries',
  user: process.env.USER || 'matthewsteele',
};

async function importFromFiles() {
  console.log('🚀 Importing data from exported files to local PostgreSQL\n');
  
  const local = new Client(localConfig);
  
  try {
    await local.connect();
    console.log('✅ Connected to local PostgreSQL\n');
    
    const tables = ['journals', 'plans', 'protocols', 'journal_metadata'];
    
    for (const table of tables) {
      const filepath = `${OUTPUT_DIR}/${table}.json`;
      
      try {
        console.log(`📦 Importing ${table}...`);
        const rawData = await fs.readFile(filepath, 'utf8');
        const data = JSON.parse(rawData);
        
        if (data.length === 0) {
          console.log(`   ⚠️  No data to import\n`);
          continue;
        }
        
        console.log(`   Total rows: ${data.length}`);
        
        // Get columns (exclude embedding)
        const allColumns = Object.keys(data[0]);
        const columns = allColumns.filter(col => col !== 'embedding');
        
        // Import in batches
        const batchSize = 50;
        let imported = 0;
        
        for (let i = 0; i < data.length; i += batchSize) {
          const batch = data.slice(i, i + batchSize);
          
          // Insert each row individually to handle any issues
          for (const row of batch) {
            const values = columns.map(col => row[col]);
            const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
            
            const conflictKey = table === 'journal_metadata' ? 'journal_id' : 'id';
            const updateCols = columns.filter(col => col !== 'id' && col !== 'journal_id');
            const updateStr = updateCols.map(col => `${col} = EXCLUDED.${col}`).join(', ');
            
            const query = `
              INSERT INTO ${table} (${columns.join(', ')})
              VALUES (${placeholders})
              ON CONFLICT (${conflictKey}) DO UPDATE SET ${updateStr}
            `;
            
            try {
              await local.query(query, values);
              imported++;
              if (imported % 50 === 0) {
                process.stdout.write(`\r   Progress: ${imported}/${data.length} (${Math.round(imported/data.length*100)}%)`);
              }
            } catch (error) {
              console.error(`\n   ⚠️  Error on row ${imported}:`, error.message);
            }
          }
        }
        
        console.log(`\n   ✅ Imported ${imported} rows\n`);
        
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log(`   ⚠️  File not found: ${filepath}\n`);
        } else {
          console.error(`   ❌ Error importing ${table}:`, error.message, '\n');
        }
      }
    }
    
    // Verify
    console.log('📊 Verification:\n');
    for (const table of tables) {
      const result = await local.query(`SELECT COUNT(*) FROM ${table}`);
      console.log(`   ${table}: ${result.rows[0].count} rows`);
    }
    
    console.log('\n✅ Import complete!\n');
    
  } catch (error) {
    console.error('\n❌ Import failed:', error.message);
    process.exit(1);
  } finally {
    await local.end();
  }
}

async function main() {
  const command = process.argv[2];
  
  if (command === 'import') {
    await importFromFiles();
  } else {
    console.log('Supabase Export & Import Tool\n');
    console.log('Step 1: Export data from Supabase using MCP');
    console.log('  Run these MCP queries and save outputs as JSON files:\n');
    console.log('  1. SELECT * FROM journals ORDER BY created_at;');
    console.log('     Save to: /tmp/supabase_export/journals.json\n');
    console.log('  2. SELECT * FROM plans ORDER BY created_at;');
    console.log('     Save to: /tmp/supabase_export/plans.json\n');
    console.log('  3. SELECT * FROM protocols ORDER BY created_at;');
    console.log('     Save to: /tmp/supabase_export/protocols.json\n');
    console.log('  4. SELECT * FROM journal_metadata ORDER BY created_at;');
    console.log('     Save to: /tmp/supabase_export/journal_metadata.json\n');
    console.log('Step 2: Import to local PostgreSQL');
    console.log('  node scripts/batch-import.js import\n');
  }
}

main();


