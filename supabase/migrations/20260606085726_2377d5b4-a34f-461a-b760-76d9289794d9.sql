
-- =========================
-- projects
-- =========================
CREATE TABLE public.projects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  title           text NOT NULL,
  summary         text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'active',
  pinned          boolean NOT NULL DEFAULT false,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_status_check CHECK (status IN ('active','paused','archived'))
);

CREATE INDEX idx_projects_user_updated ON public.projects (user_id, updated_at DESC);
CREATE INDEX idx_projects_org_updated  ON public.projects (organization_id, updated_at DESC) WHERE organization_id IS NOT NULL;
CREATE INDEX idx_projects_pinned       ON public.projects (user_id, pinned, updated_at DESC) WHERE pinned = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Personal scope: owner only
CREATE POLICY "projects personal read"
  ON public.projects FOR SELECT TO authenticated
  USING (organization_id IS NULL AND auth.uid() = user_id);

CREATE POLICY "projects personal write"
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NULL AND auth.uid() = user_id);

CREATE POLICY "projects personal update"
  ON public.projects FOR UPDATE TO authenticated
  USING (organization_id IS NULL AND auth.uid() = user_id)
  WITH CHECK (organization_id IS NULL AND auth.uid() = user_id);

CREATE POLICY "projects personal delete"
  ON public.projects FOR DELETE TO authenticated
  USING (organization_id IS NULL AND auth.uid() = user_id);

-- Workspace scope: any active member can read; creator or org admins can mutate
CREATE POLICY "projects workspace read"
  ON public.projects FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "projects workspace insert"
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IS NOT NULL
    AND auth.uid() = user_id
    AND public.is_org_member(organization_id, auth.uid())
  );

CREATE POLICY "projects workspace update"
  ON public.projects FOR UPDATE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND (
      auth.uid() = user_id
      OR public.org_role(organization_id, auth.uid()) IN ('owner_admin','manager')
    )
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND (
      auth.uid() = user_id
      OR public.org_role(organization_id, auth.uid()) IN ('owner_admin','manager')
    )
  );

CREATE POLICY "projects workspace delete"
  ON public.projects FOR DELETE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND (
      auth.uid() = user_id
      OR public.org_role(organization_id, auth.uid()) IN ('owner_admin','manager')
    )
  );

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- project_items
-- =========================
CREATE TABLE public.project_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  item_type   text NOT NULL,
  item_id     uuid NOT NULL,
  added_by    uuid NOT NULL,
  position    integer NOT NULL DEFAULT 0,
  note        text,
  added_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_items_type_check CHECK (
    item_type IN ('capture','note','file','finding','commitment','action')
  ),
  CONSTRAINT project_items_unique UNIQUE (project_id, item_type, item_id)
);

CREATE INDEX idx_project_items_project ON public.project_items (project_id, position, added_at DESC);
CREATE INDEX idx_project_items_target  ON public.project_items (item_type, item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_items TO authenticated;
GRANT ALL ON public.project_items TO service_role;

ALTER TABLE public.project_items ENABLE ROW LEVEL SECURITY;

-- Read: anyone who can read the parent project
CREATE POLICY "project_items read"
  ON public.project_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_items.project_id
        AND (
          (p.organization_id IS NULL AND p.user_id = auth.uid())
          OR (p.organization_id IS NOT NULL AND public.is_org_member(p.organization_id, auth.uid()))
        )
    )
  );

-- Insert: anyone who can read the project; must stamp added_by = self
CREATE POLICY "project_items insert"
  ON public.project_items FOR INSERT TO authenticated
  WITH CHECK (
    added_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_items.project_id
        AND (
          (p.organization_id IS NULL AND p.user_id = auth.uid())
          OR (p.organization_id IS NOT NULL AND public.is_org_member(p.organization_id, auth.uid()))
        )
    )
  );

-- Update / delete: the person who attached it, the project owner, or workspace admins/managers
CREATE POLICY "project_items update"
  ON public.project_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_items.project_id
        AND (
          project_items.added_by = auth.uid()
          OR p.user_id = auth.uid()
          OR (p.organization_id IS NOT NULL
              AND public.org_role(p.organization_id, auth.uid()) IN ('owner_admin','manager'))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_items.project_id
        AND (
          project_items.added_by = auth.uid()
          OR p.user_id = auth.uid()
          OR (p.organization_id IS NOT NULL
              AND public.org_role(p.organization_id, auth.uid()) IN ('owner_admin','manager'))
        )
    )
  );

CREATE POLICY "project_items delete"
  ON public.project_items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_items.project_id
        AND (
          project_items.added_by = auth.uid()
          OR p.user_id = auth.uid()
          OR (p.organization_id IS NOT NULL
              AND public.org_role(p.organization_id, auth.uid()) IN ('owner_admin','manager'))
        )
    )
  );
