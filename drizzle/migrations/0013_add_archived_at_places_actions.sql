ALTER TABLE public.awareness_places ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.actions ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS awareness_places_archived_idx ON public.awareness_places (user_id, archived_at);
CREATE INDEX IF NOT EXISTS actions_archived_idx ON public.actions (user_id, archived_at);