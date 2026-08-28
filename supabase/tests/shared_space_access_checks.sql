-- Who can reach what, as assertions. Run against any environment with:
--
--     npx supabase db query --linked --file supabase/tests/shared_space_access_checks.sql
--
-- Everything runs inside a transaction that rolls back, so it is safe against production: no space,
-- no membership and no folder is left behind.
--
-- These exist because the access rules live in SQL, where the app's TypeScript checks cannot reach
-- them. The rewrite in 20260828012000_shared_spaces.sql changed the meaning of three functions that
-- fourteen policies depend on, and "personal data still behaves exactly as before" is not something
-- a type checker can confirm.

BEGIN;

CREATE TEMP TABLE results (name text, ok boolean, detail text) ON COMMIT DROP;
-- The policy section below runs as `authenticated`, which still has to be able to record what it
-- found.
GRANT ALL ON results TO authenticated;

-- Fixed ids so every assertion below reads as a sentence about a named person.
--   A = owner of the space, and owner of some personal notes
--   B = editor in the space, with personal notes of their own
--   V = viewer in the space
--   C = nobody, a signed-in stranger

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-00000000000a', 'a@example.test'),
  ('00000000-0000-4000-8000-00000000000b', 'b@example.test'),
  ('00000000-0000-4000-8000-00000000000d', 'v@example.test'),
  ('00000000-0000-4000-8000-00000000000c', 'c@example.test');

INSERT INTO public.spaces (id, name, created_by)
VALUES ('00000000-0000-4000-8000-000000000001', 'Q3 Launch', '00000000-0000-4000-8000-00000000000a');

INSERT INTO public.space_members (space_id, user_id, role) VALUES
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'owner'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000b', 'editor'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000d', 'viewer');

-- ---------------------------------------------------------------- content, created as its authors
--
-- The folder trigger stamps user_id from the session and refuses an unauthenticated insert, so even
-- setup has to say who is acting.

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-00000000000a"}';

INSERT INTO public.folders (id, name, sort_order)
VALUES ('00000000-0000-4000-8000-000000000002', 'A''s personal folder', 0);

INSERT INTO public.folders (id, name, sort_order, space_id)
VALUES ('00000000-0000-4000-8000-000000000003', 'Shared root', 0, '00000000-0000-4000-8000-000000000001');

INSERT INTO public.tasks (id, folder_id, title, sort_order)
VALUES ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000003', 'Shared task', 0);

INSERT INTO public.tasks (id, folder_id, title, sort_order)
VALUES ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002', 'A''s private task', 0);

INSERT INTO public.subtasks (id, task_id, title)
VALUES ('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000004', 'Shared step');

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-00000000000b"}';

INSERT INTO public.folders (id, name, sort_order)
VALUES ('00000000-0000-4000-8000-000000000007', 'B''s personal folder', 0);

-- The rule that changed: inside a space, nesting under someone else's folder is the feature. The
-- old trigger refused this outright ("must belong to the same user as its parent").
INSERT INTO public.folders (id, name, sort_order, space_id, parent_id)
VALUES (
  '00000000-0000-4000-8000-000000000008', 'B''s subfolder in A''s tree', 0,
  '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003');

INSERT INTO results VALUES (
  'space: a member may nest under another member''s folder',
  EXISTS (SELECT 1 FROM public.folders WHERE id = '00000000-0000-4000-8000-000000000008'),
  '');

-- ---------------------------------------------------------------- reachability helpers
--
-- These three are what every policy delegates to, so they are checked directly as well as through
-- the policies further down.

DO $t$
DECLARE
  v_space uuid := '00000000-0000-4000-8000-000000000001';
  v_personal_a uuid := '00000000-0000-4000-8000-000000000002';
  v_shared_folder uuid := '00000000-0000-4000-8000-000000000003';
  v_shared_task uuid := '00000000-0000-4000-8000-000000000004';
  v_private_task uuid := '00000000-0000-4000-8000-000000000005';
  v_shared_subtask uuid := '00000000-0000-4000-8000-000000000006';
  v_a text := '00000000-0000-4000-8000-00000000000a';
  v_b text := '00000000-0000-4000-8000-00000000000b';
  v_v text := '00000000-0000-4000-8000-00000000000d';
  v_c text := '00000000-0000-4000-8000-00000000000c';
