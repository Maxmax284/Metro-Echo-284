create or replace function public.memory_search(
  _user_id uuid,
  _query_embedding vector(1536),
  _match_count int default 12,
  _min_similarity float default 0.5
)
returns table (
  kind text,
  id uuid,
  title text,
  snippet text,
  similarity float,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() <> _user_id then
    raise exception 'not authorized';
  end if;
  return query
  select * from (
    select 'note'::text as kind, n.id, n.title, left(n.body, 240) as snippet,
           1 - (n.embedding <=> _query_embedding) as similarity, n.created_at
    from public.notes n
    where n.user_id = _user_id and n.embedding is not null
    union all
    select 'message'::text, m.id, null::text, left(m.content, 240),
           1 - (m.embedding <=> _query_embedding), m.created_at
    from public.messages m
    where m.user_id = _user_id and m.embedding is not null
    union all
    select 'commitment'::text, c.id, null::text, left(c.summary, 240),
           1 - (c.embedding <=> _query_embedding), c.created_at
    from public.commitments c
    where c.user_id = _user_id and c.embedding is not null
  ) t
  where t.similarity >= _min_similarity
  order by t.similarity desc
  limit _match_count;
end;
$$;

create or replace function public.notes_related(
  _user_id uuid,
  _note_id uuid,
  _match_count int default 8,
  _min_similarity float default 0.6
)
returns table (id uuid, title text, snippet text, similarity float)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() <> _user_id then
    raise exception 'not authorized';
  end if;
  return query
  with src as (
    select embedding from public.notes
    where id = _note_id and user_id = _user_id and embedding is not null
  )
  select n.id, n.title, left(n.body, 200) as snippet,
         1 - (n.embedding <=> (select embedding from src)) as similarity
  from public.notes n, src
  where n.user_id = _user_id
    and n.id <> _note_id
    and n.embedding is not null
    and 1 - (n.embedding <=> src.embedding) >= _min_similarity
  order by similarity desc
  limit _match_count;
end;
$$;