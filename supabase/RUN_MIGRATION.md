# 🚀 QUICK START: Run Migrations

## Option 1: Copy/Paste One File (EASIEST)

1. **Open Supabase SQL Editor**
   https://supabase.com/dashboard/project/hjajrstidftkjwqmdung/sql/new

2. **Open this file:**
   `/Users/matthewsteele/Desktop/entries/supabase/complete-migration.sql`

3. **Copy the entire contents** (it's one complete migration)

4. **Paste into SQL Editor**

5. **Click "Run"** (or press Cmd+Enter)

6. **Wait for success message** ✅

---

## What Gets Created:

✅ **4 Tables with Vector Support:**
- `journals` - Journal entries with embeddings
- `plans` - Plans with embeddings
- `protocols` - Protocols with embeddings
- `journal_metadata` - People, emotions, concepts

✅ **5 Search Functions:**
- `search_journals()`
- `search_plans()`
- `search_protocols()`
- `get_related_journals_for_plan()`
- `search_all_entries()`

✅ **Vector Indexes:**
- Fast similarity search using IVFFlat algorithm

✅ **Security:**
- Row Level Security enabled (permissive for personal use)

---

## After Running Migration:

Test the connection:
```bash
node supabase/test-connection.js
```

Expected output:
```
✅ Connected to Supabase
✅ pgvector extension enabled
✅ journals: 0 rows
✅ plans: 0 rows
✅ protocols: 0 rows
✅ journal_metadata: 0 rows
```

---

## Troubleshooting:

### "extension vector does not exist"
- You need to enable vector extension first
- Go to: Database → Extensions → Enable "vector"

### "permission denied"
- Make sure you're logged into Supabase
- Try refreshing the SQL Editor page

### Syntax errors
- Make sure you copied the ENTIRE file
- Check no characters were lost during copy/paste

---

## Next Steps:

After migration succeeds:
1. ✅ Test connection
2. 📦 Migrate data from JSON files
3. 🤖 Generate embeddings with OpenAI
4. 🔍 Test semantic search

