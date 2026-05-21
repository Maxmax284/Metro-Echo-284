
-- Phase 2: File Intake Maturity — schema fields and value guards
ALTER TABLE public.ingested_files
  ADD COLUMN IF NOT EXISTS detected_doc_type text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS extracted_text text,
  ADD COLUMN IF NOT EXISTS extracted_entities jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS suggested_summary text,
  ADD COLUMN IF NOT EXISTS suggested_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS approved_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sensitive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confidence text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'new';

-- Enum guards (immutable value sets, safe as CHECK constraints)
ALTER TABLE public.ingested_files
  DROP CONSTRAINT IF EXISTS ingested_files_detected_doc_type_chk;
ALTER TABLE public.ingested_files
  ADD CONSTRAINT ingested_files_detected_doc_type_chk
  CHECK (detected_doc_type IN (
    'unknown','receipt','invoice','booking','contract','schedule',
    'waiver','visa','id_doc','medical','screenshot','image',
    'voice_note','payment_proof','platform_export','other'
  ));

ALTER TABLE public.ingested_files
  DROP CONSTRAINT IF EXISTS ingested_files_confidence_chk;
ALTER TABLE public.ingested_files
  ADD CONSTRAINT ingested_files_confidence_chk
  CHECK (confidence IN ('low','medium','high'));

ALTER TABLE public.ingested_files
  DROP CONSTRAINT IF EXISTS ingested_files_review_status_chk;
ALTER TABLE public.ingested_files
  ADD CONSTRAINT ingested_files_review_status_chk
  CHECK (review_status IN (
    'new','needs_review','suggested','routed','attached',
    'archived','ignored','waiting','stale'
  ));

-- Structural guards: jsonb columns must be objects or arrays (never scalars/null)
ALTER TABLE public.ingested_files
  DROP CONSTRAINT IF EXISTS ingested_files_extracted_entities_obj_chk;
ALTER TABLE public.ingested_files
  ADD CONSTRAINT ingested_files_extracted_entities_obj_chk
  CHECK (jsonb_typeof(extracted_entities) = 'object');

ALTER TABLE public.ingested_files
  DROP CONSTRAINT IF EXISTS ingested_files_suggested_actions_arr_chk;
ALTER TABLE public.ingested_files
  ADD CONSTRAINT ingested_files_suggested_actions_arr_chk
  CHECK (jsonb_typeof(suggested_actions) = 'array');

ALTER TABLE public.ingested_files
  DROP CONSTRAINT IF EXISTS ingested_files_approved_actions_arr_chk;
ALTER TABLE public.ingested_files
  ADD CONSTRAINT ingested_files_approved_actions_arr_chk
  CHECK (jsonb_typeof(approved_actions) = 'array');

-- updated_at automation (table already has the column, just needs the trigger)
DROP TRIGGER IF EXISTS ingested_files_set_updated_at ON public.ingested_files;
CREATE TRIGGER ingested_files_set_updated_at
  BEFORE UPDATE ON public.ingested_files
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Indexes for Capture Inbox queries
CREATE INDEX IF NOT EXISTS ingested_files_user_review_idx
  ON public.ingested_files (user_id, review_status, created_at DESC);

CREATE INDEX IF NOT EXISTS ingested_files_user_sensitive_idx
  ON public.ingested_files (user_id, created_at DESC)
  WHERE sensitive = true;

CREATE INDEX IF NOT EXISTS ingested_files_user_doctype_idx
  ON public.ingested_files (user_id, detected_doc_type, created_at DESC)
  WHERE detected_doc_type <> 'unknown';
