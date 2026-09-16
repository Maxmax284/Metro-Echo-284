alter table public.flight_plans
  add column if not exists origin_kind text not null default 'desk',
  add column if not exists ownership text not null default 'mine',
  add column if not exists traveller_name text,
  add column if not exists booking_ref text,
  add column if not exists noticed_from jsonb,
  add column if not exists live_status jsonb,
  add column if not exists live_checked_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'flight_plans_origin_kind_ck') then
    alter table public.flight_plans
      add constraint flight_plans_origin_kind_ck check (origin_kind in ('desk', 'recognised'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'flight_plans_ownership_ck') then
    alter table public.flight_plans
      add constraint flight_plans_ownership_ck
      check (ownership in ('unknown', 'mine', 'mine_too', 'theirs', 'not_mine'));
  end if;
end $$;

create index if not exists flight_plans_ownership_idx
  on public.flight_plans (user_id, ownership, depart_on);

create table if not exists public.flight_senders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  sender_key text not null,
  sender_name text,
  ownership text not null default 'theirs',
  times_seen integer not null default 1,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint flight_senders_ownership_ck check (ownership in ('mine', 'mine_too', 'theirs', 'not_mine'))
);

grant select, insert, update, delete on public.flight_senders to authenticated;
grant all on public.flight_senders to service_role;

alter table public.flight_senders enable row level security;

create unique index if not exists flight_senders_key_idx
  on public.flight_senders (
    user_id,
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    sender_key
  );

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'flight_senders' and policyname = 'own senders') then
    create policy "own senders" on public.flight_senders
      for all to authenticated
      using (
        user_id = auth.uid()
        and (organization_id is null or public.is_org_member(organization_id, auth.uid()))
      )
      with check (
        user_id = auth.uid()
        and (organization_id is null or public.is_org_member(organization_id, auth.uid()))
      );
  end if;
end $$;