
ALTER TABLE public.action_events REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.action_events;
