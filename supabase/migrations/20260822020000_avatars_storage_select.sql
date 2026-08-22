-- Uploads were failing with "new row violates row-level security policy" even though the
-- INSERT's own WITH CHECK passed. Root cause: the storage API's upload response reads the
-- new row back via `INSERT ... RETURNING`, and Postgres enforces RLS's SELECT-side policies
-- on RETURNING too — with zero SELECT policies on this bucket that visibility check failed
-- and surfaced as a policy violation on write, not read. Public bucket downloads bypass RLS
-- through a separate path, so this was never hit until an authenticated write needed it.

DROP POLICY IF EXISTS avatars_storage_select ON storage.objects;

CREATE POLICY avatars_storage_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars');
