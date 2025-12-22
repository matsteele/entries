#!/usr/bin/env node

/**
 * Simple migration script - uses smaller batches to avoid issues
 * Connects to both Supabase and local PostgreSQL directly
 */

const { Client } = require('pg');

// We know from context that Supabase has:
// - 695 journals
// - 3 plans  
// - 1 protocol
// - 650 journal_metadata

const BATCH_SIZE = 50;

// Supabase connection 
const supabaseConfig = {
  host: 'aws-0-us-east-1.pooler.supabase.com',
  database: 'postgres',
  user: 'postgres',
  password: process.env.SUPABASE_PASSWORD,
  port: 5432,
  ssl: { rejectUnauthorized: false }
};

// Local PostgreSQL
const localConfig = {
  host: 'localhost',
  database: 'entries',
  user: process.env.USER || 'matthewsteele',
};

async function copyTable(tableName) {
  const supabase = new Client(supabaseConfig);
  const local = new Client(localConfig);
  
  try {
    console.log(`\n📋 Migrating ${tableName}...`);
    
    await supabase.connect();
    await local.connect();
    
    // Get count
    const countResult = await supabase.query(`SELECT COUNT(*) FROM ${tableName}`);
    const total = parseInt(countResult.rows[0].count);
    console.log(`   Total rows: ${total}`);
    
    if (total === 0) {
      console.log(`   ⚠️  No data to migrate`);
      return;
    }
    
    // Get column info (exclude embedding column)
    const columnsResult = await supabase.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1 
      AND column_name != 'embedding'
      ORDER BY ordinal_position
    `, [tableName]);
    
    const columns = columnsResult.rows.map(r => r.column_name);
    console.log(`   Columns: ${columns.join(', ')}`);
    
    // Copy in batches
    let offset = 0;
    let imported = 0;
    
    while (offset < total) {
      const result = await supabase.query(`
        SELECT ${columns.join(', ')}
        FROM ${tableName}
        ORDER BY created_at
        LIMIT $1 OFFSET $2
      `, [BATCH_SIZE, offset]);
      
      if (result.rows.length === 0) break;
      
      // Insert batch into local
      for (const row of result.rows) {
        const values = columns.map(col => row[col]);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        
        const conflictKey = tableName === 'journal_metadata' ? 'journal_id' : 'id';
        const updateCols = columns.filter(col => col !== 'id' && col !== 'journal_id');
        const updateStr = updateCols.map(col => `${col} = EXCLUDED.${col}`).join(', ');
        
        const query = `
          INSERT INTO ${tableName} (${columns.join(', ')})
          VALUES (${placeholders})
          ON CONFLICT (${conflictKey}) DO UPDATE SET ${updateStr}
        `;
        
        try {
          await local.query(query, values);
          imported++;
        } catch (error) {
          console.error(`\n   ⚠️  Error on row ${imported}:`, error.message);
        }
      }
      
      offset += BATCH_SIZE;
      process.stdout.write(`\r   Progress: ${imported}/${total} (${Math.round(imported/total*100)}%)`);
    }
    
    console.log(`\n   ✅ Migrated ${imported} rows`);
    
  } catch (error) {
    console.error(`\n   ❌ Error migrating ${tableName}:`, error.message);
    throw error;
  } finally {
    await supabase.end();
    await local.end();
  }
}

async function main() {
  console.log('🚀 Starting migration from Supabase to local PostgreSQL\n');
  
  if (!process.env.SUPABASE_PASSWORD) {
    console.error('❌ SUPABASE_PASSWORD environment variable not set');
    console.error('\nSet it with:');
    console.error('  export SUPABASE_PASSWORD="your-password"');
    process.exit(1);
  }
  
  try {
    await copyTable('journals');
    await copyTable('plans');
    await copyTable('protocols');
    await copyTable('journal_metadata');
    
    // Verify
    console.log('\n📊 Verifying local database...\n');
    const local = new Client(localConfig);
    await local.connect();
    
    const tables = ['journals', 'plans', 'protocols', 'journal_metadata'];
    for (const table of tables) {
      const result = await local.query(`SELECT COUNT(*) FROM ${table}`);
      console.log(`   ${table}: ${result.rows[0].count} rows`);
    }
    
    await local.end();
    
    console.log('\n✅ Migration complete!\n');
    console.log('Next steps:');
    console.log('  1. Update MCP config to use local PostgreSQL');
    console.log('  2. Restart Cursor/Claude');
    console.log('  3. Test queries against local database');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

main();

