-- Shared Spaces, phase 1: the skeleton.
--
-- A second kind of workspace. A folder belongs either to one person (space_id IS NULL, the way
-- every folder does today) or to a space, and everything under it — tasks, subtasks, attachments,
-- reminders, tags — inherits that through the chain it already uses. Nothing about a shared note
-- differs from a personal one except who can reach it, so there are no parallel tables: one
-- nullable column on folders and a rewrite of the three functions that decide reach.
--
-- Those three functions are why this is one migration rather than twenty. Every policy on tasks,
-- subtasks and attachments already delegates to them, and so do reminders and the Storage object
-- policy. Their names still say "owned"; they now mean "reachable", and the comment on each says so.
--
-- What this migration does NOT do, on purpose: no invitations, no activity log, no locks, no
-- per-item visibility, no Trash. It also cannot create a space through the API — there is no INSERT
-- policy on public.spaces, because a space and its owner row have to appear together or the space
-- is invisible to the person who made it. That belongs in an RPC, with the invite flow.

-- ---------------------------------------------------------------- spaces

CREATE TABLE IF NOT EXISTS public.spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  /* A palette name from the app's own task/folder palette. Not decoration: once the shared UI is
     identical to the personal one, "which workspace am I in" is a question with a costly wrong
     answer. */
  color text,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT spaces_name_not_empty CHECK (length(btrim(name)) > 0)
);

DROP TRIGGER IF EXISTS spaces_set_updated_at ON public.spaces;
CREATE TRIGGER spaces_set_updated_at
  BEFORE UPDATE ON public.spaces
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------- membership
--
-- Four roles rather than two. The split between owner and admin is what lets a space have several
-- people who can manage members without ambiguity about who may delete the space; viewer is what
-- lets a plan be shown to someone without hoping they don't touch it.

CREATE TABLE IF NOT EXISTS public.space_members (
  space_id uuid NOT NULL REFERENCES public.spaces (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'editor',
  invited_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, user_id),
  CONSTRAINT space_members_role_allowed CHECK (role IN ('owner', 'admin', 'editor', 'viewer'))
);

-- "Which spaces am I in" is the query the app opens with.
CREATE INDEX IF NOT EXISTS space_members_user_id_idx
  ON public.space_members (user_id);

-- Exactly one owner, enforced rather than assumed. Two owners is an argument about who may delete
-- the space; zero is a space nobody can hand over.
CREATE UNIQUE INDEX IF NOT EXISTS space_members_one_owner_idx
  ON public.space_members (space_id)
  WHERE role = 'owner';

-- ---------------------------------------------------------------- membership helpers
--
-- SECURITY DEFINER, and that is the whole point: a policy on space_members that queried
-- space_members would recurse forever. This repository has already been bitten by exactly that —
-- see 20260821080000_fix_rls_recursion.sql, which exists because the folders policies used to
-- query folders. A definer function runs as the table owner, which is exempt from the table's own
-- RLS, so the policy asks a question that never re-enters the policy.

