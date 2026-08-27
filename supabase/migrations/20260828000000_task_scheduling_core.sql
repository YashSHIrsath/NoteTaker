-- Notes and due-date tasks become two explicit kinds, and completion becomes a fact with a
-- timestamp rather than a colour someone picked.
--
-- What this replaces, and why:
--
--   tasks.status ('pending' | 'ongoing' | 'complete') was set by clicking a badge. It could say
--   "complete" but never *when*, so "finished before the deadline" and "finished two hours late"
--   were the same row. The four lifecycle states this feature is built around can't be derived
--   from it. `completed` + `completed_at` can, and are stamped here by the server rather than
--   sent by the browser.
--
--   The status column is deliberately NOT dropped. It is kept in step by the trigger below
--   ('complete' when done, 'pending' when not, NULL for a plain note), so the existing
--   pending_task_reminders view and any client that hasn't been updated keep reading something
--   truthful. It is a mirror now, the way tasks.tags became one when the tag catalogue landed.
--   'ongoing' stops being written; rows that hold it are read as incomplete.
--
--   note_kind exists so a note becomes a task because you said so, never as a side effect. A
--   reminder on a plain note must not give it a deadline, and a due date is the one thing that
--   used to imply "this is a task".

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS note_kind text NOT NULL DEFAULT 'note',
  ADD COLUMN IF NOT EXISTS completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_note_kind_allowed'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_note_kind_allowed CHECK (note_kind IN ('note', 'due_task'));
  END IF;
END;
$$;

-- ---------------------------------------------------------------- backfill
--
-- A task that already carries a due date is already being tracked against one, so it becomes a
-- due-date task and keeps behaving as it does today. Everything else stays a plain note.
--
-- completed_at for already-finished tasks is the best fact available: nothing recorded when they
-- were ticked, and updated_at is the last time the row moved, which for a finished task is
-- usually that tick. It only decides on-time vs late for tasks completed before this migration.

UPDATE public.tasks
SET note_kind = 'due_task'
WHERE due_at IS NOT NULL AND note_kind = 'note';

UPDATE public.tasks
SET completed = true,
    completed_at = COALESCE(completed_at, updated_at)
WHERE status = 'complete' AND completed = false;

-- ---------------------------------------------------------------- invariants
--
-- Normalised rather than rejected, on purpose. The app saves the whole document in one upsert, so
-- a CHECK that refuses one inconsistent row would fail the save for every other note in it. A
-- stale client that sends a plain note with a leftover due date gets the due date dropped, not an
-- error, and the rest of its work still lands.
--
-- completed_at is stamped here and only here. The browser sends `completed`; when it flips to
-- true the server writes the time from its own clock, and a row that was already complete keeps
-- the timestamp it was given. A client cannot claim it finished something yesterday.

CREATE OR REPLACE FUNCTION public.normalize_task_schedule()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.note_kind IS DISTINCT FROM 'due_task' THEN
    NEW.note_kind := 'note';
    NEW.due_at := NULL;
    NEW.completed := false;
    NEW.completed_at := NULL;
    NEW.status := NULL;
    RETURN NEW;
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
$$;

DROP TRIGGER IF EXISTS tasks_normalize_schedule ON public.tasks;
CREATE TRIGGER tasks_normalize_schedule
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE PROCEDURE public.normalize_task_schedule();

-- ---------------------------------------------------------------- lifecycle
--
-- The one definition of what state a task is in. The reminder pipeline reads it here; the client
-- mirrors this exact ladder in lib/taskLifecycle.ts against a server-synced clock, so the two
-- can't disagree about a task whose deadline passed while the page sat open.

CREATE OR REPLACE FUNCTION public.task_lifecycle(
  p_note_kind text,
  p_completed boolean,
  p_completed_at timestamptz,
  p_due_at timestamptz,
  p_at timestamptz DEFAULT now()
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_note_kind IS DISTINCT FROM 'due_task' OR p_due_at IS NULL THEN 'note'
    WHEN p_completed AND COALESCE(p_completed_at, p_at) <= p_due_at THEN 'completed_on_time'
    WHEN p_completed THEN 'completed_late'
    WHEN p_at > p_due_at THEN 'overdue'
    ELSE 'upcoming'
  END;
$$;

REVOKE ALL ON FUNCTION public.task_lifecycle(text, boolean, timestamptz, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.task_lifecycle(text, boolean, timestamptz, timestamptz, timestamptz) TO authenticated, service_role;

-- The clock the countdown trusts.
--
-- A countdown driven by Date.now() is a countdown to whatever the device thinks the time is; a
-- phone an hour fast shows a task overdue an hour early. The client reads this once on load,
-- keeps the offset, and ticks against that instead.
CREATE OR REPLACE FUNCTION public.server_now()
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT now();
$$;

REVOKE ALL ON FUNCTION public.server_now() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.server_now() TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS tasks_due_task_due_at_idx
  ON public.tasks (due_at)
  WHERE note_kind = 'due_task' AND due_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
