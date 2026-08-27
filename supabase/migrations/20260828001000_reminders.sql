-- Reminders become rows you own, one task to many, instead of a single "minutes before due"
-- integer on the task.
--
-- What this replaces, and why:
--
--   tasks.remind_before_minutes could hold exactly one reminder, and only ever one shaped as
--   "N minutes before the due date". "One day before, one hour before, and fifteen minutes
--   before" was three reminders the column had no room for; "every Monday at 10" was a shape it
--   could not express at all; and a reminder could not exist on a note without a deadline,
--   because it was defined by subtracting from one.
--
--   remind_before_minutes and reminder_sent_at are NOT dropped, and the pending_task_reminders
--   view is left standing. Every existing reminder is copied into this table below, and the app
--   stops reading the old columns -- but a database that has this migration and a browser tab
--   that does not must not lose anyone's reminders in between. They come out in a later
--   migration once this has been live for a while.
--
-- Recurrence lives in SQL, not in the browser. The edge function asks which reminders are due and
-- says when it sent one; working out when the next Monday is happens here, next to the clock and
-- the timezone, where it still happens with every browser closed.

CREATE TABLE IF NOT EXISTS public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,

  kind text NOT NULL,

  -- What the reminder says. NULL means "write me a sensible one" -- the sender builds it from the
  -- task and the schedule, so an unedited reminder still arrives as a sentence.
  message text,

  -- The user's own switch. Distinct from next_run_at being NULL, which means "nothing left to
  -- fire" -- a one-time reminder that has already been sent is finished, not switched off.
  is_active boolean NOT NULL DEFAULT true,

  -- IANA zone the wall-clock fields are read in. Stored per reminder rather than per account:
  -- "every day at 9:00" means 9:00 where you were when you set it, and it must keep meaning that
  -- after you travel, and across a DST boundary that moves the UTC instant underneath it.
  timezone text NOT NULL DEFAULT 'UTC',

  -- kind = 'one_time'
  at_utc timestamptz,

  -- kind = 'recurring'
  recur_unit text,
  recur_interval integer,
  recur_weekday smallint,
  recur_time time,
  -- The occurrence the series counts from, so "every 2 days" lands on a defined set of days
  -- rather than drifting with whenever it was last processed.
  anchor_date date,

  -- kind = 'relative' -- an offset from the task's own due date, in either direction.
  offset_minutes integer,
  offset_direction text,

  -- When this fires next, in UTC. Computed here on every write and after each send; NULL means
  -- nothing is scheduled (a one-time reminder that has fired, or a relative one whose task has no
  -- due date right now).
  next_run_at timestamptz,
  last_run_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reminders_kind_allowed CHECK (kind IN ('one_time', 'recurring', 'relative')),
  CONSTRAINT reminders_recur_unit_allowed CHECK (recur_unit IS NULL OR recur_unit IN ('day', 'week')),
  CONSTRAINT reminders_recur_interval_range CHECK (recur_interval IS NULL OR (recur_interval BETWEEN 1 AND 365)),
  CONSTRAINT reminders_recur_weekday_range CHECK (recur_weekday IS NULL OR (recur_weekday BETWEEN 0 AND 6)),
  CONSTRAINT reminders_offset_direction_allowed CHECK (offset_direction IS NULL OR offset_direction IN ('before', 'after')),
  CONSTRAINT reminders_offset_range CHECK (offset_minutes IS NULL OR (offset_minutes BETWEEN 0 AND 525600)),
  CONSTRAINT reminders_message_length CHECK (message IS NULL OR length(message) <= 500),

  -- Each kind carries its own fields and none of the others'. Without this a row could claim to
  -- be weekly while holding an absolute instant, and which one the scheduler honoured would be
  -- whichever branch it happened to reach first.
  CONSTRAINT reminders_shape CHECK (
    (kind = 'one_time'
      AND at_utc IS NOT NULL
      AND recur_unit IS NULL AND recur_interval IS NULL AND recur_time IS NULL AND anchor_date IS NULL
      AND offset_minutes IS NULL AND offset_direction IS NULL)
    OR (kind = 'recurring'
      AND at_utc IS NULL
      AND recur_unit IS NOT NULL AND recur_interval IS NOT NULL AND recur_time IS NOT NULL AND anchor_date IS NOT NULL
      AND (recur_unit = 'day' OR recur_weekday IS NOT NULL)
      AND offset_minutes IS NULL AND offset_direction IS NULL)
    OR (kind = 'relative'
      AND at_utc IS NULL
      AND recur_unit IS NULL AND recur_interval IS NULL AND recur_time IS NULL AND anchor_date IS NULL
      AND offset_minutes IS NOT NULL AND offset_direction IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS reminders_task_id_idx ON public.reminders (task_id);

-- What the every-minute sweep actually reads: the few reminders that are armed and due. Partial,
-- so the index stays the size of the pending set rather than the whole table.
CREATE INDEX IF NOT EXISTS reminders_next_run_at_idx
  ON public.reminders (next_run_at)
  WHERE is_active AND next_run_at IS NOT NULL;

DROP TRIGGER IF EXISTS reminders_set_updated_at ON public.reminders;
CREATE TRIGGER reminders_set_updated_at
  BEFORE UPDATE ON public.reminders
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------- recurrence
--
-- Given a reminder's configuration, when does it next fire after p_after?
--
-- Wall-clock fields are resolved through AT TIME ZONE rather than by adding 24h repeatedly, so
-- "every day at 9:00" stays 9:00 across a DST change instead of sliding to 8:00 or 10:00. The
-- search walks candidate occurrences from a computed starting guess; the loop is bounded because
-- an unbounded one inside a trigger is a way to hang every save on the table.

CREATE OR REPLACE FUNCTION public.reminder_next_run(
  p_kind text,
  p_timezone text,
  p_at_utc timestamptz,
  p_recur_unit text,
  p_recur_interval integer,
  p_recur_weekday smallint,
  p_recur_time time,
  p_anchor_date date,
  p_offset_minutes integer,
  p_offset_direction text,
  p_due_at timestamptz,
  p_last_run_at timestamptz,
  p_after timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  v_zone text := COALESCE(p_timezone, 'UTC');
  v_base timestamptz;
  v_step integer;
  v_anchor date;
  v_local_date date;
  v_k integer;
  v_candidate timestamptz;
  v_guard integer := 0;
BEGIN
  IF p_kind = 'one_time' THEN
    -- Fires once. Once it has, there is nothing left to schedule.
    IF p_last_run_at IS NOT NULL THEN
      RETURN NULL;
    END IF;
    RETURN p_at_utc;
  END IF;

  IF p_kind = 'relative' THEN
    -- Nothing to be relative to yet: the task has no due date, or is no longer a due-date task.
    IF p_due_at IS NULL THEN
      RETURN NULL;
    END IF;
    v_base := CASE
      WHEN p_offset_direction = 'after' THEN p_due_at + make_interval(mins => p_offset_minutes)
      ELSE p_due_at - make_interval(mins => p_offset_minutes)
    END;
    -- Already sent for this due date. Moving the due date moves v_base past last_run_at, which
    -- re-arms the reminder on its own -- which is what should happen when a deadline is pushed.
    IF p_last_run_at IS NOT NULL AND p_last_run_at >= v_base THEN
      RETURN NULL;
    END IF;
    RETURN v_base;
  END IF;

  IF p_kind <> 'recurring' OR p_recur_time IS NULL OR p_anchor_date IS NULL THEN
    RETURN NULL;
  END IF;

  v_step := GREATEST(1, COALESCE(p_recur_interval, 1)) * CASE WHEN p_recur_unit = 'week' THEN 7 ELSE 1 END;
  v_anchor := p_anchor_date;

  -- A weekly series has to start on the weekday it repeats on, or every occurrence after it is on
  -- the wrong day. Shifted forward rather than rejected: the day is what the user picked, and the
  -- start date is a detail the UI derives.
  IF p_recur_unit = 'week' AND p_recur_weekday IS NOT NULL THEN
    v_anchor := v_anchor + ((p_recur_weekday - EXTRACT(dow FROM v_anchor)::integer + 7) % 7);
  END IF;

  v_local_date := (p_after AT TIME ZONE v_zone)::date;
  -- Start one step behind the arithmetic guess so the loop below always considers the occurrence
  -- on the day p_after falls in -- its time of day may still be ahead of the current moment.
  v_k := GREATEST(0, CEIL((v_local_date - v_anchor)::numeric / v_step)::integer - 1);

  LOOP
    v_candidate := ((v_anchor + (v_k * v_step)) + p_recur_time) AT TIME ZONE v_zone;
    EXIT WHEN v_candidate > p_after;
    v_k := v_k + 1;
    v_guard := v_guard + 1;
    IF v_guard > 800 THEN
      RETURN NULL;
    END IF;
  END LOOP;

  RETURN v_candidate;
END;
$fn$;

-- Same call, but reading a reminder row that already exists. Used by the triggers and by the
-- send-side RPC so there is exactly one place that answers "when next".
CREATE OR REPLACE FUNCTION public.reminder_row_next_run(r public.reminders, p_after timestamptz)
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $fn$
  SELECT public.reminder_next_run(
    r.kind, r.timezone, r.at_utc,
    r.recur_unit, r.recur_interval, r.recur_weekday, r.recur_time, r.anchor_date,
    r.offset_minutes, r.offset_direction,
    (SELECT t.due_at FROM public.tasks t WHERE t.id = r.task_id AND t.note_kind = 'due_task'),
    r.last_run_at,
    p_after
  );
$fn$;

-- ---------------------------------------------------------------- ownership + scheduling
--
-- user_id is stamped from the session, never taken from the client, the same way folders and tags
-- are. The exception is a write with no session at all: the every-minute sender runs as the
-- service role, and the backfill below runs as postgres. Neither is a browser claiming to be
-- someone, so both keep the row's existing owner rather than being refused.

CREATE OR REPLACE FUNCTION public.prepare_reminder()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.user_id := auth.uid();
    ELSE
      NEW.user_id := OLD.user_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.user_id := OLD.user_id;
  ELSIF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- An unknown zone would make every AT TIME ZONE on this row raise, which would take out the
  -- sweep for everyone rather than just this reminder. Fall back instead.
  IF NEW.timezone IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone
  ) THEN
    NEW.timezone := 'UTC';
  END IF;

  IF NEW.kind = 'recurring' AND NEW.recur_unit = 'week' AND NEW.recur_weekday IS NOT NULL THEN
    NEW.anchor_date := NEW.anchor_date
      + ((NEW.recur_weekday - EXTRACT(dow FROM NEW.anchor_date)::integer + 7) % 7);
  END IF;

  NEW.next_run_at := public.reminder_row_next_run(NEW, now());
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS reminders_prepare ON public.reminders;
CREATE TRIGGER reminders_prepare
  BEFORE INSERT OR UPDATE ON public.reminders
  FOR EACH ROW
  EXECUTE PROCEDURE public.prepare_reminder();

-- A relative reminder is defined by a due date it does not store. Move the deadline and every
-- "1 hour before" on that task has to move with it -- including back into existence, when a task
-- that had its due date cleared gets a new one.
CREATE OR REPLACE FUNCTION public.resync_task_reminders()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.due_at IS NOT DISTINCT FROM OLD.due_at
     AND NEW.note_kind IS NOT DISTINCT FROM OLD.note_kind THEN
    RETURN NEW;
  END IF;

  UPDATE public.reminders r
  SET next_run_at = public.reminder_row_next_run(r, now())
  WHERE r.task_id = NEW.id AND r.kind = 'relative';

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS tasks_resync_reminders ON public.tasks;
CREATE TRIGGER tasks_resync_reminders
  AFTER UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE PROCEDURE public.resync_task_reminders();

-- ---------------------------------------------------------------- RLS

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reminders_select_own ON public.reminders;
DROP POLICY IF EXISTS reminders_insert_own ON public.reminders;
DROP POLICY IF EXISTS reminders_update_own ON public.reminders;
DROP POLICY IF EXISTS reminders_delete_own ON public.reminders;

-- Both ends are checked on the way in: the row's owner must be you, and so must the task it
-- points at. Checking only user_id would let anyone attach a reminder of their own to someone
-- else's task, which would then quietly email them about it.
CREATE POLICY reminders_select_own
  ON public.reminders FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY reminders_insert_own
  ON public.reminders FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.task_owned_by_uid(task_id));

CREATE POLICY reminders_update_own
  ON public.reminders FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.task_owned_by_uid(task_id));

