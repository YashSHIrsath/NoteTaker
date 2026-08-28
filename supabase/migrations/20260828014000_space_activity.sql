-- Shared Spaces, phase 3: the record.
--
-- The point of this phase is not that changes are logged. It is that a change *cannot happen*
-- without being logged, and that nothing has to remember to do it. A log written alongside each
-- mutation drifts: someone adds a mutation and forgets the log line, a bulk operation writes fifty
-- rows and one entry, and the guarantee quietly stops being true. So the log is a consequence of
-- writing, in two layers that cover each other.
--
-- The floor is triggers. They fire for anything that touches the row — this app, another client, a
-- psql session, a script — and they record what actually changed, taken from OLD and NEW. Nothing
-- in the application can switch them off or lie to them.
--
-- The narrative is intent. Raw diffs read badly, so the write path declares what a person was doing
-- and the triggers stamp it alongside the diff. If a client ever sends a misleading intent, the real
-- before and after are sitting next to it; if a write arrives without going through the write path at
-- all, it is still recorded, just without the friendly sentence.
--
-- Still not in this phase: the admin-only search and export, locks, per-item visibility, realtime,
-- presence, Trash.

-- ---------------------------------------------------------------- a repair, first
--
-- Two more guards compared public.space_role directly. It returns NULL for someone who is not in the
-- space, `NULL NOT IN (...)` and `NULL <> 'owner'` are both NULL, and `IF NULL THEN RAISE` does not
-- fire — so invite_to_space and transfer_space_ownership skipped their own permission checks for
-- exactly the people they exist to stop. Inviting is the worse of the two: it hands a third party
-- access to the space.
--
-- The idiom is removed rather than patched site by site. Every role question is one of three
-- NULL-safe functions now, and nothing compares against space_role again. Repeated here because
-- 20260828013000 has already been applied to live databases.

