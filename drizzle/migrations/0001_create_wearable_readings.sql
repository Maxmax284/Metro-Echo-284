CREATE TABLE public.wearable_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('heart_rate','steps','sleep','workout','stand')),
  value numeric NOT NULL,
  unit text NOT NULL DEFAULT '',
  measured_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'bluetooth' CHECK (source IN ('bluetooth','ingest','manual')),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, measured_at, source)
);

CREATE INDEX idx_wearable_readings_user_measured
  ON public.wearable_readings (user_id, measured_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wearable_readings TO authenticated;
GRANT ALL ON public.wearable_readings TO service_role;

ALTER TABLE public.wearable_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own readings are readable"
ON public.wearable_readings FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid()))
);

CREATE POLICY "Own readings can be written"
ON public.wearable_readings FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Own readings can be updated"
ON public.wearable_readings FOR UPDATE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Own readings can be deleted"
ON public.wearable_readings FOR DELETE TO authenticated
USING (user_id = auth.uid());