CREATE POLICY reminders_delete_own
  ON public.reminders FOR DELETE TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reminders TO authenticated;

-- ---------------------------------------------------------------- the sweep's view
--
-- Everything the sender needs to write an email, in one read. Service role only: it holds the
-- owner's id and the task's title, and no signed-in user has any business reading the queue.

DROP VIEW IF EXISTS public.due_reminders;

CREATE VIEW public.due_reminders AS
SELECT
  r.id,
  r.task_id,
  r.kind,
  r.message,
  r.timezone,
  r.next_run_at,
  r.offset_minutes,
  r.offset_direction,
  t.title,
  t.due_at,
  t.folder_id,
  t.note_kind,
  f.user_id
FROM public.reminders r
JOIN public.tasks t ON t.id = r.task_id
JOIN public.folders f ON f.id = t.folder_id
WHERE r.is_active
  AND r.next_run_at IS NOT NULL
  -- A finished task stops nagging. A plain note has nothing to finish, so its recurring reminders
  -- keep running -- that is the whole point of a reminder that is not a deadline.
  AND NOT (t.note_kind = 'due_task' AND t.completed);

REVOKE ALL ON public.due_reminders FROM anon, authenticated;
GRANT SELECT ON public.due_reminders TO service_role;

-- Records a send and re-arms the reminder in one step, so "when is it next" is answered by the
-- same function everywhere. is_active is left alone: it is the user's switch, and a one-time
-- reminder that has fired drops out of the queue by having no next run, not by being turned off.
CREATE OR REPLACE FUNCTION public.mark_reminder_sent(p_reminder_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  RETURN v_next;
END;
$fn$;

REVOKE ALL ON FUNCTION public.mark_reminder_sent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_reminder_sent(uuid) TO service_role;

-- ---------------------------------------------------------------- backfill
--
-- Every reminder that exists today, carried over as a relative reminder -- which is exactly what
-- remind_before_minutes was, including the NULL case, which meant "at the due time" and so
-- becomes an offset of zero.
--
-- reminder_sent_at comes across as last_run_at, so a reminder that has already been emailed is
-- not emailed a second time the minute this deploys.

INSERT INTO public.reminders (
  task_id, user_id, kind, offset_minutes, offset_direction, timezone, last_run_at
)
SELECT
  t.id,
  f.user_id,
  'relative',
  COALESCE(t.remind_before_minutes, 0),
  'before',
  COALESCE(
    (SELECT tz.name FROM pg_timezone_names tz WHERE tz.name = u.raw_user_meta_data ->> 'timezone'),
    'UTC'
  ),
  t.reminder_sent_at
FROM public.tasks t
JOIN public.folders f ON f.id = t.folder_id
LEFT JOIN auth.users u ON u.id = f.user_id
WHERE t.due_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.reminders r WHERE r.task_id = t.id);

NOTIFY pgrst, 'reload schema';
