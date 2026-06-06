
CREATE TABLE public.brief_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NULL REFERENCES public.organizations(id) ON DELETE SET NULL,
  entity_id uuid NULL REFERENCES public.entities(id) ON DELETE SET NULL,
  format text NOT NULL CHECK (format IN ('operator','client','audit_packet','weekly_review','audio_script')),
  scope_kind text NOT NULL CHECK (scope_kind IN ('system','entity')),
  title text NOT NULL,
  subtitle text,
  brief jsonb NOT NULL DEFAULT '{}'::jsonb,
  signals_hash text,
  storage_path text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','exported')),
  approved_at timestamptz,
  exported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX brief_exports_user_idx ON public.brief_exports (user_id, created_at DESC);
CREATE INDEX brief_exports_entity_idx ON public.brief_exports (entity_id, created_at DESC) WHERE entity_id IS NOT NULL;
CREATE INDEX brief_exports_org_idx ON public.brief_exports (organization_id, created_at DESC) WHERE organization_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brief_exports TO authenticated;
GRANT ALL ON public.brief_exports TO service_role;

ALTER TABLE public.brief_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brief_exports owner select" ON public.brief_exports FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid())));
CREATE POLICY "brief_exports owner insert" ON public.brief_exports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "brief_exports owner update" ON public.brief_exports FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "brief_exports owner delete" ON public.brief_exports FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER brief_exports_set_updated_at
  BEFORE UPDATE ON public.brief_exports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.entity_rollup(_entity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _ent record;
  _note_ids uuid[];
  _commit_ids uuid[];
  _action_ids uuid[];
  _file_ids uuid[];
  _message_ids uuid[];
  _capture_ids uuid[];
  _notes_count int := 0;
  _commits_open int := 0;
  _commits_overdue int := 0;
  _actions_pending int := 0;
  _actions_high_risk int := 0;
  _actions_executed_7d int := 0;
  _files_count int := 0;
  _messages_count int := 0;
  _sherlock_pending int := 0;
  _cross_link_count int := 0;
  _audit_7d int := 0;
  _recent_audit jsonb;
  _recent_changes jsonb;
  _suggested jsonb := NULL;
  _now timestamptz := now();
  _today_start timestamptz := date_trunc('day', now());
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT e.id, e.display_name, e.kind, e.slug, e.summary, e.parent_entity_id, e.pinned, e.last_seen_at
    INTO _ent
  FROM public.entities e
  WHERE e.id = _entity_id AND e.user_id = _uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'entity not found'; END IF;

  WITH neighbors AS (
    SELECT cl.target_kind AS kind, cl.target_id AS id FROM public.cross_links cl
      WHERE cl.user_id = _uid AND cl.removed_at IS NULL
        AND cl.source_kind = 'entity' AND cl.source_id = _entity_id
    UNION
    SELECT cl.source_kind AS kind, cl.source_id AS id FROM public.cross_links cl
      WHERE cl.user_id = _uid AND cl.removed_at IS NULL
        AND cl.target_kind = 'entity' AND cl.target_id = _entity_id
  )
  SELECT
    array_agg(n.id) FILTER (WHERE n.kind = 'note'),
    array_agg(n.id) FILTER (WHERE n.kind = 'commitment'),
    array_agg(n.id) FILTER (WHERE n.kind = 'action'),
    array_agg(n.id) FILTER (WHERE n.kind = 'file'),
    array_agg(n.id) FILTER (WHERE n.kind = 'message'),
    array_agg(n.id) FILTER (WHERE n.kind = 'capture')
  INTO _note_ids, _commit_ids, _action_ids, _file_ids, _message_ids, _capture_ids
  FROM neighbors n;

  _note_ids    := COALESCE(_note_ids, '{}');
  _commit_ids  := COALESCE(_commit_ids, '{}');
  _action_ids  := COALESCE(_action_ids, '{}');
  _file_ids    := COALESCE(_file_ids, '{}');
  _message_ids := COALESCE(_message_ids, '{}');
  _capture_ids := COALESCE(_capture_ids, '{}');

  SELECT COUNT(*) INTO _cross_link_count
  FROM public.cross_links cl
  WHERE cl.user_id = _uid AND cl.removed_at IS NULL
    AND ((cl.source_kind = 'entity' AND cl.source_id = _entity_id)
      OR (cl.target_kind = 'entity' AND cl.target_id = _entity_id));

  SELECT COUNT(*) INTO _notes_count FROM public.notes WHERE user_id = _uid AND id = ANY(_note_ids);

  SELECT
    COUNT(*) FILTER (WHERE status <> 'done'),
    COUNT(*) FILTER (WHERE status <> 'done' AND due_at IS NOT NULL AND due_at < _today_start)
  INTO _commits_open, _commits_overdue
  FROM public.commitments WHERE user_id = _uid AND id = ANY(_commit_ids);

  SELECT
    COUNT(*) FILTER (WHERE status IN ('staged','proposed')),
    COUNT(*) FILTER (WHERE status IN ('staged','proposed') AND risk = 'high'),
    COUNT(*) FILTER (WHERE status = 'executed' AND updated_at >= _now - interval '7 days')
  INTO _actions_pending, _actions_high_risk, _actions_executed_7d
  FROM public.actions WHERE user_id = _uid AND id = ANY(_action_ids);

  SELECT COUNT(*) INTO _files_count FROM public.ingested_files WHERE user_id = _uid AND id = ANY(_file_ids);
  SELECT COUNT(*) INTO _messages_count FROM public.messages WHERE user_id = _uid AND id = ANY(_message_ids);

  SELECT COUNT(*) INTO _sherlock_pending
  FROM public.sherlock_findings
  WHERE user_id = _uid AND status = 'pending'
    AND ((source_object_type = 'entity'     AND source_object_id = _entity_id)
      OR (source_object_type = 'note'       AND source_object_id = ANY(_note_ids))
      OR (source_object_type = 'commitment' AND source_object_id = ANY(_commit_ids))
      OR (source_object_type = 'file'       AND source_object_id = ANY(_file_ids))
      OR (source_object_type = 'message'    AND source_object_id = ANY(_message_ids)));

  SELECT COUNT(*) INTO _audit_7d
  FROM public.audit_log
  WHERE user_id = _uid
    AND created_at >= _now - interval '7 days'
    AND ((entity_type = 'entity'     AND entity_id = _entity_id)
      OR (entity_type = 'note'       AND entity_id = ANY(_note_ids))
      OR (entity_type = 'commitment' AND entity_id = ANY(_commit_ids))
      OR (entity_type = 'action'     AND entity_id = ANY(_action_ids))
      OR (entity_type = 'file'       AND entity_id = ANY(_file_ids))
      OR (entity_type = 'message'    AND entity_id = ANY(_message_ids)));

  SELECT COALESCE(jsonb_agg(obj), '[]'::jsonb) INTO _recent_audit FROM (
    SELECT jsonb_build_object('id', id, 'event', event, 'entity_type', entity_type,
                              'entity_id', entity_id, 'created_at', created_at) AS obj
    FROM public.audit_log
    WHERE user_id = _uid
      AND ((entity_type = 'entity'     AND entity_id = _entity_id)
        OR (entity_type = 'note'       AND entity_id = ANY(_note_ids))
        OR (entity_type = 'commitment' AND entity_id = ANY(_commit_ids))
        OR (entity_type = 'action'     AND entity_id = ANY(_action_ids))
        OR (entity_type = 'file'       AND entity_id = ANY(_file_ids))
        OR (entity_type = 'message'    AND entity_id = ANY(_message_ids)))
    ORDER BY created_at DESC LIMIT 6
  ) sub;

  SELECT COALESCE(jsonb_agg(obj ORDER BY (obj->>'ts')::timestamptz DESC), '[]'::jsonb)
  INTO _recent_changes
  FROM (
    (SELECT jsonb_build_object('kind','note','id',id,'label',COALESCE(title,'Untitled note'),'ts',updated_at) AS obj
      FROM public.notes WHERE user_id = _uid AND id = ANY(_note_ids)
      ORDER BY updated_at DESC LIMIT 3)
    UNION ALL
    (SELECT jsonb_build_object('kind','commitment','id',id,'label',summary,'ts',updated_at)
      FROM public.commitments WHERE user_id = _uid AND id = ANY(_commit_ids)
      ORDER BY updated_at DESC LIMIT 3)
    UNION ALL
    (SELECT jsonb_build_object('kind','action','id',id,'label',title,'ts',updated_at)
      FROM public.actions WHERE user_id = _uid AND id = ANY(_action_ids)
      ORDER BY updated_at DESC LIMIT 3)
    UNION ALL
    (SELECT jsonb_build_object('kind','file','id',id,'label',filename,'ts',created_at)
      FROM public.ingested_files WHERE user_id = _uid AND id = ANY(_file_ids)
      ORDER BY created_at DESC LIMIT 3)
  ) merged
  LIMIT 5;

  IF _commits_overdue > 0 THEN
    _suggested := jsonb_build_object('label','Review overdue commitments','surface','commitments');
  ELSIF _actions_high_risk > 0 THEN
    _suggested := jsonb_build_object('label','Approve high-risk action','surface','actions');
  ELSIF _sherlock_pending > 0 THEN
    _suggested := jsonb_build_object('label','Review Sherlock findings','surface','sherlock');
  ELSIF _commits_open > 0 THEN
    _suggested := jsonb_build_object('label','Work an open commitment','surface','commitments');
  END IF;

  RETURN jsonb_build_object(
    'entity', jsonb_build_object(
      'id', _ent.id, 'display_name', _ent.display_name, 'kind', _ent.kind,
      'slug', _ent.slug, 'summary', _ent.summary,
      'parent_entity_id', _ent.parent_entity_id, 'pinned', _ent.pinned,
      'last_seen_at', _ent.last_seen_at
    ),
    'counts', jsonb_build_object(
      'notes', _notes_count,
      'commitments_open', _commits_open,
      'commitments_overdue', _commits_overdue,
      'actions_pending', _actions_pending,
      'actions_high_risk', _actions_high_risk,
      'actions_executed_7d', _actions_executed_7d,
      'files', _files_count,
      'messages', _messages_count,
      'sherlock_pending', _sherlock_pending,
      'cross_links', _cross_link_count,
      'audit_7d', _audit_7d
    ),
    'recent_changes', _recent_changes,
    'recent_audit',  _recent_audit,
    'suggested_next', _suggested,
    'generated_at', _now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.entity_rollup(uuid) TO authenticated;
