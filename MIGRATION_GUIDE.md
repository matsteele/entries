# Supabase to Local PostgreSQL Migration Guide

## Current Status

- ✅ Local PostgreSQL 16.11 installed and running
- ✅ Database "entries" created with schema (journals, plans, protocols, journal_metadata)
- ✅ `pg` npm package installed
- ⏸️  Supabase appears to be paused (will wake up on first request)

## Supabase Data Inventory

From previous MCP queries:
- **695 journals**
- **3 plans**
- **1 protocol**
- **650 journal_metadata** entries

## Migration Options

### Option 1: Using MCP Tools (Recommended - Easiest)

The Supabase MCP is already configured in `.mcp.json`. After restarting Cursor/Claude:

1. Restart Cursor/Claude to reconnect MCP servers
2. Use Cursor to run these commands:
   - Export journals: Run MCP query and ask Claude to save results
   - Export plans: Run MCP query and ask Claude to save results
   - Export protocols: Run MCP query and ask Claude to save results
   - Export journal_metadata: Run MCP query and ask Claude to save results
3. Import to local: `node scripts/batch-import.js import`

### Option 2: Using Node.js Script (If MCP isn't working)

**Prerequisites:**
- Supabase must be awake (visit your dashboard or make a request)
- Set password: `export SUPABASE_PASSWORD="journal2025planprotocols"`

**Steps:**
```bash
# Test connection to wake up Supabase
curl https://hjajrstidftkjwqmdung.supabase.co

# Wait 30 seconds for database to wake up

# Run export
node scripts/mcp-export.js

# Run import
node scripts/batch-import.js import

# Verify
/opt/homebrew/opt/postgresql@16/bin/psql -d entries -c "
  SELECT 
    'journals' as table, COUNT(*) as rows FROM journals
  UNION ALL
  SELECT 'plans', COUNT(*) FROM plans
  UNION ALL
  SELECT 'protocols', COUNT(*) FROM protocols
  UNION ALL
  SELECT 'journal_metadata', COUNT(*) FROM journal_metadata;
"
```

### Option 3: Using pg_dump (Most Reliable)

If you have `pg_dump` available and Supabase is awake:

```bash
# Set password
export PGPASSWORD="journal2025planprotocols"

# Wake up Supabase first
curl https://hjajrstidftkjwqmdung.supabase.co

# Wait 30 seconds, then export
pg_dump \
  -h aws-0-us-east-1.pooler.supabase.com \
  -p 5432 \
  -U postgres \
  -d postgres \
  -t journals -t plans -t protocols -t journal_metadata \
  --data-only \
  --column-inserts \
  --no-owner \
  --no-privileges \
  > /tmp/supabase_data.sql

# Import to local
/opt/homebrew/opt/postgresql@16/bin/psql -d entries < /tmp/supabase_data.sql

# Verify
/opt/homebrew/opt/postgresql@16/bin/psql -d entries -c "
  SELECT 
    'journals' as table, COUNT(*) as rows FROM journals
  UNION ALL
  SELECT 'plans', COUNT(*) FROM plans
  UNION ALL
  SELECT 'protocols', COUNT(*) FROM protocols
  UNION ALL
  SELECT 'journal_metadata', COUNT(*) FROM journal_metadata;
"
```

## Post-Migration: Update MCP Config

Once data is migrated, update `.mcp.json` to use local PostgreSQL:

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/entries"]
    }
  }
}
```

Then restart Cursor/Claude.

## Automated Backups to Google Drive

After migration is complete, set up automated daily backups:

```bash
# Create backup script
cat > ~/bin/backup-entries-db.sh << 'EOF'
#!/bin/bash
# Backup Entries database to Google Drive

BACKUP_DIR="$HOME/Google Drive/My Drive/Backups/entries-db"
DATE=$(date +%Y-%m-%d)
BACKUP_FILE="entries-backup-$DATE.sql"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Backup database
/opt/homebrew/opt/postgresql@16/bin/pg_dump -d entries > "$BACKUP_DIR/$BACKUP_FILE"

# Compress
gzip "$BACKUP_DIR/$BACKUP_FILE"

# Keep only last 30 days of backups
find "$BACKUP_DIR" -name "entries-backup-*.sql.gz" -mtime +30 -delete

echo "✅ Backup complete: $BACKUP_FILE.gz"
EOF

# Make executable
chmod +x ~/bin/backup-entries-db.sh

# Test backup
~/bin/backup-entries-db.sh

# Add to crontab for daily backups at 2am
crontab -l > /tmp/mycron 2>/dev/null
echo "0 2 * * * $HOME/bin/backup-entries-db.sh >> $HOME/logs/entries-backup.log 2>&1" >> /tmp/mycron
crontab /tmp/mycron
rm /tmp/mycron

# Create log directory
mkdir -p ~/logs
```

## Troubleshooting

### Supabase is paused
- Visit https://supabase.com/dashboard/project/hjajrstidftkjwqmdung
- Or: `curl https://hjajrstidftkjwqmdung.supabase.co`
- Wait 30 seconds for database to wake up

### Connection errors
- Check PostgreSQL is running: `ps aux | grep postgres`
- Check port: `/opt/homebrew/opt/postgresql@16/bin/psql -l`
- Restart if needed: `brew services restart postgresql@16`

### Permission errors
- Check database ownership: `/opt/homebrew/opt/postgresql@16/bin/psql -d entries -c "\du"`
- Grant permissions if needed: `GRANT ALL PRIVILEGES ON DATABASE entries TO matthewsteele;`

## Verification Queries

After migration, run these to verify data integrity:

```sql
-- Check row counts
SELECT 'journals' as table, COUNT(*) FROM journals
UNION ALL SELECT 'plans', COUNT(*) FROM plans
UNION ALL SELECT 'protocols', COUNT(*) FROM protocols
UNION ALL SELECT 'journal_metadata', COUNT(*) FROM journal_metadata;

-- Check recent journals
SELECT date, LEFT(content, 50) as content_preview, type
FROM journals
ORDER BY created_at DESC
LIMIT 10;

-- Check date range
SELECT 
  MIN(date) as earliest_date,
  MAX(date) as latest_date,
  COUNT(*) as total_entries
FROM journals;
```

## Expected Results

After successful migration:
- ✅ 695 journals in local database
- ✅ 3 plans in local database
- ✅ 1 protocol in local database
- ✅ 650 journal_metadata entries in local database
- ✅ MCP config updated to use local PostgreSQL
- ✅ Daily backups to Google Drive configured


