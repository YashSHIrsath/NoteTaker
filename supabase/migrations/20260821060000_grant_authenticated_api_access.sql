-- Allow the authenticated role to use the Data API on app tables.
-- RLS policies still restrict every row to auth.uid(); this does not grant anonymous access.

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.notes_migrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.folders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subtasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.attachments TO authenticated;

NOTIFY pgrst, 'reload schema';
