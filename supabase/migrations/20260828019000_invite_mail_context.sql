-- ============================================================================================
-- What the invitation mailer is allowed to know
--
-- An invitation is now emailed rather than only turned into a link the inviter has to carry to the
-- person themselves. That mail has to say one of two different things — "sign in with this address
-- and accept" or "create an account with this address first" — and it has to be able to tell the
-- inviter afterwards whether it was accepted or declined.
--
-- All of which needs auth.users, which is not reachable over PostgREST, and rows across three
-- tables that RLS shows to different people. So it is one function, called by the Edge Function
-- with the service role, that returns exactly the fields a message needs and one extra: what the
-- *caller* is, so the function does not have to be trusted to authorise itself.
--
-- Why the branch is safe.
--
--   `invitee_has_account` is the answer to "does this address have an account here", which is
--   exactly what the signup form deliberately refuses to tell anybody — see AuthContext.signUp,
--   which reads a duplicate out of a successful response rather than asking. The difference is
--   where the answer goes: this one is never returned to a browser. It picks a sentence in a
--   message addressed to that address, so the only person who learns it is the person it is about.
--   Which is why EXECUTE is granted to service_role and to nobody else — granted to
--   `authenticated` this function would be an email-enumeration oracle with a nice API.
-- ============================================================================================

CREATE OR REPLACE FUNCTION public.space_invite_mail_context(
  p_invite_id uuid DEFAULT NULL,
  p_token text DEFAULT NULL,
  p_caller uuid DEFAULT NULL
)
RETURNS TABLE (
  invite_id uuid,
  invite_email text,
  invite_role text,
  invite_token text,
  invite_status text,
  expires_at timestamptz,
  space_id uuid,
  space_name text,
  inviter_id uuid,
  inviter_name text,
  inviter_email text,
  /* Which sentence the invitation gets. Never returned to a client — see the note above. */
  invitee_has_account boolean,
  /* Null until they have an account, and then their name if they have set one. */
  invitee_name text,
  /* What the caller is in this space, so the Edge Function can refuse an invite mail from somebody
     who is not an owner or admin. NULL for a non-member, which reads as "not allowed". */
  caller_role text,
  /* And who the caller is, so an "answered" notification can be refused unless it comes from the
     person the invitation was addressed to. */
  caller_email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
  SELECT
    i.id,
    i.email,
    i.role,
    i.token,
    i.status,
    i.expires_at,
    i.space_id,
    s.name,
    i.invited_by,
    nullif(btrim(coalesce(inviter.raw_user_meta_data ->> 'full_name', '')), ''),
    inviter.email,
    invitee.id IS NOT NULL,
    nullif(btrim(coalesce(invitee.raw_user_meta_data ->> 'full_name', '')), ''),
    (
      SELECT member.role
      FROM public.space_members AS member
      WHERE member.space_id = i.space_id
        AND member.user_id = p_caller
    ),
    (SELECT lower(btrim(caller.email)) FROM auth.users AS caller WHERE caller.id = p_caller)
  FROM public.space_invites AS i
  JOIN public.spaces AS s ON s.id = i.space_id
  LEFT JOIN auth.users AS inviter ON inviter.id = i.invited_by
  -- The address as invited, matched the way every other comparison in this schema matches it.
  LEFT JOIN auth.users AS invitee ON lower(btrim(invitee.email)) = lower(btrim(i.email))
  WHERE (p_invite_id IS NOT NULL AND i.id = p_invite_id)
     OR (p_token IS NOT NULL AND i.token = p_token)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.space_invite_mail_context(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.space_invite_mail_context(uuid, text, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.space_invite_mail_context(uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.space_invite_mail_context(uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.space_invite_mail_context(uuid, text, uuid) IS
  'Everything the invitation mailer needs, for the service role only. Returns whether the invited '
  'address already has an account, which decides whether the mail says "sign in" or "sign up" — '
  'that answer must never reach a client, so EXECUTE is service_role and nothing else.';
