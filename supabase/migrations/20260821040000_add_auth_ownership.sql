-- Align ownership with: user -> folder -> task -> subtask / attachment.
-- folders.user_id is the only owner column. Child rows are authorized via that chain.
-- Replaces duplicated user_id columns added in 20260821030000_user_ownership_rls.sql.

DROP POLICY IF EXISTS tasks_select_own ON public.tasks;
DROP POLICY IF EXISTS tasks_insert_own ON public.tasks;
DROP POLICY IF EXISTS tasks_update_own ON public.tasks;
DROP POLICY IF EXISTS tasks_delete_own ON public.tasks;

DROP POLICY IF EXISTS subtasks_select_own ON public.subtasks;
DROP POLICY IF EXISTS subtasks_insert_own ON public.subtasks;
DROP POLICY IF EXISTS subtasks_update_own ON public.subtasks;
DROP POLICY IF EXISTS subtasks_delete_own ON public.subtasks;

DROP POLICY IF EXISTS attachments_select_own ON public.attachments;
DROP POLICY IF EXISTS attachments_insert_own ON public.attachments;
DROP POLICY IF EXISTS attachments_update_own ON public.attachments;
DROP POLICY IF EXISTS attachments_delete_own ON public.attachments;

DROP POLICY IF EXISTS folders_select_own ON public.folders;
DROP POLICY IF EXISTS folders_insert_own ON public.folders;
DROP POLICY IF EXISTS folders_update_own ON public.folders;
DROP POLICY IF EXISTS folders_delete_own ON public.folders;

DROP TRIGGER IF EXISTS tasks_enforce_row_owner ON public.tasks;
DROP TRIGGER IF EXISTS subtasks_enforce_row_owner ON public.subtasks;
DROP TRIGGER IF EXISTS attachments_enforce_row_owner ON public.attachments;

DROP INDEX IF EXISTS tasks_user_id_folder_id_idx;
DROP INDEX IF EXISTS subtasks_user_id_task_id_idx;
DROP INDEX IF EXISTS attachments_user_id_task_id_idx;

ALTER TABLE public.tasks DROP COLUMN IF EXISTS user_id;
ALTER TABLE public.subtasks DROP COLUMN IF EXISTS user_id;
ALTER TABLE public.attachments DROP COLUMN IF EXISTS user_id;

CREATE OR REPLACE FUNCTION public.enforce_folder_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.user_id := auth.uid();
  ELSE
    NEW.user_id := OLD.user_id;
  END IF;

  IF NEW.parent_id IS NOT NULL THEN
    SELECT parent.user_id INTO parent_owner
    FROM public.folders AS parent
    WHERE parent.id = NEW.parent_id;

    IF parent_owner IS NULL THEN
      RAISE EXCEPTION 'Parent folder not found';
    END IF;

    IF parent_owner IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'Nested folder must belong to the same user as its parent';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS folders_enforce_row_owner ON public.folders;
DROP TRIGGER IF EXISTS folders_enforce_folder_owner ON public.folders;
DROP FUNCTION IF EXISTS public.enforce_row_owner();
CREATE TRIGGER folders_enforce_folder_owner
  BEFORE INSERT OR UPDATE ON public.folders
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_folder_owner();

CREATE INDEX IF NOT EXISTS folders_user_id_parent_id_idx
  ON public.folders (user_id, parent_id);

-- Folders: own rows only. Nested inserts/updates must reference a parent the user owns.
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

-- Tasks: only via a folder owned by auth.uid()
CREATE POLICY tasks_select_own
  ON public.tasks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.folders AS folder
      WHERE folder.id = tasks.folder_id
        AND folder.user_id = auth.uid()
    )
  );

CREATE POLICY tasks_insert_own
  ON public.tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
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
  USING (
    EXISTS (
      SELECT 1
      FROM public.folders AS folder
      WHERE folder.id = tasks.folder_id
        AND folder.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
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
  USING (
    EXISTS (
      SELECT 1
      FROM public.folders AS folder
      WHERE folder.id = tasks.folder_id
        AND folder.user_id = auth.uid()
    )
  );

-- Subtasks: only via a task in a folder owned by auth.uid()
CREATE POLICY subtasks_select_own
  ON public.subtasks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tasks AS task
      JOIN public.folders AS folder ON folder.id = task.folder_id
      WHERE task.id = subtasks.task_id
        AND folder.user_id = auth.uid()
    )
  );

CREATE POLICY subtasks_insert_own
  ON public.subtasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tasks AS task
      JOIN public.folders AS folder ON folder.id = task.folder_id
      WHERE task.id = subtasks.task_id
        AND folder.user_id = auth.uid()
    )
    AND (
      parent_subtask_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.subtasks AS parent
        JOIN public.tasks AS parent_task ON parent_task.id = parent.task_id
        JOIN public.folders AS parent_folder ON parent_folder.id = parent_task.folder_id
        WHERE parent.id = subtasks.parent_subtask_id
          AND parent_folder.user_id = auth.uid()
      )
    )
  );

CREATE POLICY subtasks_update_own
  ON public.subtasks
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tasks AS task
      JOIN public.folders AS folder ON folder.id = task.folder_id
      WHERE task.id = subtasks.task_id
        AND folder.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tasks AS task
      JOIN public.folders AS folder ON folder.id = task.folder_id
      WHERE task.id = subtasks.task_id
        AND folder.user_id = auth.uid()
    )
    AND (
      parent_subtask_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.subtasks AS parent
        JOIN public.tasks AS parent_task ON parent_task.id = parent.task_id
        JOIN public.folders AS parent_folder ON parent_folder.id = parent_task.folder_id
        WHERE parent.id = subtasks.parent_subtask_id
          AND parent_folder.user_id = auth.uid()
      )
    )
  );

CREATE POLICY subtasks_delete_own
  ON public.subtasks
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tasks AS task
      JOIN public.folders AS folder ON folder.id = task.folder_id
      WHERE task.id = subtasks.task_id
        AND folder.user_id = auth.uid()
    )
  );

-- Attachments: only via a task in a folder owned by auth.uid()
CREATE POLICY attachments_select_own
  ON public.attachments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tasks AS task
      JOIN public.folders AS folder ON folder.id = task.folder_id
      WHERE task.id = attachments.task_id
        AND folder.user_id = auth.uid()
    )
  );

CREATE POLICY attachments_insert_own
  ON public.attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tasks AS task
      JOIN public.folders AS folder ON folder.id = task.folder_id
      WHERE task.id = attachments.task_id
        AND folder.user_id = auth.uid()
    )
  );

CREATE POLICY attachments_update_own
  ON public.attachments
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tasks AS task
      JOIN public.folders AS folder ON folder.id = task.folder_id
      WHERE task.id = attachments.task_id
        AND folder.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tasks AS task
      JOIN public.folders AS folder ON folder.id = task.folder_id
      WHERE task.id = attachments.task_id
        AND folder.user_id = auth.uid()
    )
  );

CREATE POLICY attachments_delete_own
  ON public.attachments
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tasks AS task
      JOIN public.folders AS folder ON folder.id = task.folder_id
      WHERE task.id = attachments.task_id
        AND folder.user_id = auth.uid()
    )
  );
