-- Emails about the task itself, not about a reminder: "you finished this", and "the deadline you
-- beat has now arrived".
--
-- Both ride the sweep that already runs every minute. A second scheduler for two more messages
-- would be a second thing to keep alive for no gain.

-- ---------------------------------------------------------------- ordering fix
--
-- occurred_at defaulted to now(), which in Postgres is the *transaction* start — so several events
-- recorded by one save all carried the same instant and the history read back in whatever order
-- their random ids happened to sort in. clock_timestamp() advances within a transaction, which is
-- what "what happened, in order" actually needs.

ALTER TABLE public.task_events
  ALTER COLUMN occurred_at SET DEFAULT clock_timestamp();

-- ---------------------------------------------------------------- the queue
--
-- One view with a reason rather than two views, so the sender has a single list to walk and a
-- single "mark it done" to call.

DROP VIEW IF EXISTS public.pending_task_emails;

CREATE VIEW public.pending_task_emails AS
-- Ticked off, and not yet told about it. Sent whenever it was finished — early, on the dot or
-- late — because which of those it was is the substance of the message.
SELECT
  t.id AS task_id,
  'completed'::text AS reason,
  t.title,
  t.due_at,
  t.completed_at,
  t.folder_id,
  f.user_id,
  public.task_lifecycle(t.note_kind, t.completed, t.completed_at, t.due_at) AS lifecycle
FROM public.tasks t
JOIN public.folders f ON f.id = t.folder_id
WHERE t.note_kind = 'due_task'
  AND t.completed
  AND t.completion_email_sent_at IS NULL

UNION ALL

-- The deadline has arrived. Every task that reaches its due date lands here so the queue drains;
-- the sender decides which of them is worth an email (the one finished ahead of time).
SELECT
  t.id,
  'due_passed'::text,
  t.title,
  t.due_at,
  t.completed_at,
  t.folder_id,
  f.user_id,
  public.task_lifecycle(t.note_kind, t.completed, t.completed_at, t.due_at)
FROM public.tasks t
JOIN public.folders f ON f.id = t.folder_id
WHERE t.note_kind = 'due_task'
  AND t.due_at IS NOT NULL
  AND t.due_at <= now()
  AND t.due_summary_email_sent_at IS NULL;

REVOKE ALL ON public.pending_task_emails FROM anon, authenticated;
GRANT SELECT ON public.pending_task_emails TO service_role;

CREATE INDEX IF NOT EXISTS tasks_pending_completion_email_idx
  ON public.tasks (completed)
  WHERE note_kind = 'due_task' AND completed AND completion_email_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS tasks_pending_due_summary_idx
  ON public.tasks (due_at)
  WHERE note_kind = 'due_task' AND due_summary_email_sent_at IS NULL;

-- Marks one of the two messages as sent. Separate from the reminder equivalent because the thing
-- being marked is a column on the task, not a reminder's schedule.
CREATE OR REPLACE FUNCTION public.mark_task_email_sent(p_task_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
BEGIN
  IF p_reason = 'completed' THEN
    UPDATE public.tasks SET completion_email_sent_at = now() WHERE id = p_task_id;
  ELSIF p_reason = 'due_passed' THEN
    UPDATE public.tasks SET due_summary_email_sent_at = now() WHERE id = p_task_id;
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.mark_task_email_sent(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_task_email_sent(uuid, text) TO service_role;

-- ---------------------------------------------------------------- don't email the backlog
--
-- Every task that is already complete, or already past its deadline, would otherwise land in that
-- queue the moment this deploys and send a burst of mail about things finished days ago. They are
-- marked as already handled; only what happens from here on is news.

UPDATE public.tasks
SET completion_email_sent_at = COALESCE(completion_email_sent_at, now())
WHERE note_kind = 'due_task' AND completed;

UPDATE public.tasks
SET due_summary_email_sent_at = COALESCE(due_summary_email_sent_at, now())
WHERE note_kind = 'due_task' AND due_at IS NOT NULL AND due_at <= now();

NOTIFY pgrst, 'reload schema';
