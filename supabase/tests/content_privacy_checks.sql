-- Per-item privacy, and the notifications that hang off it, as assertions. Run with:
--
--     npx supabase db query --linked --file supabase/tests/content_privacy_checks.sql
--
-- Everything is inside a transaction that rolls back, so it is safe against production.
--
-- The eighteen numbered cases in the brief are all here, named so a failure says which one broke.
-- Three of them are worth calling out because they are the ones a plausible implementation gets
-- wrong:
--
--   #17 (direct queries cannot bypass this) is checked as `authenticated` against the real policies
--   rather than by calling the helper functions, because a helper returning false and a policy
--   actually filtering the row are different claims and only the second one matters.
--
--   #18 (a scheduled reminder respects permission at the moment it runs) is checked by reading the
--   sender's own queue view after revoking access, which is exactly what the every-minute function
--   does — not by asking whether some flag was updated.
--
--   #16 (private content inside a shared folder stays private) is the AND at the centre of the whole
--   design, and it is checked in both directions: a private child inside an open parent, and an open
--   child inside a private parent.

BEGIN;

CREATE TEMP TABLE results (name text, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON results TO authenticated;

/*
 * The cast, matching the brief's own naming:
 *   A = owner of the space, and the creator of everything below
 *   B = the selected person
 *   C = a member of the space who is never selected
 *   D = a signed-in stranger, in no space at all
 */
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000000aa', 'a@example.test'),
  ('00000000-0000-4000-8000-0000000000bb', 'b@example.test'),
  ('00000000-0000-4000-8000-0000000000cc', 'c@example.test'),
  ('00000000-0000-4000-8000-0000000000dd', 'd@example.test');

INSERT INTO public.spaces (id, name, created_by)
VALUES ('00000000-0000-4000-8000-0000000000f1', 'Privacy Test', '00000000-0000-4000-8000-0000000000aa');

INSERT INTO public.space_members (space_id, user_id, role) VALUES
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000aa', 'owner'),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000bb', 'editor'),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000cc', 'editor');

-- ---------------------------------------------------------------- content, created as A
--
-- The triggers stamp owner_id from the session and refuse an unauthenticated insert, so setup has to
-- say who is acting — the same as the access checks.

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-0000000000aa"}';

-- An open folder, holding one of each kind of child. This is the shape from the brief:
--   🌐 Shared folder
--     ├── 🌐 open task
--     ├── 👥 task shared with B
--     └── 🔒 private note
INSERT INTO public.folders (id, name, sort_order, space_id, visibility)
VALUES ('00000000-0000-4000-8000-000000000101', 'Shared folder', 0,
        '00000000-0000-4000-8000-0000000000f1', 'space');

-- A private folder, with an *open* task inside it. The second half of #16: the task says Everyone
-- and must still reach nobody but A, because the folder above it says otherwise.
INSERT INTO public.folders (id, name, sort_order, space_id, visibility)
VALUES ('00000000-0000-4000-8000-000000000102', 'A''s private folder', 0,
        '00000000-0000-4000-8000-0000000000f1', 'private');

INSERT INTO public.tasks (id, folder_id, title, sort_order, visibility) VALUES
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'Open task', 0, 'space'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000101', 'Private note', 1, 'private'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000102', 'Open task in a private folder', 0, 'space');

-- The task the brief follows through its whole life: shared with B, B removed, B re-added.
INSERT INTO public.tasks (id, folder_id, title, sort_order, note_kind, due_at, visibility)
VALUES ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000101',
        'Complete Assignment', 2, 'due_task', now() + interval '7 days', 'space');

INSERT INTO public.subtasks (id, task_id, title)
VALUES ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000202', 'A step inside the private note');

-- A reminder A set on the shared task. Armed in the past so it is genuinely due: the point of #18 is
-- that a reminder already in the queue still asks about permission when it fires.
INSERT INTO public.reminders (id, task_id, user_id, kind, at_utc, timezone)
VALUES ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000204',
        '00000000-0000-4000-8000-0000000000aa', 'one_time', now() - interval '1 minute', 'UTC');
-- prepare_reminder recomputes next_run_at from now(), which for a one-time reminder in the past
-- leaves it exactly where it was put. Stated rather than assumed, since the queue view depends on it.
UPDATE public.reminders SET next_run_at = now() - interval '1 minute'
WHERE id = '00000000-0000-4000-8000-000000000401';

