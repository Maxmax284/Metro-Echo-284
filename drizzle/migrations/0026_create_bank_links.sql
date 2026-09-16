-- A bank link is a recorded consent to read, nothing more.
-- The access token is server-only: no client role can select that column.
CREATE TABLE public.bank_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  access_token text NOT NULL,
  institution_name text,
  accounts jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_read_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)
);

-- Column-level grants: the app may see which bank is linked, never the token.
GRANT SELECT (id, user_id, organization_id, item_id, institution_name, accounts, last_read_at, active, created_at, updated_at)
  ON public.bank_links TO authenticated;
GRANT DELETE ON public.bank_links TO authenticated;
GRANT ALL ON public.bank_links TO service_role;

ALTER TABLE public.bank_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own personal bank links"
  ON public.bank_links FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND organization_id IS NULL);

CREATE POLICY "workspace bank links readable by members"
  ON public.bank_links FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "unlink own bank link"
  ON public.bank_links FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER bank_links_set_updated_at
  BEFORE UPDATE ON public.bank_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
