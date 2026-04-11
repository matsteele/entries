-- Migration 002: Goals-to-Actions hierarchy
-- Creates goals, epics, actions tables; restructures plans table; adds lineage to task_sessions

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Create goals table
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title TEXT NOT NULL,
    description TEXT,
    horizon TEXT CHECK (horizon IN ('1yr', '3yr', '5yr')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'dormant')),
    context TEXT,
    weight INTEGER DEFAULT 5 CHECK (weight BETWEEN 1 AND 10),
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Restructure plans table (becomes "projects" layer)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Delete existing rows (3 stale records, agreed to re-seed from journals)
DELETE FROM plans;

-- Drop unused columns
ALTER TABLE plans DROP COLUMN IF EXISTS objective_id;
ALTER TABLE plans DROP COLUMN IF EXISTS project_id;
ALTER TABLE plans DROP COLUMN IF EXISTS file_path;
ALTER TABLE plans DROP COLUMN IF EXISTS type;
ALTER TABLE plans DROP COLUMN IF EXISTS context_id;

-- Add new columns
ALTER TABLE plans ADD COLUMN IF NOT EXISTS goal_id TEXT REFERENCES goals(id);
ALTER TABLE plans ADD COLUMN IF NOT EXISTS journal_id TEXT;  -- links to journals.id for narrative
ALTER TABLE plans ADD COLUMN IF NOT EXISTS weight INTEGER DEFAULT 5 CHECK (weight BETWEEN 1 AND 10);
ALTER TABLE plans ADD COLUMN IF NOT EXISTS horizon TEXT CHECK (horizon IN ('now', 'soon', 'someday'));
ALTER TABLE plans ADD COLUMN IF NOT EXISTS impact_score INTEGER CHECK (impact_score BETWEEN 1 AND 5);
ALTER TABLE plans ADD COLUMN IF NOT EXISTS next_action TEXT;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS last_reviewed DATE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Create epics table
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS epics (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title TEXT NOT NULL,
    description TEXT,
    project_id TEXT REFERENCES plans(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'active', 'completed', 'dropped')),
    sort_order INTEGER DEFAULT 0,
    target_date DATE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Create actions table
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS actions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title TEXT NOT NULL,
    epic_id TEXT REFERENCES epics(id) ON DELETE SET NULL,
    project_id TEXT REFERENCES plans(id) ON DELETE CASCADE NOT NULL,
    goal_id TEXT REFERENCES goals(id),
    estimated_minutes INTEGER,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'in_progress', 'completed', 'dropped')),
    daily_task_id TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. Create daily_intentions table
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS daily_intentions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    date DATE NOT NULL UNIQUE,
    morning_intention TEXT,
    evening_reflection TEXT,
    goal_allocations JSONB,
    journal_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. Add lineage columns to task_sessions
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE task_sessions ADD COLUMN IF NOT EXISTS action_id TEXT;
ALTER TABLE task_sessions ADD COLUMN IF NOT EXISTS project_id TEXT;
ALTER TABLE task_sessions ADD COLUMN IF NOT EXISTS goal_id TEXT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. Indexes
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_plans_goal_id ON plans(goal_id);
CREATE INDEX IF NOT EXISTS idx_plans_horizon ON plans(horizon);
CREATE INDEX IF NOT EXISTS idx_epics_project_id ON epics(project_id);
CREATE INDEX IF NOT EXISTS idx_epics_status ON epics(status);
CREATE INDEX IF NOT EXISTS idx_actions_epic_id ON actions(epic_id);
CREATE INDEX IF NOT EXISTS idx_actions_project_id ON actions(project_id);
CREATE INDEX IF NOT EXISTS idx_actions_goal_id ON actions(goal_id);
CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status);
CREATE INDEX IF NOT EXISTS idx_task_sessions_goal_id ON task_sessions(goal_id);
CREATE INDEX IF NOT EXISTS idx_task_sessions_project_id ON task_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_daily_intentions_date ON daily_intentions(date);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. Update triggers for updated_at
-- ═══════════════════════════════════════════════════════════════════════════════

-- Reuse the existing update_updated_at_column() function
CREATE TRIGGER update_goals_updated_at
    BEFORE UPDATE ON goals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_epics_updated_at
    BEFORE UPDATE ON epics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_actions_updated_at
    BEFORE UPDATE ON actions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_daily_intentions_updated_at
    BEFORE UPDATE ON daily_intentions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. Reclassify journal entries that aren't projects
-- ═══════════════════════════════════════════════════════════════════════════════

-- Brazil Winter Living → contemplation (was a seasonal experience, not a project)
UPDATE journals SET type = 'contemplation'
WHERE id = '6cfc70bb-36a2-4fa0-a82a-df083be4bbab';

-- Brazil/Philippe strategy → protocol (life strategy document, not a project)
UPDATE journals SET type = 'protocol'
WHERE id = '3f47df4a-8b01-47dd-b734-c66d307be648';

COMMIT;
