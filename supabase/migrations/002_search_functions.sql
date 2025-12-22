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