CREATE OR REPLACE FUNCTION public.space_can_manage(p_space_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT coalesce(public.space_role(p_space_id) IN ('owner', 'admin'), false);
$$;

CREATE OR REPLACE FUNCTION public.space_is_owner(p_space_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT coalesce(public.space_role(p_space_id) = 'owner', false);
$$;

REVOKE ALL ON FUNCTION public.space_can_manage(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.space_is_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.space_can_manage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.space_is_owner(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.invite_to_space(
  p_space_id uuid,
  p_email text,
  p_role text DEFAULT 'editor'
)
RETURNS public.space_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  v_invite public.space_invites;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_headcount integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.space_can_manage(p_space_id) THEN
    RAISE EXCEPTION 'Only an owner or admin can invite people';
  END IF;

  IF v_email = '' OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'That does not look like an email address';
  END IF;

  IF coalesce(p_role, '') NOT IN ('admin', 'editor', 'viewer') THEN
    RAISE EXCEPTION 'Unknown role: %', p_role;
  END IF;

  IF v_email = public.current_email() THEN
    RAISE EXCEPTION 'You are already in this space';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.space_members AS member
    JOIN auth.users AS u ON u.id = member.user_id
    WHERE member.space_id = p_space_id
      AND lower(btrim(u.email)) = v_email
  ) THEN
    RAISE EXCEPTION 'That person is already in this space';
  END IF;

  SELECT
    (SELECT count(*) FROM public.space_members AS m WHERE m.space_id = p_space_id)
    + (SELECT count(*) FROM public.space_invites AS i
        WHERE i.space_id = p_space_id AND i.status = 'pending' AND i.expires_at > now())
  INTO v_headcount;

  IF v_headcount >= public.space_limit_members() THEN
    RAISE EXCEPTION 'This space has reached the limit of % people', public.space_limit_members();
  END IF;

  UPDATE public.space_invites
  SET role = p_role,
      invited_by = auth.uid(),
      expires_at = now() + interval '14 days',
      created_at = now()
  WHERE space_id = p_space_id
    AND lower(btrim(email)) = v_email
    AND status = 'pending'
  RETURNING * INTO v_invite;

  IF FOUND THEN
    RETURN v_invite;
  END IF;

  INSERT INTO public.space_invites (space_id, email, role, invited_by)
  VALUES (p_space_id, btrim(p_email), p_role, auth.uid())
  RETURNING * INTO v_invite;

  RETURN v_invite;
END;
$$;

REVOKE ALL ON FUNCTION public.invite_to_space(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_to_space(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.transfer_space_ownership(p_space_id uuid, p_to_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.space_is_owner(p_space_id) THEN
    RAISE EXCEPTION 'Only the owner can transfer a space';
  END IF;

  IF p_to_user = auth.uid() THEN
    RAISE EXCEPTION 'You already own this space';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.space_members AS member
    WHERE member.space_id = p_space_id AND member.user_id = p_to_user
  ) THEN
    RAISE EXCEPTION 'That person is not in this space';
  END IF;

  UPDATE public.space_members
  SET role = 'admin'
  WHERE space_id = p_space_id AND user_id = auth.uid();

  UPDATE public.space_members
  SET role = 'owner'
  WHERE space_id = p_space_id AND user_id = p_to_user;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_space_ownership(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_space_ownership(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------- the record

CREATE TABLE IF NOT EXISTS public.space_activity (
  /* A bigint rather than a uuid: this is a feed, always read newest-first and paged by a cursor, and
     an identity column is both the order and the cursor. */
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  space_id uuid NOT NULL REFERENCES public.spaces (id) ON DELETE CASCADE,
  /* Nulled rather than cascaded if the account is ever deleted: what happened still happened, and a
     history with holes in it is not a history. */
  actor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  /* The title as it was, not a join. This is what keeps a line readable after the thing it is about
     has been deleted — the same trick task_events already uses for a reminder's description. */
  entity_title text,
  path_label text,
  before jsonb,
  after jsonb,
  intent text,
  CONSTRAINT space_activity_entity_type_allowed CHECK (
    entity_type IN ('folder', 'task', 'subtask', 'attachment')
  )
);

-- The feed: one space, newest first. id breaks ties within a timestamp, which matters because a
-- single space_apply writes several rows at the same now().
CREATE INDEX IF NOT EXISTS space_activity_feed_idx
  ON public.space_activity (space_id, occurred_at DESC, id DESC);

-- One item's own history, which is the other way anyone reads this.
CREATE INDEX IF NOT EXISTS space_activity_entity_idx
  ON public.space_activity (entity_type, entity_id, occurred_at DESC);

-- ---------------------------------------------------------------- what a row looked like
--
-- `content` is stripped from an update's before and after, and kept on a delete.
--
-- A note's body is the largest thing in the database and the most frequently written; storing two
-- copies of it on every save would make this table larger than the notes it describes, for a diff
-- nobody reads. What the feed is for is who changed what, when — so an edit records *that* the body
-- changed and how long it now is.
--
-- A delete is the exception, because it is the one case where the body is not still sitting in the
-- live row. That is also what makes restoring one possible later.

CREATE OR REPLACE FUNCTION public.activity_payload(p_row jsonb, p_keep_content boolean)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN p_row IS NULL THEN NULL
    WHEN p_keep_content OR NOT (p_row ? 'content') THEN p_row
    ELSE jsonb_set(
      p_row - 'content',
      '{content_length}',
      to_jsonb(length(coalesce(p_row ->> 'content', ''))),
      true
    )
  END;
$$;

/** The folder path as words, for a line that has to still read correctly in a year. */
CREATE OR REPLACE FUNCTION public.space_path_label(p_folder_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  WITH RECURSIVE up AS (
    SELECT f.id, f.parent_id, f.name, 0 AS depth
    FROM public.folders AS f
    WHERE f.id = p_folder_id
    UNION ALL
    SELECT parent.id, parent.parent_id, parent.name, up.depth + 1
    FROM public.folders AS parent
    JOIN up ON up.parent_id = parent.id
  )
  SELECT string_agg(name, ' / ' ORDER BY depth DESC) FROM up;
$$;

-- ---------------------------------------------------------------- the writer
--
-- One trigger function for all four tables. The derivation rules — which space this belongs to, what
-- to call what happened, what the thing is named — are the whole substance of the record, and
-- splitting them across four near-identical functions is how three of them come to disagree.

CREATE OR REPLACE FUNCTION public.log_space_activity()
RETURNS trigger
LANGUAGE plpgsql
-- Definer so it can insert into a table with no INSERT policy, and resolve the space through rows the
-- caller may not be able to read. That is the point: this is the one thing allowed to append here.
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_row record;
  v_space uuid;
  v_folder uuid;
  v_action text;
  v_title text;
  v_intent text;
  v_before jsonb;
  v_after jsonb;
  v_is_delete boolean := TG_OP = 'DELETE';
BEGIN
  IF v_is_delete THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;

  -- ------------------------------------------------ which space, and where
  CASE TG_TABLE_NAME
    WHEN 'folders' THEN
      v_space := v_row.space_id;
      v_folder := v_row.parent_id;
      v_title := v_row.name;
    WHEN 'tasks' THEN
      SELECT f.space_id INTO v_space FROM public.folders AS f WHERE f.id = v_row.folder_id;
      v_folder := v_row.folder_id;
      v_title := v_row.title;
    WHEN 'subtasks' THEN
      SELECT f.space_id, t.folder_id INTO v_space, v_folder
      FROM public.tasks AS t
      JOIN public.folders AS f ON f.id = t.folder_id
      WHERE t.id = v_row.task_id;
      v_title := v_row.title;
    WHEN 'attachments' THEN
      SELECT f.space_id, t.folder_id INTO v_space, v_folder
      FROM public.tasks AS t
      JOIN public.folders AS f ON f.id = t.folder_id
      WHERE t.id = v_row.task_id;
      v_title := v_row.name;
    ELSE
      RETURN NULL;
  END CASE;

  /*
   * A cascade has already removed the row above this one.
   *
   * ON DELETE CASCADE runs after the parent row is gone, so a task deleted along with its folder
   * cannot find its folder to ask which space it was in. The write path records the space it is
   * working in for exactly this moment; without the fallback, deleting a folder would log the folder
   * and silently lose everything that went with it.
   */
  IF v_space IS NULL THEN
    v_space := nullif(current_setting('mindstack.space', true), '')::uuid;
  END IF;

  -- Personal notes are not a shared space and have nothing to attribute. This is also what keeps
  -- the personal workspace exactly as fast as it was.
  IF v_space IS NULL THEN
    RETURN NULL;
  END IF;

  -- ------------------------------------------------ what happened
  --
  -- Read off OLD and NEW, never taken from the caller. Where several things changed at once the
  -- most consequential one names the entry; the diff below carries the rest.
  IF TG_OP = 'INSERT' THEN
    v_action := CASE TG_TABLE_NAME WHEN 'attachments' THEN 'attachment_added' ELSE 'created' END;
  ELSIF v_is_delete THEN
    v_action := CASE TG_TABLE_NAME WHEN 'attachments' THEN 'attachment_removed' ELSE 'deleted' END;
  ELSE
    v_action := 'updated';
    CASE TG_TABLE_NAME
      WHEN 'folders' THEN
        IF NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN v_action := 'moved';
        ELSIF NEW.name IS DISTINCT FROM OLD.name THEN v_action := 'renamed';
        ELSIF NEW.is_important IS DISTINCT FROM OLD.is_important THEN
          v_action := CASE WHEN NEW.is_important THEN 'starred' ELSE 'unstarred' END;
        END IF;
      WHEN 'tasks' THEN
        IF NEW.folder_id IS DISTINCT FROM OLD.folder_id THEN v_action := 'moved';
        ELSIF NEW.title IS DISTINCT FROM OLD.title THEN v_action := 'renamed';
        ELSIF NEW.completed IS DISTINCT FROM OLD.completed THEN
          v_action := CASE WHEN NEW.completed THEN 'completed' ELSE 'reopened' END;
        ELSIF NEW.due_at IS DISTINCT FROM OLD.due_at THEN v_action := 'due_changed';
        ELSIF NEW.content IS DISTINCT FROM OLD.content THEN v_action := 'content_edited';
        ELSIF NEW.is_important IS DISTINCT FROM OLD.is_important THEN
          v_action := CASE WHEN NEW.is_important THEN 'starred' ELSE 'unstarred' END;
        END IF;
      WHEN 'subtasks' THEN
        IF NEW.title IS DISTINCT FROM OLD.title THEN v_action := 'renamed';
        ELSIF NEW.completed IS DISTINCT FROM OLD.completed THEN
          v_action := CASE WHEN NEW.completed THEN 'completed' ELSE 'reopened' END;
        END IF;
      ELSE
        NULL;
    END CASE;

    -- Nothing actually changed. An idempotent write is not an event.
    IF to_jsonb(NEW) = to_jsonb(OLD) THEN
      RETURN NULL;
    END IF;
  END IF;

  -- ------------------------------------------------ the diff, and the sentence
  v_before := public.activity_payload(
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    v_is_delete
  );
  v_after := public.activity_payload(
    CASE WHEN v_is_delete THEN NULL ELSE to_jsonb(NEW) END,
    false
  );

  -- Declared by the write path, and only ever decoration on top of the diff above.
  v_intent := nullif(btrim(coalesce(current_setting('mindstack.intent', true), '')), '');

  INSERT INTO public.space_activity (
    space_id, actor_id, action, entity_type, entity_id,
    entity_title, path_label, before, after, intent
  )
  VALUES (
    v_space,
    auth.uid(),
    v_action,
    CASE TG_TABLE_NAME
      WHEN 'folders' THEN 'folder'
      WHEN 'tasks' THEN 'task'
      WHEN 'subtasks' THEN 'subtask'
      ELSE 'attachment'
    END,
    v_row.id,
    nullif(btrim(coalesce(v_title, '')), ''),
    public.space_path_label(v_folder),
    v_before,
    v_after,
    v_intent
  );

  RETURN NULL;
END;
$$;

-- Elevated, so not also a PostgREST endpoint — same reasoning as
-- 20260828007000_lock_down_trigger_functions.sql.
REVOKE ALL ON FUNCTION public.log_space_activity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_payload(jsonb, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.space_path_label(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.space_path_label(uuid) TO authenticated;

DROP TRIGGER IF EXISTS folders_log_space_activity ON public.folders;
CREATE TRIGGER folders_log_space_activity
  AFTER INSERT OR UPDATE OR DELETE ON public.folders
  FOR EACH ROW EXECUTE PROCEDURE public.log_space_activity();

DROP TRIGGER IF EXISTS tasks_log_space_activity ON public.tasks;
CREATE TRIGGER tasks_log_space_activity
  AFTER INSERT OR UPDATE OR DELETE ON public.tasks
  FOR EACH ROW EXECUTE PROCEDURE public.log_space_activity();

DROP TRIGGER IF EXISTS subtasks_log_space_activity ON public.subtasks;
CREATE TRIGGER subtasks_log_space_activity
  AFTER INSERT OR UPDATE OR DELETE ON public.subtasks
  FOR EACH ROW EXECUTE PROCEDURE public.log_space_activity();

DROP TRIGGER IF EXISTS attachments_log_space_activity ON public.attachments;
CREATE TRIGGER attachments_log_space_activity
  AFTER INSERT OR UPDATE OR DELETE ON public.attachments
  FOR EACH ROW EXECUTE PROCEDURE public.log_space_activity();

-- ---------------------------------------------------------------- RLS
--
-- Readable by the space, writable by nobody. There is no INSERT, UPDATE or DELETE policy on purpose:
-- history that can be edited is not history, and the only legitimate write is the trigger above,
-- which is elevated precisely so this can be true. The same shape task_events already has.
--
-- Everyone in the space reads it, not only its admins. A log the whole space can see deters far more
-- than one only the owner reads, and it doubles as "what changed while I was away" — which is the
-- most-used screen in any shared workspace. The admin-only powers are searching one named person's
-- actions and exporting, and those come with the admin screens.

ALTER TABLE public.space_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS space_activity_select_member ON public.space_activity;
CREATE POLICY space_activity_select_member
  ON public.space_activity FOR SELECT TO authenticated
  USING (public.is_space_member(space_id));

GRANT SELECT ON TABLE public.space_activity TO authenticated;

-- ---------------------------------------------------------------- reading it
--
-- Functions rather than plain selects for one reason: the feed shows who did something, and
-- auth.users is not readable by the client. Same boundary crossing as space_member_directory, and
-- just as narrow.

--
-- The filters are arguments rather than something the client does to a page it already has.
--
-- The feed is paged fifty at a time and kept for a year, so filtering in the browser would search
-- only whatever happened to be on screen — "show me everything Priya deleted" would answer from the
-- last fifty rows and quietly leave out the rest. NULL means no filter, which is why both default
-- to it and an empty selection sends NULL rather than an empty array.
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
AS $$
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
  ORDER BY a.occurred_at DESC, a.id DESC
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

/** One item's own history — the note you are looking at, rather than the whole space. */
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
AS $$
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
  ORDER BY a.occurred_at DESC, a.id DESC
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

REVOKE ALL ON FUNCTION public.space_activity_feed(uuid, bigint, integer, uuid[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.space_entity_history(text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.space_activity_feed(uuid, bigint, integer, uuid[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.space_entity_history(text, uuid, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
