-- Shared Spaces, phase 3: the write path.
--
-- One function, taking exactly the operations the app already produces. Phase 0 replaced whole-
-- document saves with named changes — `{entity, action, id, fields}` — and this is the same list,
-- serialised, applied server-side. There is no second mutation model: the ops *are* the model, and
-- this is a second transport for them.
--
-- Three things only this can give, which the direct table writes cannot:
--
--   Atomicity. A batch either lands or it doesn't. The direct path sends a request per phase, so a
--   failure halfway leaves part of an edit applied.
--
--   One permission decision. Every op is checked against the space before anything is written,
--   rather than each row's policy being consulted independently after the fact.
--
--   The intent. It is set once here, transaction-locally, and the activity triggers read it — which
--   is what turns "UPDATE tasks SET folder_id" into "moved a note into Q3 Launch". A write that
--   never comes through here is still recorded by those triggers; it just arrives without a sentence.
--
-- Field names are the app's, not the schema's — `parentId`, `dueAt`, `gridLayouts`. That is
-- deliberate: the client sends the ops it already built, and the mapping lives here, once, in the
-- same shape as taskPatchToRow. `?` tests for the key being present rather than for a truthy value,
-- for the same reason that mapper does: null, false, 0 and '' are all real values to patch to.

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
   * removed the row above the one being deleted — a task deleted along with its folder can no longer
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

    -- A folder can only be nested inside one this space already owns. Without this an op could
    -- graft a shared subtree onto somebody's personal folder.
    IF v_row ->> 'parentId' IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.folders AS parent
      WHERE parent.id = (v_row ->> 'parentId')::uuid AND parent.space_id = p_space_id
    ) THEN
      RAISE EXCEPTION 'That parent folder is not in this space';
    END IF;

    INSERT INTO public.folders (id, parent_id, name, is_important, sort_order, space_id)
    VALUES (
      (v_row ->> 'id')::uuid,
      nullif(v_row ->> 'parentId', '')::uuid,
      v_row ->> 'name',
      coalesce((v_row ->> 'isImportant')::boolean, false),
      coalesce((v_row ->> 'sortOrder')::integer, 0),
      p_space_id
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

    INSERT INTO public.tasks (
      id, folder_id, title, content, is_important, is_pinned, pinned_scopes,
      sort_order, note_kind, due_at, completed, tags, color, grid_layout
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
      v_row -> 'gridLayouts'
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
  -- the rest of an edit over something that has already resolved itself.
  FOR v_op IN SELECT value FROM jsonb_array_elements(p_ops) AS value
    WHERE value ->> 'entity' = 'folder' AND value ->> 'action' = 'patch'
  LOOP
    v_fields := v_op -> 'fields';
    v_id := (v_op ->> 'id')::uuid;

    IF v_fields ? 'parentId' AND v_fields ->> 'parentId' IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.folders AS parent
      WHERE parent.id = (v_fields ->> 'parentId')::uuid AND parent.space_id = p_space_id
    ) THEN
      RAISE EXCEPTION 'That parent folder is not in this space';
    END IF;

    UPDATE public.folders AS f SET
      name = CASE WHEN v_fields ? 'name' THEN v_fields ->> 'name' ELSE f.name END,
      parent_id = CASE WHEN v_fields ? 'parentId'
        THEN nullif(v_fields ->> 'parentId', '')::uuid ELSE f.parent_id END,
      is_important = CASE WHEN v_fields ? 'isImportant'
        THEN (v_fields ->> 'isImportant')::boolean ELSE f.is_important END,
      sort_order = CASE WHEN v_fields ? 'sortOrder'
        THEN (v_fields ->> 'sortOrder')::integer ELSE f.sort_order END
    WHERE f.id = v_id AND f.space_id = p_space_id;
  END LOOP;

  FOR v_op IN SELECT value FROM jsonb_array_elements(p_ops) AS value
    WHERE value ->> 'entity' = 'task' AND value ->> 'action' = 'patch'
  LOOP
    v_fields := v_op -> 'fields';
    v_id := (v_op ->> 'id')::uuid;

    IF v_fields ? 'folderId' AND NOT EXISTS (
      SELECT 1 FROM public.folders AS f
      WHERE f.id = (v_fields ->> 'folderId')::uuid AND f.space_id = p_space_id
    ) THEN
      RAISE EXCEPTION 'That folder is not in this space';
    END IF;

    /* completed_at is absent on purpose. The database stamps it from its own clock — that is what
       separates "finished before the deadline" from "finished two hours after it" — so a browser's
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
      );
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
      );
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
  -- from "never there" by whether this raises, and the deletion service relies on it.
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
      );
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
      );
    IF NOT FOUND AND EXISTS (SELECT 1 FROM public.tasks WHERE id = v_id) THEN
      RAISE EXCEPTION 'Could not delete the task.';
    END IF;
  END LOOP;

  FOR v_op IN SELECT value FROM jsonb_array_elements(p_ops) AS value
    WHERE value ->> 'entity' = 'folder' AND value ->> 'action' = 'delete'
  LOOP
    v_id := (v_op ->> 'id')::uuid;
    DELETE FROM public.folders AS f WHERE f.id = v_id AND f.space_id = p_space_id;
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
