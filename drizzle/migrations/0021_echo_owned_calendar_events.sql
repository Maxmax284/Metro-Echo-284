-- Echo-owned calendar events: created, edited and deleted inside the platform,
-- optionally mirrored to Google both ways. Feed rows stay exactly as they were.
ALTER TABLE public.calendar_events
  ALTER COLUMN feed_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'feed',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS google_calendar_id text,
  ADD COLUMN IF NOT EXISTS sync_state text NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS sync_error text,
  ADD COLUMN IF NOT EXISTS synced_at timestamptz;

ALTER TABLE public.calendar_events
  DROP CONSTRAINT IF EXISTS calendar_events_origin_check;
ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_origin_check CHECK (origin IN ('feed', 'echo'));

ALTER TABLE public.calendar_events
  DROP CONSTRAINT IF EXISTS calendar_events_sync_state_check;
ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_sync_state_check
  CHECK (sync_state IN ('local', 'synced', 'error', 'off'));

CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_google_event_key
  ON public.calendar_events (user_id, google_event_id)
  WHERE google_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS calendar_events_origin_idx
  ON public.calendar_events (user_id, origin, starts_at);
