
do $$ begin
  create type public.app_mode as enum ('locked', 'observer', 'advisor', 'operator');
exception when duplicate_object then null; end $$;

create table if not exists public.user_modes (
  user_id uuid primary key,
  mode public.app_mode not null default 'advisor',
  updated_at timestamptz not null default now()
);

alter table public.user_modes enable row level security;

drop policy if exists "user_modes own select" on public.user_modes;
create policy "user_modes own select" on public.user_modes
  for select using (auth.uid() = user_id);

drop policy if exists "user_modes own insert" on public.user_modes;
create policy "user_modes own insert" on public.user_modes
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_modes own update" on public.user_modes;
create policy "user_modes own update" on public.user_modes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace trigger user_modes_set_updated_at
  before update on public.user_modes
  for each row execute function public.set_updated_at();
