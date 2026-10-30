-- Toby reminder schedule.
-- Asks your app every 5 minutes whether any notifications are due.
-- Before running: replace YOUR_CRON_SECRET with the CRON_SECRET you set in Vercel,
-- and the address if your app lives somewhere other than toby-rust.vercel.app.
-- Then: Supabase SQL Editor -> New query -> paste -> Run.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove an older copy of the job if you run this file again.
select cron.unschedule(jobid) from cron.job where jobname = 'toby-notify';

select cron.schedule(
  'toby-notify',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://toby-rust.vercel.app/api/notify',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer YOUR_CRON_SECRET'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- To check it's working later:
--   select status_code, content from net._http_response order by created desc limit 5;
