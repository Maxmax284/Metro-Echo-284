-- Per-user connector connection keys (server-only, encrypted at rest).
CREATE TABLE IF NOT EXISTS public.app_user_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connector_id text NOT NULL,
  connection_key_ciphertext text NOT NULL,
  account_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, connector_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_user_connections TO service_role;
ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;

-- Calendar feeds can now come from a live provider account, not only an .ics URL.
ALTER TABLE public.calendar_feeds
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'ical';
ALTER TABLE public.calendar_feeds ALTER COLUMN url DROP NOT NULL;
ALTER TABLE public.calendar_feeds
  ADD CONSTRAINT calendar_feeds_provider_check CHECK (provider IN ('ical', 'google'));