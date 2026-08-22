-- Per-task card color, chosen from the app's own palette (indigo/teal/amber/rose/emerald).
-- Nullable on purpose: NULL means "no explicit choice", and the view keeps deriving the color
-- the way it did before (folder color in a folder, a stable scattered color in the flat lists).
-- Stored as text rather than an enum so adding a palette entry doesn't need a type migration.
ALTER TABLE public.tasks
  ADD COLUMN color text;
