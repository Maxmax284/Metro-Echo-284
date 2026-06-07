ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS digest jsonb;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS digest jsonb;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS brief_structured jsonb;