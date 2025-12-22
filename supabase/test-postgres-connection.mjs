#!/usr/bin/env node
/**
 * Test Direct PostgreSQL Connection
 */

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error('❌ DATABASE_URL not found');
    process.exit(1);
  }

  console.log('🔍 Testing connection...');
  console.log('Connection string:', connectionString.replace(/:[^:@]+@/, ':***@'));
  
  const sql = postgres(connectionString, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  try {
    // Simple query to test connection
    const result = await sql`SELECT version()`;
    console.log('✅ Connection successful!');
    console.log('PostgreSQL version:', result[0].version.split(' ')[1]);
    
    // Check if pgvector is enabled
    const vectorCheck = await sql`SELECT * FROM pg_extension WHERE extname = 'vector'`;
    if (vectorCheck.length > 0) {
      console.log('✅ pgvector extension enabled');
    } else {
      console.log('⚠️  pgvector extension not enabled yet');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Check password is correct in .env');
    console.error('2. Try SQL Editor method instead');
    return false;
  } finally {
    await sql.end();
  }
}

testConnection();

