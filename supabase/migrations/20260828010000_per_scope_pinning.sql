-- Pinning becomes per-listing, the way card size and order already are.
--
-- is_pinned was one boolean for a note that appears in three different places — inside its folder,
-- in the flat Tasks list, and in Starred. Each of those is a different set of cards next to
-- different neighbours, so "keep this one at the top" is a different answer in each: the note you
-- want first in Job Tracking is rarely the note you want first in Starred. One flag meant pinning
-- somewhere pinned it everywhere, which is not pinning so much as three lists arguing over one
-- setting.
--
-- Exactly the reasoning, and exactly the three scopes, behind tasks.grid_layout (see
-- TaskGridScope). This column is the same idea for order-to-top.
--
-- is_pinned is kept and kept correct — derived below as "pinned in at least one listing" — so a
-- client that predates this column still reads something true, the same way tasks.tags survived
-- the tag catalogue.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS pinned_scopes text[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_pinned_scopes_allowed') THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_pinned_scopes_allowed
      CHECK (pinned_scopes <@ ARRAY['folder', 'tasks', 'important']::text[]);
  END IF;
END;
$$;

-- Anything pinned today was pinned in all three, because there was only one flag. Carrying it
-- across as all three is what makes this change invisible until someone unpins somewhere.
UPDATE public.tasks
SET pinned_scopes = ARRAY['folder', 'tasks', 'important']
WHERE is_pinned AND cardinality(pinned_scopes) = 0;

-- Keeps the old flag honest without letting it be authoritative. Folded into the existing
-- normalising trigger rather than added as a second one, and placed before its early return
-- because pinning applies to plain notes too.
CREATE OR REPLACE FUNCTION public.normalize_task_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $fn$
BEGIN
  NEW.pinned_scopes := COALESCE(NEW.pinned_scopes, '{}');
  NEW.is_pinned := cardinality(NEW.pinned_scopes) > 0;

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

NOTIFY pgrst, 'reload schema';
