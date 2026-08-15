ALTER TABLE public.nudges
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_nudges_user_org_status
  ON public.nudges(user_id, organization_id, status, priority DESC, created_at DESC);