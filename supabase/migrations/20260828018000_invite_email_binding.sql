-- An invitation belongs to the address it was sent to, and to nobody else.
--
-- Until now the token in an invite link was a bearer credential: whoever held it could accept, on
-- the reasoning that someone might sign up with a different address than the one invited. That is
-- the wrong trade. An invite link travels through email, chat and screenshots, and anyone who ends
-- up holding one could join a space they were never asked into — while the person who *was* asked
-- has no way to tell it happened except by reading the member list.
--
-- So the email is the identity and the token is only a pointer. The link still does its job: it
-- names which invitation is being answered, which matters when somebody has several or none of them
-- visible yet. What it no longer does is prove who you are.
--
-- The consequence, stated plainly: if you are invited at one address and sign up at another, the
-- invitation will not accept. That is the intended behaviour — the alternative is a link that lets
-- anybody in.
--
-- There is nothing here to encrypt. The token is 64 hex characters from gen_random_uuid, not a
-- reversible encoding of anything, so there is no value in the URL to tamper with: changing it
-- produces a token that matches no row. What made the link dangerous was never that it could be
-- guessed — it was that holding it was enough. This is the fix for that.

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
  v_email text := public.current_email();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  /* Either handle finds the invitation; neither one authorises it. The token is looked up without an
     email filter on purpose, so that a mismatch can be reported as a mismatch rather than as "no
     such invitation" — which would leave somebody following a perfectly good link with no idea why
     it failed. */
  IF p_token IS NOT NULL THEN
    SELECT * INTO v_invite FROM public.space_invites WHERE token = p_token;
  ELSIF p_invite_id IS NOT NULL THEN
    SELECT * INTO v_invite FROM public.space_invites WHERE id = p_invite_id;
  ELSE
    RAISE EXCEPTION 'Which invitation?';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That invitation is no longer available';
  END IF;

  -- The one check that matters, and it applies to both routes in.
  IF v_email IS NULL OR lower(btrim(v_invite.email)) IS DISTINCT FROM v_email THEN
    RAISE EXCEPTION 'That invitation was sent to a different email address. Sign in with that address to accept it.';
  END IF;

  IF v_invite.status <> 'pending' THEN
    -- Already answered. If it was accepted and the membership exists, saying so is friendlier than
    -- an error for what is usually a double tap or a link opened twice.
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

NOTIFY pgrst, 'reload schema';
