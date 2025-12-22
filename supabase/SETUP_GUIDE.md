# Supabase Setup Guide

## Step 1: Run SQL Migrations ⚡

You need to run the SQL migrations in your Supabase dashboard.

### Go to SQL Editor
1. Open https://supabase.com/dashboard/project/hjajrstidftkjwqmdung/sql/new
2. You'll see the SQL Editor

### Run Migration 1: Initialize Schema

Copy the entire contents of `/supabase/migrations/001_init_schema.sql` and paste into the SQL editor, then click **Run**.

This creates:
- ✅ journals table
- ✅ plans table  
- ✅ protocols table
- ✅ journal_metadata table
- ✅ Vector indexes for semantic search

### Run Migration 2: Create Search Functions

Copy the entire contents of `/supabase/migrations/002_search_functions.sql` and paste into the SQL editor, then click **Run**.

This creates:
- ✅ search_journals() function
- ✅ search_plans() function
- ✅ search_protocols() function
- ✅ get_related_journals_for_plan() function
- ✅ search_all_entries() function

### Run Migration 3: Set Up Security Policies

Copy the entire contents of `/supabase/migrations/003_rls_policies.sql` and paste into the SQL editor, then click **Run**.

This sets up:
- ✅ Row Level Security policies (permissive for personal use)

---

## Step 2: Get Your Service Role Key 🔑

1. Go to https://supabase.com/dashboard/project/hjajrstidftkjwqmdung/settings/api
2. Find "service_role" key under "Project API keys"
3. Copy it

---

## Step 3: Get Your OpenAI API Key 🤖

1. Go to https://platform.openai.com/api-keys
2. Create a new secret key (or use existing)
3. Copy it

---

## Step 4: Configure Environment 📝

Edit `.env` file in the root directory:

```bash
# Already configured:
SUPABASE_URL=https://hjajrstidftkjwqmdung.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...

# Add these:
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here  # From Step 2
OPENAI_API_KEY=sk-...                                  # From Step 3
```

---

## Step 5: Test Connection ✓

```bash
node supabase/test-connection.js
```

You should see:
```
🔍 Testing Supabase connection...

1. Testing basic connection...
   ✅ Connected to Supabase

2. Checking pgvector extension...
   ✅ pgvector extension enabled

3. Checking tables...
   ✅ journals: 0 rows
   ✅ plans: 0 rows
   ✅ protocols: 0 rows
   ✅ journal_metadata: 0 rows

✅ Supabase is ready!
```

---

## What's Next?

Once Supabase is set up, the next steps are:

1. **Create migration scripts** to populate data from JSON files
2. **Generate embeddings** for all content using OpenAI
3. **Test semantic search** with sample queries
4. **Update CLI tools** to use Supabase backend

---

## Troubleshooting

### "function search_journals does not exist"
- You haven't run migration 002_search_functions.sql yet

### "relation journals does not exist"
- You haven't run migration 001_init_schema.sql yet

### "extension vector does not exist"
- pgvector extension not enabled. Run migration 001 again.

### Connection timeout
- Check your internet connection
- Verify SUPABASE_URL and SUPABASE_ANON_KEY in .env

---

## Quick Command Reference

```bash
# Test connection
node supabase/test-connection.js

# View Supabase dashboard
open https://supabase.com/dashboard/project/hjajrstidftkjwqmdung

# View SQL Editor
open https://supabase.com/dashboard/project/hjajrstidftkjwqmdung/sql/new

# View API settings
open https://supabase.com/dashboard/project/hjajrstidftkjwqmdung/settings/api
```

