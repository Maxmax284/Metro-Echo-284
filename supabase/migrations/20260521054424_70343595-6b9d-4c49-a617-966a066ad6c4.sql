create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Remove any prior schedule with this name to keep migrations idempotent.
do $$
declare
  jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'sherlock-patterns-nightly';
  if jid is not null then
    perform cron.unschedule(jid);
  end if;
end $$;

select cron.schedule(
  'sherlock-patterns-nightly',
  '17 3 * * *',
  $$
  select net.http_post(
    url := 'https://dsyjofggptfblxftqtpv.supabase.co/functions/v1/sherlock-patterns',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzeWpvZmdncHRmYmx4ZnRxdHB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDM3MzgsImV4cCI6MjA5MzYxOTczOH0.Nzf7ldbQUwrz7OsLf1E-j-TA05gmB3p8HGQ6SSeKB0I',
      'x-cron-scan', 'sherlock-patterns'
    ),
    body := jsonb_build_object('cron', true)
  ) as request_id;
  $$
);