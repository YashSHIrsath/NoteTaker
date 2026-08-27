-- Scheduling rules, as assertions. Run against any environment with:
--
--     npx supabase db query --linked --file supabase/tests/reminder_scheduling_checks.sql
--
-- Everything runs inside a transaction that rolls back, so it is safe against production: no row
-- is left behind and no reminder is ever actually sent (nothing here calls the edge function).
--
-- These exist because the scheduling rules live in SQL, where the app's TypeScript checks cannot
-- reach them. Each one is a question that has already been answered wrongly at least once.

BEGIN;

CREATE TEMP TABLE results (name text, ok boolean, detail text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.check_equal(p_name text, p_got timestamptz, p_want timestamptz)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO results
  VALUES (
    p_name,
    p_got IS NOT DISTINCT FROM p_want,
    format('got %s, want %s', COALESCE(p_got::text, 'NULL'), COALESCE(p_want::text, 'NULL'))
  );
END;
$$;

DO $t$
DECLARE
  v_occurrence timestamptz;
  v_due timestamptz := '2026-08-30 18:00:00+00';
BEGIN
  -- ---------------------------------------------------------------- one-time
  --
  -- The rule that broke: a one-time reminder is spent only for the instant it was sent for.
  -- Moving it to a later time has to bring it back, or editing a reminder that has already fired
  -- kills it permanently while still looking active in the app.

  PERFORM pg_temp.check_equal(
    'one-time: never sent, arms for its own time',
    public.reminder_next_run('one_time','UTC','2026-08-28 02:31:00+00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
      NULL, '2026-08-28 02:00:00+00'),
    '2026-08-28 02:31:00+00');

  PERFORM pg_temp.check_equal(
    'one-time: sent for this time, does not repeat',
    public.reminder_next_run('one_time','UTC','2026-08-28 02:25:00+00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
      '2026-08-28 02:25:03+00', '2026-08-28 02:30:00+00'),
    NULL);

  PERFORM pg_temp.check_equal(
    'one-time: moved later after firing, re-arms',
    public.reminder_next_run('one_time','UTC','2026-08-28 02:31:00+00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
      '2026-08-28 02:25:03+00', '2026-08-28 02:26:00+00'),
    '2026-08-28 02:31:00+00');

  PERFORM pg_temp.check_equal(
    'one-time: moved earlier than the send, stays quiet',
    public.reminder_next_run('one_time','UTC','2026-08-28 02:10:00+00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
      '2026-08-28 02:25:03+00', '2026-08-28 02:30:00+00'),
    NULL);

  -- ---------------------------------------------------------------- relative

  PERFORM pg_temp.check_equal(
    'relative: 15 minutes before the deadline',
    public.reminder_next_run('relative','UTC',NULL,NULL,NULL,NULL,NULL,NULL,15,'before',
      v_due, NULL, '2026-08-28 00:00:00+00'),
    '2026-08-30 17:45:00+00');

  PERFORM pg_temp.check_equal(
    'relative: 90 days after the deadline',
    public.reminder_next_run('relative','UTC',NULL,NULL,NULL,NULL,NULL,NULL,129600,'after',
      v_due, NULL, '2026-08-28 00:00:00+00'),
    '2026-11-28 18:00:00+00');

  PERFORM pg_temp.check_equal(
    'relative: deadline pushed later, re-arms',
    public.reminder_next_run('relative','UTC',NULL,NULL,NULL,NULL,NULL,NULL,15,'before',
      '2026-09-05 18:00:00+00', '2026-08-30 17:45:04+00', '2026-08-30 18:00:00+00'),
    '2026-09-05 17:45:00+00');

  PERFORM pg_temp.check_equal(
    'relative: no deadline, nothing to measure from',
    public.reminder_next_run('relative','UTC',NULL,NULL,NULL,NULL,NULL,NULL,60,'before',
      NULL, NULL, '2026-08-28 00:00:00+00'),
    NULL);

  -- ---------------------------------------------------------------- recurring

  v_occurrence := (DATE '2026-08-28' + TIME '09:00') AT TIME ZONE 'Asia/Kolkata';
  PERFORM pg_temp.check_equal(
    'recurring: every 2 days advances exactly 2 days',
    public.reminder_next_run('recurring','Asia/Kolkata',NULL,'day',2,NULL,'09:00','2026-08-28',NULL,NULL,
      NULL, v_occurrence, v_occurrence),
    v_occurrence + interval '2 days');

  v_occurrence := (DATE '2026-08-31' + TIME '10:00') AT TIME ZONE 'Asia/Kolkata';
  PERFORM pg_temp.check_equal(
    'recurring: every 2 weeks advances exactly 14 days',
    public.reminder_next_run('recurring','Asia/Kolkata',NULL,'week',2,1::smallint,'10:00','2026-08-31',NULL,NULL,
      NULL, v_occurrence, v_occurrence),
    v_occurrence + interval '14 days');

  -- A weekly series anchored on the wrong weekday is shifted forward to the right one; 2026-08-28
  -- is a Friday, so "every Monday" starts on the 31st.
  PERFORM pg_temp.check_equal(
    'recurring: weekly anchors onto its chosen weekday',
    public.reminder_next_run('recurring','Asia/Kolkata',NULL,'week',1,1::smallint,'10:00','2026-08-28',NULL,NULL,
      NULL, NULL, '2026-08-28 10:00:00+05:30'),
    (DATE '2026-08-31' + TIME '10:00') AT TIME ZONE 'Asia/Kolkata');

  -- The clocks go back in New York on 2026-11-01. 9am has to stay 9am, which is what makes the
  -- AT TIME ZONE arithmetic worth having over "add 24 hours".
  PERFORM pg_temp.check_equal(
    'recurring: daily 9am survives a DST boundary',
    public.reminder_next_run('recurring','America/New_York',NULL,'day',1,NULL,'09:00','2026-10-01',NULL,NULL,
      NULL, NULL, '2026-11-01 12:00:00-05'),
    (DATE '2026-11-02' + TIME '09:00') AT TIME ZONE 'America/New_York');

  -- ---------------------------------------------------------------- task emails
  --
  -- Which message a finished task earns, and the one case that earns a second one later: a task
  -- beaten to its deadline gets congratulated when that deadline actually arrives.

  INSERT INTO results VALUES ('email: finished before the deadline reads as on time',
    public.task_lifecycle('due_task', true, now() - interval '1 day', now() + interval '1 day')
      = 'completed_on_time', '');
  INSERT INTO results VALUES ('email: finished after the deadline reads as late',
    public.task_lifecycle('due_task', true, now(), now() - interval '2 hours')
      = 'completed_late', '');
  INSERT INTO results VALUES ('email: a deadline arriving unfinished reads as overdue, and is not worth a message',
    public.task_lifecycle('due_task', false, NULL, now() - interval '1 minute')
      = 'overdue', '');

  -- ---------------------------------------------------------------- lifecycle

  INSERT INTO results VALUES ('lifecycle: no deadline is a plain note',
    public.task_lifecycle('note', false, NULL, NULL) = 'note', '');
  INSERT INTO results VALUES ('lifecycle: incomplete before the deadline is upcoming',
    public.task_lifecycle('due_task', false, NULL, now() + interval '1 day') = 'upcoming', '');
  INSERT INTO results VALUES ('lifecycle: finished before the deadline is on time',
    public.task_lifecycle('due_task', true, now(), now() + interval '1 day') = 'completed_on_time', '');
  INSERT INTO results VALUES ('lifecycle: past the deadline unfinished is overdue',
    public.task_lifecycle('due_task', false, NULL, now() - interval '1 day') = 'overdue', '');
  INSERT INTO results VALUES ('lifecycle: finished after the deadline is late',
    public.task_lifecycle('due_task', true, now(), now() - interval '1 day') = 'completed_late', '');
END;
$t$;

SELECT
  count(*) FILTER (WHERE ok) || '/' || count(*) || ' passed' AS summary
FROM results;

SELECT name, detail FROM results WHERE NOT ok;

DO $t$
DECLARE v_failed int;
BEGIN
  SELECT count(*) INTO v_failed FROM results WHERE NOT ok;
  IF v_failed > 0 THEN
    RAISE EXCEPTION '% scheduling check(s) failed', v_failed;
  END IF;
END;
$t$;

ROLLBACK;
