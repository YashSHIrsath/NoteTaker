ALTER TABLE public.tasks
  ADD COLUMN due_at timestamptz,
  ADD COLUMN remind_before_minutes integer,
  ADD COLUMN reminder_sent_at timestamptz;

CREATE INDEX tasks_due_reminder_idx
  ON public.tasks (due_at)
  WHERE due_at IS NOT NULL AND reminder_sent_at IS NULL;

-- Changing the due date (or the lead time) after a reminder already fired must re-arm it,
-- otherwise the app's own upserts (which never touch reminder_sent_at directly) would leave
-- a stale "already sent" flag pointing at the old due date.
CREATE OR REPLACE FUNCTION public.reset_task_reminder_on_due_change()
RETURNS trigger AS $$
BEGIN
  IF NEW.due_at IS DISTINCT FROM OLD.due_at
     OR NEW.remind_before_minutes IS DISTINCT FROM OLD.remind_before_minutes THEN
    NEW.reminder_sent_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_reset_reminder_on_due_change
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE PROCEDURE public.reset_task_reminder_on_due_change();
