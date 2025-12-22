# Supabase Setup for Entries Project

This directory contains the database schema, migration scripts, and configuration for the Entries RAG system.

## Quick Start

### 1. Run Migrations in Supabase

Go to your Supabase dashboard:
1. Navigate to https://supabase.com/dashboard/project/hjajrstidftkjwqmdung
2. Click on "SQL Editor" in the left sidebar
3. Run each migration file in order:

**Step 1: Initialize Schema**
```sql
-- Copy and paste contents of migrations/001_init_schema.sql
-- This creates the tables and vector indexes
```

**Step 2: Create Search Functions**
```sql
-- Copy and paste contents of migrations/002_search_functions.sql
-- This creates the semantic search functions
```

**Step 3: Set Up RLS Policies**
```sql
-- Copy and paste contents of migrations/003_rls_policies.sql
-- This enables row-level security
```

### 2. Install Dependencies

```bash
npm install @supabase/supabase-js dotenv openai
```

### 3. Configure Environment

✅ **`.env` file is already configured** with:
- `SUPABASE_URL`: ✓
- `SUPABASE_ANON_KEY`: ✓
- `DATABASE_URL`: ✓ (with password: journal2025planprotocols)

**Still need to add:**
- `SUPABASE_SERVICE_ROLE_KEY`: Get from Supabase dashboard → Settings → API
- `OPENAI_API_KEY`: Get from https://platform.openai.com/api-keys

### 4. Test Connection

```bash
node supabase/test-connection.js
```

## Database Schema

### Tables

**journals**
- Stores all journal entries (unified from journal_entries.json and daily_logs.json)
- Includes context categorization (personal/social/professional/projects)
- Vector embeddings for semantic search

**plans**
- Stores all plans from the plans system
- Links to journal entries through context
- Vector embeddings for finding related content

**protocols**
- Stores reusable protocols and workflows
- Searchable by semantic similarity

**journal_metadata**
- Preserves existing RAG metadata (people, emotions, concepts, key_insights)
- Links to journals table

### Search Functions

**search_journals(query_embedding, threshold, count, filter_context, filter_type)**
- Search journals by semantic similarity
- Optional filtering by context and type

**search_plans(query_embedding, threshold, count, filter_status)**
- Search plans by semantic similarity

**search_protocols(query_embedding, threshold, count)**
- Search protocols by semantic similarity

**get_related_journals_for_plan(plan_id, count)**
- Get journals related to a specific plan
- Prioritizes same context

**search_all_entries(query_embedding, threshold, count)**
- Search across journals, plans, and protocols
- Returns unified results

## Migration Scripts

Location: `/Users/matthewsteele/Desktop/entries/scripts/migrate/`

These will be created to:
1. Backup existing JSON files
2. Merge daily_logs into journals with proper schema
3. Categorize entries by context (using AI)
4. Generate embeddings
5. Upload to Supabase

## Vector Search

pgvector uses cosine similarity to find semantically similar content.

**Similarity scores:**
- 1.0 = identical
- 0.8+ = very similar
- 0.7-0.8 = somewhat similar
- < 0.7 = not very similar

Default threshold: 0.7 (adjustable based on results)

## File Structure

```
supabase/
├── README.md                    # This file
├── config.js                    # Supabase client configuration
├── test-connection.js          # Test database connection
└── migrations/
    ├── 001_init_schema.sql     # Create tables and indexes
    ├── 002_search_functions.sql # Semantic search functions
    └── 003_rls_policies.sql    # Row-level security
```

## Next Steps

After setting up Supabase:
1. Run migration scripts to populate data
2. Test semantic search with sample queries
3. Update CLI tools to use Supabase backend
4. Build interactive query interface

## Costs

**Supabase Free Tier:**
- 500 MB database storage (plenty for text)
- 1 GB file storage
- 2 GB bandwidth
- Unlimited API requests

**OpenAI Embeddings:**
- text-embedding-3-small: $0.02 per 1M tokens
- ~650 entries × 150 words = ~100K tokens = $0.002
- Incremental updates negligible

## Security Notes

- `.env` is in `.gitignore` - never commit credentials
- RLS policies are permissive for personal use
- For multi-user scenarios, implement auth-based policies
- Service role key has full access - keep secure

