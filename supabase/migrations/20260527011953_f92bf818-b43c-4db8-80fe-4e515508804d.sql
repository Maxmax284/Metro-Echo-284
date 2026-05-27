ALTER TABLE public.ingested_files ADD COLUMN IF NOT EXISTS batch_id uuid;
CREATE INDEX IF NOT EXISTS idx_ingested_files_batch_id ON public.ingested_files(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ingested_files_user_batch ON public.ingested_files(user_id, batch_id, created_at DESC) WHERE batch_id IS NOT NULL;