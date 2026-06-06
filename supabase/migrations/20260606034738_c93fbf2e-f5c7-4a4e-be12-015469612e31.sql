
CREATE OR REPLACE FUNCTION public.system_rollup(_range_days int DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _since timestamptz := now() - make_interval(days => _range_days);
  _start_day timestamptz := date_trunc('day', now());
  _entities jsonb;
  _counts jsonb;
  _recent_changes jsonb;
  _recent_audit jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', e.id, 'display_name', e.display_name, 'kind', e.kind,
    'slug', e.slug, 'summary', e.summary, 'pinned', e.pinned,
    'last_seen_at', e.last_seen_at
  ) ORDER BY e.pinned DESC, e.last_seen_at DESC), '[]'::jsonb)
  INTO _entities
  FROM public.entities e
  WHERE e.user_id = _uid AND (e.kind = 'project' OR e.pinned = true)
  LIMIT 30;

  SELECT jsonb_build_object(
    'projects', (SELECT count(*) FROM public.entities WHERE user_id = _uid AND kind = 'project'),
    'pinned',   (SELECT count(*) FROM public.entities WHERE user_id = _uid AND pinned = true),
    'notes_7d', (SELECT count(*) FROM public.notes WHERE user_id = _uid AND updated_at >= _since),
    'commitments_open',    (SELECT count(*) FROM public.commitments WHERE user_id = _uid AND status <> 'done'),
    'commitments_overdue', (SELECT count(*) FROM public.commitments WHERE user_id = _uid AND status <> 'done' AND due_at IS NOT NULL AND due_at < _start_day),
    'actions_pending',     (SELECT count(*) FROM public.actions WHERE user_id = _uid AND status IN ('staged','proposed')),
    'actions_high_risk',   (SELECT count(*) FROM public.actions WHERE user_id = _uid AND status IN ('staged','proposed') AND risk = 'high'),
    'actions_executed_7d', (SELECT count(*) FROM public.actions WHERE user_id = _uid AND status = 'executed' AND updated_at >= _since),
    'files_7d',     (SELECT count(*) FROM public.ingested_files WHERE user_id = _uid AND created_at >= _since),
    'sherlock_pending', (SELECT count(*) FROM public.sherlock_findings WHERE user_id = _uid AND status = 'pending'),
    'audit_7d',     (SELECT count(*) FROM public.audit_log WHERE user_id = _uid AND created_at >= _since)
  ) INTO _counts;

  SELECT COALESCE(jsonb_agg(obj ORDER BY (obj->>'ts')::timestamptz DESC), '[]'::jsonb)
  INTO _recent_changes
  FROM (
    (SELECT jsonb_build_object('kind','note','id',id,'label',COALESCE(title,'Untitled note'),'ts',updated_at) AS obj
     FROM public.notes WHERE user_id = _uid AND updated_at >= _since ORDER BY updated_at DESC LIMIT 6)
    UNION ALL
    (SELECT jsonb_build_object('kind','commitment','id',id,'label',summary,'ts',updated_at)
     FROM public.commitments WHERE user_id = _uid AND updated_at >= _since ORDER BY updated_at DESC LIMIT 6)
    UNION ALL
    (SELECT jsonb_build_object('kind','action','id',id,'label',title,'ts',updated_at)
     FROM public.actions WHERE user_id = _uid AND updated_at >= _since ORDER BY updated_at DESC LIMIT 6)
    UNION ALL
    (SELECT jsonb_build_object('kind','file','id',id,'label',filename,'ts',created_at)
     FROM public.ingested_files WHERE user_id = _uid AND created_at >= _since ORDER BY created_at DESC LIMIT 6)
  ) merged
  LIMIT 12;

  SELECT COALESCE(jsonb_agg(obj), '[]'::jsonb) INTO _recent_audit FROM (
    SELECT jsonb_build_object('id', id, 'event', event, 'entity_type', entity_type,
                              'entity_id', entity_id, 'created_at', created_at) AS obj
    FROM public.audit_log
    WHERE user_id = _uid AND created_at >= _since
    ORDER BY created_at DESC LIMIT 25
  ) sub;

  RETURN jsonb_build_object(
    'scope', 'system',
    'range_days', _range_days,
    'entities', _entities,
    'counts', _counts,
    'recent_changes', _recent_changes,
    'recent_audit', _recent_audit,
    'generated_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.system_rollup(int) TO authenticated;
