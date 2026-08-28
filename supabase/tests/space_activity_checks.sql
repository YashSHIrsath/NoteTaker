-- The record, as assertions. Run against any environment with:
--
--     npx supabase db query --linked --file supabase/tests/space_activity_checks.sql
--
-- Everything runs inside a transaction that rolls back, so it is safe against production.
--
-- This is the phase whose whole claim is "a change cannot happen without being recorded", and that
-- claim is only worth anything if it is tested from both directions: through space_apply, which is
-- how the app writes, and by writing straight to the tables, which is what an audit is for.

BEGIN;

CREATE TEMP TABLE results (name text, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON results TO authenticated;

--   A = owner
--   B = editor
--   V = viewer
--   C = a stranger

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-00000000aa01', 'a@example.test'),
  ('00000000-0000-4000-8000-00000000bb01', 'b@example.test'),
  ('00000000-0000-4000-8000-00000000dd01', 'v@example.test'),
  ('00000000-0000-4000-8000-00000000cc01', 'c@example.test');

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-00000000aa01"}';

DO $t$
DECLARE
  v_space uuid;
  v_folder uuid := '11111111-0000-4000-8000-000000000001';
  v_folder2 uuid := '11111111-0000-4000-8000-000000000002';
  v_task uuid := '22222222-0000-4000-8000-000000000001';
  v_subtask uuid := '33333333-0000-4000-8000-000000000001';
  v_count int;
  v_row public.space_activity;
  v_failed boolean;
BEGIN
  v_space := (public.create_space('Q3 Launch', 'teal')).id;

  INSERT INTO public.space_members (space_id, user_id, role) VALUES
    (v_space, '00000000-0000-4000-8000-00000000bb01', 'editor'),
    (v_space, '00000000-0000-4000-8000-00000000dd01', 'viewer');

  -- ------------------------------------------------ create, through the write path
  --
  -- Several operations in one call: two folders, a note inside one, and a checklist item on it.
  PERFORM public.space_apply(v_space, 'Created a folder', jsonb_build_array(
    jsonb_build_object('entity','folder','action','create','row',
      jsonb_build_object('id',v_folder,'name','Finance','parentId',NULL,'isImportant',false,'sortOrder',0)),
    jsonb_build_object('entity','folder','action','create','row',
      jsonb_build_object('id',v_folder2,'name','Marketing','parentId',NULL,'isImportant',false,'sortOrder',1)),
    jsonb_build_object('entity','task','action','create','row',
      jsonb_build_object('id',v_task,'folderId',v_folder,'title','Invoices','content','','isImportant',false,
                         'pinnedScopes',jsonb_build_array(),'sortOrder',0,'noteKind','note','dueAt',NULL,
                         'completed',false,'tags',jsonb_build_array(),'color',NULL,'gridLayouts',NULL)),
    jsonb_build_object('entity','subtask','action','create','row',
      jsonb_build_object('id',v_subtask,'taskId',v_task,'parentSubtaskId',NULL,'title','Chase Acme','completed',false))
  ));

  INSERT INTO results VALUES ('apply: the folder was created',
    EXISTS (SELECT 1 FROM public.folders WHERE id = v_folder AND space_id = v_space), '');
  INSERT INTO results VALUES ('apply: the note was created in it',
    EXISTS (SELECT 1 FROM public.tasks WHERE id = v_task AND folder_id = v_folder), '');
  INSERT INTO results VALUES ('apply: the checklist item was created',
    EXISTS (SELECT 1 FROM public.subtasks WHERE id = v_subtask), '');

  SELECT count(*) INTO v_count FROM public.space_activity WHERE space_id = v_space;
  INSERT INTO results VALUES ('record: four operations, four entries', v_count = 4, 'saw ' || v_count);

  SELECT * INTO v_row FROM public.space_activity
    WHERE entity_id = v_task AND action = 'created';
  INSERT INTO results VALUES ('record: the actor is the person who did it',
    v_row.actor_id = '00000000-0000-4000-8000-00000000aa01', '');
  INSERT INTO results VALUES ('record: the title is stored, not joined',
    v_row.entity_title = 'Invoices', coalesce(v_row.entity_title, 'NULL'));
  INSERT INTO results VALUES ('record: the path is stored too',
    v_row.path_label = 'Finance', coalesce(v_row.path_label, 'NULL'));
  INSERT INTO results VALUES ('record: the intent is stamped from the write path',
    v_row.intent = 'Created a folder', coalesce(v_row.intent, 'NULL'));
  INSERT INTO results VALUES ('record: a create has no before state',
    v_row.before IS NULL, '');
  INSERT INTO results VALUES ('record: and does have an after state',
    v_row.after ->> 'title' = 'Invoices', '');

  -- ------------------------------------------------ rename
  PERFORM public.space_apply(v_space, 'Renamed a note', jsonb_build_array(
    jsonb_build_object('entity','task','action','patch','id',v_task,
      'fields', jsonb_build_object('title','Invoices Q3'))
  ));

  SELECT * INTO v_row FROM public.space_activity
    WHERE entity_id = v_task AND action = 'renamed';
  INSERT INTO results VALUES ('rename: derived from the diff, not from the intent',
    v_row.id IS NOT NULL, '');
  INSERT INTO results VALUES ('rename: before holds the old title',
    v_row.before ->> 'title' = 'Invoices', coalesce(v_row.before ->> 'title', 'NULL'));
  INSERT INTO results VALUES ('rename: after holds the new one',
    v_row.after ->> 'title' = 'Invoices Q3', coalesce(v_row.after ->> 'title', 'NULL'));

  -- ------------------------------------------------ move
  PERFORM public.space_apply(v_space, 'Moved a note to another folder', jsonb_build_array(
    jsonb_build_object('entity','task','action','patch','id',v_task,
      'fields', jsonb_build_object('folderId',v_folder2,'sortOrder',0))
  ));

  SELECT * INTO v_row FROM public.space_activity
    WHERE entity_id = v_task AND action = 'moved';
  INSERT INTO results VALUES ('move: recognised as a move',
    v_row.id IS NOT NULL, '');
  INSERT INTO results VALUES ('move: from the old folder',
    (v_row.before ->> 'folder_id')::uuid = v_folder, '');
  INSERT INTO results VALUES ('move: to the new one',
    (v_row.after ->> 'folder_id')::uuid = v_folder2, '');
  INSERT INTO results VALUES ('move: the path label follows it',
    v_row.path_label = 'Marketing', coalesce(v_row.path_label, 'NULL'));

  -- ------------------------------------------------ a misleading intent is harmless
  --
  -- The requirement this exists for: the client says one thing, the row says another, and the record
  -- keeps both — with the truth taken from OLD and NEW.
  PERFORM public.space_apply(v_space, 'Watering the plants', jsonb_build_array(
    jsonb_build_object('entity','task','action','patch','id',v_task,
      'fields', jsonb_build_object('completed',true))
  ));

  SELECT * INTO v_row FROM public.space_activity
    WHERE entity_id = v_task AND action = 'completed';
  INSERT INTO results VALUES ('truth: the action comes from the diff even when the intent lies',
    v_row.id IS NOT NULL, '');
  INSERT INTO results VALUES ('truth: the false intent is kept beside it, not instead of it',
    v_row.intent = 'Watering the plants', coalesce(v_row.intent, 'NULL'));
  INSERT INTO results VALUES ('truth: and the real state change is recorded',
    (v_row.before ->> 'completed') = 'false' AND (v_row.after ->> 'completed') = 'true', '');

  -- ------------------------------------------------ content is summarised, not duplicated
  PERFORM public.space_apply(v_space, 'Edited a note', jsonb_build_array(
    jsonb_build_object('entity','task','action','patch','id',v_task,
      'fields', jsonb_build_object('content','a fairly long note body'))
  ));

  SELECT * INTO v_row FROM public.space_activity
    WHERE entity_id = v_task AND action = 'content_edited';
  INSERT INTO results VALUES ('content: an edit is recorded', v_row.id IS NOT NULL, '');
  INSERT INTO results VALUES ('content: the body is not copied into the log',
    NOT (v_row.after ? 'content'), '');
  INSERT INTO results VALUES ('content: its length is, so the change is still visible',
    (v_row.after ->> 'content_length')::int = length('a fairly long note body'), '');

  -- ------------------------------------------------ subtask change
  PERFORM public.space_apply(v_space, 'Ticked a checklist item', jsonb_build_array(
    jsonb_build_object('entity','subtask','action','patch','id',v_subtask,
      'fields', jsonb_build_object('completed',true))
  ));
  INSERT INTO results VALUES ('subtask: a tick is recorded against the item',
    EXISTS (SELECT 1 FROM public.space_activity
            WHERE entity_type = 'subtask' AND entity_id = v_subtask AND action = 'completed'), '');

  -- ------------------------------------------------ attachments
  INSERT INTO public.attachments (id, task_id, type, name, mime_type)
  VALUES ('44444444-0000-4000-8000-000000000001', v_task, 'pdf', 'contract.pdf', 'application/pdf');
  INSERT INTO results VALUES ('attachment: adding one is recorded',
    EXISTS (SELECT 1 FROM public.space_activity
            WHERE entity_type = 'attachment' AND action = 'attachment_added'
              AND entity_title = 'contract.pdf'), '');

  DELETE FROM public.attachments WHERE id = '44444444-0000-4000-8000-000000000001';
  INSERT INTO results VALUES ('attachment: removing one is recorded',
    EXISTS (SELECT 1 FROM public.space_activity
            WHERE entity_type = 'attachment' AND action = 'attachment_removed'), '');

  -- ------------------------------------------------ a write that bypassed space_apply
  --
  -- The floor. No intent is set, nothing declares anything, and the change is still recorded with
  -- the real diff — which is the entire reason the log lives in triggers rather than in the app.
  PERFORM set_config('mindstack.intent', '', true);
  PERFORM set_config('mindstack.space', '', true);

  UPDATE public.tasks SET title = 'Renamed behind the app''s back' WHERE id = v_task;

  SELECT * INTO v_row FROM public.space_activity
    WHERE entity_id = v_task AND action = 'renamed'
    ORDER BY id DESC LIMIT 1;
  INSERT INTO results VALUES ('bypass: a direct table write is still recorded',
    v_row.after ->> 'title' = 'Renamed behind the app''s back', '');
  INSERT INTO results VALUES ('bypass: with no intent, because nothing declared one',
    v_row.intent IS NULL, coalesce(v_row.intent, 'NULL'));
  INSERT INTO results VALUES ('bypass: and still with the right actor',
    v_row.actor_id = '00000000-0000-4000-8000-00000000aa01', '');

  -- ------------------------------------------------ an idempotent write is not an event
  SELECT count(*) INTO v_count FROM public.space_activity WHERE space_id = v_space;
  UPDATE public.tasks SET title = title WHERE id = v_task;
  INSERT INTO results VALUES ('record: a write that changed nothing records nothing',
    (SELECT count(*) FROM public.space_activity WHERE space_id = v_space) = v_count, '');

  -- ------------------------------------------------ delete, and the cascade
  PERFORM public.space_apply(v_space, 'Deleted a folder', jsonb_build_array(
    jsonb_build_object('entity','folder','action','delete','id',v_folder2)
  ));

  INSERT INTO results VALUES ('delete: the folder is recorded',
    EXISTS (SELECT 1 FROM public.space_activity
            WHERE entity_id = v_folder2 AND action = 'deleted'), '');
  -- The note lived in that folder. A cascade removes the parent first, so without the space fallback
  -- the child's trigger cannot work out which space it was in and the entry is silently lost.
  INSERT INTO results VALUES ('delete: so is the note that went with it',
    EXISTS (SELECT 1 FROM public.space_activity
            WHERE entity_id = v_task AND action = 'deleted'), '');
  INSERT INTO results VALUES ('delete: and the checklist item under that',
    EXISTS (SELECT 1 FROM public.space_activity
            WHERE entity_id = v_subtask AND action = 'deleted'), '');

  SELECT * INTO v_row FROM public.space_activity
    WHERE entity_id = v_task AND action = 'deleted';
  INSERT INTO results VALUES ('delete: the body is kept, because this is where it is otherwise lost',
    v_row.before ? 'content', '');
  INSERT INTO results VALUES ('delete: and the title, so the line still reads',
    v_row.entity_title = 'Renamed behind the app''s back', coalesce(v_row.entity_title, 'NULL'));

  -- ------------------------------------------------ permission
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000dd01"}', true);
  v_failed := false;
  BEGIN
    PERFORM public.space_apply(v_space, 'Trying it on', jsonb_build_array(
      jsonb_build_object('entity','folder','action','create','row',
        jsonb_build_object('id',gen_random_uuid(),'name','Viewer folder','parentId',NULL,
                           'isImportant',false,'sortOrder',0))
    ));
  EXCEPTION WHEN others THEN v_failed := true;
  END;
  INSERT INTO results VALUES ('permission: a viewer cannot apply anything', v_failed, '');

  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000cc01"}', true);
  v_failed := false;
  BEGIN
    PERFORM public.space_apply(v_space, 'Trespassing', jsonb_build_array(
      jsonb_build_object('entity','folder','action','create','row',
        jsonb_build_object('id',gen_random_uuid(),'name','Stranger folder','parentId',NULL,
                           'isImportant',false,'sortOrder',0))
    ));
  EXCEPTION WHEN others THEN v_failed := true;
  END;
  INSERT INTO results VALUES ('permission: a non-member cannot apply anything', v_failed, '');

  -- An op naming a folder in another workspace is refused rather than quietly applied.
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000bb01"}', true);
  INSERT INTO public.folders (id, name, sort_order)
  VALUES ('55555555-0000-4000-8000-000000000001', 'B''s personal folder', 0);
  v_failed := false;
  BEGIN
    PERFORM public.space_apply(v_space, 'Reaching outside', jsonb_build_array(
      jsonb_build_object('entity','task','action','create','row',
        jsonb_build_object('id',gen_random_uuid(),'folderId','55555555-0000-4000-8000-000000000001',
                           'title','Smuggled','content','','isImportant',false,
                           'pinnedScopes',jsonb_build_array(),'sortOrder',0,'noteKind','note',
                           'dueAt',NULL,'completed',false,'tags',jsonb_build_array(),
                           'color',NULL,'gridLayouts',NULL))
    ));
  EXCEPTION WHEN others THEN v_failed := true;
  END;
  INSERT INTO results VALUES ('permission: an op cannot reach a folder outside the space', v_failed, '');

  -- ------------------------------------------------ personal notes are untouched
  INSERT INTO public.tasks (id, folder_id, title, sort_order)
  VALUES ('66666666-0000-4000-8000-000000000001', '55555555-0000-4000-8000-000000000001', 'Private', 0);
  INSERT INTO results VALUES ('personal: a personal note records no activity at all',
    NOT EXISTS (SELECT 1 FROM public.space_activity
                WHERE entity_id = '66666666-0000-4000-8000-000000000001'), '');
END;
$t$;

-- ---------------------------------------------------------------- append-only, through the policies

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-00000000bb01"}';

INSERT INTO results
SELECT 'rls: a member can read the feed', count(*) > 0, 'saw ' || count(*)
FROM public.space_activity;

DO $t$
DECLARE v_failed boolean;
BEGIN
  -- There is no UPDATE policy, and no DELETE policy. History that can be edited is not history.
  v_failed := false;
  BEGIN
    UPDATE public.space_activity SET intent = 'Something else';
    IF NOT FOUND THEN v_failed := true; END IF;
  EXCEPTION WHEN others THEN v_failed := true;
  END;
  INSERT INTO results VALUES ('append-only: a member cannot rewrite an entry', v_failed, '');

  v_failed := false;
  BEGIN
    DELETE FROM public.space_activity;
    IF NOT FOUND THEN v_failed := true; END IF;
  EXCEPTION WHEN others THEN v_failed := true;
  END;
  INSERT INTO results VALUES ('append-only: a member cannot delete an entry', v_failed, '');

  v_failed := false;
  BEGIN
    INSERT INTO public.space_activity (space_id, action, entity_type, entity_id)
    VALUES ((SELECT space_id FROM public.space_activity LIMIT 1), 'created', 'task', gen_random_uuid());
  EXCEPTION WHEN others THEN v_failed := true;
  END;
  INSERT INTO results VALUES ('append-only: and cannot forge one', v_failed, '');
END;
$t$;

-- ---------------------------------------------------------------- the filters
--
-- Applied by the function, not by the page. The feed is paged fifty at a time and kept for a year,
-- so a filter applied to whatever is on screen would answer "everything they deleted" from the last
-- fifty rows and silently leave out the rest.

DO $t$
DECLARE
  v_space uuid;
  v_all integer;
  v_mine integer;
  v_deletes integer;
  v_nobody integer;
BEGIN
  SELECT space_id INTO v_space FROM public.space_activity LIMIT 1;

  SELECT count(*) INTO v_all FROM public.space_activity_feed(v_space, NULL, 200);
  INSERT INTO results VALUES ('filter: no filter reads the whole feed', v_all > 0, 'saw ' || v_all);

  -- Two nulls and two empty arrays both have to mean "everything": the client sends null, but an
  -- empty selection arriving as [] must not read as "match nothing" and blank the page.
  SELECT count(*) INTO v_mine
  FROM public.space_activity_feed(v_space, NULL, 200, ARRAY[]::uuid[], ARRAY[]::text[]);
  INSERT INTO results VALUES ('filter: empty arrays mean everything, not nothing',
    v_mine = v_all, 'saw ' || v_mine || ' of ' || v_all);

  SELECT count(*) INTO v_deletes
  FROM public.space_activity_feed(v_space, NULL, 200, NULL, ARRAY['deleted']);
  INSERT INTO results VALUES ('filter: by kind returns only that kind',
    v_deletes > 0 AND v_deletes < v_all, 'saw ' || v_deletes || ' of ' || v_all);
  INSERT INTO results
  SELECT 'filter: and nothing else slips through', count(*) = 0, 'saw ' || count(*)
  FROM public.space_activity_feed(v_space, NULL, 200, NULL, ARRAY['deleted']) AS f
  WHERE f.action <> 'deleted';

  SELECT count(*) INTO v_mine
  FROM public.space_activity_feed(v_space, NULL, 200,
    ARRAY['00000000-0000-4000-8000-00000000aa01']::uuid[], NULL);
  INSERT INTO results VALUES ('filter: by person returns only their actions',
    v_mine > 0, 'saw ' || v_mine);
  INSERT INTO results
  SELECT 'filter: and nobody else''s', count(*) = 0, 'saw ' || count(*)
  FROM public.space_activity_feed(v_space, NULL, 200,
    ARRAY['00000000-0000-4000-8000-00000000aa01']::uuid[], NULL) AS f
  WHERE f.actor_id <> '00000000-0000-4000-8000-00000000aa01';

  -- A person who has done nothing is a legitimate thing to ask about, and the honest answer is an
  -- empty feed rather than everyone's.
  SELECT count(*) INTO v_nobody
  FROM public.space_activity_feed(v_space, NULL, 200,
    ARRAY['00000000-0000-4000-8000-00000000cc01']::uuid[], NULL);
  INSERT INTO results VALUES ('filter: somebody with no activity returns none of it',
    v_nobody = 0, 'saw ' || v_nobody);
END;
$t$;

-- The space's id, held somewhere RLS cannot take it away.
--
-- The check below runs as a stranger, and a stranger cannot see the row in `spaces` — so reading the
-- id there would hand the function NULL, and an empty feed would prove nothing about the filter. It
-- has to be asked with the real id.
CREATE TEMP TABLE fixture ON COMMIT DROP AS
SELECT space_id FROM public.space_activity LIMIT 1;
GRANT ALL ON fixture TO authenticated;

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-00000000cc01"}';

INSERT INTO results
SELECT 'rls: a non-member reads nothing', count(*) = 0, 'saw ' || count(*)
FROM public.space_activity;

-- The filters do not become a way around membership: the function still refuses a non-member, so
-- asking about a named person in a space you are not in returns nothing rather than their actions.
INSERT INTO results
SELECT 'filter: a non-member filtering by name still reads nothing', count(*) = 0, 'saw ' || count(*)
FROM public.space_activity_feed(
  (SELECT space_id FROM fixture), NULL, 200,
  ARRAY['00000000-0000-4000-8000-00000000aa01']::uuid[], NULL
);

RESET ROLE;

-- ---------------------------------------------------------------- report

SELECT
  count(*) FILTER (WHERE ok IS TRUE) || '/' || count(*) || ' passed' AS summary
FROM results;

SELECT name, detail FROM results WHERE ok IS NOT TRUE;

DO $t$
DECLARE
  v_failed int;
  v_names text;
BEGIN
  SELECT count(*), string_agg(name || coalesce(' (' || nullif(detail, '') || ')', ''), ' | ')
  INTO v_failed, v_names
  FROM results
  WHERE ok IS NOT TRUE;

  IF v_failed > 0 THEN
    RAISE EXCEPTION '% activity check(s) failed: %', v_failed, v_names;
  END IF;
END;
$t$;

ROLLBACK;
