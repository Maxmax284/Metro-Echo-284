-- Belt and braces on bank_links: the access token column is never granted to any
-- client role, and workspace visibility of a link is limited to admins/managers.

REVOKE ALL ON public.bank_links FROM authenticated;
GRANT SELECT (id, user_id, organization_id, item_id, institution_name, last_read_at, active, created_at, updated_at)
  ON public.bank_links TO authenticated;
GRANT DELETE ON public.bank_links TO authenticated;
GRANT ALL ON public.bank_links TO service_role;

-- Workspace links: only owner_admin and manager may see that a bank is linked.
DROP POLICY IF EXISTS "workspace bank links readable by members" ON public.bank_links;
CREATE POLICY "workspace bank links readable by admins"
  ON public.bank_links FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND public.org_role(organization_id, auth.uid()) IN ('owner_admin', 'manager')
  );
