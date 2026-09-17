-- A reading that lands should reach an open Today panel and Body desk the way a
-- gate change or a moved calendar entry does. Read-only broadcast: nothing here
-- lets a device approve or run anything.
ALTER TABLE public.wearable_readings REPLICA IDENTITY FULL;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.wearable_readings;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;