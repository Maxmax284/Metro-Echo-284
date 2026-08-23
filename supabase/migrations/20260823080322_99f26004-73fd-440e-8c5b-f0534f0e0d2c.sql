-- Ask threads: additive fields on the existing conversations table.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_titled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS context_kind text,
  ADD COLUMN IF NOT EXISTS context_id uuid,
  ADD COLUMN IF NOT EXISTS context_label text,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz;

-- Backfill: legacy rolling history becomes a personal legacy thread.
UPDATE public.conversations
   SET title = COALESCE(NULLIF(title, ''), 'Earlier Ask history'),
       auto_titled = true,
       last_message_at = COALESCE(last_message_at, updated_at)
 WHERE last_message_at IS NULL;

CREATE INDEX IF NOT EXISTS conversations_scope_idx
  ON public.conversations(user_id, scope, organization_id, pinned DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS conversations_live_idx
  ON public.conversations(user_id, deleted_at, archived_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;

-- Inbound email scope routing: emails inherit a chosen room instead of always Personal.
ALTER TABLE public.email_inbound_addresses
  ADD COLUMN IF NOT EXISTS default_organization_id uuid,
  ADD COLUMN IF NOT EXISTS default_scope text NOT NULL DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS default_project_id uuid;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_inbound_addresses TO authenticated;
GRANT ALL ON public.email_inbound_addresses TO service_role;