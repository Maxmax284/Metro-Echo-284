
create table if not exists public.capture_routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  capture_kind text not null check (capture_kind in ('message','file','field_note','note','other')),
  capture_id text not null,
  source text,
  suggested_route text,
  user_action text not null check (user_action in (
    'accepted','edited','dismissed','archived','attached','ignored',
    'reviewed','snoozed','unsnoozed','routed','undo'
  )),
  previous_status text,
  new_status text,
  sherlock_finding_id uuid,
  audit_event_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists capture_routes_user_created_idx
  on public.capture_routes (user_id, created_at desc);
create index if not exists capture_routes_user_capture_idx
  on public.capture_routes (user_id, capture_kind, capture_id, created_at desc);

alter table public.capture_routes enable row level security;

create policy "capture_routes own select"
  on public.capture_routes for select
  using (auth.uid() = user_id);

create policy "capture_routes own insert"
  on public.capture_routes for insert
  with check (auth.uid() = user_id);
