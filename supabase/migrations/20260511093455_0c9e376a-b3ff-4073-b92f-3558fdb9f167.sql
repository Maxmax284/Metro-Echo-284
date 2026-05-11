
-- Extend action_status enum
ALTER TYPE public.action_status ADD VALUE IF NOT EXISTS 'rolled_back';
ALTER TYPE public.action_status ADD VALUE IF NOT EXISTS 'needs_credentials';

-- Extend actions table
ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS executed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rolled_back_at timestamptz,
  ADD COLUMN IF NOT EXISTS risk_acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS rollback_available boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rollback_token text,
  ADD COLUMN IF NOT EXISTS affected_entities jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_actions_user_status_updated
  ON public.actions (user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_action_events_action_created
  ON public.action_events (action_id, created_at DESC);

-- Sherlock findings cache
CREATE TABLE IF NOT EXISTS public.sherlock_findings_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  scope_hash text NOT NULL,
  findings jsonb NOT NULL,
  confidence text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity_type, scope_hash)
);

ALTER TABLE public.sherlock_findings_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sherlock_cache own all"
  ON public.sherlock_findings_cache
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sherlock_cache_lookup
  ON public.sherlock_findings_cache (user_id, entity_type, entity_id, updated_at DESC);

CREATE TRIGGER trg_sherlock_cache_updated
  BEFORE UPDATE ON public.sherlock_findings_cache
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
