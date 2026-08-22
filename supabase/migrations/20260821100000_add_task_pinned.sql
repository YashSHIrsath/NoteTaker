ALTER TABLE public.tasks
  ADD COLUMN is_pinned boolean NOT NULL DEFAULT false;
