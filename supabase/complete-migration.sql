-- ============================================================================
-- SUPABASE MIGRATION: Entries RAG System with pgvector
-- Run this entire file in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- PART 1: Enable pgvector extension and Create Tables
-- ============================================================================

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create journals table
CREATE TABLE IF NOT EXISTS journals (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  content TEXT NOT NULL,
  type TEXT, -- 'quick', 'reflection', 'end-of-day', etc.
  context TEXT, -- 'personal', 'social', 'professional', 'projects'
  summary TEXT,
  word_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  embedding vector(1536) -- OpenAI text-embedding-3-small dimension
);

-- Create plans table
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT,
  status TEXT,
  context_id TEXT,
  objective_id TEXT,
  project_id TEXT,
  content TEXT NOT NULL,
  file_path TEXT,
  created_at DATE,
  updated_at DATE,
  tags TEXT[],
  embedding vector(1536)
);

-- Create protocols table
CREATE TABLE IF NOT EXISTS protocols (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  file_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  embedding vector(1536)
);

-- Create journal_metadata table (preserving existing RAG metadata)
CREATE TABLE IF NOT EXISTS journal_metadata (
  journal_id TEXT PRIMARY KEY REFERENCES journals(id) ON DELETE CASCADE,
  people TEXT[],
  emotions TEXT[],
  concepts TEXT[],
  key_insights TEXT[]
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_journals_date ON journals(date DESC);
CREATE INDEX IF NOT EXISTS idx_journals_context ON journals(context);
CREATE INDEX IF NOT EXISTS idx_journals_type ON journals(type);
CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
CREATE INDEX IF NOT EXISTS idx_plans_context ON plans(context_id);

-- Create vector similarity search indexes
-- Note: These use ivfflat algorithm for approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS idx_journals_embedding ON journals 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_plans_embedding ON plans 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_protocols_embedding ON protocols 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_journals_updated_at ON journals;
CREATE TRIGGER update_journals_updated_at BEFORE UPDATE ON journals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_protocols_updated_at ON protocols;
CREATE TRIGGER update_protocols_updated_at BEFORE UPDATE ON protocols
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 2: Create Search Functions
-- ============================================================================

-- Function to search journals by semantic similarity
CREATE OR REPLACE FUNCTION search_journals(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  filter_context text DEFAULT NULL,
  filter_type text DEFAULT NULL
)
RETURNS TABLE (
  id text,
  date date,
  content text,
  type text,
  context text,
  summary text,
  word_count int,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.id,
    j.date,
    j.content,
    j.type,
    j.context,
    j.summary,
    j.word_count,
    1 - (j.embedding <=> query_embedding) as similarity
  FROM journals j
  WHERE 
    (filter_context IS NULL OR j.context = filter_context)
    AND (filter_type IS NULL OR j.type = filter_type)
    AND 1 - (j.embedding <=> query_embedding) > match_threshold
  ORDER BY j.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to search plans by semantic similarity
CREATE OR REPLACE FUNCTION search_plans(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  filter_status text DEFAULT NULL
)
RETURNS TABLE (
  id text,
  title text,
  type text,
  status text,
  content text,
  context_id text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.title,
    p.type,
    p.status,
    p.content,
    p.context_id,
    1 - (p.embedding <=> query_embedding) as similarity
  FROM plans p
  WHERE 
    (filter_status IS NULL OR p.status = filter_status)
    AND 1 - (p.embedding <=> query_embedding) > match_threshold
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to search protocols by semantic similarity
CREATE OR REPLACE FUNCTION search_protocols(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id text,
  title text,
  content text,
  category text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pr.id,
    pr.title,
    pr.content,
    pr.category,
    1 - (pr.embedding <=> query_embedding) as similarity
  FROM protocols pr
  WHERE 1 - (pr.embedding <=> query_embedding) > match_threshold
  ORDER BY pr.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to get related journals for a plan (based on context and content similarity)
CREATE OR REPLACE FUNCTION get_related_journals_for_plan(
  plan_id_param text,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id text,
  date date,
  content text,
  context text,
  summary text,
  similarity float
)
LANGUAGE plpgsql
AS $$
DECLARE
  plan_embedding vector(1536);
  plan_context text;
BEGIN
  -- Get the plan's embedding and context
  SELECT p.embedding, p.context_id INTO plan_embedding, plan_context
  FROM plans p
  WHERE p.id = plan_id_param;

  -- If no plan found, return empty
  IF plan_embedding IS NULL THEN
    RETURN;
  END IF;

  -- Return similar journals, prioritizing same context
  RETURN QUERY
  SELECT
    j.id,
    j.date,
    j.content,
    j.context,
    j.summary,
    1 - (j.embedding <=> plan_embedding) as similarity
  FROM journals j
  WHERE 
    j.embedding IS NOT NULL
    AND (plan_context IS NULL OR j.context = plan_context)
  ORDER BY 
    CASE WHEN j.context = plan_context THEN 0 ELSE 1 END,
    j.embedding <=> plan_embedding
  LIMIT match_count;
END;
$$;

-- Function to search across all content types
CREATE OR REPLACE FUNCTION search_all_entries(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id text,
  type text,
  title text,
  content text,
  context text,
  date date,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  (
    SELECT
      j.id,
      'journal'::text as type,
      NULL::text as title,
      j.content,
      j.context,
      j.date,
      1 - (j.embedding <=> query_embedding) as similarity
    FROM journals j
    WHERE 
      j.embedding IS NOT NULL
      AND 1 - (j.embedding <=> query_embedding) > match_threshold
  )
  UNION ALL
  (
    SELECT
      p.id,
      'plan'::text as type,
      p.title,
      p.content,
      p.context_id as context,
      p.created_at::date as date,
      1 - (p.embedding <=> query_embedding) as similarity
    FROM plans p
    WHERE 
      p.embedding IS NOT NULL
      AND 1 - (p.embedding <=> query_embedding) > match_threshold
  )
  UNION ALL
  (
    SELECT
      pr.id,
      'protocol'::text as type,
      pr.title,
      pr.content,
      pr.category as context,
      pr.created_at::date as date,
      1 - (pr.embedding <=> query_embedding) as similarity
    FROM protocols pr
    WHERE 
      pr.embedding IS NOT NULL
      AND 1 - (pr.embedding <=> query_embedding) > match_threshold
  )
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- PART 3: Enable Row Level Security (RLS)
-- ============================================================================

-- Enable Row Level Security (RLS)
ALTER TABLE journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_metadata ENABLE ROW LEVEL SECURITY;

-- For personal use, allow all operations with anon key
-- In production, you'd want more granular policies based on auth.uid()

-- Journals policies
DROP POLICY IF EXISTS "Allow all operations on journals" ON journals;
CREATE POLICY "Allow all operations on journals" ON journals
  FOR ALL USING (true) WITH CHECK (true);

-- Plans policies
DROP POLICY IF EXISTS "Allow all operations on plans" ON plans;
CREATE POLICY "Allow all operations on plans" ON plans
  FOR ALL USING (true) WITH CHECK (true);

-- Protocols policies
DROP POLICY IF EXISTS "Allow all operations on protocols" ON protocols;
CREATE POLICY "Allow all operations on protocols" ON protocols
  FOR ALL USING (true) WITH CHECK (true);

-- Journal metadata policies
DROP POLICY IF EXISTS "Allow all operations on journal_metadata" ON journal_metadata;
CREATE POLICY "Allow all operations on journal_metadata" ON journal_metadata
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- MIGRATION COMPLETE!
-- ============================================================================
-- Next steps:
-- 1. Run: node supabase/test-connection.js
-- 2. Migrate your data from JSON files
-- 3. Generate embeddings
-- ============================================================================

