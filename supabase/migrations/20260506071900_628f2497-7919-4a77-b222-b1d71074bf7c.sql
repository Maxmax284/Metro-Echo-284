
-- ============ Enums ============
create type public.app_role as enum ('admin', 'user');
create type public.action_risk as enum ('low_reversible', 'standard', 'high');
create type public.action_status as enum ('proposed', 'staged', 'approved', 'executed', 'audited', 'rolled_back', 'cancelled');
create type public.commitment_status as enum ('open', 'done', 'cancelled');
create type public.message_role as enum ('user', 'assistant', 'system', 'tool');

-- ============ Profiles ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  timezone text,
  home_geo jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles select own" on public.profiles for select using (auth.uid() = id);
create policy "profiles insert own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles update own" on public.profiles for update using (auth.uid() = id);

-- ============ User Roles ============
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "user_roles select own" on public.user_roles for select using (auth.uid() = user_id);
create policy "user_roles admin all" on public.user_roles for all using (public.has_role(auth.uid(), 'admin'));

-- ============ Auth trigger ============
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Generic updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

-- ============ Conversations + Messages ============
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.conversations enable row level security;
create policy "conv own all" on public.conversations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger set_conversations_updated_at before update on public.conversations for each row execute function public.set_updated_at();

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.message_role not null,
  content text not null default '',
  tool_calls jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;
create policy "msg own all" on public.messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index messages_conv_idx on public.messages(conversation_id, created_at);

-- ============ Notes ============
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  body text not null default '',
  tags text[] not null default '{}',
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.notes enable row level security;
create policy "notes own all" on public.notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger set_notes_updated_at before update on public.notes for each row execute function public.set_updated_at();
create index notes_user_updated_idx on public.notes(user_id, updated_at desc);

create table public.note_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_note uuid not null references public.notes(id) on delete cascade,
  to_note uuid not null references public.notes(id) on delete cascade,
  kind text not null default 'related',
  created_at timestamptz not null default now(),
  unique (from_note, to_note, kind)
);
alter table public.note_links enable row level security;
create policy "note_links own all" on public.note_links for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ Commitments ============
create table public.commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  summary text not null,
  due_at timestamptz,
  source_note uuid references public.notes(id) on delete set null,
  status public.commitment_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.commitments enable row level security;
create policy "commitments own all" on public.commitments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger set_commitments_updated_at before update on public.commitments for each row execute function public.set_updated_at();

-- ============ Actions ============
create table public.actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  payload jsonb not null default '{}'::jsonb,
  risk public.action_risk not null default 'standard',
  status public.action_status not null default 'proposed',
  source text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.actions enable row level security;
create policy "actions own all" on public.actions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger set_actions_updated_at before update on public.actions for each row execute function public.set_updated_at();
create index actions_user_status_idx on public.actions(user_id, status, updated_at desc);

create table public.action_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_id uuid not null references public.actions(id) on delete cascade,
  from_status public.action_status,
  to_status public.action_status not null,
  actor text not null default 'user',
  reason text,
  created_at timestamptz not null default now()
);
alter table public.action_events enable row level security;
create policy "action_events own select" on public.action_events for select using (auth.uid() = user_id);
create policy "action_events own insert" on public.action_events for insert with check (auth.uid() = user_id);

-- ============ Audit log (append-only) ============
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  event text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
create policy "audit own select" on public.audit_log for select using (auth.uid() = user_id);
create policy "audit own insert" on public.audit_log for insert with check (auth.uid() = user_id);
-- intentionally no update/delete policies => append-only
create index audit_user_created_idx on public.audit_log(user_id, created_at desc);

-- ============ Awareness ============
create table public.awareness_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  geo jsonb,
  country text,
  region text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.awareness_places enable row level security;
create policy "places own all" on public.awareness_places for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger set_places_updated_at before update on public.awareness_places for each row execute function public.set_updated_at();

create table public.awareness_briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id uuid not null references public.awareness_places(id) on delete cascade,
  section text not null,
  content text not null,
  sources jsonb,
  confidence text,
  generated_at timestamptz not null default now()
);
alter table public.awareness_briefings enable row level security;
create policy "briefings own all" on public.awareness_briefings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index briefings_place_idx on public.awareness_briefings(place_id, section);

-- ============ Operational state ============
create table public.operational_state_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  inferred_state text not null,
  signals jsonb,
  created_at timestamptz not null default now()
);
alter table public.operational_state_events enable row level security;
create policy "opstate own all" on public.operational_state_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index opstate_user_created_idx on public.operational_state_events(user_id, created_at desc);
