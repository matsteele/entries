#!/usr/bin/env node
/**
 * Run Supabase Migrations using Direct PostgreSQL Connection
 */

import postgres from 'postgres';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error('❌ DATABASE_URL not found in .env file');
    console.error('Please add: DATABASE_URL=postgresql://postgres.hjajrstidftkjwqmdung:journal2025planprotocols@aws-0-us-east-1.pooler.supabase.com:5432/postgres');
    process.exit(1);
  }

  console.log('🚀 Running Supabase Migrations\n');
  
  const sql = postgres(connectionString);

  try {
    // Read the complete migration file
    const migrationPath = path.join(__dirname, 'complete-migration.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📝 Executing complete-migration.sql...\n');
    
    // Execute the entire migration
    await sql.unsafe(migrationSQL);
    
    console.log('✅ Migration completed successfully!\n');
    
    // Test the setup
    console.log('🔍 Verifying tables...\n');
    
    const tables = ['journals', 'plans', 'protocols', 'journal_metadata'];
    
    for (const table of tables) {
      const result = await sql`SELECT COUNT(*) as count FROM ${sql(table)}`;
      console.log(`   ✅ ${table}: ${result[0].count} rows`);
    }
    
    console.log('\n✅ All tables created successfully!\n');
    console.log('Next steps:');
    console.log('1. Migrate data from JSON files');
    console.log('2. Generate embeddings');
    console.log('3. Test semantic search\n');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nIf you see a syntax error, try running the migration manually:');
    console.error('1. Open: https://supabase.com/dashboard/project/hjajrstidftkjwqmdung/sql/new');
    console.error('2. Copy contents of: supabase/complete-migration.sql');
    console.error('3. Paste and run in SQL Editor\n');
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigrations();

