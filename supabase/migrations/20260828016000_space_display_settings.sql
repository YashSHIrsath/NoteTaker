-- Shared Spaces: the settings that belong to the space rather than to a person.
--
-- Two of the app's display preferences stop being yours when the workspace is shared. The bottom
-- bar's tab order and the note style (list cards or colourful tiles) describe *the space* — everyone
-- in it is looking at the same tree, and one member arranging it should be arranging it for the
-- others too. Anyone who can write to the space can change them.
--
-- Tiles per row deliberately stays personal. It is a function of the screen in front of you, and
-- it is already stored per screen size for that exact reason: the count that reads well at a desk is
-- not the count that reads well on a phone, so it cannot be one shared answer. Which page you open
-- on stays personal for the same kind of reason — it is about where *you* start.

ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS nav_order text,
  ADD COLUMN IF NOT EXISTS view_style text;

/*
 * Change a space's display settings.
 *
 * A function rather than an UPDATE policy because the existing one on public.spaces is admin-only —
 * renaming a space or deleting it are not things an editor should do — while these two are
 * deliberately open to anyone who can write. Row level security cannot say "this column but not
 * that one", so the narrower permission gets its own door.
 *
 * NULL leaves a setting alone; an empty string clears it back to the account's own preference. Those
 * have to be distinguishable, or "reset this to default" would be indistinguishable from "don't
 * touch this".
 */
CREATE OR REPLACE FUNCTION public.set_space_display(
  p_space_id uuid,
  p_nav_order text DEFAULT NULL,
  p_view_style text DEFAULT NULL
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

  IF NOT public.space_can_write(p_space_id) THEN
    RAISE EXCEPTION 'You do not have permission to change this space';
  END IF;

  IF p_view_style IS NOT NULL
    AND p_view_style <> ''
    AND p_view_style NOT IN ('professional', 'clipboard')
  THEN
    RAISE EXCEPTION 'Unknown note style: %', p_view_style;
  END IF;

  UPDATE public.spaces AS space
  SET nav_order = CASE
        WHEN p_nav_order IS NULL THEN space.nav_order
        WHEN btrim(p_nav_order) = '' THEN NULL
        ELSE btrim(p_nav_order)
      END,
      view_style = CASE
        WHEN p_view_style IS NULL THEN space.view_style
        WHEN btrim(p_view_style) = '' THEN NULL
        ELSE btrim(p_view_style)
      END
  WHERE space.id = p_space_id
  RETURNING * INTO v_space;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That space no longer exists';
  END IF;

  RETURN v_space;
END;
$$;

REVOKE ALL ON FUNCTION public.set_space_display(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_space_display(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