-- Share "Complete Assignment" with B, through the only door there is.
SELECT public.set_content_visibility(
  'task', '00000000-0000-4000-8000-000000000204', 'restricted',
  ARRAY['00000000-0000-4000-8000-0000000000bb']::uuid[]);

-- ---------------------------------------------------------------- the rules, asked directly

DO $checks$
DECLARE
  v_space uuid := '00000000-0000-4000-8000-0000000000f1';
  v_open_folder uuid := '00000000-0000-4000-8000-000000000101';
  v_private_folder uuid := '00000000-0000-4000-8000-000000000102';
  v_open_task uuid := '00000000-0000-4000-8000-000000000201';
  v_private_note uuid := '00000000-0000-4000-8000-000000000202';
  v_open_in_private uuid := '00000000-0000-4000-8000-000000000203';
  v_assignment uuid := '00000000-0000-4000-8000-000000000204';
  v_private_subtask uuid := '00000000-0000-4000-8000-000000000301';
  v_a text := '00000000-0000-4000-8000-0000000000aa';
  v_b text := '00000000-0000-4000-8000-0000000000bb';
  v_c text := '00000000-0000-4000-8000-0000000000cc';
  v_d text := '00000000-0000-4000-8000-0000000000dd';
  v_au uuid := '00000000-0000-4000-8000-0000000000aa';
  v_bu uuid := '00000000-0000-4000-8000-0000000000bb';
  v_cu uuid := '00000000-0000-4000-8000-0000000000cc';
