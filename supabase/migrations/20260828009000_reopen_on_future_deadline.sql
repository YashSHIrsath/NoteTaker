-- Moving a finished task's deadline into the future un-finishes it.
--
-- A completed task carries the time it was completed, and the whole lifecycle is that time read
-- against the deadline. Give it a deadline that hasn't happened yet and the pair stops making
-- sense: the row claims to have been finished before a moment that is still to come, so it shows
-- as "completed on time" for work nobody has done under the new date.
--
-- Pushing a deadline forward is how someone says "this needs doing again, by then". So the tick
-- comes off and the task is open once more. Note the direction: this only applies to a deadline in
-- the *future*. Correcting a past deadline to another past one is fixing a record, not reopening
-- work, and leaves the completion alone.
--
-- Enforced here rather than only in the browser because it is a rule about what the data is
-- allowed to say, and the app writes tasks from more than one place.

CREATE OR REPLACE FUNCTION public.normalize_task_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $fn$
BEGIN
  IF NEW.note_kind IS DISTINCT FROM 'due_task' THEN
    NEW.note_kind := 'note';
    NEW.due_at := NULL;
    NEW.completed := false;
    NEW.completed_at := NULL;
    NEW.status := NULL;
    RETURN NEW;
  END IF;

  -- The deadline has been moved forward on something already ticked off: reopen it, before the
  -- completion bookkeeping below runs, so completed_at is cleared with it and the history trigger
  -- records a genuine 'reopened'.
  IF TG_OP = 'UPDATE'
     AND NEW.due_at IS DISTINCT FROM OLD.due_at
     AND NEW.due_at IS NOT NULL
     AND NEW.due_at > now()
     AND OLD.completed
     AND NEW.completed THEN
    NEW.completed := false;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.completed_at := CASE WHEN NEW.completed THEN now() ELSE NULL END;
  ELSIF NEW.completed AND NOT OLD.completed THEN
    NEW.completed_at := now();
  ELSIF NEW.completed AND OLD.completed THEN
    NEW.completed_at := OLD.completed_at;
  ELSE
    NEW.completed_at := NULL;
  END IF;

  NEW.status := CASE WHEN NEW.completed THEN 'complete' ELSE 'pending' END;

  RETURN NEW;
END;
$fn$;

ALTER FUNCTION public.normalize_task_schedule() SET search_path = public, pg_catalog;

NOTIFY pgrst, 'reload schema';
