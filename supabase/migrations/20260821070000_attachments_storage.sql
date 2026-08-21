-- Private attachment files. Not public. Access is authenticated + ownership via task → folder.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  false,
  10485760,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/csv'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

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
    AND split_part(name, '/', 1) = auth.uid()::text
    AND EXISTS (
      SELECT 1
      FROM public.tasks AS task
      JOIN public.folders AS folder ON folder.id = task.folder_id
      WHERE task.id::text = split_part(name, '/', 2)
        AND folder.user_id = auth.uid()
    )
  );

CREATE POLICY attachments_storage_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'attachments'
    AND split_part(name, '/', 1) = auth.uid()::text
    AND EXISTS (
      SELECT 1
      FROM public.tasks AS task
      JOIN public.folders AS folder ON folder.id = task.folder_id
      WHERE task.id::text = split_part(name, '/', 2)
        AND folder.user_id = auth.uid()
    )
  );

CREATE POLICY attachments_storage_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'attachments'
    AND split_part(name, '/', 1) = auth.uid()::text
    AND EXISTS (
      SELECT 1
      FROM public.tasks AS task
      JOIN public.folders AS folder ON folder.id = task.folder_id
      WHERE task.id::text = split_part(name, '/', 2)
        AND folder.user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'attachments'
    AND split_part(name, '/', 1) = auth.uid()::text
    AND EXISTS (
      SELECT 1
      FROM public.tasks AS task
      JOIN public.folders AS folder ON folder.id = task.folder_id
      WHERE task.id::text = split_part(name, '/', 2)
        AND folder.user_id = auth.uid()
    )
  );

CREATE POLICY attachments_storage_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'attachments'
    AND split_part(name, '/', 1) = auth.uid()::text
    AND EXISTS (
      SELECT 1
      FROM public.tasks AS task
      JOIN public.folders AS folder ON folder.id = task.folder_id
      WHERE task.id::text = split_part(name, '/', 2)
        AND folder.user_id = auth.uid()
    )
  );
