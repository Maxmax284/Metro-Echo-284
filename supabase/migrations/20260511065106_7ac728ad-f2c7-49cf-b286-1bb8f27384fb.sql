-- rate limits (server-side, durable)
create table public.rate_limit_buckets (
  user_id uuid not null,
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (user_id, bucket, window_start)
);
alter table public.rate_limit_buckets enable row level security;
-- no client policies; only service_role / SECURITY DEFINER fn touches it

create or replace function public.rate_limit_hit(
  _user_id uuid, _bucket text, _limit integer, _window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  win timestamptz;
  current_count integer;
begin
  win := date_trunc('second', now()) - make_interval(secs => extract(epoch from now())::int % _window_seconds);
  insert into public.rate_limit_buckets (user_id, bucket, window_start, count)
    values (_user_id, _bucket, win, 1)
  on conflict (user_id, bucket, window_start)
    do update set count = public.rate_limit_buckets.count + 1
  returning count into current_count;
  -- best-effort cleanup of old buckets for this user/bucket
  delete from public.rate_limit_buckets
    where user_id = _user_id and bucket = _bucket and window_start < now() - interval '1 hour';
  return current_count <= _limit;
end;
$$;
revoke execute on function public.rate_limit_hit(uuid, text, integer, integer) from public, anon, authenticated;

-- action retries
create table public.action_retries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  action_id uuid not null,
  attempt integer not null default 1,
  next_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
alter table public.action_retries enable row level security;
create policy "action_retries own select" on public.action_retries for select using (auth.uid() = user_id);
create index idx_action_retries_action on public.action_retries(action_id, created_at desc);

-- perf indexes
create index if not exists idx_notes_user_created on public.notes(user_id, created_at desc);
create index if not exists idx_messages_conv_created on public.messages(conversation_id, created_at);
create index if not exists idx_commitments_user_due on public.commitments(user_id, due_at) where status = 'open';
create index if not exists idx_actions_user_status on public.actions(user_id, status, updated_at desc);
create index if not exists idx_nudges_user_status on public.nudges(user_id, status, priority desc, created_at desc);
create index if not exists idx_audit_user_created on public.audit_log(user_id, created_at desc);
create index if not exists idx_action_events_action on public.action_events(action_id, created_at desc);