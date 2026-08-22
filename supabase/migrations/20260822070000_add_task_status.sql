-- Status only makes sense for tasks that are actually being tracked against a due date —
-- plain notes stay untouched (status null). Set alongside due_at by the app, not
-- independently, so a task can't end up with a status but no due date (or vice versa).
ALTER TABLE public.tasks
  ADD COLUMN status text
    CHECK (status IN ('pending', 'ongoing', 'complete'));

-- A completed task should never get emailed again even if its reminder time hasn't passed
-- yet (e.g. finished early) or already has — recreate the view with that extra guard.
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
WHERE t.due_at IS NOT NULL
  AND t.reminder_sent_at IS NULL
  AND t.status IS DISTINCT FROM 'complete';

GRANT SELECT ON public.pending_task_reminders TO service_role;
