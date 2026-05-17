
create type public.research_status as enum ('pending','running','complete','failed','blocked');
create type public.research_mode as enum ('quick','deep');

create table public.research_objects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  question text not null,
  mode public.research_mode not null default 'quick',
  status public.research_status not null default 'pending',
  summary text,
  error text,
  related_entity_type text,
  related_entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.research_objects enable row level security;

create policy "research_objects own all"
  on public.research_objects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger research_objects_updated_at
before update on public.research_objects
for each row execute function public.set_updated_at();

create index idx_research_objects_user_created on public.research_objects(user_id, created_at desc);

create table public.research_sources (
  id uuid primary key default gen_random_uuid(),
  research_id uuid not null references public.research_objects(id) on delete cascade,
  user_id uuid not null,
  title text,
  url text,
  snippet text,
  provider text,
  relevance numeric,
  position integer,
  created_at timestamptz not null default now()
);

alter table public.research_sources enable row level security;

create policy "research_sources own all"
  on public.research_sources for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_research_sources_research on public.research_sources(research_id, position);
