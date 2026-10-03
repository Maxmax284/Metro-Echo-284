-- weather-tick: hourly instrument pass for conditions watches.
-- telemetry_at records when the sky numbers were last re-read (separate from
-- last_check_at, which stays the news sweep's timestamp), and the hourly cron
-- keeps the Solari board's Now line fresh between 6-hour sweeps.

ALTER TABLE public.watches ADD COLUMN IF NOT EXISTS telemetry_at timestamptz;

SELECT cron.schedule(
  'vanta-weather-tick',
  '7 * * * *',
  $$select net.http_post(
      url := 'https://dsyjofggptfblxftqtpv.supabase.co/functions/v1/weather-tick',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{"source":"cron"}'::jsonb
    ) as request_id;$$
);