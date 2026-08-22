-- service_role bypasses RLS but NOT table-level GRANTs — those are separate mechanisms.
-- The earlier API-access migration only granted the `authenticated` role, so the
-- send-task-reminders edge function (which uses the service role key) could SELECT through
-- the pending_task_reminders view (views run as their owner) but couldn't UPDATE tasks
-- directly to mark a reminder sent ("permission denied for table tasks").

GRANT USAGE ON SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notes_migrations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.folders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tasks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subtasks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.attachments TO service_role;

NOTIFY pgrst, 'reload schema';
