#!/bin/bash

# Export all data from Supabase using MCP and import to local PostgreSQL
# This uses pg_dump to create SQL export

set -e

echo "🚀 Migration: Supabase → Local PostgreSQL"
echo ""

# Check if we have Supabase password
if [ -z "$SUPABASE_PASSWORD" ]; then
  echo "❌ SUPABASE_PASSWORD environment variable is not set"
  echo ""
  echo "Please set it with:"
  echo "  export SUPABASE_PASSWORD='your-password'"
  echo ""
  echo "You can find it in your Supabase dashboard:"
  echo "  https://supabase.com/dashboard/project/hjajrstidftkjwqmdung/settings/database"
  exit 1
fi

echo "📥 Exporting from Supabase..."
echo ""

# Export using pg_dump
PGPASSWORD="$SUPABASE_PASSWORD" pg_dump \
  -h hjajrstidftkjwqmdung.supabase.co \
  -p 6543 \
  -U postgres.hjajrstidftkjwqmdung \
  -d postgres \
  -t journals -t plans -t protocols -t journal_metadata \
  --data-only \
  --column-inserts \
  --no-owner \
  --no-privileges \
  > /tmp/supabase_data.sql

echo "✅ Exported to /tmp/supabase_data.sql"
echo ""

echo "📦 Importing to local PostgreSQL..."
echo ""

# Import to local
/opt/homebrew/opt/postgresql@16/bin/psql -d entries < /tmp/supabase_data.sql

echo ""
echo "📊 Verifying migration..."
echo ""

# Verify counts
/opt/homebrew/opt/postgresql@16/bin/psql -d entries -c "
  SELECT 
    'journals' as table_name, COUNT(*) as row_count FROM journals
  UNION ALL
  SELECT 'plans', COUNT(*) FROM plans
  UNION ALL
  SELECT 'protocols', COUNT(*) FROM protocols
  UNION ALL
  SELECT 'journal_metadata', COUNT(*) FROM journal_metadata;
"

echo ""
echo "✅ Migration complete!"
echo ""
echo "Next steps:"
echo "  1. Update MCP config to use local PostgreSQL"
echo "  2. Restart Cursor/Claude"
echo "  3. Test queries against local database"


