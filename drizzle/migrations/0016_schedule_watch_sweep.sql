-- lovable-cron-fallback-reviewed: 144 runs/day; watches are time-based goals with per-watch cadence and next_check_at, so a low-frequency reconciliation timer is the only way to honour a due time without a second event pipeline. Sweep is read-only and reports.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
declare
  jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'vanta-watch-sweep';
  if jid is not null then
    perform cron.unschedule(jid);
  end if;
end $$;

select cron.schedule(
  'vanta-watch-sweep',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://dsyjofggptfblxftqtpv.supabase.co/functions/v1/watch-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-scan', 'watch-sweep'
    ),
    body := jsonb_build_object('source', 'cron')
  ) as request_id;
  $$
);