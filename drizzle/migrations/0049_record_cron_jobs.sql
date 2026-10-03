-- lovable-cron-fallback-reviewed: records 15 cron jobs that already run in production at these exact cadences (864 sub-hourly runs/day total, unchanged); timing preserved verbatim so the repo can rebuild the live backend.
-- Single tree going forward: supabase/migrations owns cron definitions
-- (the drizzle/migrations cron files are legacy, left untouched).
-- Pattern matches the existing house style: unschedule same-name first,
-- then schedule, so re-applying is idempotent and never duplicates a job.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN (
    'vanta-commitment-reminders-hourly',
    'vanta-embed-backfill-notes',
    'vanta-embed-backfill-messages',
    'vanta-embed-backfill-commitments',
    'awareness-decay-hourly',
    'sherlock-watch-hourly',
    'vanta-drift-sweep',
    'vanta-calendar-sync',
    'sherlock-digest-weekly',
    'vanta-physical-sweep-daily',
    'vanta-wearable-sweep-daily',
    'vanta-watch-sweep',
    'metro-echo-journey-watch',
    'gmail-sweep-hourly',
    'vanta-weather-tick'
  );
END $$;

SELECT cron.schedule(
  'vanta-commitment-reminders-hourly',
  '0 * * * *',
  $cmd$
  select net.http_post(
    url := 'https://dsyjofggptfblxftqtpv.supabase.co/functions/v1/commitment-reminders',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzeWpvZmdncHRmYmx4ZnRxdHB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDM3MzgsImV4cCI6MjA5MzYxOTczOH0.Nzf7ldbQUwrz7OsLf1E-j-TA05gmB3p8HGQ6SSeKB0I"}'::jsonb,
    body := '{}'::jsonb
  );
  $cmd$
);

SELECT cron.schedule(
  'vanta-embed-backfill-notes',
  '*/15 * * * *',
  $cmd$
  select net.http_post(
    url := 'https://dsyjofggptfblxftqtpv.supabase.co/functions/v1/embeddings-generate',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzeWpvZmdncHRmYmx4ZnRxdHB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDM3MzgsImV4cCI6MjA5MzYxOTczOH0.Nzf7ldbQUwrz7OsLf1E-j-TA05gmB3p8HGQ6SSeKB0I","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzeWpvZmdncHRmYmx4ZnRxdHB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDM3MzgsImV4cCI6MjA5MzYxOTczOH0.Nzf7ldbQUwrz7OsLf1E-j-TA05gmB3p8HGQ6SSeKB0I"}'::jsonb,
    body := '{"mode":"backfill","kind":"note","limit":50}'::jsonb
  );
  $cmd$
);

SELECT cron.schedule(
  'vanta-embed-backfill-messages',
  '*/15 * * * *',
  $cmd$
  select net.http_post(
    url := 'https://dsyjofggptfblxftqtpv.supabase.co/functions/v1/embeddings-generate',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzeWpvZmdncHRmYmx4ZnRxdHB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDM3MzgsImV4cCI6MjA5MzYxOTczOH0.Nzf7ldbQUwrz7OsLf1E-j-TA05gmB3p8HGQ6SSeKB0I","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzeWpvZmdncHRmYmx4ZnRxdHB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDM3MzgsImV4cCI6MjA5MzYxOTczOH0.Nzf7ldbQUwrz7OsLf1E-j-TA05gmB3p8HGQ6SSeKB0I"}'::jsonb,
    body := '{"mode":"backfill","kind":"message","limit":50}'::jsonb
  );
  $cmd$
);

SELECT cron.schedule(
  'vanta-embed-backfill-commitments',
  '*/15 * * * *',
  $cmd$
  select net.http_post(
    url := 'https://dsyjofggptfblxftqtpv.supabase.co/functions/v1/embeddings-generate',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzeWpvZmdncHRmYmx4ZnRxdHB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDM3MzgsImV4cCI6MjA5MzYxOTczOH0.Nzf7ldbQUwrz7OsLf1E-j-TA05gmB3p8HGQ6SSeKB0I","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzeWpvZmdncHRmYmx4ZnRxdHB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDM3MzgsImV4cCI6MjA5MzYxOTczOH0.Nzf7ldbQUwrz7OsLf1E-j-TA05gmB3p8HGQ6SSeKB0I"}'::jsonb,
    body := '{"mode":"backfill","kind":"commitment","limit":50}'::jsonb
  );
  $cmd$
);

SELECT cron.schedule(
  'awareness-decay-hourly',
  '0 * * * *',
  $cmd$
  select net.http_post(
    url:='https://dsyjofggptfblxftqtpv.supabase.co/functions/v1/awareness-decay',
    headers:='{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzeWpvZmdncHRmYmx4ZnRxdHB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDM3MzgsImV4cCI6MjA5MzYxOTczOH0.Nzf7ldbQUwrz7OsLf1E-j-TA05gmB3p8HGQ6SSeKB0I"}'::jsonb,
    body:=concat('{"time": "', now(), '"}')::jsonb
  ) as request_id;
  $cmd$
);

