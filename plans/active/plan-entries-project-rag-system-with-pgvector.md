# Entries Project - RAG System with PGVector

**Plan ID:** `plan-1763107686748`
**Type:** Project Plan
**Status:** Draft
**Created:** `2025-11-14`
**Context:** `personal`
**Objective:** `Not specified`
**Project:** `Not specified`

---

## Overview

### Problem Statement
*What problem are we solving?*

Currently, the entries project has:
- Two separate journal systems (legacy `journal_entries.json` and new `daily_logs.json`) that don't communicate
- Keyword-based RAG search that lacks semantic understanding
- No unified system for journals, plans, and protocols
- No categorization of journal entries by context (personal, social, professional, projects)
- Time tracking system that needs to be deferred to later integration with Sunsama

We need a unified, AI-powered knowledge management system that can semantically search across journals, plans, and protocols to support reflective planning and decision-making.

### Goals
*What do we want to achieve?*

- Connect journal entries to PostgreSQL with pgvector for semantic search
- Connect plans to PGVector for context-aware planning
- Add protocols to PGVector for systematic process retrieval
- Separate journals into four contexts: personal, social, professional, and projects
- Enable AI-assisted retrieval of relevant entries when working on plans
- Unify legacy and new journal systems into a single source of truth
- Create conversational interface for querying life patterns and insights
- build a system that saves copies locally and to google drive for security

### Success Criteria
*How will we know we've succeeded?*

- Can ask natural language questions and get semantically relevant journal entries
- Plans automatically surface related journal entries as context
- Protocols are retrievable and can guide workflows
- Journal entries are properly categorized by context (personal/social/professional/projects)
- All journal data (legacy + new) is migrated and queryable
- Can query: "When was I most productive on technical projects?" and get accurate results
- Supabase free tier successfully hosts all data with pgvector enabled


---

## Strategy

### Approach
*How will we solve this?*

**Phase 1: Infrastructure Setup**
- Set up Supabase account with PostgreSQL + pgvector
- Design unified schema for journals, plans, and protocols
- Create migration scripts for legacy data

**Phase 2: Data Integration**
- Migrate and unify journal systems (merge daily_logs.json into journal_entries.json with proper schema)
- Add context categorization (personal/social/professional/projects) to all journal entries
- Generate embeddings for all existing content using OpenAI's text-embedding-3-small model
- Store embeddings in Supabase pgvector

**Phase 3: Query Interface**
- Build CLI for natural language queries across all content types
- Implement semantic search with pgvector similarity search
- Create plan-aware context retrieval (plans pull relevant journal entries automatically)
- Build interactive journal CLI that can reference past entries

**Phase 4: Integration & Refinement**
- Integrate protocols into searchable system
- Add tagging and cross-references between journals/plans/protocols
- Defer time-tracking integration; use Supabase for planning integration with Sunsama

### Key Decisions
*What are the important choices we're making?*

- **Supabase over local PostgreSQL**: Cloud-hosted for accessibility, free tier sufficient for personal use
- **OpenAI embeddings over open-source**: Better quality, acceptable cost for personal project (~$0.10 per 1M tokens)
- **Unified journal schema**: Merge daily_logs into journal_entries with type field (quick, reflection, end-of-day, etc.)
- **Four-context categorization**: Personal, Social, Professional, Projects - broad enough to be clear, specific enough to be useful
- **Deferring time-tracking**: Focus on core RAG functionality first; Sunsama handles daily task planning for now
- **Keep existing CLI tools**: journal-cli.js, plan-cli.js remain as interfaces, just backed by Supabase

### Risks & Mitigation
*What could go wrong and how will we handle it?*

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Data loss during migration | High | Low | Create full backup before migration; test on subset first |
| Supabase free tier limits exceeded | Medium | Low | Monitor usage; 500MB limit is 100x current size; can upgrade to $25/mo if needed |
| Poor embedding quality/relevance | Medium | Medium | Test with sample queries before full migration; tune similarity thresholds |
| Context categorization is subjective | Low | High | Start with AI-assisted categorization; allow manual overrides; iterate based on usage |
| Cost of embeddings generation | Low | Low | ~650 entries × 150 words avg = ~$0.15 one-time cost; incremental updates negligible |
| Breaking existing tools/workflows | Medium | Medium | Maintain backward compatibility with CLI interfaces; gradual cutover |

---

## Execution Plan

### Phases
*Break down into major phases*

1. **Phase 1: Infrastructure Setup (Week 1)**
   - Set up Supabase account and configure pgvector
   - Design database schema for unified entries system
   - Set up OpenAI API for embeddings generation
   - Create backup of all existing data

2. **Phase 2: Data Migration & Integration (Week 1-2)**
   - Migrate journal entries to unified schema with context categorization
   - Generate embeddings for existing journals, plans, protocols
   - Load data into Supabase with pgvector indices
   - Validate data integrity and search functionality

3. **Phase 3: Query Interface Development (Week 2-3)**
   - Build semantic search CLI (`entries ask <query>`)
   - Update journal-cli.js to use Supabase backend
   - Add plan-aware context retrieval
   - Create interactive journaling with AI coaching interface

4. **Phase 4: Integration & Polish (Week 3-4)**
   - Add protocols to searchable system
   - Implement cross-references between content types
   - Build context-specific journal views
   - Documentation and usage examples

