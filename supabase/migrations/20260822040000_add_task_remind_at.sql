-- A STORED generated column can't express "due_at minus a variable interval" (Postgres
-- rejects timestamptz - interval as non-immutable), so this is a view instead: computed at
-- query time, queried by the reminder edge function via the service role (which bypasses RLS
-- on both the view and the underlying tables, so no additional policies are needed here).
DROP VIEW IF EXISTS public.pending_task_reminders;

CREATE VIEW public.pending_task_reminders AS
SELECT
  t.id,
  t.title,
  t.due_at,
  t.folder_id,
  f.user_id,
  (t.due_at - (COALESCE(t.remind_before_minutes, 0) * interval '1 minute')) AS remind_at
FROM public.tasks t
JOIN public.folders f ON f.id = t.folder_id
WHERE t.due_at IS NOT NULL AND t.reminder_sent_at IS NULL;

GRANT SELECT ON public.pending_task_reminders TO service_role;
