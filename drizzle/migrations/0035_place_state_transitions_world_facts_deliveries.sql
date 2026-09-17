-- Phase 2/3/4 of the world-context pass. Additive only.

-- One role-aware current place per user + scope + role.
CREATE TABLE public.place_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  role text NOT NULL,
  country text,
  region text,
  metro text,
  locality text,
  exact_place_id uuid REFERENCES public.awareness_places(id) ON DELETE SET NULL,
  exact_label text,
  level text NOT NULL DEFAULT 'country',
  confidence text NOT NULL DEFAULT 'thin',
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  conflicts jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text,
  fixed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id, role)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.place_state TO authenticated;
GRANT ALL ON public.place_state TO service_role;
ALTER TABLE public.place_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "place_state readable in scope" ON public.place_state FOR SELECT TO authenticated
USING (
  (organization_id IS NULL AND user_id = auth.uid())
  OR (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid()))
);
CREATE POLICY "place_state written by owner" ON public.place_state FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());
CREATE POLICY "place_state updated by owner" ON public.place_state FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "place_state removed by owner" ON public.place_state FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- Meaningful transitions only. Never a breadcrumb trail.
CREATE TABLE public.place_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL,
  level text NOT NULL,
  from_words text,
  to_words text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence text NOT NULL DEFAULT 'thin',
  at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX place_transitions_user_at_idx ON public.place_transitions (user_id, at DESC);

GRANT SELECT, INSERT, DELETE ON public.place_transitions TO authenticated;
GRANT ALL ON public.place_transitions TO service_role;
ALTER TABLE public.place_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "place_transitions readable in scope" ON public.place_transitions FOR SELECT TO authenticated
USING (
  (organization_id IS NULL AND user_id = auth.uid())
  OR (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid()))
);
CREATE POLICY "place_transitions written by owner" ON public.place_transitions FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());
CREATE POLICY "place_transitions removed by owner" ON public.place_transitions FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- Practical world facts with provenance. Shared reference data, read-only to users.
CREATE TABLE public.world_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  country text NOT NULL,
  region text,
  value text NOT NULL,
  source text NOT NULL,
  authority text NOT NULL DEFAULT 'public',
  checked_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (topic, country, region, source)
);

CREATE INDEX world_facts_country_idx ON public.world_facts (country, region);

GRANT SELECT ON public.world_facts TO authenticated;
GRANT ALL ON public.world_facts TO service_role;
ALTER TABLE public.world_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "world_facts readable when signed in" ON public.world_facts FOR SELECT TO authenticated
USING (true);

-- One event, one delivery. The dedupe ledger and the delivery receipt.
CREATE TABLE public.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  situation_kind text NOT NULL,
  situation_id text NOT NULL,
  dedupe_key text NOT NULL,
  surface text NOT NULL,
  urgency text NOT NULL,
  sensitivity text NOT NULL DEFAULT 'ordinary',
  because text,
  headline text,
  status text NOT NULL DEFAULT 'sent',
  failure text,
  acted_status text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX deliveries_dedupe_idx ON public.deliveries (user_id, dedupe_key, surface);
CREATE INDEX deliveries_user_sent_idx ON public.deliveries (user_id, sent_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.deliveries TO authenticated;
GRANT ALL ON public.deliveries TO service_role;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deliveries readable in scope" ON public.deliveries FOR SELECT TO authenticated
USING (
  (organization_id IS NULL AND user_id = auth.uid())
  OR (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid()))
);
CREATE POLICY "deliveries written by owner" ON public.deliveries FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());
CREATE POLICY "deliveries updated by owner" ON public.deliveries FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
