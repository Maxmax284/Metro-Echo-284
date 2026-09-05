CREATE TABLE IF NOT EXISTS public.object_cadence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL,
  object_id UUID NOT NULL,
  window_days INTEGER NOT NULL DEFAULT 90,
  samples INTEGER NOT NULL DEFAULT 0,
  median_gap_days NUMERIC NOT NULL DEFAULT 0,
  last_event_at TIMESTAMPTZ,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS object_cadence_unique
  ON public.object_cadence (user_id, object_type, object_id, window_days);
CREATE INDEX IF NOT EXISTS object_cadence_scope ON public.object_cadence (user_id, organization_id);

GRANT SELECT ON public.object_cadence TO authenticated;
GRANT ALL ON public.object_cadence TO service_role;

ALTER TABLE public.object_cadence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own cadence"
  ON public.object_cadence FOR SELECT TO authenticated
  USING (auth.uid() = user_id);