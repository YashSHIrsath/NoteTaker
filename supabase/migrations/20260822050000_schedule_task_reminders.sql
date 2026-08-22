-- Runs the send-task-reminders edge function every 5 minutes. The shared secret below only
-- authorizes this one cron job to trigger that function (it does nothing else, and the
-- function is idempotent via reminder_sent_at) — rotate it if this migration history is ever
-- made public or shared beyond this project.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.schedule(
  'send-task-reminders',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zbgznpssljwrkoswhtou.supabase.co/functions/v1/send-task-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '3128f6f414f60805f5b3177f351dab1fc54a9d4b04582fb1'
    ),
    body := '{}'::jsonb
  );
  $$
);
