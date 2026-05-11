-- ingested_files
create table public.ingested_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  filename text not null,
  mime_type text,
  size_bytes bigint,
  storage_path text,
  source text not null default 'upload',
  status text not null default 'pending',
  note_id uuid,
  error text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ingested_files enable row level security;
create policy "ingested_files own all" on public.ingested_files for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger ingested_files_set_updated_at before update on public.ingested_files for each row execute function public.set_updated_at();
create index idx_ingested_files_user on public.ingested_files(user_id, created_at desc);

-- email_inbound_addresses
create table public.email_inbound_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  slug text not null unique,
  active boolean not null default true,
  last_received_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.email_inbound_addresses enable row level security;
create policy "email_inbound own all" on public.email_inbound_addresses for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- storage bucket
insert into storage.buckets (id, name, public) values ('memory-uploads', 'memory-uploads', false)
on conflict (id) do nothing;

create policy "memory-uploads own select" on storage.objects for select
  using (bucket_id = 'memory-uploads' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "memory-uploads own insert" on storage.objects for insert
  with check (bucket_id = 'memory-uploads' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "memory-uploads own update" on storage.objects for update
  using (bucket_id = 'memory-uploads' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "memory-uploads own delete" on storage.objects for delete
  using (bucket_id = 'memory-uploads' and auth.uid()::text = (storage.foldername(name))[1]);