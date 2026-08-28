-- A space's own identity: a picture, and a note saying what it is for.
--
-- Until now a space had a name and a colour, and the colour stood in for a picture. That works as a
-- glance-level marker and not as an identity — a team space is recognised by its logo the way a
-- person is by their face, and "what is this space for" is the first question a new member has.
--
-- The picture lives in the existing avatars bucket rather than a new one. It is the same kind of
-- thing at the same size with the same rules, and a second public image bucket would be two sets of
-- policies to keep in step for no gain. Paths are `space/<space id>/...`, which is what the storage
-- policy below keys on — a user's own avatar is `<user id>/...`, and a uuid can never equal the
-- literal 'space', so the two namespaces cannot collide.

ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS image_url text;

/*
 * A space's name, note, colour and picture.
 *
 * Admin and owner only — unlike the display settings in 20260828016000, which any writing member may
 * change. The split is deliberate: how the space *looks to work in* is everyone's, but what the space
 * *is* — its name, what it is for, its face — is the kind of thing that should not change under the
 * people using it because an editor was tidying up.
 *
 * NULL leaves a field alone; an empty string clears it. Those have to be distinguishable, or
 * "remove the description" and "don't touch the description" would be the same request.
 */
CREATE OR REPLACE FUNCTION public.set_space_profile(
  p_space_id uuid,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_color text DEFAULT NULL,
  p_image_url text DEFAULT NULL
)
RETURNS public.spaces
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_space public.spaces;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.space_can_manage(p_space_id) THEN
    RAISE EXCEPTION 'Only an owner or admin can change this space';
  END IF;

  -- A name is the one field that cannot be cleared: the table's own CHECK refuses a blank one, and
  -- a space with no name is not identifiable in any list.
  IF p_name IS NOT NULL AND length(btrim(p_name)) = 0 THEN
    RAISE EXCEPTION 'A space needs a name';
  END IF;

  UPDATE public.spaces AS space
  SET name = coalesce(nullif(btrim(coalesce(p_name, '')), ''), space.name),
      description = CASE
        WHEN p_description IS NULL THEN space.description
        WHEN btrim(p_description) = '' THEN NULL
        ELSE btrim(p_description)
      END,
      color = CASE
        WHEN p_color IS NULL THEN space.color
        WHEN btrim(p_color) = '' THEN NULL
        ELSE btrim(p_color)
      END,
      image_url = CASE
        WHEN p_image_url IS NULL THEN space.image_url
        WHEN btrim(p_image_url) = '' THEN NULL
        ELSE btrim(p_image_url)
      END
  WHERE space.id = p_space_id
  RETURNING * INTO v_space;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That space no longer exists';
  END IF;

  RETURN v_space;
END;
$$;

REVOKE ALL ON FUNCTION public.set_space_profile(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_space_profile(uuid, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------- the picture in Storage
--
-- The avatars policies key on the first path segment being the caller's own user id. A space's
-- picture is nobody's user id, so it needs its own clause — and the permission is the space's, not a
-- person's: whoever may manage the space may change its face.

CREATE OR REPLACE FUNCTION public.storage_space_image_space(object_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
BEGIN
  IF split_part(object_name, '/', 1) <> 'space' THEN
    RETURN NULL;
  END IF;
  RETURN split_part(object_name, '/', 2)::uuid;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.storage_space_image_writable(object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_space uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  v_space := public.storage_space_image_space(object_name);
  IF v_space IS NULL THEN
    RETURN false;
  END IF;
  RETURN public.space_can_manage(v_space);
END;
$$;

REVOKE ALL ON FUNCTION public.storage_space_image_space(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_space_image_writable(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storage_space_image_space(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_space_image_writable(text) TO authenticated;

DROP POLICY IF EXISTS avatars_storage_insert ON storage.objects;
DROP POLICY IF EXISTS avatars_storage_update ON storage.objects;
DROP POLICY IF EXISTS avatars_storage_delete ON storage.objects;

CREATE POLICY avatars_storage_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR public.storage_space_image_writable(name)
    )
  );

CREATE POLICY avatars_storage_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR public.storage_space_image_writable(name)
    )
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR public.storage_space_image_writable(name)
    )
  );

CREATE POLICY avatars_storage_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR public.storage_space_image_writable(name)
    )
  );

NOTIFY pgrst, 'reload schema';
