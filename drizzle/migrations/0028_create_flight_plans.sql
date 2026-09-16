CREATE TABLE public.flight_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  origin text NOT NULL,
  destination text NOT NULL,
  depart_on date NOT NULL,
  return_on date,
  passengers integer NOT NULL DEFAULT 1,
  currency text,
  source text NOT NULL DEFAULT 'entered',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  chosen_option_id text,
  status text NOT NULL DEFAULT 'prepared',
  event_ids text[] NOT NULL DEFAULT '{}',
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.flight_plans TO authenticated;
GRANT ALL ON public.flight_plans TO service_role;

ALTER TABLE public.flight_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own personal flight plans"
ON public.flight_plans FOR ALL TO authenticated
USING (auth.uid() = user_id AND organization_id IS NULL)
WITH CHECK (auth.uid() = user_id AND organization_id IS NULL);

CREATE POLICY "workspace members read flight plans"
ON public.flight_plans FOR SELECT TO authenticated
USING (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "workspace members prepare flight plans"
ON public.flight_plans FOR INSERT TO authenticated
WITH CHECK (
  organization_id IS NOT NULL
  AND auth.uid() = user_id
  AND public.org_role(organization_id, auth.uid()) IN ('owner_admin', 'manager', 'member')
);

CREATE POLICY "workspace managers settle flight plans"
ON public.flight_plans FOR UPDATE TO authenticated
USING (organization_id IS NOT NULL AND public.org_role(organization_id, auth.uid()) IN ('owner_admin', 'manager'))
WITH CHECK (organization_id IS NOT NULL AND public.org_role(organization_id, auth.uid()) IN ('owner_admin', 'manager'));

CREATE POLICY "workspace admins remove flight plans"
ON public.flight_plans FOR DELETE TO authenticated
USING (organization_id IS NOT NULL AND public.org_role(organization_id, auth.uid()) = 'owner_admin');

CREATE TRIGGER flight_plans_set_updated_at
BEFORE UPDATE ON public.flight_plans
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX flight_plans_user_depart_idx ON public.flight_plans (user_id, depart_on DESC);