CREATE OR REPLACE FUNCTION public.is_space_member(p_space_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT p_space_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.space_members AS member
      WHERE member.space_id = p_space_id
        AND member.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.space_role(p_space_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT member.role
  FROM public.space_members AS member
  WHERE member.space_id = p_space_id
    AND member.user_id = auth.uid();
$$;

/* Whether this member may change content. Phase 1 has no locks and no per-item visibility yet, so
   for now this is only the read-only role being excluded — but it is a separate function from
   is_space_member from the start, because every write policy below has to ask the narrower
   question, and retrofitting that later means finding all of them again.

   The coalesce is not decoration. space_role returns NULL for someone who is not in the space, and
   `NULL IN (...)` is NULL rather than false — so without it this answers "unknown" for exactly the
   people it is meant to exclude. A policy reads NULL as false and is safe either way, but an
   `IF NOT space_can_write(...) THEN RAISE` does not fire on NULL, which left the folder trigger's
   own membership guard open to a non-member. */
CREATE OR REPLACE FUNCTION public.space_can_write(p_space_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT coalesce(public.space_role(p_space_id) IN ('owner', 'admin', 'editor'), false);
$$;

REVOKE ALL ON FUNCTION public.is_space_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.space_role(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.space_can_write(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_space_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.space_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.space_can_write(uuid) TO authenticated;

-- ---------------------------------------------------------------- spaces / members RLS

ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS spaces_select_member ON public.spaces;
DROP POLICY IF EXISTS spaces_update_admin ON public.spaces;
DROP POLICY IF EXISTS spaces_delete_owner ON public.spaces;

CREATE POLICY spaces_select_member
  ON public.spaces FOR SELECT TO authenticated
  USING (public.is_space_member(id));

CREATE POLICY spaces_update_admin
  ON public.spaces FOR UPDATE TO authenticated
  USING (public.space_role(id) IN ('owner', 'admin'))
  WITH CHECK (public.space_role(id) IN ('owner', 'admin'));

CREATE POLICY spaces_delete_owner
  ON public.spaces FOR DELETE TO authenticated
  USING (public.space_role(id) = 'owner');

/* No INSERT policy. Creating a space means inserting the space and its owner row together — a
   space with no members is invisible to the person who just made it, since the SELECT policy above
   needs membership. Phase 2 adds a create_space() RPC that does both in one transaction. */

DROP POLICY IF EXISTS space_members_select ON public.space_members;
DROP POLICY IF EXISTS space_members_insert_admin ON public.space_members;
DROP POLICY IF EXISTS space_members_update_admin ON public.space_members;
DROP POLICY IF EXISTS space_members_delete ON public.space_members;

-- A member can see who else is in the space. Definer helper, so this does not re-enter itself.
CREATE POLICY space_members_select
  ON public.space_members FOR SELECT TO authenticated
  USING (public.is_space_member(space_id));

CREATE POLICY space_members_insert_admin
  ON public.space_members FOR INSERT TO authenticated
  WITH CHECK (
    role <> 'owner'
    AND public.space_role(space_id) IN ('owner', 'admin')
  );

/* The owner row is untouchable through the API, in both directions: an admin cannot demote the
   owner, and nobody can promote themselves into a second owner (the unique index would refuse it
   anyway, but failing a CHECK is a clearer answer than failing an index). Transfer is a deliberate,
   logged act and belongs in its own RPC. */
CREATE POLICY space_members_update_admin
  ON public.space_members FOR UPDATE TO authenticated
  USING (
    role <> 'owner'
    AND public.space_role(space_id) IN ('owner', 'admin')
  )
  WITH CHECK (
    role <> 'owner'
    AND public.space_role(space_id) IN ('owner', 'admin')
  );

-- Leaving a space is deleting your own row; an admin may remove someone else's. The owner cannot
-- leave, because that would strand the space.
CREATE POLICY space_members_delete
  ON public.space_members FOR DELETE TO authenticated
  USING (
    role <> 'owner'
    AND (
      user_id = auth.uid()
      OR public.space_role(space_id) IN ('owner', 'admin')
    )
  );

GRANT SELECT, UPDATE, DELETE ON TABLE public.spaces TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.space_members TO authenticated;

-- ---------------------------------------------------------------- the workspace column
--
-- Both columns are added here, before the functions below, because a SQL function body is parsed
-- and validated at CREATE time: tag_owned_by_uid reads tags.space_id, so the column has to exist by
-- the time that function is written. The rest of the tag changes stay in their own section further
-- down.

ALTER TABLE public.folders
  ADD COLUMN IF NOT EXISTS space_id uuid REFERENCES public.spaces (id) ON DELETE CASCADE;

ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS space_id uuid REFERENCES public.spaces (id) ON DELETE CASCADE;

-- The shape every space read has: "this space's folders, in order".
CREATE INDEX IF NOT EXISTS folders_space_id_parent_id_sort_order_idx
  ON public.folders (space_id, parent_id, sort_order)
  WHERE space_id IS NOT NULL;

/*
 * Creator, workspace, and the one rule that ties a subtree together.
 *
 * Two things changed here. The old version refused to nest a folder under a parent belonging to a
 * different user, which inside a space is the normal case — B adding a subfolder under A's folder
 * is the feature, not an error. Inside a space the space is the unit of ownership, so the parent
 * rule becomes "same workspace"; outside one, the old per-user rule stands unchanged.
 *
 * And space_id is fixed for a folder's whole life. Letting an UPDATE change it would move a whole
 * subtree between workspaces in one statement, past every membership check and with nothing
 * recorded — which is also the database half of the decision that a personal folder is *copied*
 * into a space rather than moved.
 */
CREATE OR REPLACE FUNCTION public.enforce_folder_owner()
RETURNS trigger
LANGUAGE plpgsql
-- Definer so the parent lookup below sees the parent regardless of the caller's own RLS, the same
-- way the reachability helpers do. Revoked from the API at the end of this file.
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  parent_space uuid;
  parent_user uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Who made it. Stamped from the session, never taken from the client.
    NEW.user_id := auth.uid();
    IF NEW.space_id IS NOT NULL AND NOT public.space_can_write(NEW.space_id) THEN
      RAISE EXCEPTION 'Not allowed to add folders to this space';
    END IF;
  ELSE
    NEW.user_id := OLD.user_id;
    NEW.space_id := OLD.space_id;
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
$$;

-- ---------------------------------------------------------------- reachability
--
-- The three functions the whole permission surface hangs off, rewritten from "do you own this" to
-- "can you reach this". Their names are historical and kept deliberately: fourteen policies name
-- them, and renaming would turn a contained change into a sweep.
--
-- Each now has a *_writable_by_uid sibling. Read and write have to be separate questions because a
-- viewer can reach a row and must not change it; using one helper for USING and WITH CHECK alike
-- would hand every reader a pen.

CREATE OR REPLACE FUNCTION public.folder_owned_by_uid(folder_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.folders AS folder
    WHERE folder.id = folder_id
      AND CASE
            WHEN folder.space_id IS NULL THEN folder.user_id = auth.uid()
            ELSE public.is_space_member(folder.space_id)
          END
  );
$$;

CREATE OR REPLACE FUNCTION public.folder_writable_by_uid(folder_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.folders AS folder
    WHERE folder.id = folder_id
      AND CASE
            WHEN folder.space_id IS NULL THEN folder.user_id = auth.uid()
            ELSE public.space_can_write(folder.space_id)
          END
  );
$$;

CREATE OR REPLACE FUNCTION public.task_owned_by_uid(task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks AS task
    JOIN public.folders AS folder ON folder.id = task.folder_id
    WHERE task.id = task_id
      AND CASE
            WHEN folder.space_id IS NULL THEN folder.user_id = auth.uid()
            ELSE public.is_space_member(folder.space_id)
          END
  );
$$;

CREATE OR REPLACE FUNCTION public.task_writable_by_uid(task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks AS task
    JOIN public.folders AS folder ON folder.id = task.folder_id
    WHERE task.id = task_id
      AND CASE
            WHEN folder.space_id IS NULL THEN folder.user_id = auth.uid()
            ELSE public.space_can_write(folder.space_id)
          END
  );
$$;

CREATE OR REPLACE FUNCTION public.subtask_owned_by_uid(subtask_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subtasks AS subtask
    JOIN public.tasks AS task ON task.id = subtask.task_id
    JOIN public.folders AS folder ON folder.id = task.folder_id
    WHERE subtask.id = subtask_id
      AND CASE
            WHEN folder.space_id IS NULL THEN folder.user_id = auth.uid()
            ELSE public.is_space_member(folder.space_id)
          END
  );
$$;

CREATE OR REPLACE FUNCTION public.subtask_writable_by_uid(subtask_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subtasks AS subtask
    JOIN public.tasks AS task ON task.id = subtask.task_id
    JOIN public.folders AS folder ON folder.id = task.folder_id
    WHERE subtask.id = subtask_id
      AND CASE
            WHEN folder.space_id IS NULL THEN folder.user_id = auth.uid()
            ELSE public.space_can_write(folder.space_id)
          END
  );
$$;

/* Whether a tag is reachable, by the same rule. task_tags needs it: checking only the task would
   let anyone file one of their own tags against a shared row, and checking only the tag would let
   them learn which tasks it sits on. */
CREATE OR REPLACE FUNCTION public.tag_owned_by_uid(tag_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tags AS tag
    WHERE tag.id = tag_id
      AND CASE
            WHEN tag.space_id IS NULL THEN tag.user_id = auth.uid()
            ELSE public.is_space_member(tag.space_id)
          END
  );
$$;

REVOKE ALL ON FUNCTION public.folder_writable_by_uid(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.task_writable_by_uid(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.subtask_writable_by_uid(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tag_owned_by_uid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.folder_writable_by_uid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_writable_by_uid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.subtask_writable_by_uid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tag_owned_by_uid(uuid) TO authenticated;

-- The trigger function is elevated, so it should not also be a PostgREST endpoint — same reasoning
-- as 20260828007000_lock_down_trigger_functions.sql.
REVOKE ALL ON FUNCTION public.enforce_folder_owner() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- folders policies
--
-- These are the one set the helpers cannot cover: a policy on folders that called
-- folder_owned_by_uid(id) would be asking about the row it is already deciding. So the reach rule
-- is written out inline here, and only here.

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
    END
  )
  WITH CHECK (
    CASE
      WHEN space_id IS NULL THEN user_id = auth.uid()
      ELSE public.space_can_write(space_id)
    END
    AND (parent_id IS NULL OR public.folder_writable_by_uid(parent_id))
  );

CREATE POLICY folders_delete_own
  ON public.folders FOR DELETE TO authenticated
  USING (
    CASE
      WHEN space_id IS NULL THEN user_id = auth.uid()
      ELSE public.space_can_write(space_id)
    END
  );

-- ---------------------------------------------------------------- tasks policies

DROP POLICY IF EXISTS tasks_select_own ON public.tasks;
DROP POLICY IF EXISTS tasks_insert_own ON public.tasks;
DROP POLICY IF EXISTS tasks_update_own ON public.tasks;
DROP POLICY IF EXISTS tasks_delete_own ON public.tasks;

CREATE POLICY tasks_select_own
  ON public.tasks FOR SELECT TO authenticated
  USING (public.folder_owned_by_uid(folder_id));

CREATE POLICY tasks_insert_own
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (public.folder_writable_by_uid(folder_id));

CREATE POLICY tasks_update_own
  ON public.tasks FOR UPDATE TO authenticated
  USING (public.folder_writable_by_uid(folder_id))
  WITH CHECK (public.folder_writable_by_uid(folder_id));

CREATE POLICY tasks_delete_own
  ON public.tasks FOR DELETE TO authenticated
  USING (public.folder_writable_by_uid(folder_id));

-- ---------------------------------------------------------------- subtasks policies

DROP POLICY IF EXISTS subtasks_select_own ON public.subtasks;
DROP POLICY IF EXISTS subtasks_insert_own ON public.subtasks;
DROP POLICY IF EXISTS subtasks_update_own ON public.subtasks;
DROP POLICY IF EXISTS subtasks_delete_own ON public.subtasks;

CREATE POLICY subtasks_select_own
  ON public.subtasks FOR SELECT TO authenticated
  USING (public.task_owned_by_uid(task_id));

CREATE POLICY subtasks_insert_own
  ON public.subtasks FOR INSERT TO authenticated
  WITH CHECK (
    public.task_writable_by_uid(task_id)
    AND (parent_subtask_id IS NULL OR public.subtask_writable_by_uid(parent_subtask_id))
  );

CREATE POLICY subtasks_update_own
  ON public.subtasks FOR UPDATE TO authenticated
  USING (public.task_writable_by_uid(task_id))
  WITH CHECK (
    public.task_writable_by_uid(task_id)
    AND (parent_subtask_id IS NULL OR public.subtask_writable_by_uid(parent_subtask_id))
  );

CREATE POLICY subtasks_delete_own
  ON public.subtasks FOR DELETE TO authenticated
  USING (public.task_writable_by_uid(task_id));

-- ---------------------------------------------------------------- attachments policies

DROP POLICY IF EXISTS attachments_select_own ON public.attachments;
DROP POLICY IF EXISTS attachments_insert_own ON public.attachments;
DROP POLICY IF EXISTS attachments_update_own ON public.attachments;
DROP POLICY IF EXISTS attachments_delete_own ON public.attachments;

CREATE POLICY attachments_select_own
  ON public.attachments FOR SELECT TO authenticated
  USING (public.task_owned_by_uid(task_id));

CREATE POLICY attachments_insert_own
  ON public.attachments FOR INSERT TO authenticated
  WITH CHECK (public.task_writable_by_uid(task_id));

CREATE POLICY attachments_update_own
  ON public.attachments FOR UPDATE TO authenticated
  USING (public.task_writable_by_uid(task_id))
  WITH CHECK (public.task_writable_by_uid(task_id));

CREATE POLICY attachments_delete_own
  ON public.attachments FOR DELETE TO authenticated
  USING (public.task_writable_by_uid(task_id));

-- ---------------------------------------------------------------- tags
--
-- A space needs its own catalogue. Without one, the tags a space's tasks carry would be filed in
-- whichever member happened to type them first, and every member would see their personal tags
-- offered inside the space — the two catalogues erasing each other on the next save.

-- space_id itself was added further up, alongside folders.space_id — see the note there.

-- One name per catalogue, and there are now two kinds of catalogue. The old index was over
-- (user_id, name) unconditionally, which inside a space would have made a name unique per member
-- rather than per space.
DROP INDEX IF EXISTS public.tags_user_id_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS tags_personal_name_key
  ON public.tags (user_id, name)
  WHERE space_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tags_space_name_key
  ON public.tags (space_id, name)
  WHERE space_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_tag_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.user_id := auth.uid();
    IF NEW.space_id IS NOT NULL AND NOT public.space_can_write(NEW.space_id) THEN
      RAISE EXCEPTION 'Not allowed to add tags to this space';
    END IF;
  ELSE
    NEW.user_id := OLD.user_id;
    -- Fixed for the tag's life, for the same reason a folder's is: a tag that could change
    -- catalogue would carry every task it is on across with it.
    NEW.space_id := OLD.space_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_tag_owner() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS tags_select_own ON public.tags;
DROP POLICY IF EXISTS tags_insert_own ON public.tags;
DROP POLICY IF EXISTS tags_update_own ON public.tags;
DROP POLICY IF EXISTS tags_delete_own ON public.tags;

CREATE POLICY tags_select_own
  ON public.tags FOR SELECT TO authenticated
  USING (
    CASE
      WHEN space_id IS NULL THEN user_id = auth.uid()
      ELSE public.is_space_member(space_id)
    END
  );

CREATE POLICY tags_insert_own
  ON public.tags FOR INSERT TO authenticated
  WITH CHECK (
    CASE
      WHEN space_id IS NULL THEN user_id = auth.uid()
      ELSE public.space_can_write(space_id)
    END
  );

CREATE POLICY tags_update_own
  ON public.tags FOR UPDATE TO authenticated
  USING (
    CASE
      WHEN space_id IS NULL THEN user_id = auth.uid()
      ELSE public.space_can_write(space_id)
    END
  )
  WITH CHECK (
    CASE
      WHEN space_id IS NULL THEN user_id = auth.uid()
      ELSE public.space_can_write(space_id)
    END
  );

CREATE POLICY tags_delete_own
  ON public.tags FOR DELETE TO authenticated
  USING (
    CASE
      WHEN space_id IS NULL THEN user_id = auth.uid()
      ELSE public.space_can_write(space_id)
    END
  );

-- ---------------------------------------------------------------- task_tags
--
-- Was two inlined folder joins against folder.user_id. Both ends are checked, for the reason the
-- original comment gave, but each end now asks the reachability helper instead.

DROP POLICY IF EXISTS task_tags_select_own ON public.task_tags;
DROP POLICY IF EXISTS task_tags_insert_own ON public.task_tags;
DROP POLICY IF EXISTS task_tags_delete_own ON public.task_tags;

CREATE POLICY task_tags_select_own
  ON public.task_tags FOR SELECT TO authenticated
  USING (public.task_owned_by_uid(task_id));

CREATE POLICY task_tags_insert_own
  ON public.task_tags FOR INSERT TO authenticated
  WITH CHECK (
    public.task_writable_by_uid(task_id)
    AND public.tag_owned_by_uid(tag_id)
  );

CREATE POLICY task_tags_delete_own
  ON public.task_tags FOR DELETE TO authenticated
  USING (public.task_writable_by_uid(task_id));

-- ---------------------------------------------------------------- reminders
--
-- A reminder still belongs to the person who made it: they are the one it emails, and phase 5 is
-- where an explicit notify target arrives. What changes is the task check on the way in, which
-- becomes "a task I may write" — otherwise nobody could put a reminder on a shared task at all.

DROP POLICY IF EXISTS reminders_insert_own ON public.reminders;
DROP POLICY IF EXISTS reminders_update_own ON public.reminders;

CREATE POLICY reminders_insert_own
  ON public.reminders FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.task_writable_by_uid(task_id));

CREATE POLICY reminders_update_own
  ON public.reminders FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.task_writable_by_uid(task_id));

-- ---------------------------------------------------------------- attachment storage
--
-- The path check was "the first segment must be my own user id", which is exactly what stops a
-- space member from reading a file another member uploaded. The authorization that matters is the
-- task in the second segment, so reads and deletes now rest on that alone.
--
-- Uploads keep the first-segment rule: writing under your own prefix is what keeps two people's
-- files from colliding, and it means buildAttachmentStoragePath stays as it is and every file
-- already in the bucket stays exactly where it is.

CREATE OR REPLACE FUNCTION public.storage_attachment_task(object_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$
BEGIN
  RETURN split_part(object_name, '/', 2)::uuid;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.storage_attachment_allowed(object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  path_task uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  path_task := public.storage_attachment_task(object_name);
  IF path_task IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.task_owned_by_uid(path_task);
END;
$$;

CREATE OR REPLACE FUNCTION public.storage_attachment_writable(object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  path_task uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  -- Your own prefix only, so uploads cannot collide or be planted under someone else's path.
  IF split_part(object_name, '/', 1) IS DISTINCT FROM auth.uid()::text THEN
    RETURN false;
  END IF;

  path_task := public.storage_attachment_task(object_name);
  IF path_task IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.task_writable_by_uid(path_task);
END;
$$;

REVOKE ALL ON FUNCTION public.storage_attachment_task(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_attachment_writable(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storage_attachment_task(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_attachment_writable(text) TO authenticated;

DROP POLICY IF EXISTS attachments_storage_select ON storage.objects;
DROP POLICY IF EXISTS attachments_storage_insert ON storage.objects;
DROP POLICY IF EXISTS attachments_storage_update ON storage.objects;
DROP POLICY IF EXISTS attachments_storage_delete ON storage.objects;

CREATE POLICY attachments_storage_select
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attachments' AND public.storage_attachment_allowed(name));

CREATE POLICY attachments_storage_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attachments' AND public.storage_attachment_writable(name));

CREATE POLICY attachments_storage_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'attachments' AND public.storage_attachment_writable(name))
  WITH CHECK (bucket_id = 'attachments' AND public.storage_attachment_writable(name));

-- Deleting the file follows the task, not the prefix: a member tidying up a shared note should not
-- be blocked because somebody else uploaded it.
CREATE POLICY attachments_storage_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'attachments' AND public.task_writable_by_uid(public.storage_attachment_task(name)));

NOTIFY pgrst, 'reload schema';
