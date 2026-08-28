-- Shared Spaces, phase 2: membership.
--
-- Phase 1 built a workspace that only a manually inserted row could reach. This is how a space
-- comes into existence and how people get into it: creating one, inviting by email, accepting or
-- declining, and the four roles being enforced where it counts.
--
-- Everything that changes membership is a function rather than a table write. Not for ceremony —
-- each one is a thing that must happen completely or not at all. A space without its owner row is
-- invisible to the person who just made it; an accepted invite that didn't create a membership is a
-- dead end; a transfer that demoted the old owner without promoting the new one leaves a space
-- nobody can administer. A single UPDATE cannot express any of those.
--
-- Still not in this phase: activity history, locks, per-item visibility, realtime, Trash.

-- ---------------------------------------------------------------- a repair, first
--
-- space_can_write returned NULL rather than false for anybody who is not in the space, because
-- space_role returns NULL for them and `NULL IN (...)` is NULL. Row level security reads NULL as
-- false, so nothing was ever exposed through the API — but plpgsql does not: the folder trigger's
-- `IF NOT public.space_can_write(NEW.space_id) THEN RAISE` simply did not fire, so its own guard
-- against a non-member planting a folder in a space was inert.
--
-- Repeated here as well as fixed in 20260828012000 because that migration has already been applied
-- to live databases, and an applied migration never runs again.

CREATE OR REPLACE FUNCTION public.space_can_write(p_space_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT coalesce(public.space_role(p_space_id) IN ('owner', 'admin', 'editor'), false);
$$;

/*
 * The same trap, twice more.
 *
 * `space_role(...) NOT IN ('owner','admin')` and `space_role(...) <> 'owner'` are both NULL for a
 * non-member, and `IF NULL THEN RAISE` does not fire — so `invite_to_space` and
 * `transfer_space_ownership` skipped their own permission checks for exactly the people they were
 * written to stop. Inviting is the worse of the two: it hands access to a third party.
 *
 * Fixed by removing the idiom rather than patching each site. Every role question is now one of
 * these three functions, all NULL-safe by construction, and no caller writes a comparison against
 * space_role again.
 */
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

-- ---------------------------------------------------------------- who am I
--
-- Invitations are addressed to an email, and an email is what a person has before they have an
-- account. Read from auth.users rather than the JWT so the answer does not depend on which claims a
-- given token happens to carry.

CREATE OR REPLACE FUNCTION public.current_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
  SELECT lower(btrim(u.email))
  FROM auth.users AS u
  WHERE u.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.current_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_email() TO authenticated;

-- ---------------------------------------------------------------- invitations

/*
 * The credential in an invite link, from built-ins only.
 *
 * This was gen_random_bytes, which lives in pgcrypto — and Supabase installs pgcrypto into the
 * `extensions` schema rather than public, so an unqualified call fails at CREATE time while a
 * qualified one hardcodes one platform's layout. gen_random_uuid is in pg_catalog and needs no
 * extension at all; two of them concatenated is 64 hex characters carrying around 244 bits of
 * randomness, which is far more than a fourteen-day invitation requires.
 */
CREATE OR REPLACE FUNCTION public.new_invite_token()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = pg_catalog
AS $$
  SELECT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

REVOKE ALL ON FUNCTION public.new_invite_token() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.new_invite_token() TO authenticated;

CREATE TABLE IF NOT EXISTS public.space_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces (id) ON DELETE CASCADE,
  /* Kept as typed, compared lowercased. Someone who writes "Sam@Example.com" on the invite should
     see their own capitalisation back, and should still be matched when they sign in as
     "sam@example.com". */
  email text NOT NULL,
  role text NOT NULL DEFAULT 'editor',
  /* The credential in an invite link. Holding it is the proof — which is the whole point, since the
     person it is for may not have an account yet and so cannot be identified any other way. */
  token text NOT NULL UNIQUE DEFAULT public.new_invite_token(),
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '14 days',
  responded_at timestamptz,
  CONSTRAINT space_invites_email_not_empty CHECK (length(btrim(email)) > 0),
  /* Never owner. A space has exactly one, and it is not something an invitation can hand out. */
  CONSTRAINT space_invites_role_allowed CHECK (role IN ('admin', 'editor', 'viewer')),
  CONSTRAINT space_invites_status_allowed CHECK (
    status IN ('pending', 'accepted', 'declined', 'revoked')
  )
);

