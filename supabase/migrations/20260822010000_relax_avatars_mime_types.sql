-- The storage API's allowed_mime_types check on this project rejects otherwise-valid
-- uploads with a 400 (the 'attachments' bucket hit the same issue and was already relaxed
-- to null — see storage.buckets row). File type is still enforced client-side before upload.

UPDATE storage.buckets
SET allowed_mime_types = NULL
WHERE id = 'avatars';