### Tasks
*High-level tasks (will be broken down into trackable tasks)*

**Infrastructure**
- [ ] Create Supabase account and project
- [ ] Enable pgvector extension in Supabase
- [ ] Design unified schema (journals, plans, protocols, embeddings tables)
- [ ] Set up OpenAI API key and test embeddings

**Data Migration**
- [ ] Backup all existing JSON files
- [ ] Create migration script for journal_entries.json → Supabase
- [ ] Merge daily_logs.json into unified journal system
- [ ] Categorize existing entries (personal/social/professional/projects) using AI
- [ ] Generate embeddings for all 650+ journal entries
- [ ] Migrate plans and protocols with embeddings

**Query Interface**
- [ ] Build `entries-cli.js` for semantic search
- [ ] Implement pgvector similarity search queries
- [ ] Update journal-cli.js to use Supabase as backend
- [ ] Create plan context retrieval (plans pull relevant journals)
- [ ] Build interactive AI coaching journal interface
- [ ] Add batch query capabilities for analysis

**Integration**
- [ ] Add protocols to vector search
- [ ] Implement cross-referencing between journals/plans/protocols
- [ ] Create context-filtered views (show only professional journals, etc.)
- [ ] Test end-to-end workflows
- [ ] Write documentation and examples

### Timeline
*Rough timeline estimates*

**Total Duration:** 3-4 weeks (part-time)

- **Week 1:** Infrastructure + Start Migration
  - Days 1-2: Supabase setup, schema design
  - Days 3-5: Data backup, migration scripts, initial data load
  - Days 6-7: Test embeddings and search quality

- **Week 2:** Complete Migration + Start Interface
  - Days 8-10: Complete journal categorization and embedding generation
  - Days 11-14: Build CLI search interface, test queries

- **Week 3:** Interface Development
  - Days 15-17: Update existing CLIs to use Supabase
  - Days 18-21: Plan-aware retrieval, interactive journaling

- **Week 4:** Integration & Polish
  - Days 22-24: Protocols integration, cross-references
  - Days 25-28: Testing, documentation, refinement

### Resources Needed
*What do we need to execute this?*

**Technical**
- Supabase account (free tier)
- OpenAI API key (~$0.50 budget for embeddings)
- Node.js environment (already have)
- Python environment for migration scripts (already have)

**Knowledge**
- Supabase pgvector documentation
- OpenAI embeddings API documentation
- SQL for schema design and queries
- Node.js for CLI updates

**Time**
- ~20-30 hours over 3-4 weeks
- Can be done in parallel with other work
- Bulk of work is one-time migration

**Optional (Future)**
- Supabase Pro tier ($25/mo) if free tier becomes limiting
- Fine-tuned embedding model for better relevance

---

## Notes

### Implementation Details

**Database Schema (Proposed)**
```sql
-- Main journals table
CREATE TABLE journals (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  content TEXT NOT NULL,
  type TEXT, -- 'quick', 'reflection', 'end-of-day', etc.
  context TEXT, -- 'personal', 'social', 'professional', 'projects'
  summary TEXT,
  word_count INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  embedding vector(1536) -- OpenAI text-embedding-3-small dimension
);

-- Plans table
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT,
  status TEXT,
  context_id TEXT,
  content TEXT NOT NULL,
  created_at DATE,
  updated_at DATE,
  embedding vector(1536)
);

-- Protocols table
CREATE TABLE protocols (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  embedding vector(1536)
);

-- Metadata tables for existing RAG data
CREATE TABLE journal_metadata (
  journal_id TEXT PRIMARY KEY REFERENCES journals(id),
  people TEXT[],
  emotions TEXT[],
  concepts TEXT[],
  key_insights TEXT[]
);

-- Create vector similarity search indexes
CREATE INDEX ON journals USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON plans USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON protocols USING ivfflat (embedding vector_cosine_ops);
```

**Example Query Pattern**
```javascript
// Semantic search for journals
const { data } = await supabase.rpc('search_journals', {
  query_embedding: await getEmbedding(userQuery),
  match_threshold: 0.7,
  match_count: 5,
  filter_context: 'professional' // optional
});
```

### Related Documents
- **Refactoring Protocol:** `/Protocols/refactoring-protocol.md` - Follow this for structured implementation
- **Existing RAG System:** `/journal/scripts/README_RAG.md` - Reference for metadata structure
- **Current Schema:** Review existing JSON structures before migration

### Next Steps (Immediate)
1. Review and approve this plan
2. Set up Supabase account (5 minutes)
3. Create database schema (30 minutes)
4. Test with 10 sample entries before full migration

### Future Enhancements (Out of Scope)
- Time-tracking integration (defer to Sunsama integration)
- Real-time sync across devices
- Mobile app interface
- Advanced analytics dashboard
- Automatic journal prompts based on patterns
- Integration with calendar for context-aware journaling
- Voice-to-text journaling
- Image/photo attachments with vision embeddings

### References
- Supabase pgvector guide: https://supabase.com/docs/guides/ai/vector-columns
- OpenAI embeddings: https://platform.openai.com/docs/guides/embeddings
- Existing implementation: `/journal/scripts/search_rag.py`

---

*This plan will generate trackable tasks that reference this document.*
