-- Fix RLS infinite recursion: policies must not query the same table they protect.
-- Ownership checks go through SECURITY DEFINER helpers that join folders.user_id.

CREATE OR REPLACE FUNCTION public.folder_owned_by_uid(folder_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.folders AS folder
    WHERE folder.id = folder_id
      AND folder.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.task_owned_by_uid(task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks AS task
    JOIN public.folders AS folder ON folder.id = task.folder_id
    WHERE task.id = task_id
      AND folder.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.subtask_owned_by_uid(subtask_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subtasks AS subtask
    JOIN public.tasks AS task ON task.id = subtask.task_id
    JOIN public.folders AS folder ON folder.id = task.folder_id
    WHERE subtask.id = subtask_id
      AND folder.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.folder_owned_by_uid(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.task_owned_by_uid(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.subtask_owned_by_uid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.folder_owned_by_uid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_owned_by_uid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.subtask_owned_by_uid(uuid) TO authenticated;

DROP POLICY IF EXISTS folders_select_own ON public.folders;
DROP POLICY IF EXISTS folders_insert_own ON public.folders;
DROP POLICY IF EXISTS folders_update_own ON public.folders;
DROP POLICY IF EXISTS folders_delete_own ON public.folders;

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
    AND (parent_id IS NULL OR public.folder_owned_by_uid(parent_id))
  );

CREATE POLICY folders_update_own
  ON public.folders
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (parent_id IS NULL OR public.folder_owned_by_uid(parent_id))
  );

CREATE POLICY folders_delete_own
  ON public.folders
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS tasks_select_own ON public.tasks;
DROP POLICY IF EXISTS tasks_insert_own ON public.tasks;
DROP POLICY IF EXISTS tasks_update_own ON public.tasks;
DROP POLICY IF EXISTS tasks_delete_own ON public.tasks;

CREATE POLICY tasks_select_own
  ON public.tasks
  FOR SELECT
  TO authenticated
  USING (public.folder_owned_by_uid(folder_id));

CREATE POLICY tasks_insert_own
  ON public.tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (public.folder_owned_by_uid(folder_id));

CREATE POLICY tasks_update_own
  ON public.tasks
  FOR UPDATE
  TO authenticated
  USING (public.folder_owned_by_uid(folder_id))
  WITH CHECK (public.folder_owned_by_uid(folder_id));

CREATE POLICY tasks_delete_own
  ON public.tasks
  FOR DELETE
  TO authenticated
  USING (public.folder_owned_by_uid(folder_id));

DROP POLICY IF EXISTS subtasks_select_own ON public.subtasks;
DROP POLICY IF EXISTS subtasks_insert_own ON public.subtasks;
DROP POLICY IF EXISTS subtasks_update_own ON public.subtasks;
DROP POLICY IF EXISTS subtasks_delete_own ON public.subtasks;

CREATE POLICY subtasks_select_own
  ON public.subtasks
  FOR SELECT
  TO authenticated
  USING (public.task_owned_by_uid(task_id));

CREATE POLICY subtasks_insert_own
  ON public.subtasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.task_owned_by_uid(task_id)
    AND (parent_subtask_id IS NULL OR public.subtask_owned_by_uid(parent_subtask_id))
  );

CREATE POLICY subtasks_update_own
  ON public.subtasks
  FOR UPDATE
  TO authenticated
  USING (public.task_owned_by_uid(task_id))
  WITH CHECK (
    public.task_owned_by_uid(task_id)
    AND (parent_subtask_id IS NULL OR public.subtask_owned_by_uid(parent_subtask_id))
  );

CREATE POLICY subtasks_delete_own
  ON public.subtasks
  FOR DELETE
  TO authenticated
  USING (public.task_owned_by_uid(task_id));

DROP POLICY IF EXISTS attachments_select_own ON public.attachments;
DROP POLICY IF EXISTS attachments_insert_own ON public.attachments;
DROP POLICY IF EXISTS attachments_update_own ON public.attachments;
DROP POLICY IF EXISTS attachments_delete_own ON public.attachments;

CREATE POLICY attachments_select_own
  ON public.attachments
  FOR SELECT
  TO authenticated
  USING (public.task_owned_by_uid(task_id));

CREATE POLICY attachments_insert_own
  ON public.attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (public.task_owned_by_uid(task_id));

CREATE POLICY attachments_update_own
  ON public.attachments
  FOR UPDATE
  TO authenticated
  USING (public.task_owned_by_uid(task_id))
  WITH CHECK (public.task_owned_by_uid(task_id));

CREATE POLICY attachments_delete_own
  ON public.attachments
  FOR DELETE
  TO authenticated
  USING (public.task_owned_by_uid(task_id));

-- App already validates file types. Bucket MIME filtering was rejecting valid browser uploads (400).
UPDATE storage.buckets
SET allowed_mime_types = NULL
WHERE id = 'attachments';
