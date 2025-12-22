# 🤖 Claude Journal System - Quick Reference

## For Claude AI: How to Add Journal Entries

When the user asks you to journal something or record a thought, use this command:

```bash
node scripts/journal-supabase.js add "<the journal entry content>"
```

### Key Features:
- ✅ **Automatic embeddings** - Every entry gets an AI embedding for semantic search
- ✅ **Auto-categorization** - Entries are automatically categorized (personal/social/professional/projects)
- ✅ **Supabase storage** - All entries go directly to the database
- ✅ **Semantic search** - Users can search by meaning, not just keywords

---

## Common Claude Commands

### 1. Add a journal entry (most common)
```bash
node scripts/journal-supabase.js add "Today I made progress on the RAG system. The embeddings are working well and semantic search feels magical."
```

### 2. Add with specific context
```bash
node scripts/journal-supabase.js add "Deployed the new feature to production" --context projects
```

### 3. Add with specific type
```bash
node scripts/journal-supabase.js add "Feeling grateful for the breakthrough today" --type insight
```

---

## Commands for the User

### Search semantically
```bash
node scripts/journal-supabase.js search "when was I most productive?"
node scripts/journal-supabase.js search "times I felt stuck" --limit 10
node scripts/journal-supabase.js search "work breakthroughs" --context professional
```

### View recent entries
```bash
node scripts/journal-supabase.js recent
node scripts/journal-supabase.js recent --limit 20
node scripts/journal-supabase.js recent --context projects
```

### Get specific entry
```bash
node scripts/journal-supabase.js get <entry-id>
```

---

## Entry Contexts (auto-detected)
- **personal** - Feelings, reflections, personal growth
- **social** - Relationships, conversations, social activities
- **professional** - Work, meetings, career
- **projects** - Code, building, technical work

## Entry Types
- **event** - Concrete happenings, experiences, activities (what happened, when, where, who was involved)
- **contemplation** - Decision points, internal debates, explorations of questions being considered
- **plan** - Forward-looking initiatives with multiple steps, projects and execution strategies
- **protocol** - Repeatable procedures, rules, or processes ("how to do X" patterns)

### Analysis Guidance by Entry Type
- **Events**: Look for relationship insights, pattern observations
- **Contemplations**: Provide framework for thinking through decision points, questions to consider
- **Plans**: Offer risk mitigation, resource identification, timeline reality-checks
- **Protocols**: Suggest optimization ideas, potential challenges, complementary protocols

---

## Example Conversation Flow

**User:** "Hey Claude, can you journal this for me: Had a great conversation with Sarah about the new project direction. Feeling excited about the possibilities."

**Claude:** *Runs:*
```bash
node scripts/journal-supabase.js add "Had a great conversation with Sarah about the new project direction. Feeling excited about the possibilities."
```

*Output:*
```
📝 Adding journal entry to Supabase...
🤖 Generating AI embedding...

✅ Journal entry added successfully!
   ID: 550e8400-e29b-41d4-a716-446655440000
   Date: 2025-11-17
   Context: social
   Type: reflection
   Embedding: ✓

   "Had a great conversation with Sarah about the new project direction. Feeling excited about the possibilities."
```

---

## User Search Examples

**User:** "Claude, search my journal for times I felt productive"

**Claude:** *Runs:*
```bash
node scripts/journal-supabase.js search "times I felt productive"
```

**User:** "Show me my recent project updates"

**Claude:** *Runs:*
```bash
node scripts/journal-supabase.js recent --context projects --limit 10
```

---

## Migration Commands (One-time)

These have already been run or are ready to run:

```bash
# Step 1-3: Migrate existing data (already done if you have data in Supabase)
node scripts/migrate/01-migrate-journals.js
node scripts/migrate/02-migrate-plans.js
node scripts/migrate/03-migrate-protocols.js

# Step 4: Generate embeddings for existing entries (run once)
node scripts/migrate/04-generate-embeddings.js
```

---

## Environment Setup

Make sure `.env` file has:
```bash
SUPABASE_URL=https://hjajrstidftkjwqmdung.supabase.co
SUPABASE_ANON_KEY=<your-key>
OPENAI_API_KEY=<your-key>
DATABASE_URL=<your-db-url>
```

---

## Tips for Claude

1. **Always use the full command** - Don't abbreviate or modify the syntax
2. **Quote the content** - Use double quotes around journal entries
3. **Let auto-categorization work** - Don't manually specify context unless user asks
4. **Confirm success** - After adding an entry, acknowledge what was recorded
5. **Use semantic search** - When user asks "when did I...", use the search command

---

## Cost Information

- **Embeddings**: ~$0.02 per 1M tokens
- **Each entry**: ~100-500 tokens = ~$0.0001-0.001 per entry
- **Very affordable** for personal use (~$1-2 per year for daily journaling)

---

## What This Replaces

The old CLI tools (`journal/scripts/journal-cli.js`, `daily-cli.js`) wrote to JSON files.  
The **new system** writes to Supabase with automatic embeddings and semantic search.

Use `scripts/journal-supabase.js` for all new entries going forward!