-- One live invitation per person per space. Inviting the same address twice should change the first
-- invitation, not produce two links that both work.
CREATE UNIQUE INDEX IF NOT EXISTS space_invites_pending_email_idx
  ON public.space_invites (space_id, lower(btrim(email)))
  WHERE status = 'pending';

-- "What am I invited to" — the query the Shared Spaces page opens with.
CREATE INDEX IF NOT EXISTS space_invites_email_pending_idx
  ON public.space_invites (lower(btrim(email)))
  WHERE status = 'pending';

ALTER TABLE public.space_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS space_invites_select ON public.space_invites;
DROP POLICY IF EXISTS space_invites_delete_admin ON public.space_invites;

/*
 * Two audiences, and they see it for different reasons: the space's members, because managing who
 * has been asked is part of managing a space, and the person it is addressed to, because otherwise
 * the in-app "you have been invited" card could not exist.
 *
 * Note what this does *not* grant: the token column is readable by members (who need it to build a
 * link) and by the invitee (who is already holding it if they followed one). Nobody else can select
 * the row at all, so the token cannot be fished for.
 */
CREATE POLICY space_invites_select
  ON public.space_invites FOR SELECT TO authenticated
  USING (
    public.is_space_member(space_id)
    OR lower(btrim(email)) = public.current_email()
  );

-- Withdrawing an invitation is a plain delete, for an admin, while it is still pending. Accepted and
-- declined rows stay: they are the record of what happened.
CREATE POLICY space_invites_delete_admin
  ON public.space_invites FOR DELETE TO authenticated
  USING (
    status = 'pending'
    AND public.space_role(space_id) IN ('owner', 'admin')
  );

/* No INSERT or UPDATE policy. Creating an invitation has to check the caller's role, the target's
   membership and the space's size together, and accepting one has to create a membership in the
   same breath — see the functions below. */

GRANT SELECT, DELETE ON TABLE public.space_invites TO authenticated;

-- ---------------------------------------------------------------- limits
--
-- Chosen now rather than when someone hits them: retrofitting a cap onto accounts that have already
-- exceeded it is a much worse conversation than starting with one. Generous on purpose.

CREATE OR REPLACE FUNCTION public.space_limit_members()
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$ SELECT 50; $$;

CREATE OR REPLACE FUNCTION public.space_limit_per_account()
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$ SELECT 20; $$;

REVOKE ALL ON FUNCTION public.space_limit_members() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.space_limit_per_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.space_limit_members() TO authenticated;
GRANT EXECUTE ON FUNCTION public.space_limit_per_account() TO authenticated;

-- ---------------------------------------------------------------- create a space

/*
 * A space and its owner row, together or not at all.
 *
 * This is why public.spaces has no INSERT policy. The SELECT policy needs membership, so a space
 * inserted without its owner row is invisible to the account that just created it — unreachable,
 * undeletable, and impossible to notice.
 */
CREATE OR REPLACE FUNCTION public.create_space(p_name text, p_color text DEFAULT NULL)
RETURNS public.spaces
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_space public.spaces;
  v_owned integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF length(btrim(coalesce(p_name, ''))) = 0 THEN
    RAISE EXCEPTION 'A space needs a name';
  END IF;

  SELECT count(*) INTO v_owned
  FROM public.space_members AS member
  WHERE member.user_id = auth.uid()
    AND member.role = 'owner';

  IF v_owned >= public.space_limit_per_account() THEN
    RAISE EXCEPTION 'You have reached the limit of % spaces', public.space_limit_per_account();
  END IF;

  INSERT INTO public.spaces (name, color, created_by)
  VALUES (btrim(p_name), nullif(btrim(coalesce(p_color, '')), ''), auth.uid())
  RETURNING * INTO v_space;

  INSERT INTO public.space_members (space_id, user_id, role, invited_by)
  VALUES (v_space.id, auth.uid(), 'owner', auth.uid());

  RETURN v_space;
