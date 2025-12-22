#!/bin/bash
# Complete migration and backup setup script
# Run this when Supabase is accessible

set -e

echo "🚀 Entries Database Migration & Backup Setup"
echo "============================================"
echo ""

# Step 1: Check local PostgreSQL
echo "📌 Step 1: Checking local PostgreSQL..."
if /opt/homebrew/opt/postgresql@16/bin/psql -d entries -c "SELECT 1" > /dev/null 2>&1; then
  echo "   ✅ Local PostgreSQL is running"
else
  echo "   ❌ Local PostgreSQL is not accessible"
  echo "   Start it with: brew services start postgresql@16"
  exit 1
fi

# Step 2: Create backup directory
echo ""
echo "📌 Step 2: Setting up backup directory..."
BACKUP_DIR="$HOME/Google Drive/My Drive/Backups/entries-db"
mkdir -p "$BACKUP_DIR"
echo "   ✅ Backup directory ready: $BACKUP_DIR"

# Step 3: Create backup script
echo ""
echo "📌 Step 3: Creating backup script..."
mkdir -p ~/bin
cat > ~/bin/backup-entries-db.sh << 'BACKUP_SCRIPT'
#!/bin/bash
# Automated backup script for Entries database

BACKUP_DIR="$HOME/Google Drive/My Drive/Backups/entries-db"
DATE=$(date +%Y-%m-%d-%H%M)
BACKUP_FILE="entries-backup-$DATE.sql"
LOG_FILE="$HOME/logs/entries-backup.log"

# Create log directory
mkdir -p "$HOME/logs"
mkdir -p "$BACKUP_DIR"

# Log start
echo "[$(date)] Starting backup..." >> "$LOG_FILE"

# Backup database
if /opt/homebrew/opt/postgresql@16/bin/pg_dump -d entries > "$BACKUP_DIR/$BACKUP_FILE" 2>> "$LOG_FILE"; then
  # Compress
  gzip "$BACKUP_DIR/$BACKUP_FILE"
  
  # Keep only last 30 days of backups
  find "$BACKUP_DIR" -name "entries-backup-*.sql.gz" -mtime +30 -delete
  
  # Log success
  BACKUP_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_FILE.gz" | cut -f1)
  echo "[$(date)] ✅ Backup complete: $BACKUP_FILE.gz ($BACKUP_SIZE)" >> "$LOG_FILE"
  echo "✅ Backup complete: $BACKUP_FILE.gz ($BACKUP_SIZE)"
else
  echo "[$(date)] ❌ Backup failed" >> "$LOG_FILE"
  echo "❌ Backup failed. Check $LOG_FILE"
  exit 1
fi
BACKUP_SCRIPT

chmod +x ~/bin/backup-entries-db.sh
echo "   ✅ Backup script created: ~/bin/backup-entries-db.sh"

# Step 4: Test backup
echo ""
echo "📌 Step 4: Testing backup..."
if ~/bin/backup-entries-db.sh; then
  echo "   ✅ Backup test successful"
else
  echo "   ⚠️  Backup test failed (database might be empty)"
fi

# Step 5: Setup cron for daily backups
echo ""
echo "📌 Step 5: Setting up daily automated backups..."
CRON_CMD="0 2 * * * $HOME/bin/backup-entries-db.sh >> $HOME/logs/entries-backup-cron.log 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "backup-entries-db.sh"; then
  echo "   ⚠️  Cron job already exists"
else
  (crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
  echo "   ✅ Daily backup scheduled for 2:00 AM"
fi

# Step 6: Show current database status
echo ""
echo "📌 Step 6: Current database status..."
/opt/homebrew/opt/postgresql@16/bin/psql -d entries -c "
  SELECT 
    'journals' as table_name, 
    COUNT(*) as row_count,
    pg_size_pretty(pg_total_relation_size('journals')) as size
  FROM journals
  UNION ALL
  SELECT 'plans', COUNT(*), pg_size_pretty(pg_total_relation_size('plans')) FROM plans
  UNION ALL
  SELECT 'protocols', COUNT(*), pg_size_pretty(pg_total_relation_size('protocols')) FROM protocols
  UNION ALL
  SELECT 'journal_metadata', COUNT(*), pg_size_pretty(pg_total_relation_size('journal_metadata')) FROM journal_metadata
  ORDER BY table_name;
"

# Step 7: MCP config update instructions
echo ""
echo "📌 Step 7: Next steps for MCP configuration..."
echo ""
echo "To use local PostgreSQL with MCP, update .mcp.json:"
echo ""
echo "Replace the 'supabase' section with:"
echo ""
cat << 'MCP_CONFIG'
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/entries"]
    }
MCP_CONFIG
echo ""
echo "Then restart Cursor/Claude."
echo ""

# Summary
echo "============================================"
echo "✅ Setup Complete!"
echo ""
echo "Configured:"
echo "  • Local PostgreSQL database 'entries'"
echo "  • Backup directory in Google Drive"
echo "  • Daily automated backups at 2:00 AM"
echo "  • Backup script: ~/bin/backup-entries-db.sh"
echo ""
echo "Manual backup: ~/bin/backup-entries-db.sh"
echo "View logs: tail -f ~/logs/entries-backup.log"
echo ""
echo "To migrate data from Supabase:"
echo "  1. Ensure Supabase is awake (visit dashboard)"
echo "  2. Follow instructions in MIGRATION_GUIDE.md"
echo "  3. Or ask Claude to help with MCP-based migration"
echo ""