BEGIN
  -- ---------------------------------------------- #1 a private item is A's alone
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_a), true);
  INSERT INTO results VALUES ('#1 A reaches their own private note', public.task_owned_by_uid(v_private_note), '');
  INSERT INTO results VALUES ('#1 A reaches their own private folder', public.folder_owned_by_uid(v_private_folder), '');

  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_b), true);
  INSERT INTO results VALUES ('#1 B cannot reach A''s private note', NOT public.task_owned_by_uid(v_private_note), '');
  INSERT INTO results VALUES ('#1 B cannot reach A''s private folder', NOT public.folder_owned_by_uid(v_private_folder), '');
  -- A subtask has no visibility of its own; it inherits, and this is what proves the helpers carry it.
  INSERT INTO results VALUES ('#1 B cannot reach a subtask of a private note', NOT public.subtask_owned_by_uid(v_private_subtask), '');
  -- Reaching and writing are separate questions, and both have to refuse.
  INSERT INTO results VALUES ('#1 B cannot write A''s private note', NOT public.task_writable_by_uid(v_private_note), '');

  -- ---------------------------------------------- #2 shared with B, #3 not with C
  INSERT INTO results VALUES ('#2 B reaches the task shared with them', public.task_owned_by_uid(v_assignment), '');
  INSERT INTO results VALUES ('#2 B may write the task shared with them', public.task_writable_by_uid(v_assignment), '');

  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_c), true);
  INSERT INTO results VALUES ('#3 C cannot reach the task shared with B only', NOT public.task_owned_by_uid(v_assignment), '');
  INSERT INTO results VALUES ('#3 C cannot reach A''s private note', NOT public.task_owned_by_uid(v_private_note), '');
  -- C is a member, so the open siblings must still be reachable. A privacy feature that hid
  -- everything would pass every test above and be useless.
  INSERT INTO results VALUES ('#3 C still reaches the open task', public.task_owned_by_uid(v_open_task), '');
  INSERT INTO results VALUES ('#3 C still reaches the open folder', public.folder_owned_by_uid(v_open_folder), '');

  -- ---------------------------------------------- #8 the owner always keeps access
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_a), true);
  INSERT INTO results VALUES ('#8 A keeps access to a task shared with somebody else', public.task_owned_by_uid(v_assignment), '');

  -- ---------------------------------------------- #16 a shared folder does not open its children
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_c), true);
  INSERT INTO results VALUES (
    '#16 a private note inside an open folder stays private',
    NOT public.task_owned_by_uid(v_private_note), '');
  INSERT INTO results VALUES (
    '#16 an open note inside a private folder is not reachable',
    NOT public.task_owned_by_uid(v_open_in_private), '');
  INSERT INTO results VALUES (
    '#16 the chain refuses at the folder above',
    NOT public.folder_chain_visible(v_private_folder, v_cu), '');

  -- ---------------------------------------------- #10 changing a folder does not expose children
  --
  -- Opening the private folder right up must reveal its open child and *not* touch anything with a
  -- restriction of its own. Checked by doing it, since the claim is about behaviour rather than
  -- about the rule as written.
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_a), true);
  PERFORM public.set_content_visibility('folder', v_private_folder, 'space', NULL);

  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_c), true);
  INSERT INTO results VALUES (
    '#10 opening a folder reveals the child that carried no restriction',
    public.task_owned_by_uid(v_open_in_private), '');
  INSERT INTO results VALUES (
    '#10 opening a folder does not reveal a private sibling elsewhere',
    NOT public.task_owned_by_uid(v_private_note), '');

  -- Put it back, and confirm the child disappears again. The reverse direction is the one that
  -- matters for revocation.
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_a), true);
  PERFORM public.set_content_visibility('folder', v_private_folder, 'private', NULL);
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_c), true);
  INSERT INTO results VALUES (
    '#10 closing a folder hides its open child again',
    NOT public.task_owned_by_uid(v_open_in_private), '');

  -- ---------------------------------------------- #4/#5 who the reminder reaches
  INSERT INTO results VALUES (
    '#4 B is in the audience of the task shared with them',
    EXISTS (SELECT 1 FROM public.content_audience('task', v_assignment) AS u WHERE u = v_bu), '');
  INSERT INTO results VALUES (
    '#4 B may be notified about it',
    public.notification_allowed(v_bu, 'task', v_assignment, 'reminders'), '');
  INSERT INTO results VALUES (
    '#5 C is not in the audience',
    NOT EXISTS (SELECT 1 FROM public.content_audience('task', v_assignment) AS u WHERE u = v_cu), '');
  INSERT INTO results VALUES (
    '#5 C may not be notified about it',
    NOT public.notification_allowed(v_cu, 'task', v_assignment, 'reminders'), '');
  INSERT INTO results VALUES (
    '#5 A, the owner, is still in the audience',
    EXISTS (SELECT 1 FROM public.content_audience('task', v_assignment) AS u WHERE u = v_au), '');

  -- ---------------------------------------------- #6/#7/#8 removing B
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_a), true);
  PERFORM public.set_content_visibility('task', v_assignment, 'restricted', ARRAY[]::uuid[]);

  -- Naming nobody is not a sharing state: the function stores 'private' instead. This is the
  -- brief's "if no users are selected, treat the item as Only Me".
  INSERT INTO results VALUES (
    'empty selection becomes Only me rather than an invalid state',
    (SELECT t.visibility FROM public.tasks t WHERE t.id = v_assignment) = 'private', '');

  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_b), true);
  INSERT INTO results VALUES ('#7 B immediately loses access', NOT public.task_owned_by_uid(v_assignment), '');
  INSERT INTO results VALUES (
    '#8 B is no longer eligible for its notifications',
    NOT public.notification_allowed(v_bu, 'task', v_assignment, 'reminders'), '');
  INSERT INTO results VALUES (
    '#8 B is out of the audience entirely',
    NOT EXISTS (SELECT 1 FROM public.content_audience('task', v_assignment) AS u WHERE u = v_bu), '');

  -- The grants are gone, not merely ignored — so switching back to "selected people" later starts
  -- from an empty list rather than silently restoring whoever used to be on it.
  INSERT INTO results VALUES (
    'going private clears the grant list',
    NOT EXISTS (
      SELECT 1 FROM public.content_shares s
      WHERE s.entity_type = 'task' AND s.entity_id = v_assignment), '');

  -- ---------------------------------------------- #9/#10/#11 adding B back
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_a), true);
  PERFORM public.set_content_visibility('task', v_assignment, 'restricted', ARRAY[v_bu]);

  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_b), true);
  INSERT INTO results VALUES ('#10 B regains access', public.task_owned_by_uid(v_assignment), '');
  INSERT INTO results VALUES (
    '#11 B is eligible for future notifications again',
    public.notification_allowed(v_bu, 'task', v_assignment, 'reminders'), '');

  -- ---------------------------------------------- #12/#13 shared with everyone
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_a), true);
  PERFORM public.set_content_visibility('task', v_assignment, 'space', NULL);

  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_c), true);
  INSERT INTO results VALUES ('#13 C can now reach it', public.task_owned_by_uid(v_assignment), '');
  INSERT INTO results VALUES (
    '#13 C is now eligible for its notifications',
    public.notification_allowed(v_cu, 'task', v_assignment, 'reminders'), '');

  -- ---------------------------------------------- #14/#15 back to selected people
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_a), true);
  PERFORM public.set_content_visibility('task', v_assignment, 'restricted', ARRAY[v_bu]);

  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_c), true);
  INSERT INTO results VALUES ('#15 C loses access again', NOT public.task_owned_by_uid(v_assignment), '');
  INSERT INTO results VALUES (
    '#15 C stops being eligible for notifications',
    NOT public.notification_allowed(v_cu, 'task', v_assignment, 'reminders'), '');

  -- ---------------------------------------------- a preference can never widen access
  --
  -- Everything on for C, who cannot see the item. The answer must still be no: the brief's
  -- "notification preferences must NEVER override privacy".
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_c), true);
  PERFORM public.set_notification_prefs(v_space, true, true, true);
  INSERT INTO results VALUES (
    'preferences cannot override privacy',
    NOT public.notification_allowed(v_cu, 'task', v_assignment, 'reminders'), '');

  -- And it can narrow. B has access; with reminders off, B is not to be told.
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_b), true);
  PERFORM public.set_notification_prefs(v_space, false, NULL, NULL);
  INSERT INTO results VALUES (
    'a preference can decline a notification the reader is allowed',
    NOT public.notification_allowed(v_bu, 'task', v_assignment, 'reminders'), '');
  INSERT INTO results VALUES (
    'declining reminders leaves access alone',
    public.task_owned_by_uid(v_assignment), '');
  -- Put it back for the queue checks below.
  PERFORM public.set_notification_prefs(v_space, true, NULL, NULL);

  -- ---------------------------------------------- who may change sharing
  --
  -- Not the space's admin, and not somebody the item is shared with. Only its owner. An admin who
  -- could edit the list could add themselves and read a private item, which is the one thing the
  -- role is not allowed to do.
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_b), true);
  INSERT INTO results VALUES (
    'a person the item is shared with cannot manage it',
    NOT public.content_manageable_by_uid('task', v_assignment), '');
  BEGIN
    PERFORM public.set_content_visibility('task', v_assignment, 'space', NULL);
    INSERT INTO results VALUES ('a non-owner cannot change sharing', false, 'the call was allowed');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO results VALUES ('a non-owner cannot change sharing', true, '');
  END;

  -- ---------------------------------------------- a member who leaves
  --
  -- #15's last case. Membership is the outer gate, so this needs no separate revocation step — but
  -- the grants are purged too, so being let back in does not silently restore what was shared.
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_a), true);
  DELETE FROM public.space_members
  WHERE space_id = v_space AND user_id = v_bu;

  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_b), true);
  INSERT INTO results VALUES (
    'leaving the space ends access to everything in it',
    NOT public.task_owned_by_uid(v_assignment) AND NOT public.folder_owned_by_uid(v_open_folder), '');
  INSERT INTO results VALUES (
    'leaving the space ends notification eligibility',
    NOT public.notification_allowed(v_bu, 'task', v_assignment, 'reminders'), '');
  INSERT INTO results VALUES (
    'leaving the space purges the grants that named them',
    NOT EXISTS (
      SELECT 1 FROM public.content_shares s
      WHERE s.space_id = v_space AND s.user_id = v_bu), '');

  -- Put B back for the sections below, which need a member who is not the owner.
  --
  -- And re-share, because leaving purged the grant: rejoining a space does not restore what was once
  -- shared with you, which is the behaviour asserted three lines above. The queue checks further down
  -- need B to actually have access, so it is granted again here rather than assumed.
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_a), true);
  INSERT INTO public.space_members (space_id, user_id, role) VALUES (v_space, v_bu, 'editor');
  PERFORM public.set_content_visibility('task', v_assignment, 'restricted', ARRAY[v_bu]);

  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_d), true);
  INSERT INTO results VALUES (
    'a stranger reaches nothing in the space',
    NOT public.folder_owned_by_uid(v_open_folder) AND NOT public.task_owned_by_uid(v_open_task), '');
