-- Authenticated ownership for notes tables.
-- No profiles table: auth.uid() is the owner.
-- No anonymous policies. RLS stays enabled; only the authenticated owner can access a row.

CREATE OR REPLACE FUNCTION public.enforce_row_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.user_id := auth.uid();
  ELSIF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Cannot change owner';
  ELSE
    NEW.user_id := OLD.user_id;
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE public.folders
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE public.subtasks
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE public.attachments
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE public.folders
  ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE public.tasks
  ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE public.subtasks
  ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE public.attachments
  ALTER COLUMN user_id SET DEFAULT auth.uid();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.folders WHERE user_id IS NULL) THEN
    ALTER TABLE public.folders ALTER COLUMN user_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tasks WHERE user_id IS NULL) THEN
    ALTER TABLE public.tasks ALTER COLUMN user_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.subtasks WHERE user_id IS NULL) THEN
    ALTER TABLE public.subtasks ALTER COLUMN user_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.attachments WHERE user_id IS NULL) THEN
    ALTER TABLE public.attachments ALTER COLUMN user_id SET NOT NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS folders_user_id_parent_id_idx
  ON public.folders (user_id, parent_id);

CREATE INDEX IF NOT EXISTS tasks_user_id_folder_id_idx
  ON public.tasks (user_id, folder_id);

CREATE INDEX IF NOT EXISTS subtasks_user_id_task_id_idx
  ON public.subtasks (user_id, task_id);

CREATE INDEX IF NOT EXISTS attachments_user_id_task_id_idx
  ON public.attachments (user_id, task_id);

DROP TRIGGER IF EXISTS folders_enforce_row_owner ON public.folders;
CREATE TRIGGER folders_enforce_row_owner
  BEFORE INSERT OR UPDATE ON public.folders
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_row_owner();

DROP TRIGGER IF EXISTS tasks_enforce_row_owner ON public.tasks;
CREATE TRIGGER tasks_enforce_row_owner
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_row_owner();

DROP TRIGGER IF EXISTS subtasks_enforce_row_owner ON public.subtasks;
CREATE TRIGGER subtasks_enforce_row_owner
  BEFORE INSERT OR UPDATE ON public.subtasks
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_row_owner();

DROP TRIGGER IF EXISTS attachments_enforce_row_owner ON public.attachments;
CREATE TRIGGER attachments_enforce_row_owner
  BEFORE INSERT OR UPDATE ON public.attachments
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_row_owner();

-- ---------------------------------------------------------------------------
-- RLS: authenticated users, own rows only. No TO anon policies.
-- ---------------------------------------------------------------------------

CREATE POLICY folders_select_own
  ON public.folders
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY folders_insert_own
  ON public.folders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      parent_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.folders AS parent
        WHERE parent.id = folders.parent_id
          AND parent.user_id = auth.uid()
      )
    )
  );

CREATE POLICY folders_update_own
  ON public.folders
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (
      parent_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.folders AS parent
        WHERE parent.id = folders.parent_id
          AND parent.user_id = auth.uid()
      )
    )
  );

CREATE POLICY folders_delete_own
  ON public.folders
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY tasks_select_own
  ON public.tasks
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY tasks_insert_own
  ON public.tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.folders AS folder
      WHERE folder.id = tasks.folder_id
        AND folder.user_id = auth.uid()
    )
  );

CREATE POLICY tasks_update_own
  ON public.tasks
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.folders AS folder
      WHERE folder.id = tasks.folder_id
        AND folder.user_id = auth.uid()
    )
  );

CREATE POLICY tasks_delete_own
  ON public.tasks
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY subtasks_select_own
  ON public.subtasks
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY subtasks_insert_own
  ON public.subtasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.tasks AS task
      WHERE task.id = subtasks.task_id
        AND task.user_id = auth.uid()
    )
    AND (
      parent_subtask_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.subtasks AS parent
        WHERE parent.id = subtasks.parent_subtask_id
          AND parent.user_id = auth.uid()
      )
    )
  );

CREATE POLICY subtasks_update_own
  ON public.subtasks
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.tasks AS task
      WHERE task.id = subtasks.task_id
        AND task.user_id = auth.uid()
    )
    AND (
      parent_subtask_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.subtasks AS parent
        WHERE parent.id = subtasks.parent_subtask_id
          AND parent.user_id = auth.uid()
      )
    )
  );

CREATE POLICY subtasks_delete_own
  ON public.subtasks
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY attachments_select_own
  ON public.attachments
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY attachments_insert_own
  ON public.attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.tasks AS task
      WHERE task.id = attachments.task_id
        AND task.user_id = auth.uid()
    )
  );

CREATE POLICY attachments_update_own
  ON public.attachments
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.tasks AS task
      WHERE task.id = attachments.task_id
        AND task.user_id = auth.uid()
    )
  );

CREATE POLICY attachments_delete_own
  ON public.attachments
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
