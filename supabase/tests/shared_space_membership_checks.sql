-- Membership, as assertions. Run against any environment with:
--
--     npx supabase db query --linked --file supabase/tests/shared_space_membership_checks.sql
--
-- Everything runs inside a transaction that rolls back, so it is safe against production.
--
-- These exist because the membership rules live in SQL functions, where the app's TypeScript checks
-- cannot reach them — and because each one is an invariant that is cheap to break by accident: two
-- owners, a space with none, an invitation accepted twice, a viewer who can write.

BEGIN;

CREATE TEMP TABLE results (name text, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON results TO authenticated;

--   A = creates the space
--   B = invited, accepts
--   V = invited as a viewer
--   C = a stranger

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'a@example.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'b@example.test'),
  ('00000000-0000-4000-8000-0000000000d1', 'v@example.test'),
  ('00000000-0000-4000-8000-0000000000c1', 'c@example.test');

-- ---------------------------------------------------------------- creating

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-0000000000a1"}';

DO $t$
DECLARE
  v_space public.spaces;
  v_invite public.space_invites;
  v_failed boolean;
  v_result uuid;
BEGIN
  v_space := public.create_space('Q3 Launch', 'teal');

  INSERT INTO results VALUES ('create: the space exists',
    EXISTS (SELECT 1 FROM public.spaces WHERE id = v_space.id), '');
  INSERT INTO results VALUES ('create: the creator is its owner',
    EXISTS (SELECT 1 FROM public.space_members
            WHERE space_id = v_space.id
              AND user_id = '00000000-0000-4000-8000-0000000000a1'
              AND role = 'owner'), '');
  INSERT INTO results VALUES ('create: and its only member',
    (SELECT count(*) FROM public.space_members WHERE space_id = v_space.id) = 1, '');
  INSERT INTO results VALUES ('create: a blank name is refused', (
    SELECT NOT EXISTS (SELECT 1 FROM public.spaces WHERE btrim(name) = '')
  ), '');

  -- ------------------------------------------------ inviting
  v_invite := public.invite_to_space(v_space.id, 'B@Example.test', 'editor');
  INSERT INTO results VALUES ('invite: an invitation is created pending',
    v_invite.status = 'pending', v_invite.status);
  INSERT INTO results VALUES ('invite: it carries a token',
    length(coalesce(v_invite.token, '')) > 16, '');
  INSERT INTO results VALUES ('invite: the typed capitalisation is kept',
    v_invite.email = 'B@Example.test', v_invite.email);

  -- Inviting the same address again must change the first invitation, not issue a second link.
  DECLARE v_again public.space_invites;
  BEGIN
    v_again := public.invite_to_space(v_space.id, 'b@example.test', 'viewer');
    INSERT INTO results VALUES ('invite: re-inviting reuses the same invitation',
      v_again.id = v_invite.id, '');
    INSERT INTO results VALUES ('invite: and updates the role',
      v_again.role = 'viewer', v_again.role);
    INSERT INTO results VALUES ('invite: only one live invitation per address',
      (SELECT count(*) FROM public.space_invites
        WHERE space_id = v_space.id AND status = 'pending') = 1, '');
    -- Put it back to editor for the acceptance checks below.
    v_again := public.invite_to_space(v_space.id, 'b@example.test', 'editor');
  END;

  -- Inviting yourself, and inviting as owner, are both refused.
  v_failed := false;
  BEGIN
    PERFORM public.invite_to_space(v_space.id, 'a@example.test', 'editor');
  EXCEPTION WHEN others THEN v_failed := true;
  END;
  INSERT INTO results VALUES ('invite: you cannot invite yourself', v_failed, '');

  v_failed := false;
  BEGIN
    PERFORM public.invite_to_space(v_space.id, 'someone@example.test', 'owner');
  EXCEPTION WHEN others THEN v_failed := true;
  END;
  INSERT INTO results VALUES ('invite: ownership cannot be invited', v_failed, '');

  v_failed := false;
  BEGIN
    PERFORM public.invite_to_space(v_space.id, 'not-an-email', 'editor');
  EXCEPTION WHEN others THEN v_failed := true;
  END;
  INSERT INTO results VALUES ('invite: a malformed address is refused', v_failed, '');

  -- A viewer invitation for V, used further down.
  PERFORM public.invite_to_space(v_space.id, 'v@example.test', 'viewer');

  -- ------------------------------------------------ a stranger cannot invite
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1"}', true);
  v_failed := false;
  BEGIN
    PERFORM public.invite_to_space(v_space.id, 'x@example.test', 'editor');
  EXCEPTION WHEN others THEN v_failed := true;
  END;
  INSERT INTO results VALUES ('invite: a non-member cannot invite', v_failed, '');

  -- ------------------------------------------------ accepting
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1"}', true);

  INSERT INTO results VALUES ('invite: the invitee sees it, with the space name',
    (SELECT count(*) FROM public.my_space_invites() WHERE space_id = v_space.id) = 1, '');
  INSERT INTO results VALUES ('invite: and the name is readable even before joining',
    (SELECT space_name FROM public.my_space_invites() WHERE space_id = v_space.id) = 'Q3 Launch', '');

  SELECT * INTO v_invite FROM public.space_invites
    WHERE space_id = v_space.id AND lower(btrim(email)) = 'b@example.test' AND status = 'pending';

  v_result := public.respond_to_space_invite(true, v_invite.id, NULL);
  INSERT INTO results VALUES ('accept: returns the space', v_result = v_space.id, '');
  INSERT INTO results VALUES ('accept: creates the membership at the invited role',
    EXISTS (SELECT 1 FROM public.space_members
            WHERE space_id = v_space.id
              AND user_id = '00000000-0000-4000-8000-0000000000b1'
              AND role = 'editor'), '');
  INSERT INTO results VALUES ('accept: the invitation is marked accepted',
    (SELECT status FROM public.space_invites WHERE id = v_invite.id) = 'accepted', '');
  INSERT INTO results VALUES ('accept: it no longer waits for an answer',
    (SELECT count(*) FROM public.my_space_invites() WHERE space_id = v_space.id) = 0, '');

  -- A second tap on a stale card must not fail.
  v_result := public.respond_to_space_invite(true, v_invite.id, NULL);
  INSERT INTO results VALUES ('accept: accepting twice is not an error', v_result = v_space.id, '');

  -- ------------------------------------------------ declining
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1"}', true);
  SELECT * INTO v_invite FROM public.space_invites
    WHERE space_id = v_space.id AND lower(btrim(email)) = 'v@example.test' AND status = 'pending';
  PERFORM public.respond_to_space_invite(false, v_invite.id, NULL);
  INSERT INTO results VALUES ('decline: marked declined',
    (SELECT status FROM public.space_invites WHERE id = v_invite.id) = 'declined', '');
  INSERT INTO results VALUES ('decline: creates no membership',
    NOT EXISTS (SELECT 1 FROM public.space_members
                WHERE space_id = v_space.id
                  AND user_id = '00000000-0000-4000-8000-0000000000d1'), '');

  -- ------------------------------------------------ a stranger cannot answer someone else's
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1"}', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1"}', true);
  DECLARE v_for_c public.space_invites;
  BEGIN
    v_for_c := public.invite_to_space(v_space.id, 'nobody@example.test', 'editor');
    PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1"}', true);
    v_failed := false;
    BEGIN
      PERFORM public.respond_to_space_invite(true, v_for_c.id, NULL);
    EXCEPTION WHEN others THEN v_failed := true;
    END;
    INSERT INTO results VALUES (
      'accept: an invitation addressed to someone else cannot be taken by id', v_failed, '');

    /*
     * And the token does not change that.
     *
     * This assertion used to say the opposite — that whoever held the link could accept, on the
     * reasoning that somebody might sign up at a different address than the one invited. That made
     * the link a bearer credential: an invite forwarded, screenshotted or pasted into a group chat
     * let anybody into the space, and the person actually invited had no way of noticing. The email
     * is the identity now; the token only says which invitation is being answered.
     */
    v_failed := false;
    BEGIN
      PERFORM public.respond_to_space_invite(true, NULL, v_for_c.token);
    EXCEPTION WHEN others THEN v_failed := true;
    END;
    INSERT INTO results VALUES (
      'accept: holding the link is not enough — the address has to match', v_failed, '');

    INSERT INTO results VALUES (
      'accept: and no membership was created for the wrong person',
      NOT EXISTS (SELECT 1 FROM public.space_members
                  WHERE space_id = v_space.id
                    AND user_id = '00000000-0000-4000-8000-0000000000c1'), '');
  END;

  -- ------------------------------------------------ exactly one owner, and transfer
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1"}', true);
  INSERT INTO results VALUES ('owner: exactly one',
    (SELECT count(*) FROM public.space_members
      WHERE space_id = v_space.id AND role = 'owner') = 1, '');

  v_failed := false;
  BEGIN
    INSERT INTO public.space_members (space_id, user_id, role)
    VALUES (v_space.id, '00000000-0000-4000-8000-0000000000c1', 'owner');
  EXCEPTION WHEN others THEN v_failed := true;
  END;
  INSERT INTO results VALUES ('owner: a second owner is refused', v_failed, '');

  PERFORM public.transfer_space_ownership(v_space.id, '00000000-0000-4000-8000-0000000000b1');
  INSERT INTO results VALUES ('transfer: the new owner owns it',
    (SELECT role FROM public.space_members
      WHERE space_id = v_space.id AND user_id = '00000000-0000-4000-8000-0000000000b1') = 'owner', '');
  INSERT INTO results VALUES ('transfer: the old owner becomes an admin',
    (SELECT role FROM public.space_members
      WHERE space_id = v_space.id AND user_id = '00000000-0000-4000-8000-0000000000a1') = 'admin', '');
  INSERT INTO results VALUES ('transfer: still exactly one owner',
    (SELECT count(*) FROM public.space_members
      WHERE space_id = v_space.id AND role = 'owner') = 1, '');

  -- The former owner is now an admin, so transferring is no longer theirs to do.
  v_failed := false;
  BEGIN
    PERFORM public.transfer_space_ownership(v_space.id, '00000000-0000-4000-8000-0000000000c1');
  EXCEPTION WHEN others THEN v_failed := true;
  END;
  INSERT INTO results VALUES ('transfer: only the owner can transfer', v_failed, '');

  -- And a complete outsider least of all. This is the sibling of the invite check above: both
  -- guards compared space_role directly, which is NULL for a non-member, so neither fired.
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1"}', true);
  v_failed := false;
  BEGIN
    PERFORM public.transfer_space_ownership(v_space.id, '00000000-0000-4000-8000-0000000000a1');
  EXCEPTION WHEN others THEN v_failed := true;
  END;
  INSERT INTO results VALUES ('transfer: a non-member cannot transfer', v_failed, '');
END;
$t$;

-- ---------------------------------------------------------------- through the policies

SET LOCAL ROLE authenticated;

-- V declined, and therefore never joined — the outsider this section needs. (C never got in either,
-- now that a token alone does not admit anybody.)
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-4000-8000-0000000000d1"}';

INSERT INTO results
SELECT 'rls: someone who declined sees no space', count(*) = 0, 'saw ' || count(*)
FROM public.spaces;

INSERT INTO results
SELECT 'rls: and no membership rows', count(*) = 0, 'saw ' || count(*)
FROM public.space_members;

INSERT INTO results
SELECT 'rls: they can still see their own declined invitation', count(*) = 1, 'saw ' || count(*)
FROM public.space_invites
WHERE lower(btrim(email)) = 'v@example.test';

INSERT INTO results
SELECT 'rls: but not invitations addressed to other people', count(*) = 0, 'saw ' || count(*)
FROM public.space_invites
WHERE lower(btrim(email)) <> 'v@example.test';

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
    RAISE EXCEPTION '% membership check(s) failed: %', v_failed, v_names;
  END IF;
END;
$t$;

ROLLBACK;
