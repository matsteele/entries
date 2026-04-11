-- Migration 003: Add context column to epics and actions for cascading context inheritance
-- Context resolves: action.context ?? epic.context ?? project.context ?? goal.context ?? 'projects'

BEGIN;

ALTER TABLE epics ADD COLUMN IF NOT EXISTS context TEXT;
ALTER TABLE actions ADD COLUMN IF NOT EXISTS context TEXT;

COMMIT;
