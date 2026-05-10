
create table public.telegram_chat_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  chat_id bigint not null unique,
  tg_username text,
  linked_at timestamptz not null default now()
);
alter table public.telegram_chat_links enable row level security;
create policy "tg_links own all" on public.telegram_chat_links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_tg_links_user on public.telegram_chat_links(user_id);

create table public.telegram_link_codes (
  code text primary key,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  used_at timestamptz
);
alter table public.telegram_link_codes enable row level security;
create policy "tg_codes own all" on public.telegram_link_codes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