BEGIN
  -- ------------------------------------------------ membership
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_a), true);
  INSERT INTO results VALUES ('membership: the owner is a member', public.is_space_member(v_space), '');
  INSERT INTO results VALUES ('membership: the owner''s role is owner', public.space_role(v_space) = 'owner', '');
  INSERT INTO results VALUES ('membership: the owner may write', public.space_can_write(v_space), '');

  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_v), true);
  INSERT INTO results VALUES ('membership: a viewer is a member', public.is_space_member(v_space), '');
  INSERT INTO results VALUES ('membership: a viewer may not write', NOT public.space_can_write(v_space), '');

  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_c), true);
  INSERT INTO results VALUES ('membership: a stranger is not a member', NOT public.is_space_member(v_space), '');
  INSERT INTO results VALUES ('membership: a stranger has no role', public.space_role(v_space) IS NULL, '');
  INSERT INTO results VALUES ('membership: a null space is never a membership', NOT public.is_space_member(NULL), '');

  -- ------------------------------------------------ personal notes behave exactly as before
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_a), true);
  INSERT INTO results VALUES ('personal: the owner reaches their own folder', public.folder_owned_by_uid(v_personal_a), '');
  INSERT INTO results VALUES ('personal: the owner may write their own folder', public.folder_writable_by_uid(v_personal_a), '');
  INSERT INTO results VALUES ('personal: the owner reaches their own task', public.task_owned_by_uid(v_private_task), '');

  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_b), true);
  INSERT INTO results VALUES (
    'personal: a space colleague cannot reach personal folders',
    NOT public.folder_owned_by_uid(v_personal_a), '');
  INSERT INTO results VALUES (
    'personal: a space colleague cannot reach personal tasks',
    NOT public.task_owned_by_uid(v_private_task), '');

  -- ------------------------------------------------ shared content
  INSERT INTO results VALUES ('space: an editor reaches the shared folder', public.folder_owned_by_uid(v_shared_folder), '');
  INSERT INTO results VALUES ('space: an editor may write the shared folder', public.folder_writable_by_uid(v_shared_folder), '');
  INSERT INTO results VALUES ('space: an editor reaches the shared task', public.task_owned_by_uid(v_shared_task), '');
  INSERT INTO results VALUES ('space: an editor may write the shared task', public.task_writable_by_uid(v_shared_task), '');
  INSERT INTO results VALUES ('space: an editor reaches the shared subtask', public.subtask_owned_by_uid(v_shared_subtask), '');
  INSERT INTO results VALUES ('space: an editor may write the shared subtask', public.subtask_writable_by_uid(v_shared_subtask), '');

  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_v), true);
  INSERT INTO results VALUES ('space: a viewer reaches the shared task', public.task_owned_by_uid(v_shared_task), '');
  INSERT INTO results VALUES ('space: a viewer may not write the shared task', NOT public.task_writable_by_uid(v_shared_task), '');
  INSERT INTO results VALUES ('space: a viewer may not write the shared folder', NOT public.folder_writable_by_uid(v_shared_folder), '');

  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_c), true);
  INSERT INTO results VALUES ('space: a stranger cannot reach the shared folder', NOT public.folder_owned_by_uid(v_shared_folder), '');
  INSERT INTO results VALUES ('space: a stranger cannot reach the shared task', NOT public.task_owned_by_uid(v_shared_task), '');
  INSERT INTO results VALUES ('space: a stranger cannot reach the shared subtask', NOT public.subtask_owned_by_uid(v_shared_subtask), '');
END;
$t$;

-- ---------------------------------------------------------------- the invariants the trigger holds

DO $t$
DECLARE
  v_failed boolean;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b"}', true);

  -- A subtree cannot straddle two workspaces.
  v_failed := false;
  BEGIN
    INSERT INTO public.folders (id, name, sort_order, space_id, parent_id)
    VALUES (gen_random_uuid(), 'Straddling', 0, NULL, '00000000-0000-4000-8000-000000000003');
  EXCEPTION WHEN others THEN
    v_failed := true;
  END;
  INSERT INTO results VALUES ('trigger: a personal folder cannot nest under a space folder', v_failed, '');

  v_failed := false;
  BEGIN
    INSERT INTO public.folders (id, name, sort_order, space_id, parent_id)
    VALUES (gen_random_uuid(), 'Straddling the other way', 0,
      '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000007');
  EXCEPTION WHEN others THEN
    v_failed := true;
  END;
  INSERT INTO results VALUES ('trigger: a space folder cannot nest under a personal folder', v_failed, '');

  -- Which workspace a folder is in is fixed for its life. This is the database half of "a personal
  -- folder is copied into a space, never moved".
  UPDATE public.folders
  SET space_id = '00000000-0000-4000-8000-000000000001'
  WHERE id = '00000000-0000-4000-8000-000000000007';
  INSERT INTO results VALUES (
    'trigger: an update cannot move a folder into a space',
    (SELECT space_id IS NULL FROM public.folders WHERE id = '00000000-0000-4000-8000-000000000007'),
    '');

  -- And a stranger cannot plant a folder in a space they are not in.
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c"}', true);
  v_failed := false;
  BEGIN
    INSERT INTO public.folders (id, name, sort_order, space_id)
    VALUES (gen_random_uuid(), 'Trespassing', 0, '00000000-0000-4000-8000-000000000001');
  EXCEPTION WHEN others THEN
    v_failed := true;
  END;
  INSERT INTO results VALUES ('trigger: a stranger cannot create a folder in the space', v_failed, '');

  -- A viewer may read the space but not add to it.
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000d"}', true);
  v_failed := false;
  BEGIN
    INSERT INTO public.folders (id, name, sort_order, space_id)
    VALUES (gen_random_uuid(), 'Viewer''s folder', 0, '00000000-0000-4000-8000-000000000001');
  EXCEPTION WHEN others THEN
    v_failed := true;
  END;
  INSERT INTO results VALUES ('trigger: a viewer cannot create a folder in the space', v_failed, '');
