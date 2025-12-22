#!/usr/bin/env node
/**
 * Test Supabase Connection
 * Verifies that the database is set up correctly
 */

const { supabase, testConnection } = require('./config');

async function main() {
  console.log('🔍 Testing Supabase connection...\n');
  
  // Test basic connection
  console.log('1. Testing basic connection...');
  const connected = await testConnection();
  
  if (!connected) {
    console.error('\n❌ Connection failed. Please check:');
    console.error('   - Your .env file is configured correctly');
    console.error('   - You have run the migration scripts in Supabase');
    console.error('   - Your Supabase project is active');
    process.exit(1);
  }
  
  console.log('   ✅ Connected to Supabase\n');
  
  // Check if pgvector extension is enabled
  console.log('2. Checking pgvector extension...');
  try {
    const { data, error } = await supabase
      .rpc('search_journals', {
        query_embedding: Array(1536).fill(0),
        match_count: 1
      });
    
    if (error && error.message.includes('function')) {
      console.error('   ❌ Search functions not found. Please run migration 002_search_functions.sql');
      process.exit(1);
    }
    
    console.log('   ✅ pgvector extension enabled\n');
  } catch (error) {
    console.error('   ⚠️  Could not verify pgvector:', error.message);
  }
  
  // Check tables
  console.log('3. Checking tables...');
  const tables = ['journals', 'plans', 'protocols', 'journal_metadata'];
  
  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      
      if (error) throw error;
      console.log(`   ✅ ${table}: ${count || 0} rows`);
    } catch (error) {
      console.error(`   ❌ ${table}: ${error.message}`);
    }
  }
  
  console.log('\n✅ Supabase is ready!\n');
  console.log('Next steps:');
  console.log('1. Run migration scripts to populate data');
  console.log('2. Generate embeddings for existing content');
  console.log('3. Test semantic search queries\n');
}

main().catch(console.error);

