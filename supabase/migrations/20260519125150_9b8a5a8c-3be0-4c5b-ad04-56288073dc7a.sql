DO $$
DECLARE _uid uuid := '761b9440-c013-4b5a-a77a-53d826cd4329';
BEGIN
  DELETE FROM public.investigation_findings WHERE user_id = _uid;
  DELETE FROM public.investigations WHERE user_id = _uid;
  DELETE FROM public.action_events WHERE user_id = _uid;
  DELETE FROM public.action_retries WHERE user_id = _uid;
  DELETE FROM public.actions WHERE user_id = _uid;
  DELETE FROM public.nudges WHERE user_id = _uid;
  DELETE FROM public.commitments WHERE user_id = _uid;
  DELETE FROM public.messages WHERE user_id = _uid;
  DELETE FROM public.conversations WHERE user_id = _uid;
  DELETE FROM public.field_notes WHERE user_id = _uid;
  DELETE FROM public.ingested_files WHERE user_id = _uid;
  DELETE FROM public.awareness_briefings WHERE user_id = _uid;
  DELETE FROM public.awareness_snapshots WHERE user_id = _uid;
  DELETE FROM public.awareness_places WHERE user_id = _uid;
  DELETE FROM public.sherlock_findings_cache WHERE user_id = _uid;
  DELETE FROM public.telegram_link_codes WHERE user_id = _uid;
  DELETE FROM public.note_links WHERE user_id = _uid;
  DELETE FROM public.notes WHERE user_id = _uid;
  DELETE FROM public.audit_log WHERE user_id = _uid;
END $$;