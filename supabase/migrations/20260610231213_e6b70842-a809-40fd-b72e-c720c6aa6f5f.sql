CREATE OR REPLACE FUNCTION public.entity_rollup(_entity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  _note_ids := COALESCE(_note_ids, '{}');
  _commit_ids := COALESCE(_commit_ids, '{}');
  _action_ids := COALESCE(_action_ids, '{}');
  _file_ids := COALESCE(_file_ids, '{}');
  _message_ids := COALESCE(_message_ids, '{}');
  _capture_ids := COALESCE(_capture_ids, '{}');

  SELECT COUNT(*) INTO _cross_link_count
  FROM public.cross_links cl
  WHERE cl.user_id = _uid AND cl.removed_at IS NULL
    AND ((cl.source_kind = 'entity' AND cl.source_id = _entity_id)
      OR (cl.target_kind = 'entity' AND cl.target_id = _entity_id));

  SELECT COUNT(*) INTO _notes_count FROM public.notes WHERE user_id = _uid AND id = ANY(_note_ids);

  SELECT
    COUNT(*) FILTER (WHERE status = 'open'),
    COUNT(*) FILTER (WHERE status = 'open' AND due_at IS NOT NULL AND due_at < _today_start)
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
    AND (
      source_object_id = _entity_id OR target_object_id = _entity_id OR
      source_object_id = ANY(_note_ids) OR target_object_id = ANY(_note_ids) OR
      source_object_id = ANY(_commit_ids) OR target_object_id = ANY(_commit_ids) OR
      source_object_id = ANY(_action_ids) OR target_object_id = ANY(_action_ids) OR
      source_object_id = ANY(_file_ids) OR target_object_id = ANY(_file_ids)
    );

  SELECT COUNT(*) INTO _audit_7d
  FROM public.audit_log
  WHERE user_id = _uid AND created_at >= _now - interval '7 days'
    AND (entity_id = _entity_id OR entity_id = ANY(_note_ids) OR entity_id = ANY(_commit_ids)
      OR entity_id = ANY(_action_ids) OR entity_id = ANY(_file_ids) OR entity_id = ANY(_message_ids));

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id, 'event', a.event, 'entity_type', a.entity_type, 'entity_id', a.entity_id, 'created_at', a.created_at
  ) ORDER BY a.created_at DESC), '[]'::jsonb)
  INTO _recent_audit
  FROM (
    SELECT id, event, entity_type, entity_id, created_at
    FROM public.audit_log
    WHERE user_id = _uid
      AND (entity_id = _entity_id OR entity_id = ANY(_note_ids) OR entity_id = ANY(_commit_ids)
        OR entity_id = ANY(_action_ids) OR entity_id = ANY(_file_ids) OR entity_id = ANY(_message_ids))
    ORDER BY created_at DESC
    LIMIT 10
  ) a;

  WITH changes AS (
    SELECT 'note'::text AS kind, id, COALESCE(title, left(body, 80), 'Untitled note') AS label, updated_at AS ts
      FROM public.notes WHERE user_id = _uid AND id = ANY(_note_ids)
    UNION ALL
    SELECT 'commitment', id, summary, updated_at FROM public.commitments WHERE user_id = _uid AND id = ANY(_commit_ids)
    UNION ALL
    SELECT 'action', id, title, updated_at FROM public.actions WHERE user_id = _uid AND id = ANY(_action_ids)
    UNION ALL
    SELECT 'file', id, filename, created_at FROM public.ingested_files WHERE user_id = _uid AND id = ANY(_file_ids)
    UNION ALL
    SELECT 'message', id, left(content, 80), created_at FROM public.messages WHERE user_id = _uid AND id = ANY(_message_ids)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', kind, 'id', id, 'label', label, 'ts', ts) ORDER BY ts DESC), '[]'::jsonb)
  INTO _recent_changes
  FROM (SELECT * FROM changes ORDER BY ts DESC LIMIT 8) x;

  IF _commits_overdue > 0 THEN
    _suggested := jsonb_build_object('label','Clear overdue commitments','surface','commitments');
  ELSIF _actions_high_risk > 0 THEN
    _suggested := jsonb_build_object('label','Review high-risk actions','surface','actions');
  ELSIF _sherlock_pending > 0 THEN
    _suggested := jsonb_build_object('label','Open Sherlock findings','surface','sherlock');
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
$function$;

CREATE OR REPLACE FUNCTION public.system_rollup(_range_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _since timestamptz := now() - make_interval(days => GREATEST(1, LEAST(COALESCE(_range_days, 7), 90)));
  _start_day timestamptz := date_trunc('day', now());
  _entities jsonb;
  _counts jsonb;
  _recent jsonb;
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
    'commitments_open',    (SELECT count(*) FROM public.commitments WHERE user_id = _uid AND status = 'open'),
    'commitments_overdue', (SELECT count(*) FROM public.commitments WHERE user_id = _uid AND status = 'open' AND due_at IS NOT NULL AND due_at < _start_day),
    'actions_pending',     (SELECT count(*) FROM public.actions WHERE user_id = _uid AND status IN ('staged','proposed')),
    'actions_high_risk',   (SELECT count(*) FROM public.actions WHERE user_id = _uid AND status IN ('staged','proposed') AND risk = 'high'),
    'actions_executed_7d', (SELECT count(*) FROM public.actions WHERE user_id = _uid AND status = 'executed' AND updated_at >= _since),
    'files_7d',     (SELECT count(*) FROM public.ingested_files WHERE user_id = _uid AND created_at >= _since),
    'sherlock_pending', (SELECT count(*) FROM public.sherlock_findings WHERE user_id = _uid AND status = 'pending'),
    'audit_7d',     (SELECT count(*) FROM public.audit_log WHERE user_id = _uid AND created_at >= _since)
  ) INTO _counts;

  SELECT COALESCE(jsonb_agg(obj ORDER BY (obj->>'ts')::timestamptz DESC), '[]'::jsonb)
  INTO _recent
  FROM (
    SELECT jsonb_build_object('kind','note','id',id,'label',COALESCE(title,left(body,80),'Untitled note'),'ts',updated_at) obj
      FROM public.notes WHERE user_id = _uid AND updated_at >= _since ORDER BY updated_at DESC LIMIT 10
  ) r;

  RETURN jsonb_build_object('entities', _entities, 'counts', _counts, 'recent_changes', _recent, 'generated_at', now());
END;
$function$;