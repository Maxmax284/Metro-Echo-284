DROP POLICY IF EXISTS "conv own all" ON public.conversations;

CREATE POLICY "conversations scope aware"
ON public.conversations
FOR ALL
TO authenticated
USING (
  user_id = auth.uid()
  AND (
    organization_id IS NULL
    OR public.is_org_member(organization_id, auth.uid())
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND (
    organization_id IS NULL
    OR public.is_org_member(organization_id, auth.uid())
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;