SELECT cron.schedule(
  'sherlock-watch-hourly',
  '0 * * * *',
  $cmd$
  select net.http_post(
    url := 'https://dsyjofggptfblxftqtpv.supabase.co/functions/v1/sherlock-watch',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzeWpvZmdncHRmYmx4ZnRxdHB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDM3MzgsImV4cCI6MjA5MzYxOTczOH0.Nzf7ldbQUwrz7OsLf1E-j-TA05gmB3p8HGQ6SSeKB0I"}'::jsonb,
    body := concat('{"time":"', now(), '"}')::jsonb
  ) as request_id;
  $cmd$
);

SELECT cron.schedule(
  'vanta-drift-sweep',
  '0 * * * *',
  $cmd$
  select net.http_post(
    url:='https://dsyjofggptfblxftqtpv.supabase.co/functions/v1/awareness-drift-sweep',
    headers:='{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzeWpvZmdncHRmYmx4ZnRxdHB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDM3MzgsImV4cCI6MjA5MzYxOTczOH0.Nzf7ldbQUwrz7OsLf1E-j-TA05gmB3p8HGQ6SSeKB0I"}'::jsonb,
    body:=concat('{"time": "', now(), '"}')::jsonb
  ) as request_id;
  $cmd$
);

SELECT cron.schedule(
  'vanta-calendar-sync',
  '*/5 * * * *',
  $cmd$
  select net.http_post(
    url := 'https://dsyjofggptfblxftqtpv.supabase.co/functions/v1/calendar-sync',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := '{}'::jsonb
  );
  $cmd$
);

SELECT cron.schedule(
  'sherlock-digest-weekly',
  '0 21 * * 0',
  $cmd$
  select net.http_post(
    url := 'https://dsyjofggptfblxftqtpv.supabase.co/functions/v1/sherlock-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-scan', 'sherlock-digest'
    ),
    body := jsonb_build_object('cron', true)
  ) as request_id;
  $cmd$
);

SELECT cron.schedule(
  'vanta-physical-sweep-daily',
  '35 4 * * *',
  $cmd$
  select net.http_post(
    url := 'https://dsyjofggptfblxftqtpv.supabase.co/functions/v1/physical-sweep',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-scan','physical-sweep'),
    body := '{"source":"cron"}'::jsonb
  );
  $cmd$
);

SELECT cron.schedule(
  'vanta-wearable-sweep-daily',
  '50 4 * * *',
  $cmd$
  select net.http_post(
    url := 'https://dsyjofggptfblxftqtpv.supabase.co/functions/v1/wearable-sweep',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-scan','wearable-sweep'),
    body := '{"source":"cron"}'::jsonb
  );
  $cmd$
);

SELECT cron.schedule(
  'vanta-watch-sweep',
  '*/10 * * * *',
  $cmd$
  select net.http_post(
    url := 'https://dsyjofggptfblxftqtpv.supabase.co/functions/v1/watch-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-scan', 'watch-sweep'
    ),
    body := jsonb_build_object('source', 'cron')
  ) as request_id;
  $cmd$
);

SELECT cron.schedule(
  'metro-echo-journey-watch',
  '*/10 * * * *',
  $cmd$
  select net.http_post(
    url := 'https://dsyjofggptfblxftqtpv.supabase.co/functions/v1/journey-watch',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzeWpvZmdncHRmYmx4ZnRxdHB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDM3MzgsImV4cCI6MjA5MzYxOTczOH0.Nzf7ldbQUwrz7OsLf1E-j-TA05gmB3p8HGQ6SSeKB0I"}'::jsonb,
    body := concat('{"cron": true, "at": "', now(), '"}')::jsonb
  ) as request_id;
  $cmd$
);

SELECT cron.schedule(
  'gmail-sweep-hourly',
  '7 * * * *',
  $cmd$
  select net.http_post(
    url:='https://dsyjofggptfblxftqtpv.supabase.co/functions/v1/gmail-sweep',
    headers:='{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzeWpvZmdncHRmYmx4ZnRxdHB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDM3MzgsImV4cCI6MjA5MzYxOTczOH0.Nzf7ldbQUwrz7OsLf1E-j-TA05gmB3p8HGQ6SSeKB0I"}'::jsonb,
    body:=concat('{"time": "', now(), '"}')::jsonb
  ) as request_id;
  $cmd$
);

SELECT cron.schedule(
  'vanta-weather-tick',
  '7 * * * *',
  $cmd$
  select net.http_post(
      url := 'https://dsyjofggptfblxftqtpv.supabase.co/functions/v1/weather-tick',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{"source":"cron"}'::jsonb
    ) as request_id;
  $cmd$
);