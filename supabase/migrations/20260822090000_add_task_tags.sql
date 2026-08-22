-- Lightweight free-text labels, independent of folder location — e.g. distinguishing
-- reference "info" tasks from actionable "data" ones. A plain array column, not a separate
-- tags table: no cross-task tag management needed for this to be useful.
ALTER TABLE public.tasks
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}'::text[];
