-- Takes the history-writing trigger functions off the public API.
--
-- They are SECURITY DEFINER so they can append to task_events, which nothing else is allowed to
-- write. But every function in the `public` schema is also a PostgREST endpoint, so making them
-- SECURITY DEFINER quietly published /rest/v1/rpc/log_task_schedule_change to anon and
-- authenticated. Calling a trigger function directly fails on its own ("can only be called as
-- triggers"), so this was not exploitable — but an elevated function nobody should ever call
-- should not be reachable at all, and the database linter is right to say so.
--
-- Triggers are unaffected: the trigger machinery invokes them as the table owner, not through the
-- caller's EXECUTE privilege.

REVOKE ALL ON FUNCTION public.log_task_schedule_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_reminder_added() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_reminder_removed() FROM PUBLIC, anon, authenticated;

-- Same reasoning for the two helpers reachable alongside them.
REVOKE ALL ON FUNCTION public.log_task_event(uuid, text, timestamptz, timestamptz, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.describe_reminder_row(public.reminders) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