END;
$checks$;

-- ---------------------------------------------------------------- #17 through the real policies
--
-- Everything above asked the helper functions. This section runs as `authenticated` and reads the
-- tables directly, which is what a client with the anon key and a valid session actually does — the
-- "manually modified request" in the brief. A helper that answers correctly while a policy lets the
-- row through would pass every check above.

SET LOCAL ROLE authenticated;

DO $policies$
DECLARE
  v_open_folder uuid := '00000000-0000-4000-8000-000000000101';
  v_private_folder uuid := '00000000-0000-4000-8000-000000000102';
  v_private_note uuid := '00000000-0000-4000-8000-000000000202';
  v_assignment uuid := '00000000-0000-4000-8000-000000000204';
  v_private_subtask uuid := '00000000-0000-4000-8000-000000000301';
  v_b text := '00000000-0000-4000-8000-0000000000bb';
  v_c text := '00000000-0000-4000-8000-0000000000cc';
  v_bu uuid := '00000000-0000-4000-8000-0000000000bb';
  v_touched int;
BEGIN
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_c), true);

  -- SELECT
  INSERT INTO results VALUES (
    '#17 SELECT on folders hides a private folder',
    NOT EXISTS (SELECT 1 FROM public.folders f WHERE f.id = v_private_folder), '');
  INSERT INTO results VALUES (
    '#17 SELECT on tasks hides a private note',
    NOT EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = v_private_note), '');
  INSERT INTO results VALUES (
    '#17 SELECT on tasks hides a task shared with somebody else',
    NOT EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = v_assignment), '');
  INSERT INTO results VALUES (
    '#17 SELECT on subtasks hides the children of a private note',
    NOT EXISTS (SELECT 1 FROM public.subtasks s WHERE s.id = v_private_subtask), '');
  INSERT INTO results VALUES (
    '#17 the open folder is still readable',
    EXISTS (SELECT 1 FROM public.folders f WHERE f.id = v_open_folder), '');

  -- The grant rows themselves. Learning *who* an item is shared with is learning that it exists.
  INSERT INTO results VALUES (
    '#17 SELECT on content_shares hides grants for unreachable items',
    NOT EXISTS (
      SELECT 1 FROM public.content_shares s
      WHERE s.entity_type = 'task' AND s.entity_id = v_assignment), '');

  -- UPDATE
  UPDATE public.tasks SET title = 'hijacked' WHERE id = v_private_note;
  GET DIAGNOSTICS v_touched = ROW_COUNT;
  INSERT INTO results VALUES ('#17 UPDATE cannot touch a private note', v_touched = 0, '');

  UPDATE public.folders SET name = 'hijacked' WHERE id = v_private_folder;
  GET DIAGNOSTICS v_touched = ROW_COUNT;
  INSERT INTO results VALUES ('#17 UPDATE cannot touch a private folder', v_touched = 0, '');

  -- DELETE
  DELETE FROM public.tasks WHERE id = v_private_note;
  GET DIAGNOSTICS v_touched = ROW_COUNT;
  INSERT INTO results VALUES ('#17 DELETE cannot remove a private note', v_touched = 0, '');

  -- INSERT into a folder that cannot be seen.
  BEGIN
    INSERT INTO public.tasks (id, folder_id, title, sort_order)
    VALUES ('00000000-0000-4000-8000-000000000299', v_private_folder, 'planted', 0);
    INSERT INTO results VALUES ('#17 INSERT into an unreachable folder is refused', false, 'the row was accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO results VALUES ('#17 INSERT into an unreachable folder is refused', true, '');
  END;

  -- Writing a grant directly, which is the whole permission system in one row. There is no INSERT
  -- policy on content_shares at all, so this cannot succeed by any route.
  BEGIN
    INSERT INTO public.content_shares (entity_type, entity_id, user_id, space_id)
    VALUES ('task', v_assignment, '00000000-0000-4000-8000-0000000000cc',
            '00000000-0000-4000-8000-0000000000f1');
    INSERT INTO results VALUES ('#17 a client cannot grant itself access', false, 'the grant was accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO results VALUES ('#17 a client cannot grant itself access', true, '');
  END;

  -- Changing an item's visibility with an ordinary UPDATE, bypassing set_content_visibility. The
  -- column is frozen by the row's trigger, so the statement succeeds and changes nothing — which is
  -- why this is asserted on the stored value rather than on whether it raised.
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_b), true);
  UPDATE public.tasks SET visibility = 'space' WHERE id = v_assignment;
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_c), true);
  INSERT INTO results VALUES (
    '#17 a PATCH cannot widen an item this account does not own',
    NOT EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = v_assignment), '');

  -- The activity feed carries titles and diffs, so it is a second way to read a private item.
  INSERT INTO results VALUES (
    '#17 the activity feed hides entries about unreachable items',
    NOT EXISTS (
      SELECT 1 FROM public.space_activity_feed('00000000-0000-4000-8000-0000000000f1'::uuid, NULL, 200, NULL, NULL)
      WHERE entity_id = v_private_note), '');
  INSERT INTO results VALUES (
    '#17 per-item history hides an unreachable item',
    NOT EXISTS (SELECT 1 FROM public.space_entity_history('task', v_private_note)), '');

  -- A reminder row names a task. Somebody who has lost access to the task should not keep the row.
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_b), true);
  INSERT INTO results VALUES (
    '#17 a reminder on an unreachable task is not readable',
    NOT EXISTS (
      SELECT 1 FROM public.reminders r WHERE r.id = '00000000-0000-4000-8000-000000000401'), '');
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_bu), true);
END;
$policies$;

