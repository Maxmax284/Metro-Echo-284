
REVOKE EXECUTE ON FUNCTION public.entity_rollup(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.entity_rollup(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.entity_rollup(uuid) TO authenticated;
