CREATE TABLE public.telegram_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid NULL,
  chat_id bigint NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  text text NULL,
  update_id bigint NULL,
  kind text NOT NULL DEFAULT 'text',
  filed_as text NULL,
  entity_type text NULL,
  entity_id uuid NULL,
  sent_by text NULL,
  error text NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX telegram_messages_update_uniq ON public.telegram_messages (user_id, update_id) WHERE update_id IS NOT NULL;
CREATE INDEX telegram_messages_user_created ON public.telegram_messages (user_id, created_at DESC);

GRANT SELECT ON public.telegram_messages TO authenticated;
GRANT ALL ON public.telegram_messages TO service_role;

ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own telegram messages"
ON public.telegram_messages
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);