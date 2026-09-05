-- Attachments were previously limited to image/pdf/doc/docx/xls/xlsx/csv — a .md file (or any
-- other type) had nowhere to go and was rejected client-side before ever reaching this table.
-- 'md' and 'txt' get their own type (a real text preview); 'file' is the catch-all for anything
-- else, so uploading is no longer an allowlist of specific extensions. See classifyAttachmentFile.
ALTER TABLE public.attachments
  DROP CONSTRAINT attachments_type_allowed;

ALTER TABLE public.attachments
  ADD CONSTRAINT attachments_type_allowed CHECK (
    type IN ('image', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'md', 'txt', 'file')
  );
