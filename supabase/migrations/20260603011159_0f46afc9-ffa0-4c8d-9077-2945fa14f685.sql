
-- Drop existing legacy role check constraint that blocks the new role names
ALTER TABLE public.organization_members DROP CONSTRAINT IF EXISTS organization_members_role_check;

-- =============================================================
-- 1. organizations: type + slug
-- =============================================================
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS slug text;
UPDATE public.organizations SET type = COALESCE(type, kind, 'personal') WHERE type IS NULL;
ALTER TABLE public.organizations ALTER COLUMN type SET DEFAULT 'personal';
ALTER TABLE public.organizations ALTER COLUMN type SET NOT NULL;
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_type_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_type_check
  CHECK (type IN ('personal','business','property_ops','gym_ops','security_ops','admin_system'));

UPDATE public.organizations
SET slug = lower(regexp_replace(coalesce(name,'workspace') || '-' || substr(id::text,1,8), '[^a-z0-9]+','-','g'))
WHERE slug IS NULL;
ALTER TABLE public.organizations ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_slug_unique;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_slug_unique UNIQUE (slug);

-- =============================================================
-- 2. organization_members: migrate values, then add new constraints
-- =============================================================
UPDATE public.organization_members SET role = 'owner_admin' WHERE role IN ('owner','admin');
UPDATE public.organization_members SET role = 'member'      WHERE role NOT IN ('owner_admin','manager','member','viewer');

ALTER TABLE public.organization_members ADD COLUMN IF NOT EXISTS status      text NOT NULL DEFAULT 'active';
ALTER TABLE public.organization_members ADD COLUMN IF NOT EXISTS invited_by  uuid;
ALTER TABLE public.organization_members ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
ALTER TABLE public.organization_members ADD COLUMN IF NOT EXISTS removed_at  timestamptz;
ALTER TABLE public.organization_members ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_role_check
  CHECK (role IN ('owner_admin','manager','member','viewer'));

ALTER TABLE public.organization_members DROP CONSTRAINT IF EXISTS organization_members_status_check;
ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_status_check
  CHECK (status IN ('active','suspended','removed'));

UPDATE public.organization_members SET accepted_at = COALESCE(accepted_at, created_at);

