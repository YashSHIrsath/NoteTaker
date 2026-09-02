-- Shared Spaces, phase 5: per-item privacy.
--
-- A space is a room several people share, and until now everything in it was on the table. This
-- adds the other half: a folder, note or task can be visible to everyone in the space, to a few
-- named people, or to nobody but the person who made it.
--
-- The whole of it rests on one rule, written once:
--
--     you can reach an item if you can reach every folder above it, and it is visible to you
--
-- An AND, not an override. A child is allowed to be *more* restrictive than the folder holding it
-- and can never be less, which is what makes "I shared the folder and my private note came with it"
-- structurally impossible rather than a case somebody has to remember. It also means widening a
-- folder can never expose a restricted child, so there is no cascade to get wrong -- the only thing
-- widening a folder exposes is the children that were already open.
--
-- Why this is a small migration rather than a large one: every policy in this schema already asks
-- one of six functions whether a row is reachable (folder/task/subtask x readable/writable). They
-- are rewritten here to include visibility, and privacy therefore arrives on subtasks, attachments,
-- task_tags and the Storage bucket without any of those being touched. See the note above
-- folder_owned_by_uid in 20260828012000_shared_spaces.sql for why they are named the way they are.
--
-- What this migration deliberately does not do: it does not give admins a way in. A space admin
-- manages *membership*; per-item sharing is the owner's alone. That is the database half of the
-- settled decision that an admin can see that a private item exists and who made it but never read
-- it -- and an admin who could edit its share list could grant themselves and read it.

-- ---------------------------------------------------------------- the two columns
--
-- Added to folders and tasks only. Subtasks, attachments and reminders are parts of a note rather
-- than things anyone would share separately, and they inherit the note's answer through the helpers
-- below -- which is both simpler to reason about and impossible to get inconsistent.

