-- ============================================================
-- Stage 6 foundation: organizations + membership + nullable org_id
-- Stage 7 foundation: geohash + gated aggregation thresholds
-- Nothing shared is actually visible yet. RLS stays conservative.
-- ============================================================

-- 1. organizations -------------------------------------------------
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'personal' CHECK (kind IN ('personal','team')),
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. organization_members -----------------------------------------
CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX organization_members_user_idx ON public.organization_members(user_id);
CREATE INDEX organization_members_org_idx  ON public.organization_members(organization_id);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- 3. membership helper (SECURITY DEFINER, no recursion) -----------
CREATE OR REPLACE FUNCTION public.is_org_member(_org_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org_id AND user_id = _user_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO authenticated;

-- 4. RLS for organizations + members ------------------------------
CREATE POLICY "organizations member select"
  ON public.organizations FOR SELECT
  USING (public.is_org_member(id, auth.uid()));

CREATE POLICY "organizations owner insert"
  ON public.organizations FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "organizations owner update"
  ON public.organizations FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "org_members self select"
  ON public.organization_members FOR SELECT
  USING (auth.uid() = user_id OR public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "org_members owner manage"
  ON public.organization_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = organization_members.organization_id AND o.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = organization_members.organization_id AND o.owner_id = auth.uid()
    )
  );

-- 5. Auto-create personal org on signup ---------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
  _display text;
BEGIN
  _display := coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1));

  INSERT INTO public.profiles (id, display_name) VALUES (new.id, _display);
  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'user');
  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'owner');

  INSERT INTO public.organizations (name, kind, owner_id)
    VALUES (_display || '''s space', 'personal', new.id)
    RETURNING id INTO _org_id;
  INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (_org_id, new.id, 'owner');

  RETURN new;
END;
$$;

-- Backfill personal orgs for existing users that don't have one yet
INSERT INTO public.organizations (name, kind, owner_id)
SELECT coalesce(p.display_name, 'Personal') || '''s space', 'personal', p.id
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.organizations o
  WHERE o.owner_id = p.id AND o.kind = 'personal'
);

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT o.id, o.owner_id, 'owner'
FROM public.organizations o
WHERE o.kind = 'personal'
  AND NOT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = o.id AND m.user_id = o.owner_id
  );

-- 6. Additive org_id columns + geohash ----------------------------
ALTER TABLE public.corrections        ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.field_notes        ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.audit_annotations  ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.privacy_settings   ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.field_notes ADD COLUMN geohash text;
CREATE INDEX field_notes_geohash_idx ON public.field_notes(geohash) WHERE geohash IS NOT NULL;

-- 7. Extend RLS to allow org-scope reads (writes still owner-only)
-- Existing "own all" policies stay; we ADD a permissive org-read policy.
CREATE POLICY "corrections org select"
  ON public.corrections FOR SELECT
  USING (
    organization_id IS NOT NULL
    AND scope IN ('org','org_shared')
    AND public.is_org_member(organization_id, auth.uid())
  );

CREATE POLICY "field_notes org select"
  ON public.field_notes FOR SELECT
  USING (
    organization_id IS NOT NULL
    AND share_intent IN ('ask','anonymized_ok')
    AND public.is_org_member(organization_id, auth.uid())
  );

-- 8. Stage 7 gating switches on system_controls -------------------
ALTER TABLE public.system_controls
  ADD COLUMN shared_aggregation_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN shared_min_distinct_users integer NOT NULL DEFAULT 3,
  ADD COLUMN shared_window_days integer NOT NULL DEFAULT 14;

-- 9. Stage 7 candidate evaluator (read-only — does not share anything).
-- Returns the count of distinct users that filed a similar field_note
-- in the same geohash within the window. Threshold check + actual
-- sharing pipeline is intentionally NOT implemented yet.
CREATE OR REPLACE FUNCTION public.shared_candidate_strength(
  _geohash text,
  _note_type text,
  _window_days integer DEFAULT 14
)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT user_id)::int
  FROM public.field_notes
  WHERE geohash = _geohash
    AND note_type = _note_type
    AND status = 'active'
    AND share_intent IN ('ask','anonymized_ok')
    AND created_at >= now() - make_interval(days => _window_days);
$$;

REVOKE EXECUTE ON FUNCTION public.shared_candidate_strength(text, text, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.shared_candidate_strength(text, text, integer) TO authenticated;