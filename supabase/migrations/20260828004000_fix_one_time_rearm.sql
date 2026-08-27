-- Fixes a one-time reminder being killed permanently by its own first send.
--
-- The original branch read:
--
--     IF p_kind = 'one_time' THEN
--       IF p_last_run_at IS NOT NULL THEN RETURN NULL; END IF;
--       RETURN p_at_utc;
--
-- which is right for "don't send the same reminder twice" and wrong for everything else. Editing a
-- reminder that has already fired -- moving it to a new time later today, say -- recomputes
-- next_run_at through this function, hits `last_run_at IS NOT NULL`, and stores NULL. The row
-- looks perfectly healthy in the app: active, showing its new time, sitting in the list. It simply
-- has nothing scheduled and will never fire again, whatever time is put on it.
--
-- The comparison the relative branch already makes is the correct one here too: a reminder is
-- spent only if it was sent *at or after the instant it is now set to*. Moving the time forward
-- puts at_utc past last_run_at and re-arms it, exactly as moving a due date re-arms the offsets
-- hanging off it.
--
-- Nothing else in the function changes; it is repeated in full because CREATE OR REPLACE takes a
-- whole definition, and search_path is restated because a replace drops settings applied by a
-- later ALTER (see 20260828002000).

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
SET search_path = public, pg_catalog
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
    IF p_at_utc IS NULL THEN
      RETURN NULL;
    END IF;
    -- Spent only if the send happened at or after the instant this is now set to. A reminder moved
    -- to a later time has not been sent for *that* time, so it arms again.
    IF p_last_run_at IS NOT NULL AND p_last_run_at >= p_at_utc THEN
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

  IF p_recur_unit = 'week' AND p_recur_weekday IS NOT NULL THEN
    v_anchor := v_anchor + ((p_recur_weekday - EXTRACT(dow FROM v_anchor)::integer + 7) % 7);
  END IF;

  v_local_date := (p_after AT TIME ZONE v_zone)::date;
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

-- Re-arm anything the old rule stranded.
--
-- Only rows whose time is genuinely still ahead of their last send are affected: a reminder that
-- fired for the time it is set to recomputes to NULL again and stays quiet. A stranded one whose
-- moment has already passed fires on the next sweep, which is late but is the message its owner
-- asked for and never got.
UPDATE public.reminders r
SET next_run_at = public.reminder_row_next_run(r, now())
WHERE r.kind = 'one_time'
  AND r.next_run_at IS DISTINCT FROM public.reminder_row_next_run(r, now());

NOTIFY pgrst, 'reload schema';