ALTER TABLE public.folders
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'space',
  /* The creator, held separately from the share list on purpose. Removing somebody from "selected
     people" is a DELETE from content_shares, and it must not be able to touch the creator's own
     access -- so the creator is never in that table at all. */
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'space',
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'folders_visibility_allowed') THEN
    ALTER TABLE public.folders
      ADD CONSTRAINT folders_visibility_allowed
      CHECK (visibility IN ('space', 'restricted', 'private'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_visibility_allowed') THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_visibility_allowed
      CHECK (visibility IN ('space', 'restricted', 'private'));
  END IF;
END;
$do$;

CREATE INDEX IF NOT EXISTS folders_space_owner_idx
  ON public.folders (space_id, owner_id)
  WHERE space_id IS NOT NULL;

-- The lookup every visibility decision on a task makes.
CREATE INDEX IF NOT EXISTS tasks_folder_visibility_idx
  ON public.tasks (folder_id, visibility);

-- ---------------------------------------------------------------- the grants
--
-- One table over both entity kinds rather than folder_shares plus task_shares. The decision this
-- feeds is identical for a folder and a task, and two tables would mean two sets of policies to keep
-- in agreement -- which is how one of them eventually disagrees. The cost is that a polymorphic
-- reference cannot carry a foreign key, so the cascade is written by hand further down.

CREATE TABLE IF NOT EXISTS public.content_shares (
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  /* Denormalised from the item, and load-bearing rather than convenient: it is what lets a member
     leaving a space purge their grants in one statement, and what keeps a grant from ever naming
     somebody outside the space the item lives in. */
  space_id uuid NOT NULL REFERENCES public.spaces (id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, entity_id, user_id),
  CONSTRAINT content_shares_entity_type_allowed CHECK (entity_type IN ('folder', 'task'))
);

-- "Everything shared with me in this space" -- how a departing member is cleaned up.
CREATE INDEX IF NOT EXISTS content_shares_user_space_idx
  ON public.content_shares (user_id, space_id);

-- ---------------------------------------------------------------- the decision
--
-- Definer, because a policy that queried content_shares directly would be subject to that table's
-- own RLS -- and this repository has already been bitten once by a policy that re-entered itself
-- (see 20260821080000_fix_rls_recursion.sql).

CREATE OR REPLACE FUNCTION public.has_content_share(
  p_entity_type text,
  p_entity_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.content_shares AS share
    WHERE share.entity_type = p_entity_type
      AND share.entity_id = p_entity_id
      AND share.user_id = p_user_id
  );
$fn$;

/*
 * Is this one item visible to this one person, ignoring everything above it?
 *
 * Takes the row's visibility and owner as arguments rather than looking them up, so a policy on
 * folders or tasks can hand over columns it is already holding. The whole per-row cost is then the
 * share lookup, and only for a 'restricted' item.
 *
 * The owner test comes before the visibility switch, and that ordering *is* the requirement that a
 * creator cannot lose access to their own work: it is answered without consulting the share list at
 * all, so nothing done to that list can reach it.
 *
 * Takes an explicit user rather than reading auth.uid(), because the notification side has to ask
 * this about somebody who is not the caller -- see content_audience in the notifications migration.
 */
CREATE OR REPLACE FUNCTION public.content_visible_to(
  p_entity_type text,
  p_entity_id uuid,
  p_visibility text,
  p_owner_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
  SELECT CASE
    WHEN p_user_id IS NULL THEN false
    -- Ownership, answered first and from the row itself.
    WHEN p_owner_id IS NOT NULL AND p_owner_id = p_user_id THEN true
    -- Everyone in the space. coalesce so a row written before the column existed reads as open,
    -- which is exactly what it was.
    WHEN coalesce(p_visibility, 'space') = 'space' THEN true
    WHEN p_visibility = 'restricted'
      THEN public.has_content_share(p_entity_type, p_entity_id, p_user_id)
    -- 'private', and not the owner.
    ELSE false
  END;
$fn$;

/*
 * The chain: this folder, and every folder above it.
 *
 * A loop rather than a recursive CTE, because it can stop at the first refusal -- the common case for
 * anything private -- and because the depth guard is then obvious. Folder trees are a handful of
 * levels deep, so this is a handful of primary-key lookups.
 *
 * That guard is not defensive decoration about cycles; enforce_folder_owner makes those impossible.
 * It is there because this runs inside RLS, and a policy that can loop forever is a policy that can
 * hang every read of the table for everybody.
 */
CREATE OR REPLACE FUNCTION public.folder_chain_visible(p_folder_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_id uuid := p_folder_id;
  v_space uuid;
  v_user uuid;
  v_visibility text;
  v_owner uuid;
  v_parent uuid;
  v_depth integer := 0;
BEGIN
  IF p_folder_id IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  LOOP
    SELECT f.space_id, f.user_id, f.visibility, f.owner_id, f.parent_id
      INTO v_space, v_user, v_visibility, v_owner, v_parent
      FROM public.folders AS f
      WHERE f.id = v_id;

    IF NOT FOUND THEN
      RETURN false;
    END IF;

    -- A personal folder has one reader and no visibility to speak of. Answered here, so the whole
    -- personal path costs one comparison and cannot be changed by anything below.
    IF v_space IS NULL THEN
      RETURN v_user = p_user_id;
    END IF;

    IF NOT public.content_visible_to('folder', v_id, v_visibility, v_owner, p_user_id) THEN
      RETURN false;
    END IF;

    IF v_parent IS NULL THEN
      RETURN true;
    END IF;

    v_id := v_parent;
    v_depth := v_depth + 1;
    IF v_depth > 64 THEN
      RETURN false;
    END IF;
  END LOOP;
END;
$fn$;

/** A task's own answer: the folder chain, and then the task itself. */
CREATE OR REPLACE FUNCTION public.task_content_visible(p_task_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks AS t
    WHERE t.id = p_task_id
      AND public.folder_chain_visible(t.folder_id, p_user_id)
      AND public.content_visible_to('task', t.id, t.visibility, t.owner_id, p_user_id)
  );
$fn$;

REVOKE ALL ON FUNCTION public.has_content_share(text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.content_visible_to(text, uuid, text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.folder_chain_visible(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.task_content_visible(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_content_share(text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.content_visible_to(text, uuid, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.folder_chain_visible(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_content_visible(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------- the six helpers, rewritten
--
-- This is the load-bearing part of the migration, and it is deliberately the smallest possible
-- change: each of the six gains one AND. Everything that already delegates to them -- the tasks,
-- subtasks, attachments, task_tags and reminders policies, plus the three Storage object policies --
-- becomes privacy-aware without being touched, which is the only way a change this broad can be
-- reviewed at all.
--
-- Read and write stay separate questions, as they were: a viewer can reach a row and must not change
-- it, so USING and WITH CHECK cannot share a helper. Visibility is orthogonal to that and is applied
-- to both -- an item you cannot see is not one you can write either.

CREATE OR REPLACE FUNCTION public.folder_owned_by_uid(folder_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.folders AS folder
    WHERE folder.id = folder_id
      AND CASE
            WHEN folder.space_id IS NULL THEN folder.user_id = auth.uid()
            ELSE public.is_space_member(folder.space_id)
          END
  )
  AND public.folder_chain_visible(folder_id, auth.uid());
$fn$;

CREATE OR REPLACE FUNCTION public.folder_writable_by_uid(folder_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.folders AS folder
    WHERE folder.id = folder_id
      AND CASE
            WHEN folder.space_id IS NULL THEN folder.user_id = auth.uid()
            ELSE public.space_can_write(folder.space_id)
          END
  )
  AND public.folder_chain_visible(folder_id, auth.uid());
$fn$;

CREATE OR REPLACE FUNCTION public.task_owned_by_uid(task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks AS task
    JOIN public.folders AS folder ON folder.id = task.folder_id
    WHERE task.id = task_id
      AND CASE
            WHEN folder.space_id IS NULL THEN folder.user_id = auth.uid()
            ELSE public.is_space_member(folder.space_id)
              AND public.content_visible_to('task', task.id, task.visibility, task.owner_id, auth.uid())
          END
  )
  AND public.folder_chain_visible((SELECT t.folder_id FROM public.tasks AS t WHERE t.id = task_id), auth.uid());
$fn$;

CREATE OR REPLACE FUNCTION public.task_writable_by_uid(task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks AS task
    JOIN public.folders AS folder ON folder.id = task.folder_id
    WHERE task.id = task_id
      AND CASE
            WHEN folder.space_id IS NULL THEN folder.user_id = auth.uid()
            ELSE public.space_can_write(folder.space_id)
              AND public.content_visible_to('task', task.id, task.visibility, task.owner_id, auth.uid())
          END
  )
  AND public.folder_chain_visible((SELECT t.folder_id FROM public.tasks AS t WHERE t.id = task_id), auth.uid());
$fn$;

-- Subtasks reach through their task, which now carries the whole answer. Unchanged in shape, and
-- restated here only so the two files do not have to be read together to know what they do.
CREATE OR REPLACE FUNCTION public.subtask_owned_by_uid(subtask_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.subtasks AS subtask
    WHERE subtask.id = subtask_id
      AND public.task_owned_by_uid(subtask.task_id)
  );
$fn$;

CREATE OR REPLACE FUNCTION public.subtask_writable_by_uid(subtask_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.subtasks AS subtask
    WHERE subtask.id = subtask_id
      AND public.task_writable_by_uid(subtask.task_id)
  );
$fn$;

-- ---------------------------------------------------------------- folders policies
--
-- The one set that cannot delegate, because a policy on folders calling folder_owned_by_uid(id)
-- would be asking about the row it is deciding. The reach rule was already written out inline here
-- for that reason; it now has the visibility clause too, and only here.
--
-- Note what is *not* repeated: the ancestor walk. folder_chain_visible starts at the row given, so
-- passing parent_id asks "can I see everything above this", and the row's own visibility is the
-- inline clause beside it. Passing id would ask the same question about the row being decided, which
-- is the recursion this whole arrangement exists to avoid.

DROP POLICY IF EXISTS folders_select_own ON public.folders;
DROP POLICY IF EXISTS folders_insert_own ON public.folders;
DROP POLICY IF EXISTS folders_update_own ON public.folders;
DROP POLICY IF EXISTS folders_delete_own ON public.folders;

CREATE POLICY folders_select_own
  ON public.folders FOR SELECT TO authenticated
  USING (
    CASE
      WHEN space_id IS NULL THEN user_id = auth.uid()
      ELSE public.is_space_member(space_id)
        AND public.content_visible_to('folder', id, visibility, owner_id, auth.uid())
        AND (parent_id IS NULL OR public.folder_chain_visible(parent_id, auth.uid()))
    END
  );

CREATE POLICY folders_insert_own
  ON public.folders FOR INSERT TO authenticated
  WITH CHECK (
    CASE
      WHEN space_id IS NULL THEN user_id = auth.uid()
      ELSE public.space_can_write(space_id)
    END
    AND (parent_id IS NULL OR public.folder_writable_by_uid(parent_id))
  );

CREATE POLICY folders_update_own
  ON public.folders FOR UPDATE TO authenticated
  USING (
    CASE
      WHEN space_id IS NULL THEN user_id = auth.uid()
      ELSE public.space_can_write(space_id)
        AND public.content_visible_to('folder', id, visibility, owner_id, auth.uid())
        AND (parent_id IS NULL OR public.folder_chain_visible(parent_id, auth.uid()))
    END
  )
  WITH CHECK (
    CASE
      WHEN space_id IS NULL THEN user_id = auth.uid()
      ELSE public.space_can_write(space_id)
        AND public.content_visible_to('folder', id, visibility, owner_id, auth.uid())
    END
    AND (parent_id IS NULL OR public.folder_writable_by_uid(parent_id))
  );

CREATE POLICY folders_delete_own
  ON public.folders FOR DELETE TO authenticated
  USING (
    CASE
      WHEN space_id IS NULL THEN user_id = auth.uid()
      ELSE public.space_can_write(space_id)
        AND public.content_visible_to('folder', id, visibility, owner_id, auth.uid())
        AND (parent_id IS NULL OR public.folder_chain_visible(parent_id, auth.uid()))
    END
  );

-- ---------------------------------------------------------------- tasks policies
--
-- The other set the helpers cannot cover on their own, and the reason is worth stating plainly
-- because it is not the same as the folders one.
--
-- These policies asked `folder_owned_by_uid(folder_id)` -- can I reach the folder this note is in --
-- which was the whole question while a note had no visibility of its own. It no longer is. Rewriting
-- task_owned_by_uid to include the note's own level fixed every table that delegates to it (subtasks,
-- attachments, task_tags, reminders, Storage) and did not fix `tasks` itself, because `tasks` never
-- asked it: a policy on this table asking about this table's rows is the shape that recurses.
--
-- So the note's own level is spelled out inline here, beside the folder's, and only here. Exactly the
-- arrangement the folders policies use, and for the same reason.
--
-- A personal note takes the same path and is unaffected: its visibility is 'space' and
-- content_visible_to answers true without consulting anything.

DROP POLICY IF EXISTS tasks_select_own ON public.tasks;
DROP POLICY IF EXISTS tasks_insert_own ON public.tasks;
DROP POLICY IF EXISTS tasks_update_own ON public.tasks;
DROP POLICY IF EXISTS tasks_delete_own ON public.tasks;

CREATE POLICY tasks_select_own
  ON public.tasks FOR SELECT TO authenticated
  USING (
    public.folder_owned_by_uid(folder_id)
    AND public.content_visible_to('task', id, visibility, owner_id, auth.uid())
  );

/* On the way in, the note's own level is not consulted: enforce_task_owner has just stamped owner_id
   from the session, so the author is the owner and content_visible_to would answer true whatever the
   level says. Checking it would be checking that somebody can see what they are in the middle of
   writing. */
CREATE POLICY tasks_insert_own
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (public.folder_writable_by_uid(folder_id));

CREATE POLICY tasks_update_own
  ON public.tasks FOR UPDATE TO authenticated
  USING (
    public.folder_writable_by_uid(folder_id)
    AND public.content_visible_to('task', id, visibility, owner_id, auth.uid())
  )
  WITH CHECK (
    public.folder_writable_by_uid(folder_id)
    AND public.content_visible_to('task', id, visibility, owner_id, auth.uid())
  );

CREATE POLICY tasks_delete_own
  ON public.tasks FOR DELETE TO authenticated
  USING (
    public.folder_writable_by_uid(folder_id)
    AND public.content_visible_to('task', id, visibility, owner_id, auth.uid())
  );

-- ---------------------------------------------------------------- reminders
--
-- A reminder was readable purely on `user_id = auth.uid()`. That is now too generous in one specific
-- way: somebody who set a reminder on a shared note and then lost access to that note would keep the
-- reminder row, and with it the note's id. So the task has to be reachable too.
--
-- Delete stays on user_id alone, deliberately: a reminder of your own on something you can no longer
-- see is exactly the row you should still be able to get rid of.

DROP POLICY IF EXISTS reminders_select_own ON public.reminders;
CREATE POLICY reminders_select_own
  ON public.reminders FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.task_owned_by_uid(task_id));

-- ---------------------------------------------------------------- content_shares RLS
--
-- Read: whoever can reach the item. For a restricted item that is the owner and the people it is
-- shared with, which is precisely the "here is who has access" list the share sheet shows -- and
-- nobody else can learn that the row exists, because reaching the item is the prerequisite.
--
-- Write: nobody. There is no INSERT, UPDATE or DELETE policy at all, so the only way a grant can
-- come into being is set_content_visibility() below, which checks ownership. A client that tries to
-- insert one directly is refused by the absence of a policy rather than by a check it might find a
-- way around.

ALTER TABLE public.content_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_shares_select ON public.content_shares;

CREATE POLICY content_shares_select
  ON public.content_shares FOR SELECT TO authenticated
  USING (
    CASE entity_type
      WHEN 'folder' THEN public.folder_owned_by_uid(entity_id)
      WHEN 'task' THEN public.task_owned_by_uid(entity_id)
      ELSE false
    END
  );

GRANT SELECT ON TABLE public.content_shares TO authenticated;

-- ---------------------------------------------------------------- who may change sharing
--
-- The owner, and only the owner. Not a space admin -- see the note at the top of this file.
--
-- Deliberately not "whoever can write the item": an editor granted access to a restricted note can
-- edit it, and must not be able to hand it to somebody else. Sharing is a decision about the item's
-- audience, which belongs to whoever made it.

CREATE OR REPLACE FUNCTION public.content_manageable_by_uid(p_entity_type text, p_entity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
  SELECT CASE p_entity_type
    WHEN 'folder' THEN EXISTS (
      SELECT 1 FROM public.folders AS f
      WHERE f.id = p_entity_id AND f.space_id IS NOT NULL AND f.owner_id = auth.uid()
    )
    WHEN 'task' THEN EXISTS (
      SELECT 1
      FROM public.tasks AS t
      JOIN public.folders AS f ON f.id = t.folder_id
      WHERE t.id = p_entity_id AND f.space_id IS NOT NULL AND t.owner_id = auth.uid()
    )
    ELSE false
  END;
$fn$;

REVOKE ALL ON FUNCTION public.content_manageable_by_uid(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.content_manageable_by_uid(text, uuid) TO authenticated;

-- ---------------------------------------------------------------- owner and visibility, stamped
--
-- Both columns are the server's to write. owner_id comes from the session on insert and is then
-- fixed for the row's life, the same way user_id and space_id already are.
--
-- visibility is frozen on UPDATE unless a transaction-local flag is set, and set_content_visibility
-- is the only thing that sets it. Without that freeze, any member with write access could change an
-- item's audience with an ordinary PATCH -- which is the exact thing the requirement forbids, and
-- which no amount of care in the client would prevent.

/*
 * One reading of an incoming visibility, used by every write path.
 *
 * Absent means 'space' -- the default the column carries and the level every existing row is at.
 * Anything unrecognised raises rather than falling back to that default: a typo'd level that quietly
 * became "everyone" would be a privacy failure caused by a spelling mistake, and the CHECK constraint
 * would only catch it after the trigger had already overwritten it.
 */
CREATE OR REPLACE FUNCTION public.checked_visibility(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_value text := nullif(btrim(coalesce(p_value, '')), '');
BEGIN
  IF v_value IS NULL THEN
    RETURN 'space';
  END IF;
  IF v_value NOT IN ('space', 'restricted', 'private') THEN
    RAISE EXCEPTION 'Unknown visibility: %', v_value;
  END IF;
  RETURN v_value;
END;
$fn$;

REVOKE ALL ON FUNCTION public.checked_visibility(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.checked_visibility(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sharing_change_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $fn$
  SELECT coalesce(current_setting('mindstack.sharing', true), '') = 'on';
$fn$;

REVOKE ALL ON FUNCTION public.sharing_change_allowed() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_folder_owner()
RETURNS trigger
LANGUAGE plpgsql
-- Definer so the parent lookup below sees the parent regardless of the caller's own RLS, the same
-- way the reachability helpers do. Revoked from the API at the end of this file.
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  parent_space uuid;
  parent_user uuid;
BEGIN
  /*
   * No session at all is a migration or the service role, not a browser claiming to be somebody.
   * An UPDATE from there keeps whatever the row already has and is allowed through — the same shape
   * prepare_reminder and enforce_task_owner use, and the reason this is not simply a refusal: the
   * every-minute sender and any future admin tooling write with no uid, and a blanket refusal on
   * this table would mean they could never touch a folder at all.
   *
   * An INSERT with no session is still refused. There is no correct value for "who made this" there.
   */
  IF auth.uid() IS NULL THEN
    IF TG_OP <> 'UPDATE' THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;
    NEW.user_id := OLD.user_id;
    NEW.space_id := OLD.space_id;
    NEW.owner_id := OLD.owner_id;
    NEW.visibility := OLD.visibility;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Who made it. Stamped from the session, never taken from the client.
    NEW.user_id := auth.uid();
    NEW.owner_id := auth.uid();
    IF NEW.space_id IS NOT NULL AND NOT public.space_can_write(NEW.space_id) THEN
      RAISE EXCEPTION 'Not allowed to add folders to this space';
    END IF;
    -- A personal folder has one reader; there is nothing for a visibility to mean there.
    NEW.visibility := CASE
      WHEN NEW.space_id IS NULL THEN 'space'
      ELSE public.checked_visibility(NEW.visibility)
    END;
  ELSE
    NEW.user_id := OLD.user_id;
    NEW.space_id := OLD.space_id;
    -- Ownership never moves through an ordinary write. Handing an item over is a deliberate,
    -- separate act; a PATCH that happens to carry an owner_id is a client mistake at best.
    NEW.owner_id := OLD.owner_id;
    IF NOT public.sharing_change_allowed() THEN
      NEW.visibility := OLD.visibility;
    END IF;
  END IF;

  IF NEW.parent_id IS NOT NULL THEN
    SELECT parent.space_id, parent.user_id
      INTO parent_space, parent_user
      FROM public.folders AS parent
      WHERE parent.id = NEW.parent_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Parent folder not found';
    END IF;

    IF parent_space IS DISTINCT FROM NEW.space_id THEN
      RAISE EXCEPTION 'Nested folder must belong to the same workspace as its parent';
    END IF;

    IF NEW.space_id IS NULL AND parent_user IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'Nested folder must belong to the same user as its parent';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

/*
 * The same two rules for a task.
 *
 * A new trigger rather than a clause bolted onto normalize_task_schedule: that one is about the
 * note/deadline invariant and is read by anybody debugging due dates. Named tasks_a_... so it sorts
 * ahead of the other BEFORE triggers on this table -- not because the order matters today, but
 * because "who owns this row" is the sort of thing a later trigger may want to have been decided.
 */
CREATE OR REPLACE FUNCTION public.enforce_task_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_space uuid;
BEGIN
  -- No session at all is the every-minute sender or a migration, not a browser claiming to be
  -- somebody. Those keep whatever the row already has, the way prepare_reminder does.
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.owner_id := OLD.owner_id;
      NEW.visibility := OLD.visibility;
    END IF;
    RETURN NEW;
  END IF;

  SELECT f.space_id INTO v_space FROM public.folders AS f WHERE f.id = NEW.folder_id;

  IF TG_OP = 'INSERT' THEN
    NEW.owner_id := auth.uid();
    NEW.visibility := CASE
      WHEN v_space IS NULL THEN 'space'
      ELSE public.checked_visibility(NEW.visibility)
    END;
  ELSE
    NEW.owner_id := OLD.owner_id;
    IF NOT public.sharing_change_allowed() THEN
      NEW.visibility := OLD.visibility;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.enforce_folder_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_task_owner() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tasks_a_enforce_owner ON public.tasks;
CREATE TRIGGER tasks_a_enforce_owner
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_task_owner();

-- ---------------------------------------------------------------- existing data
--
-- Deliberately down here, after the triggers above are in place, and deliberately with them stood
-- down for the duration. Both halves are necessary and neither is obvious:
--
--   It has to be *after*, because enforce_folder_owner is what defines "owner_id never moves through
--   an ordinary write" — and a backfill written before that rule exists is a backfill the rule is not
--   yet protecting.
--
--   It has to be *with the triggers off*, because that same rule would defeat it: the trigger sets
--   NEW.owner_id := OLD.owner_id on every update, so `SET owner_id = user_id` would be quietly
--   overwritten with the NULL it was trying to replace. Turning them off is the honest way to say
--   "this one statement is the exception", rather than carving a hole in the rule that then exists
--   forever.
--
-- Standing down every user trigger rather than only that one also keeps the activity log out of it.
-- These updates are a schema change, not something anybody did, and a row per folder and per note in
-- every space's history would be a migration writing thousands of lines nobody wants to read.
--
-- Why 'space' is the only defensible default for the column itself: every folder and note that exists
-- right now is readable by every member of its space — that is what a shared space has meant since
-- phase 1, and people have put things in them on that understanding. A default of 'private' would
-- silently empty every shared space on deploy; 'space' changes nothing at all, which is the
-- requirement. Privacy is something an item is opted into from here on.
--
-- owner_id is backfilled from whoever created the row. Folders have always recorded that
-- (folders.user_id); tasks never have -- the column was dropped in 20260821040000 -- so the folder's
-- creator is the closest true answer available, and it is the one the app has been showing all along.
-- It barely matters for existing rows, since 'space' visibility never consults it.

ALTER TABLE public.folders DISABLE TRIGGER USER;
ALTER TABLE public.tasks DISABLE TRIGGER USER;

UPDATE public.folders SET owner_id = user_id WHERE owner_id IS NULL;

UPDATE public.tasks AS t
SET owner_id = f.user_id
FROM public.folders AS f
WHERE f.id = t.folder_id AND t.owner_id IS NULL;

-- Privacy is a question only a space can ask: a personal folder has exactly one reader, so there is
-- nothing for a visibility to mean there. Normalised rather than merely ignored, so the column never
-- holds a value that has no effect and later reads as though it did.
UPDATE public.folders SET visibility = 'space' WHERE space_id IS NULL AND visibility <> 'space';

ALTER TABLE public.folders ENABLE TRIGGER USER;
ALTER TABLE public.tasks ENABLE TRIGGER USER;

-- ---------------------------------------------------------------- the cascade, by hand
--
-- content_shares cannot carry a foreign key to two different tables, so the rows it holds are
-- cleaned up here. Three ways a grant stops being meaningful:
--
--   the item is deleted -- the grant is about nothing
--   the member leaves the space -- they cannot reach anything in it, and a grant left behind would
--     silently restore their access if they were ever let back in
--   the account is deleted -- handled by the FK above
--
-- Without the first of these, a grant would outlive its item and could in principle match a later
-- row that happened to be given the same uuid. That is not a real risk with random uuids; the real
-- reason is that a table of grants pointing at nothing is a table nobody can audit.

CREATE OR REPLACE FUNCTION public.purge_content_shares()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
BEGIN
  DELETE FROM public.content_shares
  WHERE entity_type = CASE TG_TABLE_NAME WHEN 'folders' THEN 'folder' ELSE 'task' END
    AND entity_id = OLD.id;
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.purge_member_content_shares()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
BEGIN
  DELETE FROM public.content_shares
  WHERE space_id = OLD.space_id AND user_id = OLD.user_id;
  RETURN NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.purge_content_shares() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_member_content_shares() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS folders_purge_content_shares ON public.folders;
CREATE TRIGGER folders_purge_content_shares
  AFTER DELETE ON public.folders
  FOR EACH ROW
  EXECUTE PROCEDURE public.purge_content_shares();

DROP TRIGGER IF EXISTS tasks_purge_content_shares ON public.tasks;
CREATE TRIGGER tasks_purge_content_shares
  AFTER DELETE ON public.tasks
  FOR EACH ROW
  EXECUTE PROCEDURE public.purge_content_shares();

DROP TRIGGER IF EXISTS space_members_purge_content_shares ON public.space_members;
CREATE TRIGGER space_members_purge_content_shares
  AFTER DELETE ON public.space_members
  FOR EACH ROW
  EXECUTE PROCEDURE public.purge_member_content_shares();

-- ---------------------------------------------------------------- setting it
--
-- The only way sharing changes. One function for both entity kinds and for all three levels, because
-- they are one decision -- "who can see this" -- and splitting them would let the three levels drift
-- into meaning slightly different things.
--
-- Four rules it enforces that a client cannot be trusted with:
--
--   only the owner may call it, for this item
--   a named person must be a member of the item's own space
--   'restricted' with nobody named becomes 'private' -- the requirement's "if no users are selected,
--     treat the item as Only Me rather than creating an invalid sharing state", enforced where it
--     cannot be skipped rather than in the dialog
--   'private' and 'space' clear the grant list, so no grant ever sits invisible behind a level that
--     ignores it, waiting to surprise somebody who switches back
--
-- The owner is filtered out of p_user_ids rather than rejected: a share sheet that lists members will
-- eventually offer the owner, and "you already have access" is not an error worth failing a call for.

CREATE OR REPLACE FUNCTION public.set_content_visibility(
  p_entity_type text,
  p_entity_id uuid,
  p_visibility text,
  p_user_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  entity_type text,
  entity_id uuid,
  visibility text,
  owner_id uuid,
  shared_with uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
/*
 * Bare column names mean columns here, not this function's own output parameters.
 *
 * RETURNS TABLE declares entity_type, entity_id, visibility, owner_id and shared_with as PL/pgSQL
 * variables, and every one of them is also a column of a table this function writes -- so an
 * unqualified reference (an ON CONFLICT target, a SET target) is ambiguous and Postgres refuses the
 * statement outright. Renaming the outputs would fix it too, but they are what the client reads by
 * name; this says the same thing without changing the contract.
 *
 * It has to be the first line of the body, ahead of DECLARE. That is where PL/pgSQL looks for it.
 */
#variable_conflict use_column
DECLARE
  v_space uuid;
  v_owner uuid;
  v_visibility text;
  v_members uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_entity_type NOT IN ('folder', 'task') THEN
    RAISE EXCEPTION 'Only folders and notes can be shared';
  END IF;

  IF p_visibility NOT IN ('space', 'restricted', 'private') THEN
    RAISE EXCEPTION 'Unknown visibility';
  END IF;

  -- Where the item lives, and who owns it. Read through a definer function's eyes, so a private item
  -- can be re-shared by its owner even though the owner's own RLS would let them see it anyway --
  -- and so the error below is about permission rather than about the row appearing not to exist.
  IF p_entity_type = 'folder' THEN
    SELECT f.space_id, f.owner_id INTO v_space, v_owner
    FROM public.folders AS f WHERE f.id = p_entity_id;
  ELSE
    SELECT f.space_id, t.owner_id INTO v_space, v_owner
    FROM public.tasks AS t
    JOIN public.folders AS f ON f.id = t.folder_id
    WHERE t.id = p_entity_id;
  END IF;

  IF v_space IS NULL THEN
    -- Either it does not exist, or it is a personal item. Both get the same sentence: a personal
    -- note has one reader and nothing to decide.
    RAISE EXCEPTION 'That item is not in a shared space';
  END IF;

  IF v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the person who created this can change who sees it';
  END IF;

  -- Only real members of this space, and never the owner (who has access by being the owner).
  -- Anything else in the array is dropped rather than raised on: the caller may be working from a
  -- member list that has since changed underneath them.
  v_members := ARRAY(
    SELECT DISTINCT member.user_id
    FROM public.space_members AS member
    WHERE member.space_id = v_space
      AND member.user_id <> auth.uid()
      AND member.user_id = ANY (coalesce(p_user_ids, ARRAY[]::uuid[]))
  );

  v_visibility := p_visibility;
  IF v_visibility = 'restricted' AND cardinality(v_members) = 0 THEN
    v_visibility := 'private';
  END IF;

  -- The grants first, so there is never an instant where the level says 'restricted' and the list is
  -- still the old one.
  DELETE FROM public.content_shares AS share
  WHERE share.entity_type = p_entity_type
    AND share.entity_id = p_entity_id
    AND (v_visibility <> 'restricted' OR NOT (share.user_id = ANY (v_members)));

  IF v_visibility = 'restricted' THEN
    INSERT INTO public.content_shares (entity_type, entity_id, user_id, space_id, granted_by)
    SELECT p_entity_type, p_entity_id, member, v_space, auth.uid()
    FROM unnest(v_members) AS member
    ON CONFLICT (entity_type, entity_id, user_id) DO NOTHING;
  END IF;

  -- The one place the freeze is lifted, and only for this statement.
  PERFORM set_config('mindstack.sharing', 'on', true);
  PERFORM set_config(
    'mindstack.intent',
    CASE v_visibility
      WHEN 'private' THEN 'Made this private'
      WHEN 'restricted' THEN 'Changed who can see this'
      ELSE 'Shared this with everyone'
    END,
    true
  );

  IF p_entity_type = 'folder' THEN
    UPDATE public.folders SET visibility = v_visibility WHERE id = p_entity_id;
  ELSE
    UPDATE public.tasks SET visibility = v_visibility WHERE id = p_entity_id;
  END IF;

  PERFORM set_config('mindstack.sharing', '', true);

  RETURN QUERY
  SELECT
    p_entity_type,
    p_entity_id,
    v_visibility,
    v_owner,
    ARRAY(
      SELECT share.user_id FROM public.content_shares AS share
      WHERE share.entity_type = p_entity_type AND share.entity_id = p_entity_id
      ORDER BY share.created_at
    );
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_content_visibility(text, uuid, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_content_visibility(text, uuid, text, uuid[]) TO authenticated;

-- ---------------------------------------------------------------- what widening would expose
--
-- The requirement asks that changing a folder's sharing be handled "explicitly and safely" where it
-- could expose existing private children. Under the AND rule at the top of this file it cannot --
-- a restricted child stays restricted whatever its parent says -- but the honest thing is still to
-- say what *will* become visible, which is the descendants that were only ever hidden by this
-- folder. So the dialog asks first, and this is what it asks.
--
-- Counts, not titles: the point is to inform the owner, and a list of names would be a second way to
-- read things the caller may not be able to see.

CREATE OR REPLACE FUNCTION public.folder_visibility_impact(p_folder_id uuid)
RETURNS TABLE (open_folders integer, open_tasks integer, kept_private integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
  WITH RECURSIVE down AS (
    SELECT f.id, f.visibility
    FROM public.folders AS f
    WHERE f.parent_id = p_folder_id
      AND public.content_manageable_by_uid('folder', p_folder_id)
    UNION ALL
    SELECT child.id, child.visibility
    FROM public.folders AS child
    JOIN down ON down.id = child.parent_id
  ),
  subtree AS (
    SELECT p_folder_id AS id, 'space'::text AS visibility
    WHERE public.content_manageable_by_uid('folder', p_folder_id)
    UNION ALL
    SELECT id, visibility FROM down
  )
  SELECT
    -- Folders below this one that carry no restriction of their own, and so are visible exactly as
    -- far as this folder is.
    (SELECT count(*) FROM down WHERE down.visibility = 'space')::integer,
    (SELECT count(*) FROM public.tasks AS t
      WHERE t.folder_id IN (SELECT id FROM subtree) AND t.visibility = 'space')::integer,
    -- And the ones that will stay exactly as private as they are now, whatever happens here.
    (
      (SELECT count(*) FROM down WHERE down.visibility <> 'space')
      + (SELECT count(*) FROM public.tasks AS t
          WHERE t.folder_id IN (SELECT id FROM subtree) AND t.visibility <> 'space')
    )::integer;
$fn$;

REVOKE ALL ON FUNCTION public.folder_visibility_impact(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.folder_visibility_impact(uuid) TO authenticated;

-- ---------------------------------------------------------------- reading the sharing state
--
-- One call per item, for the share sheet. Returns the level, the owner and the list -- and returns
-- nothing at all for an item the caller cannot reach, which is what keeps this from being a way to
-- probe for private items by id.

CREATE OR REPLACE FUNCTION public.content_sharing(p_entity_type text, p_entity_id uuid)
RETURNS TABLE (
  entity_type text,
  entity_id uuid,
  visibility text,
  owner_id uuid,
  can_manage boolean,
  shared_with uuid[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
  SELECT
    'folder'::text,
    f.id,
    f.visibility,
    f.owner_id,
    public.content_manageable_by_uid('folder', f.id),
    ARRAY(
      SELECT share.user_id FROM public.content_shares AS share
      WHERE share.entity_type = 'folder' AND share.entity_id = f.id
      ORDER BY share.created_at
    )
  FROM public.folders AS f
  WHERE p_entity_type = 'folder'
    AND f.id = p_entity_id
    AND f.space_id IS NOT NULL
    AND public.folder_owned_by_uid(f.id)

  UNION ALL

  SELECT
    'task'::text,
    t.id,
    t.visibility,
    t.owner_id,
    public.content_manageable_by_uid('task', t.id),
    ARRAY(
      SELECT share.user_id FROM public.content_shares AS share
      WHERE share.entity_type = 'task' AND share.entity_id = t.id
      ORDER BY share.created_at
    )
  FROM public.tasks AS t
  JOIN public.folders AS f ON f.id = t.folder_id
  WHERE p_entity_type = 'task'
    AND t.id = p_entity_id
    AND f.space_id IS NOT NULL
    AND public.task_owned_by_uid(t.id);
$fn$;

REVOKE ALL ON FUNCTION public.content_sharing(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.content_sharing(text, uuid) TO authenticated;

-- ---------------------------------------------------------------- the activity feed
--
-- The feed records entity_title and a diff for everything that happens in a space, and every member
-- could read all of it. That is a hole the moment items become private: a private folder's name, and
-- the fact that somebody renamed it, would arrive in everyone's history even though the folder itself
-- is invisible.
--
-- Both readers gain the same clause. For an item that still exists the live check is used, so
-- changing an item's visibility changes its history's visibility with it -- which is the only answer
-- that stays true. For one that has been deleted there is no row left to ask, and the answer comes
-- from the snapshot the log already keeps: `before` is to_jsonb(OLD), so it carries the visibility and
-- owner the row had when it went. A deleted private item is left to its owner alone.

CREATE OR REPLACE FUNCTION public.activity_entry_visible(
  p_entity_type text,
  p_entity_id uuid,
  p_before jsonb,
  p_after jsonb
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_parent uuid;
  v_snapshot jsonb;
  v_visibility text;
  v_owner uuid;
BEGIN
  -- Subtasks and attachments are parts of a note, so the question is really about the note.
  IF p_entity_type IN ('subtask', 'attachment') THEN
    IF p_entity_type = 'subtask' THEN
      SELECT s.task_id INTO v_parent FROM public.subtasks AS s WHERE s.id = p_entity_id;
    ELSE
      SELECT a.task_id INTO v_parent FROM public.attachments AS a WHERE a.id = p_entity_id;
    END IF;
    IF FOUND THEN
      RETURN public.task_owned_by_uid(v_parent);
    END IF;
    -- Gone, and neither carries a visibility of its own. The note it belonged to decides, and the
    -- log kept that id: `before` is to_jsonb(OLD).
    v_parent := nullif(coalesce(p_before, p_after) ->> 'task_id', '')::uuid;
    RETURN v_parent IS NOT NULL AND public.task_owned_by_uid(v_parent);
  END IF;

  IF p_entity_type = 'folder' THEN
    IF EXISTS (SELECT 1 FROM public.folders AS f WHERE f.id = p_entity_id) THEN
      RETURN public.folder_owned_by_uid(p_entity_id);
    END IF;
  ELSIF p_entity_type = 'task' THEN
    IF EXISTS (SELECT 1 FROM public.tasks AS t WHERE t.id = p_entity_id) THEN
      RETURN public.task_owned_by_uid(p_entity_id);
    END IF;
  ELSE
    RETURN false;
  END IF;

  -- Deleted. Fall back to what the row was at the time.
  v_snapshot := coalesce(p_before, p_after);
  IF v_snapshot IS NULL THEN
    RETURN false;
  END IF;
  v_visibility := coalesce(v_snapshot ->> 'visibility', 'space');
  v_owner := nullif(v_snapshot ->> 'owner_id', '')::uuid;

  -- The grants went with the row, so a restricted item's audience can no longer be reconstructed.
  -- Its owner keeps the history; everybody else loses a line about something they can no longer see.
  RETURN v_visibility = 'space' OR v_owner = auth.uid();
END;
$fn$;

REVOKE ALL ON FUNCTION public.activity_entry_visible(text, uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activity_entry_visible(text, uuid, jsonb, jsonb) TO authenticated;

/*
 * A stale overload, and a real way past all of this.
 *
 * The live database carries two space_activity_feed functions: the current five-argument one, and a
 * three-argument version from before the actor/action filters were added, which was never dropped
 * because CREATE OR REPLACE only ever matched the newer signature. Harmless while every member could
 * read every entry -- and a hole the moment they cannot, because replacing the five-argument body
 * below would leave the three-argument one answering the same question with no visibility clause at
 * all. Any client can pick which overload to call.
 *
 * Dropped rather than also gated: two functions that must agree forever is the thing that produced
 * this. Nothing calls it -- the app sends all five arguments -- so removing it is the whole fix.
 */
DROP FUNCTION IF EXISTS public.space_activity_feed(uuid, bigint, integer);

CREATE OR REPLACE FUNCTION public.space_activity_feed(
  p_space_id uuid,
  p_before_id bigint DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_actor_ids uuid[] DEFAULT NULL,
  p_actions text[] DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  occurred_at timestamptz,
  action text,
  entity_type text,
  entity_id uuid,
  entity_title text,
  path_label text,
  intent text,
  before jsonb,
  after jsonb,
  actor_id uuid,
  actor_name text,
  actor_email text,
  actor_avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $fn$
  SELECT
    a.id, a.occurred_at, a.action, a.entity_type, a.entity_id,
    a.entity_title, a.path_label, a.intent, a.before, a.after,
    a.actor_id,
    nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
    u.email,
    nullif(btrim(coalesce(u.raw_user_meta_data ->> 'avatar_url', '')), '')
  FROM public.space_activity AS a
  LEFT JOIN auth.users AS u ON u.id = a.actor_id
  WHERE a.space_id = p_space_id
    AND public.is_space_member(p_space_id)
    AND (p_before_id IS NULL OR a.id < p_before_id)
    -- cardinality, not `IS NULL`, so an empty array behaves as "no filter" too: a client that sends
    -- `[]` for "nothing selected" would otherwise get a feed that is always empty.
    AND (p_actor_ids IS NULL OR cardinality(p_actor_ids) = 0 OR a.actor_id = ANY (p_actor_ids))
    AND (p_actions IS NULL OR cardinality(p_actions) = 0 OR a.action = ANY (p_actions))
    -- Added with per-item privacy: a private item's name must not arrive in everybody's history.
    AND public.activity_entry_visible(a.entity_type, a.entity_id, a.before, a.after)
  ORDER BY a.occurred_at DESC, a.id DESC
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 200);
$fn$;

CREATE OR REPLACE FUNCTION public.space_entity_history(
  p_entity_type text,
  p_entity_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id bigint,
  occurred_at timestamptz,
  action text,
  entity_type text,
  entity_id uuid,
  entity_title text,
  path_label text,
  intent text,
  before jsonb,
  after jsonb,
  actor_id uuid,
  actor_name text,
  actor_email text,
  actor_avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $fn$
  SELECT
    a.id, a.occurred_at, a.action, a.entity_type, a.entity_id,
    a.entity_title, a.path_label, a.intent, a.before, a.after,
    a.actor_id,
    nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
    u.email,
    nullif(btrim(coalesce(u.raw_user_meta_data ->> 'avatar_url', '')), '')
  FROM public.space_activity AS a
  LEFT JOIN auth.users AS u ON u.id = a.actor_id
  WHERE a.entity_type = p_entity_type
    AND a.entity_id = p_entity_id
    -- Membership is checked per row against the space the entry belongs to, so this cannot be used
    -- to read the history of an item in a space the caller is not in.
    AND public.is_space_member(a.space_id)
    AND public.activity_entry_visible(a.entity_type, a.entity_id, a.before, a.after)
  ORDER BY a.occurred_at DESC, a.id DESC
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 200);
$fn$;

NOTIFY pgrst, 'reload schema';
