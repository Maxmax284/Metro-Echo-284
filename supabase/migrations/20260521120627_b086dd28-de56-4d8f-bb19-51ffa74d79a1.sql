
ALTER TABLE public.audit_log REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.ingested_files REPLICA IDENTITY FULL;
ALTER TABLE public.field_notes REPLICA IDENTITY FULL;
ALTER TABLE public.commitments REPLICA IDENTITY FULL;
ALTER TABLE public.actions REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_log;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ingested_files;
ALTER PUBLICATION supabase_realtime ADD TABLE public.field_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.commitments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.actions;
