#!/usr/bin/env node

/**
 * Migration script using MCP Supabase connection to export data
 * Then import to local PostgreSQL
 *
 * Usage: node scripts/migrate-via-mcp.js
 */

const { Client } = require('pg');
const fs = require('fs').promises;
const path = require('path');

// Local PostgreSQL connection
const localClient = new Client({
  host: 'localhost',
  database: 'entries',
  user: process.env.USER || 'matthewsteele',
  // No password needed for local trust authentication
});

async function exportToJSON(tableName) {
  console.log(`\n📥 Please run this MCP query and save the output:`);
  console.log(`\nsupabase - Execute SQL: SELECT * FROM ${tableName} ORDER BY created_at;`);
  console.log(`\nSave the JSON output to: /tmp/${tableName}_export.json`);
}

async function importFromJSON(tableName, jsonFile) {
  console.log(`\n📦 Importing ${tableName} from ${jsonFile}...`);
  
  try {
    const rawData = await fs.readFile(jsonFile, 'utf8');
    const data = JSON.parse(rawData);
    
    if (data.length === 0) {
      console.log(`   ⚠️  No data to import for ${tableName}`);
      return;
    }
    
    console.log(`   Found ${data.length} rows to import`);
    
    // Get column names from first row (excluding embedding)
    const allColumns = Object.keys(data[0]);
    const columns = allColumns.filter(col => col !== 'embedding');
    
    // Import in batches to avoid parameter limit
    const batchSize = 100;
    let imported = 0;
    
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      
      // Build INSERT query for batch
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
      
      await localClient.query(query, values);
      imported += batch.length;
      
      process.stdout.write(`\r   Progress: ${imported}/${data.length} (${Math.round(imported/data.length*100)}%)`);
    }
    
    console.log(`\n   ✅ Imported ${imported} rows into ${tableName}`);
    
  } catch (error) {
    console.error(`\n   ❌ Error importing ${tableName}:`, error.message);
    throw error;
  }
}

async function migrate() {
  console.log('🚀 Starting migration to local PostgreSQL...\n');
  
  try {
    console.log('🔌 Connecting to local PostgreSQL...');
    await localClient.connect();
    console.log('   ✅ Connected to local PostgreSQL');
    
    // Check if export files exist
    const tables = ['journals', 'plans', 'protocols', 'journal_metadata'];
    
    for (const table of tables) {
      const exportFile = `/tmp/${table}_export.json`;
      try {
        await fs.access(exportFile);
        await importFromJSON(table, exportFile);
      } catch (error) {
        console.log(`\n⚠️  ${exportFile} not found. Skipping ${table}.`);
        console.log(`   Run MCP query to export: SELECT * FROM ${table} ORDER BY created_at;`);
      }
    }
    
    // Verify migration
    console.log('\n\n📊 Verifying local database...');
    const localJournals = await localClient.query('SELECT COUNT(*) FROM journals');
    const localPlans = await localClient.query('SELECT COUNT(*) FROM plans');
    const localProtocols = await localClient.query('SELECT COUNT(*) FROM protocols');
    const localMetadata = await localClient.query('SELECT COUNT(*) FROM journal_metadata');
    
    console.log(`\n✅ Local database status:`);
    console.log(`   Journals: ${localJournals.rows[0].count}`);
    console.log(`   Plans: ${localPlans.rows[0].count}`);
    console.log(`   Protocols: ${localProtocols.rows[0].count}`);
    console.log(`   Metadata: ${localMetadata.rows[0].count}`);
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await localClient.end();
  }
}

// Run migration
migrate().catch(console.error);


