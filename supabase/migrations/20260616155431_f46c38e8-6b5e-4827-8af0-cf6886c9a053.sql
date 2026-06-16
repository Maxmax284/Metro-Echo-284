ALTER TABLE public.brief_exports DROP CONSTRAINT IF EXISTS brief_exports_scope_kind_check;
ALTER TABLE public.brief_exports ADD CONSTRAINT brief_exports_scope_kind_check
  CHECK (scope_kind IN ('system','entity','project','recap_weekly','recap_monthly'));

ALTER TABLE public.brief_exports DROP CONSTRAINT IF EXISTS brief_exports_format_check;
ALTER TABLE public.brief_exports ADD CONSTRAINT brief_exports_format_check
  CHECK (format = ANY (ARRAY[
    'operator'::text,
    'client'::text,
    'audit_packet'::text,
    'weekly_review'::text,
    'audio_script'::text,
    'research_brief'::text,
    'monthly_review'::text
  ]));

CREATE INDEX IF NOT EXISTS brief_exports_scope_kind_idx
  ON public.brief_exports(user_id, scope_kind, created_at DESC);