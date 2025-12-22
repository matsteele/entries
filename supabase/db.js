/**
 * Direct PostgreSQL Connection for Supabase
 * Uses postgres package for direct database access
 */

import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is required');
  console.error('Please add it to your .env file:');
  console.error('DATABASE_URL=postgresql://postgres.hjajrstidftkjwqmdung:journal2025planprotocols@aws-0-us-east-1.pooler.supabase.com:5432/postgres');
  process.exit(1);
}

const sql = postgres(connectionString, {
  max: 10, // Maximum number of connections
  idle_timeout: 20,
  connect_timeout: 10,
});

export default sql;