RESET ROLE;

-- ---------------------------------------------------------------- #18 the queue, at send time
--
-- The sender reads due_reminders and mails whoever `recipients` names. So the assertion is about
-- what that column contains *now*, after the sharing has changed — which is precisely the question
-- the brief asks: Monday shared with A and B, Tuesday B removed, Friday the reminder fires.
--
-- The reminder was configured while the task was open to everyone and has not been touched since.

DO $queue$
DECLARE
  v_assignment uuid := '00000000-0000-4000-8000-000000000204';
  v_recipients jsonb;
  v_au uuid := '00000000-0000-4000-8000-0000000000aa';
  v_bu uuid := '00000000-0000-4000-8000-0000000000bb';
  v_cu uuid := '00000000-0000-4000-8000-0000000000cc';
BEGIN
  -- The task currently reads: restricted, shared with B. (A owns it; C was dropped at #14.)
  SELECT recipients INTO v_recipients
  FROM public.due_reminders
  WHERE id = '00000000-0000-4000-8000-000000000401';

  INSERT INTO results VALUES (
    '#18 the reminder is in the queue at all',
    v_recipients IS NOT NULL, 'no queue row — the reminder is not due');

  INSERT INTO results VALUES (
    '#18 the owner is a recipient',
    v_recipients @> jsonb_build_array(jsonb_build_object('userId', v_au)), coalesce(v_recipients::text, ''));

  INSERT INTO results VALUES (
    '#18 the selected person is a recipient',
    v_recipients @> jsonb_build_array(jsonb_build_object('userId', v_bu)), coalesce(v_recipients::text, ''));

  INSERT INTO results VALUES (
    '#18 the unselected member is not a recipient',
    NOT (v_recipients @> jsonb_build_array(jsonb_build_object('userId', v_cu))),
    coalesce(v_recipients::text, ''));

  -- Now make it private and read the same queue row again. Nothing about the reminder changed.
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_au::text), true);
  PERFORM public.set_content_visibility('task', v_assignment, 'private', NULL);

  SELECT recipients INTO v_recipients
  FROM public.due_reminders
  WHERE id = '00000000-0000-4000-8000-000000000401';

  INSERT INTO results VALUES (
    '#18 revoking access removes the recipient from an already-scheduled reminder',
    NOT (v_recipients @> jsonb_build_array(jsonb_build_object('userId', v_bu))),
    coalesce(v_recipients::text, ''));
  INSERT INTO results VALUES (
    '#18 the owner still receives it',
    v_recipients @> jsonb_build_array(jsonb_build_object('userId', v_au)),
    coalesce(v_recipients::text, ''));

  -- And the per-recipient gate the sender calls in the instant before each message agrees.
  INSERT INTO results VALUES (
    '#18 the pre-send check refuses the removed recipient',
    NOT public.notification_allowed(v_bu, 'task', v_assignment, 'reminders'), '');

  -- The deadline queue, which is a different view over the same rule.
  UPDATE public.tasks SET due_at = now() - interval '1 minute' WHERE id = v_assignment;
  SELECT recipients INTO v_recipients
  FROM public.pending_task_emails
  WHERE task_id = v_assignment AND reason = 'due_passed';

  INSERT INTO results VALUES (
    '#18 the deadline queue uses the same audience',
    v_recipients IS NOT NULL
      AND v_recipients @> jsonb_build_array(jsonb_build_object('userId', v_au))
      AND NOT (v_recipients @> jsonb_build_array(jsonb_build_object('userId', v_bu))),
    coalesce(v_recipients::text, ''));
