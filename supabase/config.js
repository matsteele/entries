/**
 * Supabase Configuration
 * Loads credentials from environment variables
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Validate environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
  console.error('Please copy .env.example to .env and fill in your credentials');
  process.exit(1);
}

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

// Test connection
async function testConnection() {
  try {
    const { data, error } = await supabase
      .from('journals')
      .select('count', { count: 'exact', head: true });
    
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('❌ Failed to connect to Supabase:', error.message);
    return false;
  }
}

module.exports = {
  supabase,
  testConnection
};

