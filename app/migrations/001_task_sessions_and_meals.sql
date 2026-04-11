-- Migration 001: task_sessions, daily_time_snapshots, meals, meal_plans, user_config
-- Run with: psql -U matthewsteele -d entries -f app/migrations/001_task_sessions_and_meals.sql

-- Task sessions: source of truth for all time analytics going forward
CREATE TABLE IF NOT EXISTS task_sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  task_id TEXT NOT NULL,
  task_title TEXT NOT NULL,
  context TEXT NOT NULL,          -- cul/prof/per/soc/proj/heal/us
  focus_level INTEGER DEFAULT 2,  -- 0-5
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,           -- null = currently active
  source TEXT DEFAULT 'live',     -- 'live' | 'legacy' | 'migrated'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS task_sessions_started_at_idx ON task_sessions (started_at);
CREATE INDEX IF NOT EXISTS task_sessions_context_started_at_idx ON task_sessions (context, started_at);

-- Daily snapshots: backfilled from time-log.json (legacy context-minutes-only data)
-- New sessions are always queried live from task_sessions, not this table.
-- This table exists solely to represent pre-migration history.
CREATE TABLE IF NOT EXISTS daily_time_snapshots (
  date DATE PRIMARY KEY,
  context_minutes JSONB NOT NULL, -- {cul: 240, prof: 0, per: 0, soc: 0, proj: 0, heal: 0, us: 0}
  source TEXT DEFAULT 'legacy',   -- 'legacy' (from time-log.json) | 'computed' (future use)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Meals reference data
CREATE TABLE IF NOT EXISTS meals (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  category TEXT,                  -- breakfast/lunch/dinner/snack
  ingredients TEXT[],
  recipe TEXT,
  protein NUMERIC,
  carbs NUMERIC,
  fat NUMERIC,
  calories NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily meal plans
CREATE TABLE IF NOT EXISTS meal_plans (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  date DATE NOT NULL,
  slot TEXT NOT NULL,             -- breakfast/lunch/dinner/snack-1/snack-2
  meal_id TEXT REFERENCES meals(id) ON DELETE SET NULL,
  planned_time TIME,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, slot)
);

-- User config: persistent settings (focused minutes targets, etc.)
CREATE TABLE IF NOT EXISTS user_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default focused minutes targets (minutes * focus level per day per context)
INSERT INTO user_config (key, value) VALUES
  ('focused_minutes_targets', '{"cul": 180, "proj": 120, "per": 60, "soc": 30, "prof": 60, "heal": 30, "us": 0}')
ON CONFLICT (key) DO NOTHING;