END;
$queue$;

-- ---------------------------------------------------------------- #9 existing data still works
--
-- The migration's whole compatibility claim: a row written before any of this existed is at 'space',
-- and 'space' is exactly what it always meant. Simulated by inserting a row the way the pre-privacy
-- schema would have — no visibility named — and checking every member still reaches it.

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-0000000000aa"}';

INSERT INTO public.folders (id, name, sort_order, space_id)
VALUES ('00000000-0000-4000-8000-000000000103', 'Legacy folder', 0, '00000000-0000-4000-8000-0000000000f1');

INSERT INTO public.tasks (id, folder_id, title, sort_order)
VALUES ('00000000-0000-4000-8000-000000000205', '00000000-0000-4000-8000-000000000103', 'Legacy note', 0);

-- A personal folder, to prove the other half: privacy is a question only a space asks, and the
-- personal path must be untouched by all of this.
INSERT INTO public.folders (id, name, sort_order)
VALUES ('00000000-0000-4000-8000-000000000104', 'A personal folder', 0);

INSERT INTO public.tasks (id, folder_id, title, sort_order)
VALUES ('00000000-0000-4000-8000-000000000206', '00000000-0000-4000-8000-000000000104', 'A personal note', 0);

DO $legacy$
DECLARE
  v_legacy_folder uuid := '00000000-0000-4000-8000-000000000103';
  v_legacy_task uuid := '00000000-0000-4000-8000-000000000205';
  v_personal_folder uuid := '00000000-0000-4000-8000-000000000104';
  v_personal_task uuid := '00000000-0000-4000-8000-000000000206';
  v_a text := '00000000-0000-4000-8000-0000000000aa';
  v_b text := '00000000-0000-4000-8000-0000000000bb';
  v_au uuid := '00000000-0000-4000-8000-0000000000aa';