END;
$t$;

-- ---------------------------------------------------------------- through the policies
--
-- Everything above asked the helpers directly. This section runs as `authenticated`, so the row
-- level security policies are actually in force — which is the only way to confirm that what the
-- app's own queries see is what these rules intend.

SET LOCAL ROLE authenticated;

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-00000000000a"}';

INSERT INTO results
SELECT 'rls: A''s personal query sees only A''s personal folders',
  count(*) = 1 AND min(name) = 'A''s personal folder',
  'saw ' || count(*)
FROM public.folders WHERE space_id IS NULL;

INSERT INTO results
SELECT 'rls: A''s space query sees only the space''s folders', count(*) = 2, 'saw ' || count(*)
FROM public.folders WHERE space_id = '00000000-0000-4000-8000-000000000001';

INSERT INTO results
SELECT 'rls: A sees the shared subtask', count(*) = 1, 'saw ' || count(*)
FROM public.subtasks WHERE id = '00000000-0000-4000-8000-000000000006';

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-00000000000b"}';

INSERT INTO results
SELECT 'rls: B''s personal query never sees A''s personal folder', count(*) = 0, 'saw ' || count(*)
FROM public.folders WHERE id = '00000000-0000-4000-8000-000000000002';

INSERT INTO results
SELECT 'rls: B sees the shared tree', count(*) = 2, 'saw ' || count(*)
FROM public.folders WHERE space_id = '00000000-0000-4000-8000-000000000001';

INSERT INTO results
SELECT 'rls: B sees the shared task', count(*) = 1, 'saw ' || count(*)
FROM public.tasks WHERE id = '00000000-0000-4000-8000-000000000004';

INSERT INTO results
SELECT 'rls: B never sees A''s personal task', count(*) = 0, 'saw ' || count(*)
FROM public.tasks WHERE id = '00000000-0000-4000-8000-000000000005';

INSERT INTO results
SELECT 'rls: B sees the space row itself', count(*) = 1, 'saw ' || count(*)
FROM public.spaces WHERE id = '00000000-0000-4000-8000-000000000001';

INSERT INTO results
SELECT 'rls: B sees the full member list', count(*) = 3, 'saw ' || count(*)
FROM public.space_members WHERE space_id = '00000000-0000-4000-8000-000000000001';

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-00000000000c"}';

INSERT INTO results
SELECT 'rls: a stranger sees no folders at all', count(*) = 0, 'saw ' || count(*)
FROM public.folders;

INSERT INTO results
SELECT 'rls: a stranger sees no tasks at all', count(*) = 0, 'saw ' || count(*)
FROM public.tasks;

INSERT INTO results
SELECT 'rls: a stranger cannot see the space', count(*) = 0, 'saw ' || count(*)
FROM public.spaces;

INSERT INTO results
SELECT 'rls: a stranger cannot see the member list', count(*) = 0, 'saw ' || count(*)
FROM public.space_members;

-- A member writing shared content, which is the whole point of the phase.
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-00000000000b"}';

UPDATE public.tasks SET title = 'Shared task, renamed by B'
WHERE id = '00000000-0000-4000-8000-000000000004';

INSERT INTO results
SELECT 'rls: an editor can write a task another member created',
  count(*) = 1, 'saw ' || count(*)
FROM public.tasks
WHERE id = '00000000-0000-4000-8000-000000000004' AND title = 'Shared task, renamed by B';

-- And a viewer who cannot.
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-00000000000d"}';

UPDATE public.tasks SET title = 'Viewer got in'
WHERE id = '00000000-0000-4000-8000-000000000004';

INSERT INTO results
SELECT 'rls: a viewer''s update changes nothing', count(*) = 0, 'saw ' || count(*)
FROM public.tasks
WHERE id = '00000000-0000-4000-8000-000000000004' AND title = 'Viewer got in';

RESET ROLE;

-- ---------------------------------------------------------------- report

SELECT
  count(*) FILTER (WHERE ok IS TRUE) || '/' || count(*) || ' passed' AS summary
FROM results;

SELECT name, detail FROM results WHERE ok IS NOT TRUE;

/*
 * The failures are named in the exception, not just counted.
 *
 * `supabase db query` surfaces the error and discards the result sets above it, so a bare count told
 * us three checks had failed and nothing about which — which is most of what a check is for.
 *
 * `ok IS NOT TRUE` rather than `NOT ok`, because a NULL is a failure too and `NOT NULL` is NULL. A
 * three-valued predicate that quietly vanishes from both the pass and the fail count is exactly how
 * a broken assertion looks like a passing one.
 */
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
    RAISE EXCEPTION '% shared-space access check(s) failed: %', v_failed, v_names;
  END IF;
END;
$t$;

ROLLBACK;
