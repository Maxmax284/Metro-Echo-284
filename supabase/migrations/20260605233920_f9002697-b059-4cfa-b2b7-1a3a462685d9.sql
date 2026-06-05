
CREATE OR REPLACE FUNCTION public.entities_semantic_match(
  _user_id uuid,
  _query_embedding vector,
  _match_count integer DEFAULT 8,
  _min_similarity double precision DEFAULT 0.6,
  _kinds text[] DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  display_name text,
  kind text,
  parent_entity_id uuid,
  slug text,
  similarity double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
  SELECT e.id, e.display_name, e.kind, e.parent_entity_id, e.slug,
         1 - (e.embedding <=> _query_embedding) AS similarity
  FROM public.entities e
  WHERE e.user_id = _user_id
    AND e.embedding IS NOT NULL
    AND (_kinds IS NULL OR e.kind = ANY(_kinds))
    AND 1 - (e.embedding <=> _query_embedding) >= _min_similarity
  ORDER BY similarity DESC
  LIMIT _match_count;
END;
$$;
