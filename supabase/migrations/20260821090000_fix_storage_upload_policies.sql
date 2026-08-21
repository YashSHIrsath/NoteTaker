-- Storage policies must not join public tables under the caller's RLS
-- (that can fail the INSERT and surface as HTTP 400).
-- Ownership is checked with the existing SECURITY DEFINER helpers.

CREATE OR REPLACE FUNCTION public.storage_attachment_allowed(object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  path_task uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF split_part(object_name, '/', 1) IS DISTINCT FROM auth.uid()::text THEN
    RETURN false;
  END IF;

  BEGIN
    path_task := split_part(object_name, '/', 2)::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN false;
  END;

  RETURN public.task_owned_by_uid(path_task);
END;
$$;

REVOKE ALL ON FUNCTION public.storage_attachment_allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storage_attachment_allowed(text) TO authenticated;

DROP POLICY IF EXISTS attachments_storage_select ON storage.objects;
DROP POLICY IF EXISTS attachments_storage_insert ON storage.objects;
DROP POLICY IF EXISTS attachments_storage_update ON storage.objects;
DROP POLICY IF EXISTS attachments_storage_delete ON storage.objects;

CREATE POLICY attachments_storage_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'attachments'
    AND public.storage_attachment_allowed(name)
  );

CREATE POLICY attachments_storage_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'attachments'
    AND public.storage_attachment_allowed(name)
  );

CREATE POLICY attachments_storage_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'attachments'
    AND public.storage_attachment_allowed(name)
  )
  WITH CHECK (
    bucket_id = 'attachments'
    AND public.storage_attachment_allowed(name)
  );

CREATE POLICY attachments_storage_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'attachments'
    AND public.storage_attachment_allowed(name)
  );

-- Do not MIME-filter at the bucket. The app validates allowed types.
UPDATE storage.buckets
SET
  public = false,
  allowed_mime_types = NULL,
  file_size_limit = 52428800
WHERE id = 'attachments';
