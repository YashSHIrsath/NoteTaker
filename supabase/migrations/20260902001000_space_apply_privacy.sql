-- space_apply, taught about per-item privacy.
--
-- Two gaps that only opened once items could be private, and both are the same shape: this function
-- is SECURITY DEFINER, so its statements are not filtered by RLS. Every check it makes it has to make
-- itself, and the checks it made were about the *space* -- "is this folder in the space I am writing
-- to" -- which was the whole question when everything in a space was readable by everyone.
--
--   Reads through the back door. `create a task in folder X` only checked that X belonged to the
--   space. A member who knew or guessed the id of a folder they cannot see could put a note inside
--   it, and a patch or delete by id could reach a note they were never shown.
--
--   Writes to what you cannot see. Same cause: a patch's WHERE clause asked about the space rather
--   than about reach.
--
-- So every branch below now asks folder_writable_by_uid / task_writable_by_uid, which since the
-- privacy migration means "in a space I may write to, visible to me, and visible all the way up".
-- The space check is kept alongside rather than replaced: it is what stops an op naming a row in a
-- *different* space that this caller happens to be a member of too.
--
-- The other change is that a create may carry a visibility. A create is by definition performed by
-- the item's owner, so there is no permission question in it -- which is why 'private' is accepted
-- here and refused on a patch. Changing an existing item's audience goes through
-- set_content_visibility(), the only thing that can lift the trigger's freeze on the column.

