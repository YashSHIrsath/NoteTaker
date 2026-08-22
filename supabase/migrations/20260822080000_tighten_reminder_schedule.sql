-- A 5-minute check window meant reminders could sit unsent for up to 5 minutes after becoming
-- due, which reads as "it's broken" when someone checks their inbox right away. Checking every
-- minute instead costs nothing meaningful for a personal-scale app.
SELECT cron.unschedule('send-task-reminders');

SELECT cron.schedule(
  'send-task-reminders',
  '* * * * *',
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
