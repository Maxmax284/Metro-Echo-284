-- Extensions
create extension if not exists vector;
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Embedding columns (768 dims = gemini text-embedding-004 / many open models; we'll use 1536 for OpenAI compat via Lovable AI)
-- Using 1536 to match OpenAI ada/3-small dimensions
alter table public.notes        add column if not exists embedding vector(1536);
alter table public.messages     add column if not exists embedding vector(1536);
alter table public.commitments  add column if not exists embedding vector(1536);

-- Commitment reminder fields
alter table public.commitments add column if not exists remind_at timestamptz;
alter table public.commitments add column if not exists last_reminded_at timestamptz;
alter table public.commitments add column if not exists priority text not null default 'normal';

-- Autolink suggestions cache on notes
alter table public.notes add column if not exists autolink_suggestions jsonb default '[]'::jsonb;

-- Indexes for vector similarity (ivfflat)
create index if not exists notes_embedding_idx       on public.notes       using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index if not exists messages_embedding_idx    on public.messages    using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index if not exists commitments_embedding_idx on public.commitments using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Reminder scheduling index
create index if not exists commitments_remind_idx on public.commitments (remind_at) where status = 'open';

-- Semantic search across user's memory
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
language sql
stable
security definer
set search_path = public
as $$
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
$$;

-- Find related notes for a given note (excludes self)
create or replace function public.notes_related(
  _user_id uuid,
  _note_id uuid,
  _match_count int default 8,
  _min_similarity float default 0.6
)
returns table (id uuid, title text, snippet text, similarity float)
language sql
stable
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.memory_search(uuid, vector, int, float) from public;
revoke all on function public.notes_related(uuid, uuid, int, float) from public;
grant execute on function public.memory_search(uuid, vector, int, float) to authenticated;
grant execute on function public.notes_related(uuid, uuid, int, float) to authenticated;