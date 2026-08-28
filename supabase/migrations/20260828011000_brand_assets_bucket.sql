-- A public bucket for the images the emails link to.
--
-- An email cannot inline an image: Gmail blocks data: URIs in <img>, and it will not render SVG at
-- all, so the logo has to be a PNG fetched over HTTP from somewhere that is always up.
--
-- Not the web app's own public/ folder, which is the obvious place and the wrong one. That would
-- tie whether a reminder renders its logo to whether the site happens to have been deployed since
-- the asset was added — a mail sent on Tuesday breaking because a front-end deploy slipped to
-- Wednesday. The mail pipeline already runs entirely inside Supabase; its assets should too.
--
-- Public read, no write policy at all. Nothing in the app uploads here: brand assets are put in by
-- hand when they change, which is roughly never, and a bucket the client can write to is a bucket
-- someone can host anything in.

INSERT INTO storage.buckets (id, name, public)
VALUES ('brand', 'brand', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS brand_public_read ON storage.objects;

CREATE POLICY brand_public_read
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'brand');

NOTIFY pgrst, 'reload schema';
