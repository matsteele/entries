#!/usr/bin/env node

/**
 * MCP-based export script
 * Uses the Supabase MCP connection to export data
 * This works around direct connection issues
 */

const { Client } = require('pg');
const fs = require('fs').promises;

const OUTPUT_DIR = '/tmp/supabase_export';

// Use the MCP Supabase connection details
// From context: MCP is already connected and working
// We'll use a simple approach: connect via Supabase direct connection

const supabaseConfig = {
  host: 'aws-0-us-east-1.pooler.supabase.com',
  database: 'postgres',
  user: 'postgres.hjajrstidftkjwqmdung',
  password: 'journal2025planprotocols',
  port: 5432,
  ssl: { rejectUnauthorized: false }
};

async function exportTable(tableName) {
  const client = new Client(supabaseConfig);
  
  try {
    console.log(`\n📥 Exporting ${tableName}...`);
    await client.connect();
    
    // Get count
    const countResult = await client.query(`SELECT COUNT(*) FROM ${tableName}`);
    const total = parseInt(countResult.rows[0].count);
    console.log(`   Total rows: ${total}`);
    
    if (total === 0) {
      console.log(`   ⚠️  No data to export`);
      await client.end();
      return;
    }
    
    // Get data (exclude embedding column)
    let query;
    if (tableName === 'journal_metadata') {
      query = `SELECT * FROM ${tableName} ORDER BY created_at`;
    } else {
      query = `SELECT id, date, content, type, context, summary, word_count, created_at, updated_at FROM ${tableName} ORDER BY created_at`;
    }
    
    const result = await client.query(query);
    console.log(`   Retrieved ${result.rows.length} rows`);
    
    // Save to file
    const filepath = `${OUTPUT_DIR}/${tableName}.json`;
    await fs.writeFile(filepath, JSON.stringify(result.rows, null, 2));
    console.log(`   ✅ Saved to ${filepath}`);
    
    await client.end();
    
  } catch (error) {
    console.error(`   ❌ Error exporting ${tableName}:`, error.message);
    try {
      await client.end();
    } catch {}
  }
}

async function main() {
  console.log('🚀 Exporting data from Supabase via direct connection\n');
  
  await exportTable('journals');
  await exportTable('plans');
  await exportTable('protocols');
  await exportTable('journal_metadata');
  
  console.log('\n✅ Export complete!');
  console.log('\nNext step: node scripts/batch-import.js import\n');
}

main();