CREATE OR REPLACE FUNCTION public.space_apply(
  p_space_id uuid,
  p_intent text,
  p_ops jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_op jsonb;
  v_row jsonb;
  v_fields jsonb;
  v_id uuid;
  v_task uuid;
  v_names text[];
  v_visibility text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  /* One decision, up front. A viewer gets told they cannot change this space rather than having each
     individual row refuse them, which is both clearer and a great deal cheaper. */
  IF NOT public.space_can_write(p_space_id) THEN
    RAISE EXCEPTION 'You do not have permission to change this space';
  END IF;

  IF p_ops IS NULL OR jsonb_typeof(p_ops) <> 'array' THEN
    RAISE EXCEPTION 'Operations must be an array';
  END IF;

  /*
   * The two things the activity triggers read.
   *
   * `intent` is the sentence. `space` is the fallback the triggers need when a cascade has already
   * removed the row above the one being deleted -- a task deleted along with its folder can no longer
   * find the folder to ask which space it was in.
   *
   * Transaction-local, so they cannot leak into the next request on a pooled connection.
   */
  PERFORM set_config('mindstack.intent', coalesce(btrim(p_intent), ''), true);
  PERFORM set_config('mindstack.space', p_space_id::text, true);

  -- ------------------------------------------------ tags, before anything links to them
  FOR v_op IN SELECT value FROM jsonb_array_elements(p_ops) AS value
    WHERE value ->> 'entity' = 'tag' AND value ->> 'action' = 'create'
  LOOP
    v_row := v_op -> 'row';
    INSERT INTO public.tags (id, name, space_id)
    VALUES ((v_row ->> 'id')::uuid, v_row ->> 'name', p_space_id)
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  -- ------------------------------------------------ folders
  --
  -- In the order given, because a batch can hold a folder and its child and the child needs its
  -- parent to exist. The client sends them parent-first; the phase order below is this function's
  -- own, and does not depend on the caller.
  FOR v_op IN SELECT value FROM jsonb_array_elements(p_ops) AS value
    WHERE value ->> 'entity' = 'folder' AND value ->> 'action' = 'create'
  LOOP
    v_row := v_op -> 'row';

    -- A folder can only be nested inside one this space already owns *and this caller can reach*.
    -- Without the space half an op could graft a shared subtree onto somebody's personal folder;
    -- without the reach half it could plant one inside a folder the caller cannot see.
    IF v_row ->> 'parentId' IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.folders AS parent
        WHERE parent.id = (v_row ->> 'parentId')::uuid AND parent.space_id = p_space_id
      ) THEN
        RAISE EXCEPTION 'That parent folder is not in this space';
      END IF;
      IF NOT public.folder_writable_by_uid((v_row ->> 'parentId')::uuid) THEN
        RAISE EXCEPTION 'That parent folder is not one you can add to';
      END IF;
    END IF;

    v_visibility := public.checked_visibility(v_row ->> 'visibility');

    INSERT INTO public.folders (id, parent_id, name, is_important, sort_order, space_id, visibility)
    VALUES (
      (v_row ->> 'id')::uuid,
      nullif(v_row ->> 'parentId', '')::uuid,
      v_row ->> 'name',
      coalesce((v_row ->> 'isImportant')::boolean, false),
      coalesce((v_row ->> 'sortOrder')::integer, 0),
      p_space_id,
      v_visibility
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  -- ------------------------------------------------ tasks
  FOR v_op IN SELECT value FROM jsonb_array_elements(p_ops) AS value
    WHERE value ->> 'entity' = 'task' AND value ->> 'action' = 'create'
  LOOP
    v_row := v_op -> 'row';

    IF NOT EXISTS (
      SELECT 1 FROM public.folders AS f
      WHERE f.id = (v_row ->> 'folderId')::uuid AND f.space_id = p_space_id
    ) THEN
      RAISE EXCEPTION 'That folder is not in this space';
    END IF;

    IF NOT public.folder_writable_by_uid((v_row ->> 'folderId')::uuid) THEN
      RAISE EXCEPTION 'That folder is not one you can add to';
    END IF;

    v_visibility := public.checked_visibility(v_row ->> 'visibility');

    INSERT INTO public.tasks (
      id, folder_id, title, content, is_important, is_pinned, pinned_scopes,
      sort_order, note_kind, due_at, completed, tags, color, grid_layout, visibility
    )
    VALUES (
      (v_row ->> 'id')::uuid,
      (v_row ->> 'folderId')::uuid,
      v_row ->> 'title',
      coalesce(v_row ->> 'content', ''),
      coalesce((v_row ->> 'isImportant')::boolean, false),
      coalesce(jsonb_array_length(coalesce(v_row -> 'pinnedScopes', '[]'::jsonb)) > 0, false),
      ARRAY(SELECT jsonb_array_elements_text(coalesce(v_row -> 'pinnedScopes', '[]'::jsonb))),
      coalesce((v_row ->> 'sortOrder')::integer, 0),
      coalesce(v_row ->> 'noteKind', 'note'),
      nullif(v_row ->> 'dueAt', '')::timestamptz,
      coalesce((v_row ->> 'completed')::boolean, false),
      ARRAY(SELECT jsonb_array_elements_text(coalesce(v_row -> 'tags', '[]'::jsonb))),
      nullif(v_row ->> 'color', ''),
      v_row -> 'gridLayouts',
      v_visibility
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  -- ------------------------------------------------ subtasks
  FOR v_op IN SELECT value FROM jsonb_array_elements(p_ops) AS value
    WHERE value ->> 'entity' = 'subtask' AND value ->> 'action' = 'create'
  LOOP
    v_row := v_op -> 'row';

    IF NOT public.task_writable_by_uid((v_row ->> 'taskId')::uuid) THEN
      RAISE EXCEPTION 'That note is not one you can add to';
    END IF;

    INSERT INTO public.subtasks (id, task_id, parent_subtask_id, title, completed)
    VALUES (
      (v_row ->> 'id')::uuid,
      (v_row ->> 'taskId')::uuid,
      nullif(v_row ->> 'parentSubtaskId', '')::uuid,
      v_row ->> 'title',
      coalesce((v_row ->> 'completed')::boolean, false)
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  -- ------------------------------------------------ patches
  --
  -- Only the named columns move; everything else keeps the value it already has. That is what stops
  -- two people editing different fields of one note from overwriting each other.
  --
  -- A patch that matches nothing is skipped rather than raised on. In a shared space the usual reason
  -- is that somebody else deleted the row a moment ago, and failing the whole batch would throw away
  -- the rest of an edit over something that has already resolved itself. An unreachable row lands in
  -- the same bucket by design: a patch aimed at something the caller cannot see is answered exactly
  -- like a patch aimed at something that no longer exists, which is the answer that reveals least.
  --
  -- `visibility` is not in either SET list. The column is frozen by the row's own trigger and moves
  -- only through set_content_visibility(), which checks ownership -- so a patch naming it is not
  -- rejected here, it simply has no effect.
  FOR v_op IN SELECT value FROM jsonb_array_elements(p_ops) AS value
    WHERE value ->> 'entity' = 'folder' AND value ->> 'action' = 'patch'
  LOOP
    v_fields := v_op -> 'fields';
    v_id := (v_op ->> 'id')::uuid;

    IF v_fields ? 'parentId' AND v_fields ->> 'parentId' IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.folders AS parent
        WHERE parent.id = (v_fields ->> 'parentId')::uuid AND parent.space_id = p_space_id
      ) THEN
        RAISE EXCEPTION 'That parent folder is not in this space';
      END IF;
      IF NOT public.folder_writable_by_uid((v_fields ->> 'parentId')::uuid) THEN
        RAISE EXCEPTION 'That parent folder is not one you can add to';
      END IF;
    END IF;

    UPDATE public.folders AS f SET
      name = CASE WHEN v_fields ? 'name' THEN v_fields ->> 'name' ELSE f.name END,
      parent_id = CASE WHEN v_fields ? 'parentId'
        THEN nullif(v_fields ->> 'parentId', '')::uuid ELSE f.parent_id END,
      is_important = CASE WHEN v_fields ? 'isImportant'
        THEN (v_fields ->> 'isImportant')::boolean ELSE f.is_important END,
      sort_order = CASE WHEN v_fields ? 'sortOrder'
        THEN (v_fields ->> 'sortOrder')::integer ELSE f.sort_order END
    WHERE f.id = v_id
      AND f.space_id = p_space_id
      AND public.folder_writable_by_uid(f.id);
  END LOOP;

  FOR v_op IN SELECT value FROM jsonb_array_elements(p_ops) AS value
    WHERE value ->> 'entity' = 'task' AND value ->> 'action' = 'patch'
  LOOP
    v_fields := v_op -> 'fields';
    v_id := (v_op ->> 'id')::uuid;

    IF v_fields ? 'folderId' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.folders AS f
        WHERE f.id = (v_fields ->> 'folderId')::uuid AND f.space_id = p_space_id
      ) THEN
        RAISE EXCEPTION 'That folder is not in this space';
      END IF;
      IF NOT public.folder_writable_by_uid((v_fields ->> 'folderId')::uuid) THEN
        RAISE EXCEPTION 'That folder is not one you can add to';
      END IF;
    END IF;

    /* completed_at is absent on purpose. The database stamps it from its own clock -- that is what
       separates "finished before the deadline" from "finished two hours after it" -- so a browser's
       reading of the time is never taken. */
    UPDATE public.tasks AS t SET
      title = CASE WHEN v_fields ? 'title' THEN v_fields ->> 'title' ELSE t.title END,
      folder_id = CASE WHEN v_fields ? 'folderId'
        THEN (v_fields ->> 'folderId')::uuid ELSE t.folder_id END,
      content = CASE WHEN v_fields ? 'content' THEN coalesce(v_fields ->> 'content', '') ELSE t.content END,
      is_important = CASE WHEN v_fields ? 'isImportant'
        THEN (v_fields ->> 'isImportant')::boolean ELSE t.is_important END,
      pinned_scopes = CASE WHEN v_fields ? 'pinnedScopes'
        THEN ARRAY(SELECT jsonb_array_elements_text(coalesce(v_fields -> 'pinnedScopes', '[]'::jsonb)))
        ELSE t.pinned_scopes END,
      is_pinned = CASE WHEN v_fields ? 'pinnedScopes'
        THEN jsonb_array_length(coalesce(v_fields -> 'pinnedScopes', '[]'::jsonb)) > 0
        ELSE t.is_pinned END,
      sort_order = CASE WHEN v_fields ? 'sortOrder'
        THEN (v_fields ->> 'sortOrder')::integer ELSE t.sort_order END,
      note_kind = CASE WHEN v_fields ? 'noteKind' THEN v_fields ->> 'noteKind' ELSE t.note_kind END,
      due_at = CASE WHEN v_fields ? 'dueAt'
        THEN nullif(v_fields ->> 'dueAt', '')::timestamptz ELSE t.due_at END,
      completed = CASE WHEN v_fields ? 'completed'
        THEN (v_fields ->> 'completed')::boolean ELSE t.completed END,
      tags = CASE WHEN v_fields ? 'tags'
        THEN ARRAY(SELECT jsonb_array_elements_text(coalesce(v_fields -> 'tags', '[]'::jsonb)))
        ELSE t.tags END,
      color = CASE WHEN v_fields ? 'color' THEN nullif(v_fields ->> 'color', '') ELSE t.color END,
      grid_layout = CASE WHEN v_fields ? 'gridLayouts'
        THEN v_fields -> 'gridLayouts' ELSE t.grid_layout END
    WHERE t.id = v_id
      AND EXISTS (
        SELECT 1 FROM public.folders AS f
        WHERE f.id = t.folder_id AND f.space_id = p_space_id
      )
      AND public.task_writable_by_uid(t.id);
  END LOOP;

  FOR v_op IN SELECT value FROM jsonb_array_elements(p_ops) AS value
    WHERE value ->> 'entity' = 'subtask' AND value ->> 'action' = 'patch'
  LOOP
    v_fields := v_op -> 'fields';
    v_id := (v_op ->> 'id')::uuid;

    UPDATE public.subtasks AS s SET
      title = CASE WHEN v_fields ? 'title' THEN v_fields ->> 'title' ELSE s.title END,
      completed = CASE WHEN v_fields ? 'completed'
        THEN (v_fields ->> 'completed')::boolean ELSE s.completed END,
      parent_subtask_id = CASE WHEN v_fields ? 'parentSubtaskId'
        THEN nullif(v_fields ->> 'parentSubtaskId', '')::uuid ELSE s.parent_subtask_id END
    WHERE s.id = v_id
      AND EXISTS (
        SELECT 1
        FROM public.tasks AS t
        JOIN public.folders AS f ON f.id = t.folder_id
        WHERE t.id = s.task_id AND f.space_id = p_space_id
      )
      AND public.subtask_writable_by_uid(s.id);
  END LOOP;

  -- ------------------------------------------------ tag links
  --
  -- Rebuilt for the named tasks rather than diffed: the join is two ids and nothing else, so working
  -- out what changed costs more than writing what should be there. Only this space's catalogue is
  -- consulted, so a name cannot resolve to somebody's personal tag.
  FOR v_op IN SELECT value FROM jsonb_array_elements(p_ops) AS value
    WHERE value ->> 'entity' = 'taskTags' AND value ->> 'action' = 'set'
  LOOP
    v_task := (v_op ->> 'taskId')::uuid;
    IF NOT public.task_writable_by_uid(v_task) THEN
      CONTINUE;
    END IF;

    v_names := ARRAY(SELECT lower(btrim(value))
                     FROM jsonb_array_elements_text(coalesce(v_op -> 'names', '[]'::jsonb)) AS value);

    DELETE FROM public.task_tags WHERE task_id = v_task;

    INSERT INTO public.task_tags (task_id, tag_id)
    SELECT v_task, tag.id
    FROM public.tags AS tag
    WHERE tag.space_id = p_space_id
      AND lower(btrim(tag.name)) = ANY (v_names)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ------------------------------------------------ deletes, leaves first
  --
  -- The database would cascade anyway; doing it in this order means a batch that removes a task and
  -- one of its subtasks does not depend on which order the cascade happened to reach them in.
  --
  -- Unlike a patch, a delete that matches nothing *is* an error: the caller distinguishes "gone now"
  -- from "never there" by whether this raises, and the deletion service relies on it. A row the
  -- caller cannot reach therefore raises too -- it exists, and the delete did not happen, which is
  -- the truth the caller needs even though it does not say why.
  FOR v_op IN SELECT value FROM jsonb_array_elements(p_ops) AS value
    WHERE value ->> 'entity' = 'subtask' AND value ->> 'action' = 'delete'
  LOOP
    v_id := (v_op ->> 'id')::uuid;
    DELETE FROM public.subtasks AS s
    WHERE s.id = v_id
      AND EXISTS (
        SELECT 1
        FROM public.tasks AS t
        JOIN public.folders AS f ON f.id = t.folder_id
        WHERE t.id = s.task_id AND f.space_id = p_space_id
      )
      AND public.subtask_writable_by_uid(s.id);
    IF NOT FOUND AND EXISTS (SELECT 1 FROM public.subtasks WHERE id = v_id) THEN
      RAISE EXCEPTION 'Could not delete the subtask.';
    END IF;
  END LOOP;

  FOR v_op IN SELECT value FROM jsonb_array_elements(p_ops) AS value
    WHERE value ->> 'entity' = 'task' AND value ->> 'action' = 'delete'
  LOOP
    v_id := (v_op ->> 'id')::uuid;
    DELETE FROM public.tasks AS t
    WHERE t.id = v_id
      AND EXISTS (
        SELECT 1 FROM public.folders AS f
        WHERE f.id = t.folder_id AND f.space_id = p_space_id
      )
      AND public.task_writable_by_uid(t.id);
    IF NOT FOUND AND EXISTS (SELECT 1 FROM public.tasks WHERE id = v_id) THEN
      RAISE EXCEPTION 'Could not delete the task.';
    END IF;
  END LOOP;

  FOR v_op IN SELECT value FROM jsonb_array_elements(p_ops) AS value
    WHERE value ->> 'entity' = 'folder' AND value ->> 'action' = 'delete'
  LOOP
    v_id := (v_op ->> 'id')::uuid;
    DELETE FROM public.folders AS f
    WHERE f.id = v_id
      AND f.space_id = p_space_id
      AND public.folder_writable_by_uid(f.id);
    IF NOT FOUND AND EXISTS (SELECT 1 FROM public.folders WHERE id = v_id) THEN
      RAISE EXCEPTION 'Could not delete the folder.';
    END IF;
  END LOOP;

  FOR v_op IN SELECT value FROM jsonb_array_elements(p_ops) AS value
    WHERE value ->> 'entity' = 'tag' AND value ->> 'action' = 'delete'
  LOOP
    v_id := (v_op ->> 'id')::uuid;
    DELETE FROM public.tags AS tag WHERE tag.id = v_id AND tag.space_id = p_space_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.space_apply(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.space_apply(uuid, text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
