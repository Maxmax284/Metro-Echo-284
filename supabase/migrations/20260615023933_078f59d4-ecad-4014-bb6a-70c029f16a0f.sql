
ALTER TYPE public.document_status ADD VALUE IF NOT EXISTS 'drafting';
ALTER TYPE public.document_status ADD VALUE IF NOT EXISTS 'drafted';
ALTER TYPE public.document_status ADD VALUE IF NOT EXISTS 'approved';

ALTER TYPE public.document_version_source ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE public.document_version_source ADD VALUE IF NOT EXISTS 'revision';

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS template_key text,
  ADD COLUMN IF NOT EXISTS draft_inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS tone text;
