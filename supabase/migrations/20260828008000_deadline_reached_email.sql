-- Tells the queue whether a task has any reminders of its own.
--
-- A deadline arriving used to be worth an email only when the task had already been finished
-- (congratulations). An unfinished one sent nothing, on the reasoning that its reminders had
-- already covered it — which is true right up until the task has no reminders, and then the
-- deadline passes in complete silence. That is the common case: a due date is one action, adding
-- a reminder is a second one, and plenty of tasks only ever get the first.
--
-- The flag rather than always sending: someone who set "at the due time" would otherwise get two
-- messages a second apart saying the same thing. Reminders, where they exist, remain the
-- notification; the deadline only speaks up when nothing else will.

DROP VIEW IF EXISTS public.pending_task_emails;

CREATE VIEW public.pending_task_emails AS
SELECT
  t.id AS task_id,
  'completed'::text AS reason,
  t.title,
  t.due_at,
  t.completed_at,
  t.folder_id,
  f.user_id,
  public.task_lifecycle(t.note_kind, t.completed, t.completed_at, t.due_at) AS lifecycle,
  false AS has_reminders
FROM public.tasks t
JOIN public.folders f ON f.id = t.folder_id
WHERE t.note_kind = 'due_task'
  AND t.completed
  AND t.completion_email_sent_at IS NULL

UNION ALL

SELECT
  t.id,
  'due_passed'::text,
  t.title,
  t.due_at,
  t.completed_at,
  t.folder_id,
  f.user_id,
  public.task_lifecycle(t.note_kind, t.completed, t.completed_at, t.due_at),
  EXISTS (
    SELECT 1 FROM public.reminders r
    WHERE r.task_id = t.id AND r.is_active
  ) AS has_reminders
FROM public.tasks t
JOIN public.folders f ON f.id = t.folder_id
WHERE t.note_kind = 'due_task'
  AND t.due_at IS NOT NULL
  AND t.due_at <= now()
  AND t.due_summary_email_sent_at IS NULL;

REVOKE ALL ON public.pending_task_emails FROM anon, authenticated;
GRANT SELECT ON public.pending_task_emails TO service_role;

NOTIFY pgrst, 'reload schema';