END;
$$;

REVOKE ALL ON FUNCTION public.create_space(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_space(text, text) TO authenticated;

-- ---------------------------------------------------------------- invite

/*
 * Ask someone to join, by email.
 *
 * Addressed to an email rather than to a user id, because requiring the invitee to already have an
 * account means every invitation starts with "go and sign up first, then tell me". The invitation
 * simply waits: the SELECT policy above matches on email, so it appears in the app the moment an
 * account with that address exists. Nothing has to be claimed or migrated at signup.
 */
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

  -- Already a member: the invitation would be accepted into a seat they are sitting in.
  IF EXISTS (
    SELECT 1
    FROM public.space_members AS member
    JOIN auth.users AS u ON u.id = member.user_id
    WHERE member.space_id = p_space_id
      AND lower(btrim(u.email)) = v_email
  ) THEN
    RAISE EXCEPTION 'That person is already in this space';
  END IF;

  -- Seats taken, counting invitations still outstanding: without them, fifty pending invites could
  -- all be accepted past the limit.
  SELECT
    (SELECT count(*) FROM public.space_members AS m WHERE m.space_id = p_space_id)
    + (SELECT count(*) FROM public.space_invites AS i
        WHERE i.space_id = p_space_id AND i.status = 'pending' AND i.expires_at > now())
  INTO v_headcount;

  IF v_headcount >= public.space_limit_members() THEN
    RAISE EXCEPTION 'This space has reached the limit of % people', public.space_limit_members();
  END IF;

  /* Inviting the same address twice changes the first invitation rather than issuing a second link.
     Two live links for one seat means one of them is a surprise later. */
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

-- ---------------------------------------------------------------- accept / decline

/*
 * Answer an invitation, by token or by being the person it names.
 *
 * Two ways in, because there are two journeys. Someone already using the app sees a card and taps
 * Accept — they are identified by their email, and no token need ever be exposed. Someone who
 * followed a link out of their inbox may have signed up with a different address than the one that
 * was invited, so for them the token *is* the credential.
 *
 * Accepting is idempotent: a second tap on a stale card, or a link opened twice, finds the
 * membership already there and returns the space rather than failing.
 */
CREATE OR REPLACE FUNCTION public.respond_to_space_invite(
  p_accept boolean,
  p_invite_id uuid DEFAULT NULL,
  p_token text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_invite public.space_invites;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_token IS NOT NULL THEN
    SELECT * INTO v_invite FROM public.space_invites WHERE token = p_token;
  ELSIF p_invite_id IS NOT NULL THEN
    SELECT * INTO v_invite
    FROM public.space_invites
    WHERE id = p_invite_id
      AND lower(btrim(email)) = public.current_email();
  ELSE
    RAISE EXCEPTION 'Which invitation?';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That invitation is no longer available';
  END IF;

  IF v_invite.status <> 'pending' THEN
    -- Already answered. If it was accepted and the membership exists, saying so is friendlier than
    -- an error for what is usually a double tap.
    IF v_invite.status = 'accepted'
      AND EXISTS (
        SELECT 1 FROM public.space_members AS member
        WHERE member.space_id = v_invite.space_id AND member.user_id = auth.uid()
      )
    THEN
      RETURN v_invite.space_id;
    END IF;
    RAISE EXCEPTION 'That invitation has already been answered';
  END IF;

  IF v_invite.expires_at <= now() THEN
    RAISE EXCEPTION 'That invitation has expired';
  END IF;

  IF NOT p_accept THEN
    UPDATE public.space_invites
    SET status = 'declined', responded_at = now()
    WHERE id = v_invite.id;
    RETURN v_invite.space_id;
  END IF;

  INSERT INTO public.space_members (space_id, user_id, role, invited_by)
  VALUES (v_invite.space_id, auth.uid(), v_invite.role, v_invite.invited_by)
  ON CONFLICT (space_id, user_id) DO NOTHING;

  UPDATE public.space_invites
  SET status = 'accepted', responded_at = now()
  WHERE id = v_invite.id;

  RETURN v_invite.space_id;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_space_invite(boolean, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_space_invite(boolean, uuid, text) TO authenticated;

-- ---------------------------------------------------------------- my invitations
--
-- The one read that RLS cannot express. An invitee is by definition not yet a member, and the SELECT
-- policy on public.spaces requires membership — so they can see the invitation row but not the name
-- of the space it is for, which is the only part of it worth showing them. Widening the spaces policy
-- to admit invitees would expose every space's name to anyone holding any invitation; a function that
-- joins exactly the two columns needed, for invitations addressed to the caller, does not.
--
-- Everything else the Shared Spaces page needs is an ordinary select under the phase 1 policies.

CREATE OR REPLACE FUNCTION public.my_space_invites()
RETURNS TABLE (
  id uuid,
  space_id uuid,
  space_name text,
  space_color text,
  role text,
  token text,
  created_at timestamptz,
  expires_at timestamptz,
  invited_by_name text,
  invited_by_email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
  SELECT
    invite.id,
    invite.space_id,
    space.name,
    space.color,
    invite.role,
    invite.token,
    invite.created_at,
    invite.expires_at,
    nullif(btrim(coalesce(inviter.raw_user_meta_data ->> 'full_name', '')), ''),
    inviter.email
  FROM public.space_invites AS invite
  JOIN public.spaces AS space ON space.id = invite.space_id
  JOIN auth.users AS inviter ON inviter.id = invite.invited_by
  WHERE invite.status = 'pending'
    AND invite.expires_at > now()
    AND lower(btrim(invite.email)) = public.current_email()
  ORDER BY invite.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.my_space_invites() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_space_invites() TO authenticated;

-- ---------------------------------------------------------------- transfer ownership

/*
 * Hand the space over. One statement's worth of intent, two rows.
 *
 * A function rather than two updates because the policies on space_members refuse to touch an owner
 * row at all — deliberately, so that no sequence of ordinary writes can leave a space with two
 * owners or none. This is the only way the owner changes, and it always leaves exactly one.
 *
 * The interface exists now, in this phase, because "exactly one owner" is only a safe invariant if
 * there is a legitimate way to move it. The UI for it belongs with the rest of the admin screens.
 */
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

  -- Outgoing owner first: the partial unique index allows only one owner per space, so promoting
  -- before demoting would collide with the row being replaced.
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

-- ---------------------------------------------------------------- who is in a space
--
-- The member list needs names and avatars, and auth.users is not readable by the client. This view
-- is the one place that boundary is crossed, and it crosses it narrowly: id, email, display name and
-- avatar, for spaces the caller is actually in.

CREATE OR REPLACE FUNCTION public.space_member_directory(p_space_id uuid)
RETURNS TABLE (
  user_id uuid,
  role text,
  joined_at timestamptz,
  email text,
  full_name text,
  avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
  SELECT
    member.user_id,
    member.role,
    member.joined_at,
    u.email,
    nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(btrim(coalesce(u.raw_user_meta_data ->> 'avatar_url', '')), '')
  FROM public.space_members AS member
  JOIN auth.users AS u ON u.id = member.user_id
  WHERE member.space_id = p_space_id
    AND public.is_space_member(p_space_id)
  ORDER BY
    CASE member.role
      WHEN 'owner' THEN 0
      WHEN 'admin' THEN 1
      WHEN 'editor' THEN 2
      ELSE 3
    END,
    member.joined_at;
$$;

REVOKE ALL ON FUNCTION public.space_member_directory(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.space_member_directory(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
