ALTER TABLE public.sherlock_findings
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.sherlock_findings_cache
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS sherlock_findings_scope_idx
  ON public.sherlock_findings (user_id, organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS sherlock_findings_cache_scope_idx
  ON public.sherlock_findings_cache (user_id, organization_id, entity_type, entity_id);

DROP POLICY IF EXISTS "sherlock_findings own all" ON public.sherlock_findings;

CREATE POLICY "sherlock_findings personal all" ON public.sherlock_findings
  FOR ALL TO authenticated
  USING (organization_id IS NULL AND auth.uid() = user_id)
  WITH CHECK (organization_id IS NULL AND auth.uid() = user_id);

CREATE POLICY "sherlock_findings workspace select" ON public.sherlock_findings
  FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "sherlock_findings workspace insert" ON public.sherlock_findings
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IS NOT NULL
    AND public.org_role(organization_id, auth.uid()) = ANY (ARRAY['owner_admin','manager','member'])
    AND auth.uid() = user_id
  );

CREATE POLICY "sherlock_findings workspace update" ON public.sherlock_findings
  FOR UPDATE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND (auth.uid() = user_id OR public.org_role(organization_id, auth.uid()) = 'owner_admin')
  );

CREATE POLICY "sherlock_findings workspace delete" ON public.sherlock_findings
  FOR DELETE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND (auth.uid() = user_id OR public.org_role(organization_id, auth.uid()) = 'owner_admin')
  );

DROP POLICY IF EXISTS "sherlock_cache own all" ON public.sherlock_findings_cache;
DROP POLICY IF EXISTS "sherlock_findings_cache own all" ON public.sherlock_findings_cache;

CREATE POLICY "sherlock_cache personal all" ON public.sherlock_findings_cache
  FOR ALL TO authenticated
  USING (organization_id IS NULL AND auth.uid() = user_id)
  WITH CHECK (organization_id IS NULL AND auth.uid() = user_id);

CREATE POLICY "sherlock_cache workspace select" ON public.sherlock_findings_cache
  FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "sherlock_cache workspace insert" ON public.sherlock_findings_cache
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IS NOT NULL
    AND public.org_role(organization_id, auth.uid()) = ANY (ARRAY['owner_admin','manager','member'])
    AND auth.uid() = user_id
  );

CREATE POLICY "sherlock_cache workspace update" ON public.sherlock_findings_cache
  FOR UPDATE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND (auth.uid() = user_id OR public.org_role(organization_id, auth.uid()) = 'owner_admin')
  );

CREATE POLICY "sherlock_cache workspace delete" ON public.sherlock_findings_cache
  FOR DELETE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND (auth.uid() = user_id OR public.org_role(organization_id, auth.uid()) = 'owner_admin')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sherlock_findings TO authenticated;
GRANT ALL ON public.sherlock_findings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sherlock_findings_cache TO authenticated;
GRANT ALL ON public.sherlock_findings_cache TO service_role;