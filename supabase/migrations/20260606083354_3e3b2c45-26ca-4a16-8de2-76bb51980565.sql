CREATE OR REPLACE FUNCTION public.notes_related(_user_id uuid, _note_id uuid, _match_count integer DEFAULT 8, _min_similarity double precision DEFAULT 0.6)
 RETURNS TABLE(id uuid, title text, snippet text, similarity double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null or auth.uid() <> _user_id then
    raise exception 'not authorized';
  end if;
  return query
  with src as (
    select n0.embedding as emb
    from public.notes n0
    where n0.id = _note_id and n0.user_id = _user_id and n0.embedding is not null
  )
  select n.id, n.title, left(n.body, 200) as snippet,
         (1 - (n.embedding <=> src.emb))::double precision as similarity
  from public.notes n, src
  where n.user_id = _user_id
    and n.id <> _note_id
    and n.embedding is not null
    and 1 - (n.embedding <=> src.emb) >= _min_similarity
  order by similarity desc
  limit _match_count;
end;
$function$;