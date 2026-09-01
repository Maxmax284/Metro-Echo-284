select cron.schedule(
  'vanta-wearable-sweep-daily',
  '50 4 * * *',
  $$
  select net.http_post(
    url := 'https://dsyjofggptfblxftqtpv.supabase.co/functions/v1/wearable-sweep',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-scan','wearable-sweep'),
    body := '{"source":"cron"}'::jsonb
  );
  $$
);