-- =============================================================
-- 3. Helpers
-- =============================================================
CREATE OR REPLACE FUNCTION public.org_role(_org_id uuid, _user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.organization_members
  WHERE organization_id = _org_id AND user_id = _user_id AND status = 'active'
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(_org_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org_id AND user_id = _user_id AND status = 'active'
  );
$$;

-- =============================================================
-- 4. handle_new_user
-- =============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org_id uuid;
  _display text;
  _slug text;
BEGIN
  _display := coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1));
  _slug := lower(regexp_replace(_display || '-' || substr(new.id::text,1,8), '[^a-z0-9]+','-','g'));

  INSERT INTO public.profiles (id, display_name) VALUES (new.id, _display);
  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'user');
  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'owner');

  INSERT INTO public.organizations (name, kind, type, slug, owner_id)
    VALUES (_display || '''s space', 'personal', 'personal', _slug, new.id)
    RETURNING id INTO _org_id;
  INSERT INTO public.organization_members (organization_id, user_id, role, status, accepted_at)
    VALUES (_org_id, new.id, 'owner_admin', 'active', now());

  RETURN new;
END;
$$;

-- =============================================================
-- 5. user_channel_links
-- =============================================================
CREATE TABLE IF NOT EXISTS public.user_channel_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('telegram','whatsapp','email')),
  provider_user_id text,
  external_channel_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disconnected','pending')),
  default_route text NOT NULL DEFAULT 'personal',
  organization_id uuid,
  linked_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel, external_channel_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_channel_links TO authenticated;
GRANT ALL ON public.user_channel_links TO service_role;

ALTER TABLE public.user_channel_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "channel_links own all" ON public.user_channel_links;
CREATE POLICY "channel_links own all" ON public.user_channel_links
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS user_channel_links_updated_at ON public.user_channel_links;
CREATE TRIGGER user_channel_links_updated_at
  BEFORE UPDATE ON public.user_channel_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_user_channel_links_user ON public.user_channel_links(user_id, channel);
CREATE INDEX IF NOT EXISTS idx_user_channel_links_external ON public.user_channel_links(channel, external_channel_id);

-- =============================================================
-- 6. organization_id on capture-side tables + indexes
-- =============================================================
ALTER TABLE public.messages       ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.capture_routes ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ingested_files ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.notes          ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.commitments    ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.actions        ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.audit_log      ADD COLUMN IF NOT EXISTS organization_id uuid;

CREATE INDEX IF NOT EXISTS idx_messages_org       ON public.messages(organization_id, created_at DESC)       WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_capture_routes_org ON public.capture_routes(organization_id, created_at DESC) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ingested_files_org ON public.ingested_files(organization_id, created_at DESC) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notes_org          ON public.notes(organization_id, created_at DESC)          WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commitments_org    ON public.commitments(organization_id, created_at DESC)    WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_actions_org        ON public.actions(organization_id, created_at DESC)        WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_org      ON public.audit_log(organization_id, created_at DESC)      WHERE organization_id IS NOT NULL;

-- =============================================================
-- 7. Scope-aware RLS
-- =============================================================
-- messages
DROP POLICY IF EXISTS "msg own all" ON public.messages;
DROP POLICY IF EXISTS "messages personal all" ON public.messages;
DROP POLICY IF EXISTS "messages workspace select" ON public.messages;
DROP POLICY IF EXISTS "messages workspace insert" ON public.messages;
DROP POLICY IF EXISTS "messages workspace update" ON public.messages;
DROP POLICY IF EXISTS "messages workspace delete" ON public.messages;
CREATE POLICY "messages personal all" ON public.messages FOR ALL TO authenticated
  USING (organization_id IS NULL AND auth.uid() = user_id)
  WITH CHECK (organization_id IS NULL AND auth.uid() = user_id);
CREATE POLICY "messages workspace select" ON public.messages FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "messages workspace insert" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NOT NULL
              AND public.org_role(organization_id, auth.uid()) IN ('owner_admin','manager','member')
              AND auth.uid() = user_id);
CREATE POLICY "messages workspace update" ON public.messages FOR UPDATE TO authenticated
  USING (organization_id IS NOT NULL
         AND (auth.uid() = user_id OR public.org_role(organization_id, auth.uid()) = 'owner_admin'));
CREATE POLICY "messages workspace delete" ON public.messages FOR DELETE TO authenticated
  USING (organization_id IS NOT NULL
         AND (auth.uid() = user_id OR public.org_role(organization_id, auth.uid()) = 'owner_admin'));

-- capture_routes
DROP POLICY IF EXISTS "capture_routes own insert" ON public.capture_routes;
DROP POLICY IF EXISTS "capture_routes own select" ON public.capture_routes;
DROP POLICY IF EXISTS "capture_routes personal select" ON public.capture_routes;
DROP POLICY IF EXISTS "capture_routes personal insert" ON public.capture_routes;
DROP POLICY IF EXISTS "capture_routes workspace select" ON public.capture_routes;
DROP POLICY IF EXISTS "capture_routes workspace insert" ON public.capture_routes;
CREATE POLICY "capture_routes personal select" ON public.capture_routes FOR SELECT TO authenticated
  USING (organization_id IS NULL AND auth.uid() = user_id);
CREATE POLICY "capture_routes personal insert" ON public.capture_routes FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NULL AND auth.uid() = user_id);
CREATE POLICY "capture_routes workspace select" ON public.capture_routes FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "capture_routes workspace insert" ON public.capture_routes FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NOT NULL
              AND public.org_role(organization_id, auth.uid()) IN ('owner_admin','manager','member')
              AND auth.uid() = user_id);

-- ingested_files
DROP POLICY IF EXISTS "ingested_files own all" ON public.ingested_files;
DROP POLICY IF EXISTS "ingested_files personal all" ON public.ingested_files;
DROP POLICY IF EXISTS "ingested_files workspace select" ON public.ingested_files;
DROP POLICY IF EXISTS "ingested_files workspace insert" ON public.ingested_files;
DROP POLICY IF EXISTS "ingested_files workspace update" ON public.ingested_files;
DROP POLICY IF EXISTS "ingested_files workspace delete" ON public.ingested_files;
CREATE POLICY "ingested_files personal all" ON public.ingested_files FOR ALL TO authenticated
  USING (organization_id IS NULL AND auth.uid() = user_id)
  WITH CHECK (organization_id IS NULL AND auth.uid() = user_id);
CREATE POLICY "ingested_files workspace select" ON public.ingested_files FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "ingested_files workspace insert" ON public.ingested_files FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NOT NULL
              AND public.org_role(organization_id, auth.uid()) IN ('owner_admin','manager','member')
              AND auth.uid() = user_id);
CREATE POLICY "ingested_files workspace update" ON public.ingested_files FOR UPDATE TO authenticated
  USING (organization_id IS NOT NULL
         AND (auth.uid() = user_id OR public.org_role(organization_id, auth.uid()) = 'owner_admin'));
CREATE POLICY "ingested_files workspace delete" ON public.ingested_files FOR DELETE TO authenticated
  USING (organization_id IS NOT NULL
         AND (auth.uid() = user_id OR public.org_role(organization_id, auth.uid()) = 'owner_admin'));

-- notes
DROP POLICY IF EXISTS "notes own all" ON public.notes;
DROP POLICY IF EXISTS "notes personal all" ON public.notes;
DROP POLICY IF EXISTS "notes workspace select" ON public.notes;
DROP POLICY IF EXISTS "notes workspace insert" ON public.notes;
DROP POLICY IF EXISTS "notes workspace update" ON public.notes;
DROP POLICY IF EXISTS "notes workspace delete" ON public.notes;
CREATE POLICY "notes personal all" ON public.notes FOR ALL TO authenticated
  USING (organization_id IS NULL AND auth.uid() = user_id)
  WITH CHECK (organization_id IS NULL AND auth.uid() = user_id);
CREATE POLICY "notes workspace select" ON public.notes FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "notes workspace insert" ON public.notes FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NOT NULL
              AND public.org_role(organization_id, auth.uid()) IN ('owner_admin','manager','member')
              AND auth.uid() = user_id);
CREATE POLICY "notes workspace update" ON public.notes FOR UPDATE TO authenticated
  USING (organization_id IS NOT NULL
         AND (auth.uid() = user_id OR public.org_role(organization_id, auth.uid()) = 'owner_admin'));
CREATE POLICY "notes workspace delete" ON public.notes FOR DELETE TO authenticated
  USING (organization_id IS NOT NULL
         AND (auth.uid() = user_id OR public.org_role(organization_id, auth.uid()) = 'owner_admin'));

-- commitments
DROP POLICY IF EXISTS "commitments own all" ON public.commitments;
DROP POLICY IF EXISTS "commitments personal all" ON public.commitments;
DROP POLICY IF EXISTS "commitments workspace select" ON public.commitments;
DROP POLICY IF EXISTS "commitments workspace insert" ON public.commitments;
DROP POLICY IF EXISTS "commitments workspace update" ON public.commitments;
DROP POLICY IF EXISTS "commitments workspace delete" ON public.commitments;
CREATE POLICY "commitments personal all" ON public.commitments FOR ALL TO authenticated
  USING (organization_id IS NULL AND auth.uid() = user_id)
  WITH CHECK (organization_id IS NULL AND auth.uid() = user_id);
CREATE POLICY "commitments workspace select" ON public.commitments FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "commitments workspace insert" ON public.commitments FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NOT NULL
              AND public.org_role(organization_id, auth.uid()) IN ('owner_admin','manager','member')
              AND auth.uid() = user_id);
CREATE POLICY "commitments workspace update" ON public.commitments FOR UPDATE TO authenticated
  USING (organization_id IS NOT NULL
         AND (auth.uid() = user_id OR public.org_role(organization_id, auth.uid()) IN ('owner_admin','manager')));
CREATE POLICY "commitments workspace delete" ON public.commitments FOR DELETE TO authenticated
  USING (organization_id IS NOT NULL
         AND (auth.uid() = user_id OR public.org_role(organization_id, auth.uid()) = 'owner_admin'));

-- actions
DROP POLICY IF EXISTS "actions own all" ON public.actions;
DROP POLICY IF EXISTS "actions personal all" ON public.actions;
DROP POLICY IF EXISTS "actions workspace select" ON public.actions;
DROP POLICY IF EXISTS "actions workspace insert" ON public.actions;
DROP POLICY IF EXISTS "actions workspace update" ON public.actions;
DROP POLICY IF EXISTS "actions workspace delete" ON public.actions;
CREATE POLICY "actions personal all" ON public.actions FOR ALL TO authenticated
  USING (organization_id IS NULL AND auth.uid() = user_id)
  WITH CHECK (organization_id IS NULL AND auth.uid() = user_id);
CREATE POLICY "actions workspace select" ON public.actions FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "actions workspace insert" ON public.actions FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NOT NULL
              AND public.org_role(organization_id, auth.uid()) IN ('owner_admin','manager','member')
              AND auth.uid() = user_id);
CREATE POLICY "actions workspace update" ON public.actions FOR UPDATE TO authenticated
  USING (organization_id IS NOT NULL
         AND (auth.uid() = user_id OR public.org_role(organization_id, auth.uid()) IN ('owner_admin','manager')));
CREATE POLICY "actions workspace delete" ON public.actions FOR DELETE TO authenticated
  USING (organization_id IS NOT NULL
         AND (auth.uid() = user_id OR public.org_role(organization_id, auth.uid()) = 'owner_admin'));

-- audit_log
DROP POLICY IF EXISTS "audit own insert" ON public.audit_log;
DROP POLICY IF EXISTS "audit own select" ON public.audit_log;
DROP POLICY IF EXISTS "audit personal select" ON public.audit_log;
DROP POLICY IF EXISTS "audit personal insert" ON public.audit_log;
DROP POLICY IF EXISTS "audit workspace select" ON public.audit_log;
DROP POLICY IF EXISTS "audit workspace insert" ON public.audit_log;
CREATE POLICY "audit personal select" ON public.audit_log FOR SELECT TO authenticated
  USING (organization_id IS NULL AND auth.uid() = user_id);
CREATE POLICY "audit personal insert" ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NULL AND auth.uid() = user_id);
CREATE POLICY "audit workspace select" ON public.audit_log FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "audit workspace insert" ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NOT NULL
              AND public.is_org_member(organization_id, auth.uid())
              AND auth.uid() = user_id);
