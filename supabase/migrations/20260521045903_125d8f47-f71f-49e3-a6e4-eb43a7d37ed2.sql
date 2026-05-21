ALTER TABLE public.entity_relations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'accepted',
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'user';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'entity_relations_status_check'
  ) THEN
    ALTER TABLE public.entity_relations
      ADD CONSTRAINT entity_relations_status_check
      CHECK (status IN ('accepted','suggested','dismissed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS entity_relations_user_status_idx
  ON public.entity_relations (user_id, status);
