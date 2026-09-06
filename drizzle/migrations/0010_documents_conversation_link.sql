alter table public.documents
  add column if not exists conversation_id uuid references public.conversations(id) on delete set null;

create index if not exists documents_conversation_id_idx
  on public.documents (conversation_id)
  where conversation_id is not null;