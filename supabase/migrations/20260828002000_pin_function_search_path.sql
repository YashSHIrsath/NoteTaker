-- Pins search_path on the scheduling functions.
--
-- Without an explicit setting, a function resolves unqualified names through whatever search_path
-- the caller happens to have. Every reference in these bodies is already schema-qualified, so this
-- changes no behaviour — it removes the possibility that a future edit introduces a bare `tasks`
-- or `now()` that resolves somewhere unintended, and it clears the corresponding database linter
-- warning. mark_reminder_sent already did this because it is SECURITY DEFINER, where it matters
-- most; the rest are brought in line.
--
-- ALTER FUNCTION rather than CREATE OR REPLACE: the bodies are not changing, and repeating them
-- here would be a second copy to keep in step with the migrations that own them.

ALTER FUNCTION public.task_lifecycle(text, boolean, timestamptz, timestamptz, timestamptz)
  SET search_path = public, pg_catalog;

ALTER FUNCTION public.server_now()
  SET search_path = public, pg_catalog;

ALTER FUNCTION public.normalize_task_schedule()
  SET search_path = public, pg_catalog;

ALTER FUNCTION public.reminder_next_run(
  text, text, timestamptz, text, integer, smallint, time, date, integer, text,
  timestamptz, timestamptz, timestamptz
) SET search_path = public, pg_catalog;

ALTER FUNCTION public.reminder_row_next_run(public.reminders, timestamptz)
  SET search_path = public, pg_catalog;

ALTER FUNCTION public.prepare_reminder()
  SET search_path = public, pg_catalog;

ALTER FUNCTION public.resync_task_reminders()
  SET search_path = public, pg_catalog;

-- Predates this feature, flagged by the same linter rule, and still on the tasks table this
-- feature writes to on every save.
ALTER FUNCTION public.reset_task_reminder_on_due_change()
  SET search_path = public, pg_catalog;
