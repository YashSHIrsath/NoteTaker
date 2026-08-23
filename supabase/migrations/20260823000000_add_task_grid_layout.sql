-- Where a task's card sits on the resizable grid, and how big it is: {"x":0,"y":0,"w":3,"h":3}.
--
-- Nullable on purpose: NULL means "never placed", and the view lays the card out in flow order
-- (sort_order) at the default size, exactly as it did before this column existed. A task only
-- gains a stored position once it is actually dragged or resized.
--
-- One jsonb column rather than four smallints (grid_x/y/w/h) for a specific reason: the save path
-- in supabaseNotesRepository retries without a column the database is missing, but it drops one
-- column per attempt and retries once. Four new columns would exhaust that and fail the whole
-- save — titles and content included — on any database where this migration has not been pushed.
-- One column degrades cleanly instead. It also leaves room to store a per-breakpoint layout later
-- without another migration.
ALTER TABLE public.tasks
  ADD COLUMN grid_layout jsonb;
