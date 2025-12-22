# Data Migration to Supabase

## Step-by-Step Migration Process

### ✅ Prerequisites
- [x] Supabase tables created
- [x] Vector extension enabled
- [ ] OpenAI API key in `.env`

---

## Migration Steps

### Step 1: Migrate Journal Entries (Without Embeddings)
```bash
node scripts/migrate/01-migrate-journals.js
```

This will:
- ✅ Migrate ~650 journal entries from `journal_entries.json`
- ✅ Migrate daily logs from `daily_logs.json`
- ✅ Migrate metadata (people, emotions, concepts)
- ✅ Auto-categorize by context (personal/social/professional/projects)
- ⏳ Embeddings will be null (added in Step 4)

---

### Step 2: Migrate Plans
```bash
node scripts/migrate/02-migrate-plans.js
```

This will:
- ✅ Migrate all plans from `plans/data/plans.json`
- ✅ Include full plan content from markdown files
- ⏳ Embeddings will be null (added in Step 4)

---

### Step 3: Migrate Protocols
```bash
node scripts/migrate/03-migrate-protocols.js
```

This will:
- ✅ Migrate all protocol files from `Protocols/` folder
- ⏳ Embeddings will be null (added in Step 4)

---

### Step 4: Generate Embeddings with OpenAI
```bash
node scripts/migrate/04-generate-embeddings.js
```

This will:
- Generate vector embeddings for all content using OpenAI
- Update journals, plans, and protocols with embeddings
- Cost: ~$0.15 for ~650 entries (one-time cost)

**⚠️ Requires: OpenAI API key in `.env`**

---

## Quick Start (Run All)

```bash
# Migrate all data without embeddings
node scripts/migrate/01-migrate-journals.js
node scripts/migrate/02-migrate-plans.js
node scripts/migrate/03-migrate-protocols.js

# Then generate embeddings (requires OpenAI API key)
node scripts/migrate/04-generate-embeddings.js
```

---

## Verify Migration

After each step, you can verify in Supabase:
```bash
node supabase/test-connection.js
```

Or check in Supabase Dashboard:
https://supabase.com/dashboard/project/hjajrstidftkjwqmdung/editor

---

## Estimated Times

- Step 1 (Journals): ~30 seconds
- Step 2 (Plans): ~5 seconds  
- Step 3 (Protocols): ~5 seconds
- Step 4 (Embeddings): ~5-10 minutes (API calls)

---

## What Happens to JSON Files?

Your original JSON files are **not modified or deleted**. They serve as backups.

---

## Troubleshooting

### "Error inserting batch"
- Check your `.env` has correct `SUPABASE_URL` and `SUPABASE_ANON_KEY`
- Verify tables were created (Step 0)

### "Cannot find module"
- Run: `npm install` in project root

### Embeddings take too long
- This is normal! OpenAI API has rate limits
- Script will show progress
- Can be interrupted and resumed

---

## Next: Test Semantic Search!

Once embeddings are generated, you can:
```bash
node scripts/test-search.js "When was I most productive?"
```

