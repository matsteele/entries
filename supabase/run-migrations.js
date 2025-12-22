#!/usr/bin/env node
/**
 * Run Supabase Migrations
 * Executes SQL migrations in order
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function runMigration(filePath, name) {
  console.log(`\n📝 Running ${name}...`);
  
  const sql = fs.readFileSync(filePath, 'utf8');
  
  try {
    // Split by semicolons but handle multi-line statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      if (statement.length > 0) {
        const { error } = await supabase.rpc('exec_sql', { sql_query: statement + ';' });
        
        if (error) {
          // Try direct query for some statements
          const { error: directError } = await supabase.from('_').select('*').limit(0);
          // If it's just a method not found, we need to use raw SQL
          console.log('   Note: Using SQL editor method instead...');
          console.log('   Please run this migration manually in the SQL editor.');
          return false;
        }
      }
    }
    
    console.log(`   ✅ ${name} completed`);
    return true;
  } catch (error) {
    console.error(`   ❌ Error in ${name}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Running Supabase Migrations\n');
  console.log('⚠️  Note: Some migrations may need to be run manually in the SQL Editor');
  console.log('   Visit: https://supabase.com/dashboard/project/hjajrstidftkjwqmdung/sql/new\n');
  
  const migrationsDir = path.join(__dirname, 'migrations');
  const migrations = [
    { file: '001_init_schema.sql', name: 'Initial Schema' },
    { file: '002_search_functions.sql', name: 'Search Functions' },
    { file: '003_rls_policies.sql', name: 'RLS Policies' }
  ];
  
  console.log('📋 Migrations to run:');
  migrations.forEach(m => console.log(`   - ${m.name}`));
  console.log('');
  
  for (const migration of migrations) {
    const filePath = path.join(migrationsDir, migration.file);
    await runMigration(filePath, migration.name);
  }
  
  console.log('\n✅ Migration process complete!\n');
  console.log('Next step: Test the connection');
  console.log('   node supabase/test-connection.js\n');
}

main().catch(console.error);

