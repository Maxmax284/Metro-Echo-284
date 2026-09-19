-- A mail sweep is opt-in, remembers where it got to, and never looks at the
-- same message twice. Both tables are server-side only: the browser never
-- reads what a sweep saw.

CREATE TABLE public.mail_sync_state (
  user_id uuid PRIMARY KEY,
  connector_id text NOT NULL DEFAULT 'google_mail',
  -- Off until the person switches it on. Nothing sweeps by default.
  enabled boolean NOT NULL DEFAULT false,
  -- Gmail's own bookmark, so later runs read changes rather than the mailbox.
  history_id text,
  backfilled_at timestamptz,
  last_swept_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_sync_state TO authenticated;
GRANT ALL ON public.mail_sync_state TO service_role;
ALTER TABLE public.mail_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own mail sweep settings"
  ON public.mail_sync_state FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.mail_seen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  message_id text NOT NULL,
  subject text,
  from_address text,
  -- What the sweep did with it: looked, opened, or recognised something.
  outcome text NOT NULL DEFAULT 'looked',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, message_id)
);

-- Read-only to the person it belongs to, so Receipts can say where a flight
-- came from. Only the sweep itself writes.
GRANT SELECT ON public.mail_seen TO authenticated;
GRANT ALL ON public.mail_seen TO service_role;
ALTER TABLE public.mail_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own mail seen"
  ON public.mail_seen FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX mail_seen_user_created_idx ON public.mail_seen (user_id, created_at DESC);

CREATE TRIGGER mail_sync_state_updated_at
  BEFORE UPDATE ON public.mail_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();