-- One trip is one journey: legs in order, with the ground between them.
CREATE TABLE public.journeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journeys TO authenticated;
GRANT ALL ON public.journeys TO service_role;

ALTER TABLE public.journeys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own journeys" ON public.journeys
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid()))
  )
  WITH CHECK (
    user_id = auth.uid()
    AND (organization_id IS NULL OR public.is_org_member(organization_id, auth.uid()))
  );

CREATE TRIGGER journeys_updated_at BEFORE UPDATE ON public.journeys
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- A flight plan can belong to a journey and hold where the leg actually got to.
-- leg_state is derived from the airline's own filing; leg_state_source records
-- whose word it was, so a person can put it back when the airline is wrong.
ALTER TABLE public.flight_plans
  ADD COLUMN IF NOT EXISTS journey_id UUID REFERENCES public.journeys(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS leg_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leg_state TEXT,
  ADD COLUMN IF NOT EXISTS leg_state_source TEXT,
  ADD COLUMN IF NOT EXISTS leg_state_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS leg_state_note TEXT;

CREATE INDEX IF NOT EXISTS flight_plans_journey_idx ON public.flight_plans (journey_id, leg_order);

-- What is inside an airport terminal, cached. No personal data: an airport is an
-- airport for everyone, so every signed-in reader shares one copy and one
-- fetched_at stamp. Writes are server-side only.
CREATE TABLE public.airport_places_cache (
  iata TEXT NOT NULL,
  category TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '[]'::jsonb,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (iata, category)
);

GRANT SELECT ON public.airport_places_cache TO authenticated;
GRANT ALL ON public.airport_places_cache TO service_role;

ALTER TABLE public.airport_places_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signed in readers" ON public.airport_places_cache
  FOR SELECT TO authenticated
  USING (true);