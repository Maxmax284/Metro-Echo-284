
ALTER TABLE public.entities DROP CONSTRAINT IF EXISTS entities_kind_check;
ALTER TABLE public.entities ADD CONSTRAINT entities_kind_check
  CHECK (kind = ANY (ARRAY['person','place','org','topic','thing','event','project']));

ALTER TABLE public.entities
  ADD COLUMN IF NOT EXISTS parent_entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS entities_parent_idx ON public.entities (user_id, parent_entity_id);
CREATE INDEX IF NOT EXISTS entities_pinned_idx ON public.entities (user_id, pinned) WHERE pinned = true;
CREATE UNIQUE INDEX IF NOT EXISTS entities_user_kind_slug_uq ON public.entities (user_id, kind, slug) WHERE slug IS NOT NULL;