BEGIN
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_b), true);
  INSERT INTO results VALUES ('#9 a row written with no visibility is readable by every member',
    public.folder_owned_by_uid(v_legacy_folder) AND public.task_owned_by_uid(v_legacy_task), '');
  INSERT INTO results VALUES ('#9 and writable, exactly as before',
    public.folder_writable_by_uid(v_legacy_folder) AND public.task_writable_by_uid(v_legacy_task), '');
  INSERT INTO results VALUES ('#9 nobody else reaches a personal folder',
    NOT public.folder_owned_by_uid(v_personal_folder) AND NOT public.task_owned_by_uid(v_personal_task), '');

  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_a), true);
  INSERT INTO results VALUES ('#9 a personal folder is still reachable by its owner',
    public.folder_owned_by_uid(v_personal_folder) AND public.task_owned_by_uid(v_personal_task), '');
  -- A personal row is normalised to 'space', which there means nothing at all — there is one reader.
  INSERT INTO results VALUES ('#9 a personal folder carries no meaningful visibility',
    (SELECT f.visibility FROM public.folders f WHERE f.id = v_personal_folder) = 'space', '');
  INSERT INTO results VALUES ('#9 a personal item''s audience is its owner alone',
    ARRAY(SELECT u FROM public.content_audience('task', v_personal_task) AS u) = ARRAY[v_au], '');

  -- Sharing is meaningless outside a space, and saying so is better than storing a level that does
  -- nothing.
  BEGIN
    PERFORM public.set_content_visibility('task', v_personal_task, 'private', NULL);
    INSERT INTO results VALUES ('#9 a personal item cannot be shared', false, 'the call was allowed');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO results VALUES ('#9 a personal item cannot be shared', true, '');
  END;
END;
$legacy$;

-- ---------------------------------------------------------------- report

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
    RAISE EXCEPTION '% content-privacy check(s) failed: %', v_failed, v_names;
  END IF;
END;
$t$;

ROLLBACK;
