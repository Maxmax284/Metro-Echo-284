
-- 1. Table -----------------------------------------------------------------
CREATE TABLE public.cross_links (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_kind  text NOT NULL,
  source_id    uuid NOT NULL,
  target_kind  text NOT NULL,
  target_id    uuid NOT NULL,
  relation     text NOT NULL DEFAULT 'related',
  confidence   text NOT NULL DEFAULT 'medium',
  created_by   text NOT NULL DEFAULT 'user',
  reason       text,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  removed_at   timestamptz,
  CONSTRAINT cross_links_source_kind_chk CHECK (source_kind = ANY (ARRAY['note','capture','commitment','action','file','message','entity'])),
  CONSTRAINT cross_links_target_kind_chk CHECK (target_kind = ANY (ARRAY['note','capture','commitment','action','file','message','entity'])),
  CONSTRAINT cross_links_relation_chk    CHECK (relation    = ANY (ARRAY['related','about','part_of','blocks','duplicate_of'])),
  CONSTRAINT cross_links_confidence_chk  CHECK (confidence  = ANY (ARRAY['low','medium','high'])),
  CONSTRAINT cross_links_created_by_chk  CHECK (created_by  = ANY (ARRAY['user','sherlock','migration','system'])),
  CONSTRAINT cross_links_not_self        CHECK (NOT (source_kind = target_kind AND source_id = target_id))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cross_links TO authenticated;
GRANT ALL ON public.cross_links TO service_role;

ALTER TABLE public.cross_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cross_links own all" ON public.cross_links
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Unique active link (one relation per pair, direction-sensitive)
CREATE UNIQUE INDEX cross_links_active_uq
  ON public.cross_links (user_id, source_kind, source_id, target_kind, target_id, relation)
  WHERE removed_at IS NULL;

CREATE INDEX cross_links_source_idx ON public.cross_links (user_id, source_kind, source_id) WHERE removed_at IS NULL;
CREATE INDEX cross_links_target_idx ON public.cross_links (user_id, target_kind, target_id) WHERE removed_at IS NULL;

CREATE TRIGGER cross_links_set_updated_at
  BEFORE UPDATE ON public.cross_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. RPC: create -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cross_links_create(
  _source_kind text,
  _source_id   uuid,
  _target_kind text,
  _target_id   uuid,
  _relation    text DEFAULT 'related',
  _confidence  text DEFAULT 'medium',
  _created_by  text DEFAULT 'user',
  _reason      text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _existing uuid;
  _new_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _source_kind = _target_kind AND _source_id = _target_id THEN
    RAISE EXCEPTION 'cannot link an item to itself';
  END IF;

  -- Revive a soft-removed link if it exists
  SELECT id INTO _existing
  FROM public.cross_links
  WHERE user_id = _uid
    AND source_kind = _source_kind AND source_id = _source_id
    AND target_kind = _target_kind AND target_id = _target_id
    AND relation = _relation
  ORDER BY created_at DESC LIMIT 1;

  IF _existing IS NOT NULL THEN
    UPDATE public.cross_links
       SET removed_at = NULL,
           confidence = _confidence,
           created_by = _created_by,
           reason     = COALESCE(_reason, reason)
     WHERE id = _existing;
    _new_id := _existing;
  ELSE
    INSERT INTO public.cross_links
      (user_id, source_kind, source_id, target_kind, target_id, relation, confidence, created_by, reason)
    VALUES
      (_uid, _source_kind, _source_id, _target_kind, _target_id, _relation, _confidence, _created_by, _reason)
    RETURNING id INTO _new_id;
  END IF;

  INSERT INTO public.audit_log (user_id, entity_type, entity_id, event, payload)
  VALUES (_uid, 'cross_link', _new_id, 'link.created', jsonb_build_object(
    'source_kind', _source_kind, 'source_id', _source_id,
    'target_kind', _target_kind, 'target_id', _target_id,
    'relation', _relation, 'confidence', _confidence,
    'created_by', _created_by, 'reason', _reason
  ));

  RETURN _new_id;
END;
$$;

-- 3. RPC: remove -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cross_links_remove(_id uuid, _reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.cross_links%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO _row FROM public.cross_links WHERE id = _id AND user_id = _uid;
  IF NOT FOUND THEN RETURN false; END IF;
  IF _row.removed_at IS NOT NULL THEN RETURN true; END IF;
  UPDATE public.cross_links SET removed_at = now() WHERE id = _id;
  INSERT INTO public.audit_log (user_id, entity_type, entity_id, event, payload)
  VALUES (_uid, 'cross_link', _id, 'link.removed', jsonb_build_object(
    'source_kind', _row.source_kind, 'source_id', _row.source_id,
    'target_kind', _row.target_kind, 'target_id', _row.target_id,
    'relation', _row.relation, 'reason', _reason
  ));
  RETURN true;
END;
$$;

-- 4. RPC: list both directions for one item --------------------------------
CREATE OR REPLACE FUNCTION public.cross_links_for_item(_kind text, _id uuid)
RETURNS TABLE(
  id uuid,
  direction text,
  other_kind text,
  other_id uuid,
  relation text,
  confidence text,
  created_by text,
  reason text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  RETURN QUERY
  SELECT cl.id, 'out'::text, cl.target_kind, cl.target_id,
         cl.relation, cl.confidence, cl.created_by, cl.reason, cl.created_at
  FROM public.cross_links cl
  WHERE cl.user_id = _uid AND cl.removed_at IS NULL
    AND cl.source_kind = _kind AND cl.source_id = _id
  UNION ALL
  SELECT cl.id, 'in'::text, cl.source_kind, cl.source_id,
         cl.relation, cl.confidence, cl.created_by, cl.reason, cl.created_at
  FROM public.cross_links cl
  WHERE cl.user_id = _uid AND cl.removed_at IS NULL
    AND cl.target_kind = _kind AND cl.target_id = _id
  ORDER BY created_at DESC;
END;
$$;

-- 5. Backfill from note_links ---------------------------------------------
INSERT INTO public.cross_links
  (user_id, source_kind, source_id, target_kind, target_id, relation, confidence, created_by, created_at)
SELECT
  nl.user_id, 'note', nl.from_note, 'note', nl.to_note,
  CASE WHEN nl.kind IN ('related','about','part_of','blocks','duplicate_of') THEN nl.kind ELSE 'related' END,
  'medium', 'migration', nl.created_at
FROM public.note_links nl
ON CONFLICT DO NOTHING;
