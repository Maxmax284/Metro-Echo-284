-- Detection sensitivity + weekly digest preferences.
-- These only change what Sherlock notices and where the weekly read appears.
-- No column here grants Sherlock permission to file, link, message or execute.
ALTER TABLE public.sherlock_settings
  ADD COLUMN IF NOT EXISTS detect_stale_commitment       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS detect_near_duplicate_note    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS detect_recurring_entity       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS detect_obligation_untracked   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS detect_unapproved_high_risk   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS detect_meeting_without_context boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS detect_promise_collides       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS detect_entity_gone_quiet      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS detect_notes_disagree         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS stale_promise_days            integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS duplicate_window_days         integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS recurring_min_mentions        integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS quiet_gap_days                integer NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS meeting_lookahead_hours       integer NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS weekly_digest_enabled         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS weekly_digest_today           boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS weekly_digest_telegram        boolean NOT NULL DEFAULT false;

-- Sane ranges enforced in the database as well as in the scanner, so a bad
-- client value can never make a scan wider or noisier than intended.
CREATE OR REPLACE FUNCTION public.sherlock_settings_clamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.stale_promise_days      := LEAST(GREATEST(COALESCE(NEW.stale_promise_days, 2), 0), 30);
  NEW.duplicate_window_days   := LEAST(GREATEST(COALESCE(NEW.duplicate_window_days, 30), 7), 90);
  NEW.recurring_min_mentions  := LEAST(GREATEST(COALESCE(NEW.recurring_min_mentions, 4), 2), 20);
  NEW.quiet_gap_days          := LEAST(GREATEST(COALESCE(NEW.quiet_gap_days, 14), 7), 90);
  NEW.meeting_lookahead_hours := LEAST(GREATEST(COALESCE(NEW.meeting_lookahead_hours, 48), 6), 336);
  NEW.dismissed_cooldown_days := LEAST(GREATEST(COALESCE(NEW.dismissed_cooldown_days, 7), 1), 90);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sherlock_settings_clamp ON public.sherlock_settings;
CREATE TRIGGER trg_sherlock_settings_clamp
  BEFORE INSERT OR UPDATE ON public.sherlock_settings
  FOR EACH ROW EXECUTE FUNCTION public.sherlock_settings_clamp();

-- Single-flight lease + idempotency for the weekly digest job.
CREATE TABLE IF NOT EXISTS public.job_leases (
  job_name   text PRIMARY KEY,
  locked_by  text,
  locked_at  timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

GRANT ALL ON public.job_leases TO service_role;
ALTER TABLE public.job_leases ENABLE ROW LEVEL SECURITY;
-- No policies: this is a service-role-only coordination table. Clients cannot read it.

CREATE TABLE IF NOT EXISTS public.sherlock_digests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid,
  week_start      date NOT NULL,
  digest          jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_count       integer NOT NULL DEFAULT 0,
  look_again_count integer NOT NULL DEFAULT 0,
  delivered_channels text[] NOT NULL DEFAULT '{}',
  seen_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sherlock_digests_week_unique
  ON public.sherlock_digests (user_id, COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), week_start);
CREATE INDEX IF NOT EXISTS sherlock_digests_recent
  ON public.sherlock_digests (user_id, week_start DESC);

GRANT SELECT, UPDATE ON public.sherlock_digests TO authenticated;
GRANT ALL ON public.sherlock_digests TO service_role;
ALTER TABLE public.sherlock_digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own digests are readable"
  ON public.sherlock_digests FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Only the "seen" mark is user-writable; the digest body is composed server-side.
CREATE POLICY "own digests can be marked seen"
  ON public.sherlock_digests FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_sherlock_digests_updated ON public.sherlock_digests;
CREATE TRIGGER trg_sherlock_digests_updated
  BEFORE UPDATE ON public.sherlock_digests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();