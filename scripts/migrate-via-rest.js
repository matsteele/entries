#!/usr/bin/env node

/**
 * Export from Supabase using the JS client (REST API)
 * Import to local PostgreSQL
 */

const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');

// Supabase connection via REST API
const SUPABASE_URL = 'https://hjajrstidftkjwqmdung.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

// Local PostgreSQL
const localConfig = {
  host: 'localhost',
  database: 'entries',
  user: process.env.USER || 'matthewsteele',
};

async function exportTable(supabase, tableName) {
  console.log(`\n📥 Exporting ${tableName}...`);
  
  try {
    // Get count first
    const { count, error: countError} = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.error(`   ❌ Error getting count:`, countError.message);
      return [];
    }
    
    console.log(`   Total rows: ${count}`);
    
    if (count === 0) {
      console.log(`   ⚠️  No data to export`);
      return [];
    }
    
    // Fetch all data in batches
    const BATCH_SIZE = 1000;
    let allData = [];
    let offset = 0;
    
    // For journal_metadata, don't order by created_at (it doesn't exist)
    const orderColumn = tableName === 'journal_metadata' ? 'journal_id' : 'created_at';
    
    while (offset < count) {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .order(orderColumn)
        .range(offset, offset + BATCH_SIZE - 1);
      
      if (error) {
        console.error(`   ❌ Error fetching data:`, error.message);
        break;
      }
      
      allData = allData.concat(data);
      offset += BATCH_SIZE;
      
      process.stdout.write(`\r   Progress: ${allData.length}/${count} (${Math.round(allData.length/count*100)}%)`);
    }
    
    console.log(`\n   ✅ Exported ${allData.length} rows`);
    return allData;
    
  } catch (error) {
    console.error(`   ❌ Error exporting ${tableName}:`, error.message);
    return [];
  }
}

async function importTable(tableName, data) {
  if (data.length === 0) {
    console.log(`\n📦 Skipping ${tableName} (no data)`);
    return;
  }
  
  console.log(`\n📦 Importing ${tableName}...`);
  
  const client = new Client(localConfig);
  await client.connect();
  
  try {
    // Get columns (exclude embedding)
    const allColumns = Object.keys(data[0]);
    const columns = allColumns.filter(col => col !== 'embedding');
    
    let imported = 0;
    let errors = 0;
    
    // Import row by row
    for (const row of data) {
      const values = columns.map(col => row[col]);
      const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
      
      const conflictKey = tableName === 'journal_metadata' ? 'journal_id' : 'id';
      const updateCols = columns.filter(col => col !== 'id' && col !== 'journal_id');
      
      if (updateCols.length === 0) {
        // Just insert, don't update
        const query = `
          INSERT INTO ${tableName} (${columns.join(', ')})
          VALUES (${placeholders})
          ON CONFLICT (${conflictKey}) DO NOTHING
        `;
        
        try {
          await client.query(query, values);
          imported++;
        } catch (error) {
          errors++;
          if (errors <= 3) {
            console.error(`\n   ⚠️  Error on row ${imported + 1}:`, error.message);
          }
        }
      } else {
        const updateStr = updateCols.map(col => `${col} = EXCLUDED.${col}`).join(', ');
        
        const query = `
          INSERT INTO ${tableName} (${columns.join(', ')})
          VALUES (${placeholders})
          ON CONFLICT (${conflictKey}) DO UPDATE SET ${updateStr}
        `;
        
        try {
          await client.query(query, values);
          imported++;
        } catch (error) {
          errors++;
          if (errors <= 3) {
            console.error(`\n   ⚠️  Error on row ${imported + 1}:`, error.message);
          }
        }
      }
      
      if (imported % 100 === 0 || imported === data.length) {
        process.stdout.write(`\r   Progress: ${imported}/${data.length} (${Math.round(imported/data.length*100)}%)`);
      }
    }
    
    console.log(`\n   ✅ Imported ${imported} rows` + (errors > 0 ? ` (${errors} errors)` : ''));
    
  } catch (error) {
    console.error(`\n   ❌ Error importing ${tableName}:`, error.message);
  } finally {
    await client.end();
  }
}

async function main() {
  console.log('🚀 Migrating from Supabase to Local PostgreSQL\n');
  
  // Check for Supabase key
  if (!SUPABASE_ANON_KEY) {
    console.error('❌ SUPABASE_ANON_KEY or SUPABASE_KEY not set\n');
    console.log('Please set one of:');
    console.log('  export SUPABASE_ANON_KEY="your-anon-key"');
    console.log('  export SUPABASE_KEY="your-anon-key"\n');
    console.log('Find it at:');
    console.log('  https://supabase.com/dashboard/project/hjajrstidftkjwqmdung/settings/api\n');
    process.exit(1);
  }
  
  console.log('🔌 Connecting to Supabase...');
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log('   ✅ Connected\n');
  
  // Export all tables
  const journals = await exportTable(supabase, 'journals');
  const plans = await exportTable(supabase, 'plans');
  const protocols = await exportTable(supabase, 'protocols');
  const metadata = await exportTable(supabase, 'journal_metadata');
  
  // Import to local
  await importTable('journals', journals);
  await importTable('plans', plans);
  await importTable('protocols', protocols);
  await importTable('journal_metadata', metadata);
  
  // Verify
  console.log('\n📊 Verifying local database...\n');
  const client = new Client(localConfig);
  await client.connect();
  
  const tables = ['journals', 'plans', 'protocols', 'journal_metadata'];
  for (const table of tables) {
    const result = await client.query(`SELECT COUNT(*) FROM ${table}`);
    console.log(`   ${table}: ${result.rows[0].count} rows`);
  }
  
  await client.end();
  
  console.log('\n✅ Migration complete!\n');
  console.log('Next steps:');
  console.log('  1. Update .mcp.json to use local PostgreSQL');
  console.log('  2. Restart Cursor');
  console.log('  3. Test queries against local database\n');
}

main().catch(error => {
  console.error('\n❌ Migration failed:', error.message);
  process.exit(1);
});

