-- An append-only record of what happened to a task's schedule, and the two flags the completion
-- emails need.
--
-- Why a log rather than more columns: "when was this due before you moved it", "when did that
-- reminder actually go out", "when did you tick this off" are questions about the past, and a
-- column only ever holds the present. Every one of them was unanswerable — a reminder that fired
-- looked identical to one that never had, and a deadline moved three times looked like it had
-- always been the third one.
--
-- Written by triggers, never by the client. The rows are the system's account of itself, so a
-- browser can read them and nothing more; SECURITY DEFINER on the writer is what lets the trigger
-- insert without granting anyone else the privilege to forge an entry.

CREATE TABLE IF NOT EXISTS public.task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),

  /* The deadline as it was and as it became. Both null for events that aren't about a due date. */
  previous_at timestamptz,
  next_at timestamptz,

  /* A phrase describing the thing the event is about — "15 minutes before due", "Every Monday at
     10:00 AM". Stored rather than derived because the reminder it describes may be long deleted
     by the time anyone reads the history. */
  detail text,

  /* Which reminder, when the event is about one. Deliberately not a foreign key: deleting a
     reminder must not erase the record that it once fired. */
  reminder_id uuid,

  CONSTRAINT task_events_kind_allowed CHECK (kind IN (
    'due_set', 'due_changed', 'due_cleared',
    'reminder_added', 'reminder_fired', 'reminder_removed',
    'completed', 'reopened'
  ))
);

-- Read newest-first, always scoped to one task.
CREATE INDEX IF NOT EXISTS task_events_task_id_occurred_at_idx
  ON public.task_events (task_id, occurred_at DESC);

-- ---------------------------------------------------------------- email tracking
--
-- Two more "already sent" marks, the same shape as reminders.last_run_at: the sweep runs every
-- minute and must not send the same message twice.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS completion_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS due_summary_email_sent_at timestamptz;

-- ---------------------------------------------------------------- the writer

