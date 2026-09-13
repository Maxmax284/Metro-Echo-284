-- Per-capability health for a person's own Google services.
-- A service that never worked stays quiet; only one that stopped working
-- may say "Needs you", and only for itself.
ALTER TABLE public.app_user_connections
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_ok_at timestamptz;