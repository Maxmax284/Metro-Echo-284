-- Phase 3a: Object / Relationship Graph
-- New private tables. Owner-only RLS. No writes to existing tables.

-- ---------- entities ----------
CREATE TABLE public.entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('person','place','org','topic','thing','event')),
  display_name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  confidence text NOT NULL DEFAULT 'medium' CHECK (confidence IN ('low','medium','high')),
  metadata jsonb NOT NULL DEFAULT '{}',
  embedding vector(1536),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX entities_user_kind_idx ON public.entities (user_id, kind);
CREATE INDEX entities_user_lastseen_idx ON public.entities (user_id, last_seen_at DESC);
CREATE INDEX entities_aliases_gin ON public.entities USING gin (aliases);
CREATE INDEX entities_embedding_ivfflat
  ON public.entities USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entities own all"
  ON public.entities FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER entities_set_updated_at
  BEFORE UPDATE ON public.entities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- entity_links ----------
CREATE TABLE public.entity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  source_kind text NOT NULL CHECK (source_kind IN (
    'note','commitment','message','signal','field_note',
    'research_object','ingested_file','reminder','action','investigation'
  )),
  source_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'mentions' CHECK (role IN (
    'mentions','about','owner','location','participant','source'
  )),
  confidence text NOT NULL DEFAULT 'medium' CHECK (confidence IN ('low','medium','high')),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_kind, source_id, entity_id, role)
);

CREATE INDEX entity_links_user_idx ON public.entity_links (user_id);
CREATE INDEX entity_links_entity_idx ON public.entity_links (entity_id, created_at DESC);
CREATE INDEX entity_links_source_idx ON public.entity_links (source_kind, source_id);

ALTER TABLE public.entity_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_links own all"
  ON public.entity_links FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------- entity_relations ----------
CREATE TABLE public.entity_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  from_entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  to_entity_id   uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  relation text NOT NULL CHECK (relation IN (
    'works_with','located_at','part_of','knows','rival_of','depends_on','related_to'
  )),
  evidence_count integer NOT NULL DEFAULT 1,
  last_evidence_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_entity_id <> to_entity_id),
  UNIQUE (user_id, from_entity_id, to_entity_id, relation)
);

CREATE INDEX entity_relations_user_idx ON public.entity_relations (user_id);
CREATE INDEX entity_relations_from_idx ON public.entity_relations (from_entity_id);
CREATE INDEX entity_relations_to_idx   ON public.entity_relations (to_entity_id);

ALTER TABLE public.entity_relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_relations own all"
  ON public.entity_relations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER entity_relations_set_updated_at
  BEFORE UPDATE ON public.entity_relations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();