CREATE OR REPLACE FUNCTION public.log_task_event(
  p_task_id uuid,
  p_kind text,
  p_previous_at timestamptz DEFAULT NULL,
  p_next_at timestamptz DEFAULT NULL,
  p_detail text DEFAULT NULL,
  p_reminder_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_user uuid;
BEGIN
  -- Ownership comes from the folder chain, the same route the RLS policies take. A task with no
  -- resolvable owner is one being deleted; there is nothing to record against.
  SELECT f.user_id INTO v_user
  FROM public.tasks t
  JOIN public.folders f ON f.id = t.folder_id
  WHERE t.id = p_task_id;

  IF v_user IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.task_events (task_id, user_id, kind, previous_at, next_at, detail, reminder_id)
  VALUES (p_task_id, v_user, p_kind, p_previous_at, p_next_at, p_detail, p_reminder_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.log_task_event(uuid, text, timestamptz, timestamptz, text, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------- task triggers

CREATE OR REPLACE FUNCTION public.log_task_schedule_change()
RETURNS trigger
LANGUAGE plpgsql
-- Runs as the owner so it can call the revoked writer above. That is the point: no role other
-- than these triggers may append to the history.
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
BEGIN
  IF NEW.due_at IS DISTINCT FROM OLD.due_at THEN
    -- A changed deadline invalidates the "this one has passed" mark: the new date has its own
    -- moment of arriving, and it hasn't happened yet.
    NEW.due_summary_email_sent_at := NULL;

    IF OLD.due_at IS NULL THEN
      PERFORM public.log_task_event(NEW.id, 'due_set', NULL, NEW.due_at);
    ELSIF NEW.due_at IS NULL THEN
      PERFORM public.log_task_event(NEW.id, 'due_cleared', OLD.due_at, NULL);
    ELSE
      PERFORM public.log_task_event(NEW.id, 'due_changed', OLD.due_at, NEW.due_at);
    END IF;
  END IF;

  IF NEW.completed IS DISTINCT FROM OLD.completed THEN
    IF NEW.completed THEN
      PERFORM public.log_task_event(
        NEW.id, 'completed', NULL, NEW.completed_at,
        public.task_lifecycle(NEW.note_kind, true, NEW.completed_at, NEW.due_at));
    ELSE
      -- Reopening undoes the completion, so the email about it should be able to send again.
      NEW.completion_email_sent_at := NULL;
      PERFORM public.log_task_event(NEW.id, 'reopened');
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

-- BEFORE, not AFTER: it clears the two email marks on NEW, which only a BEFORE trigger can do
-- without a second write. It runs after tasks_normalize_schedule (alphabetical order: "log" then
-- "normalize"... which is why the name below starts with a z) so completed_at is already stamped.
DROP TRIGGER IF EXISTS tasks_zlog_schedule_change ON public.tasks;
CREATE TRIGGER tasks_zlog_schedule_change
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE PROCEDURE public.log_task_schedule_change();

-- ---------------------------------------------------------------- reminder triggers

-- The same sentence the reminder list shows, built server-side so a history entry still reads
-- correctly after the reminder itself is gone.
CREATE OR REPLACE FUNCTION public.describe_reminder_row(r public.reminders)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $fn$
  SELECT CASE
    WHEN r.kind = 'relative' AND COALESCE(r.offset_minutes, 0) = 0 THEN 'At the due time'
    WHEN r.kind = 'relative' THEN
      CASE
        WHEN r.offset_minutes % 1440 = 0 THEN (r.offset_minutes / 1440)::text || ' day(s)'
        WHEN r.offset_minutes % 60 = 0 THEN (r.offset_minutes / 60)::text || ' hour(s)'
        ELSE r.offset_minutes::text || ' minute(s)'
      END || ' ' || COALESCE(r.offset_direction, 'before') || ' due'
    WHEN r.kind = 'recurring' AND r.recur_unit = 'week' THEN
      'Every ' || CASE WHEN r.recur_interval = 1 THEN '' ELSE r.recur_interval::text || ' weeks on ' END
        || to_char(date '2026-08-30' + COALESCE(r.recur_weekday, 1), 'FMDay')
        || ' at ' || to_char(r.recur_time, 'FMHH12:MI AM')
    WHEN r.kind = 'recurring' THEN
      'Every ' || CASE WHEN r.recur_interval = 1 THEN 'day' ELSE r.recur_interval::text || ' days' END
        || ' at ' || to_char(r.recur_time, 'FMHH12:MI AM')
    ELSE 'One-time reminder'
  END;
$fn$;

CREATE OR REPLACE FUNCTION public.log_reminder_added()
RETURNS trigger
LANGUAGE plpgsql
-- Runs as the owner so it can call the revoked writer above. That is the point: no role other
-- than these triggers may append to the history.
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
BEGIN
  PERFORM public.log_task_event(
    NEW.task_id, 'reminder_added', NULL, NEW.next_run_at,
    public.describe_reminder_row(NEW), NEW.id);
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.log_reminder_removed()
RETURNS trigger
LANGUAGE plpgsql
-- Runs as the owner so it can call the revoked writer above. That is the point: no role other
-- than these triggers may append to the history.
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
BEGIN
  PERFORM public.log_task_event(
    OLD.task_id, 'reminder_removed', NULL, NULL,
    public.describe_reminder_row(OLD), OLD.id);
  RETURN OLD;
END;
$fn$;

DROP TRIGGER IF EXISTS reminders_log_added ON public.reminders;
CREATE TRIGGER reminders_log_added
  AFTER INSERT ON public.reminders
  FOR EACH ROW
  EXECUTE PROCEDURE public.log_reminder_added();

DROP TRIGGER IF EXISTS reminders_log_removed ON public.reminders;
CREATE TRIGGER reminders_log_removed
  BEFORE DELETE ON public.reminders
  FOR EACH ROW
  EXECUTE PROCEDURE public.log_reminder_removed();

-- ---------------------------------------------------------------- record each send
--
-- Extends the existing "mark it sent and work out the next run" step with the history entry, so a
-- fired reminder is recorded in the same statement that records the send. Splitting them would
-- let one happen without the other.

CREATE OR REPLACE FUNCTION public.mark_reminder_sent(p_reminder_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_row public.reminders;
  v_next timestamptz;
BEGIN
  UPDATE public.reminders
  SET last_run_at = now()
  WHERE id = p_reminder_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_next := public.reminder_row_next_run(v_row, now());

  UPDATE public.reminders
  SET next_run_at = v_next
  WHERE id = p_reminder_id;

  PERFORM public.log_task_event(
    v_row.task_id, 'reminder_fired', NULL, v_next,
    public.describe_reminder_row(v_row), v_row.id);

  RETURN v_next;
END;
$fn$;

REVOKE ALL ON FUNCTION public.mark_reminder_sent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_reminder_sent(uuid) TO service_role;

-- ---------------------------------------------------------------- RLS
--
-- Readable by its owner, writable by nobody. There is no INSERT, UPDATE or DELETE policy on
-- purpose: history that can be edited is not history, and every legitimate write goes through the
-- SECURITY DEFINER writer above.

ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_events_select_own ON public.task_events;
CREATE POLICY task_events_select_own
  ON public.task_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT ON TABLE public.task_events TO authenticated;

NOTIFY pgrst, 'reload schema';
