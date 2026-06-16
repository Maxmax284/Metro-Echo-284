-- Allow "research_brief" as a valid brief_exports.format so Phase 4 Research
-- Briefs can ride the existing exports + receipts rails without a new table.
ALTER TABLE public.brief_exports DROP CONSTRAINT IF EXISTS brief_exports_format_check;
ALTER TABLE public.brief_exports ADD CONSTRAINT brief_exports_format_check
  CHECK (format = ANY (ARRAY[
    'operator'::text,
    'client'::text,
    'audit_packet'::text,
    'weekly_review'::text,
    'audio_script'::text,
    'research_brief'::text
  ]));