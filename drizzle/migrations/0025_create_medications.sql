CREATE TABLE public.medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  dose text NOT NULL DEFAULT '',
  /* Local clock times a dose is taken, e.g. {'08:00','20:00'}. */
  times_local text[] NOT NULL DEFAULT '{}'::text[],
  /* 'daily' or 'as_needed'. Kept as text so a new rhythm needs no migration. */
  rhythm text NOT NULL DEFAULT 'daily',
  starts_on date,
  ends_on date,
  active boolean NOT NULL DEFAULT true,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.medications TO authenticated;
GRANT ALL ON public.medications TO service_role;

ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "medications personal all" ON public.medications
  FOR ALL USING (organization_id IS NULL AND auth.uid() = user_id)
  WITH CHECK (organization_id IS NULL AND auth.uid() = user_id);

CREATE POLICY "medications workspace select" ON public.medications
  FOR SELECT USING (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "medications workspace insert" ON public.medications
  FOR INSERT WITH CHECK (organization_id IS NOT NULL AND auth.uid() = user_id AND public.org_role(organization_id, auth.uid()) = ANY (ARRAY['owner_admin','manager','member']));

CREATE POLICY "medications workspace update" ON public.medications
  FOR UPDATE USING (organization_id IS NOT NULL AND (auth.uid() = user_id OR public.org_role(organization_id, auth.uid()) = 'owner_admin'));

CREATE POLICY "medications workspace delete" ON public.medications
  FOR DELETE USING (organization_id IS NOT NULL AND (auth.uid() = user_id OR public.org_role(organization_id, auth.uid()) = 'owner_admin'));

CREATE INDEX medications_user_active_idx ON public.medications (user_id, active);

CREATE TRIGGER medications_set_updated_at BEFORE UPDATE ON public.medications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();