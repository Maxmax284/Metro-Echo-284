ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS attendees text[] NOT NULL DEFAULT '{}'::text[];