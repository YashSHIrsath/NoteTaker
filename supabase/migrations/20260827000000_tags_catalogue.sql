-- Tags become rows you own, joined to tasks, instead of a free-text array per task.
--
-- The array column (20260822090000) made every tag a fresh string typed into one task. Reusing
-- "Job" across forty tasks meant typing it forty times, a typo made a second tag nobody could
-- see was a typo, and renaming it was forty edits. A tag is now made once and attached wherever
-- it belongs.
--
-- tasks.tags is deliberately left in place and still written. It is what a client that hasn't
-- been updated — or one running against a database where this migration hasn't been pushed yet —
-- reads, and the repository falls back to it when these tables are absent. It is a mirror, not a
-- second source of truth: task_tags is what the app reads when it can.

CREATE TABLE IF NOT EXISTS public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tags_name_not_blank CHECK (btrim(name) <> '')
);

-- One tag of a given name per person. This is what makes "add the tag I already made" possible
-- rather than accumulating duplicates; the app resolves a typed name against it before creating.
CREATE UNIQUE INDEX IF NOT EXISTS tags_user_id_name_key
  ON public.tags (user_id, name);

CREATE TABLE IF NOT EXISTS public.task_tags (
  task_id uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags (id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

-- The join is read both ways: a task's tags when a note opens, and a tag's tasks when the app
-- offers what already exists. The primary key covers the first; this covers the second.
CREATE INDEX IF NOT EXISTS task_tags_tag_id_idx
  ON public.task_tags (tag_id);

-- ---------------------------------------------------------------- backfill
--
-- Every distinct tag already written into tasks.tags becomes a row, owned by the same person who
-- owns the folder the task is in — the same chain the rest of the schema uses to decide ownership.
-- Blank strings are dropped rather than carried over; they were never a tag.

INSERT INTO public.tags (user_id, name)
SELECT DISTINCT folder.user_id, btrim(tag.name)
FROM public.tasks AS task
JOIN public.folders AS folder ON folder.id = task.folder_id
CROSS JOIN LATERAL unnest(task.tags) AS tag (name)
WHERE btrim(tag.name) <> ''
ON CONFLICT (user_id, name) DO NOTHING;

INSERT INTO public.task_tags (task_id, tag_id)
SELECT task.id, tag_row.id
FROM public.tasks AS task
JOIN public.folders AS folder ON folder.id = task.folder_id
CROSS JOIN LATERAL unnest(task.tags) AS tag (name)
JOIN public.tags AS tag_row
  ON tag_row.user_id = folder.user_id
  AND tag_row.name = btrim(tag.name)
WHERE btrim(tag.name) <> ''
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- ownership
--
-- tags.user_id is stamped from the session rather than trusted from the client, the same way
-- folders.user_id is. A client that sends someone else's id gets its own written instead.

CREATE OR REPLACE FUNCTION public.enforce_tag_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.user_id := auth.uid();
  ELSE
    NEW.user_id := OLD.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tags_enforce_tag_owner ON public.tags;
CREATE TRIGGER tags_enforce_tag_owner
  BEFORE INSERT OR UPDATE ON public.tags
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_tag_owner();

-- ---------------------------------------------------------------- RLS

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tags_select_own ON public.tags;
DROP POLICY IF EXISTS tags_insert_own ON public.tags;
DROP POLICY IF EXISTS tags_update_own ON public.tags;
DROP POLICY IF EXISTS tags_delete_own ON public.tags;

CREATE POLICY tags_select_own
  ON public.tags
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY tags_insert_own
  ON public.tags
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY tags_update_own
  ON public.tags
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY tags_delete_own
  ON public.tags
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- task_tags: both ends have to be yours. The task via the folder chain, exactly as subtasks and
-- attachments are authorized; the tag directly, since it carries its own owner. Checking only the
-- task would let anyone attach one of their own tags to a row and, worse, checking only the tag
-- would let them read which of your tasks it is on.
DROP POLICY IF EXISTS task_tags_select_own ON public.task_tags;
DROP POLICY IF EXISTS task_tags_insert_own ON public.task_tags;
DROP POLICY IF EXISTS task_tags_delete_own ON public.task_tags;

CREATE POLICY task_tags_select_own
  ON public.task_tags
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tasks AS task
      JOIN public.folders AS folder ON folder.id = task.folder_id
      WHERE task.id = task_tags.task_id
        AND folder.user_id = auth.uid()
    )
  );

CREATE POLICY task_tags_insert_own
  ON public.task_tags
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tasks AS task
      JOIN public.folders AS folder ON folder.id = task.folder_id
      WHERE task.id = task_tags.task_id
        AND folder.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.tags AS tag
      WHERE tag.id = task_tags.tag_id
        AND tag.user_id = auth.uid()
    )
  );

CREATE POLICY task_tags_delete_own
  ON public.task_tags
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tasks AS task
      JOIN public.folders AS folder ON folder.id = task.folder_id
      WHERE task.id = task_tags.task_id
        AND folder.user_id = auth.uid()
    )
  );

-- There is no UPDATE policy on task_tags on purpose: the row is nothing but its own primary key,
-- so changing it is deleting one association and creating another, which the policies above
-- already cover.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tags TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.task_tags TO authenticated;

NOTIFY pgrst, 'reload schema';
