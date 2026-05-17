
CREATE TABLE public.awareness_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  place_id UUID NOT NULL,
  compact JSONB NOT NULL DEFAULT '{}'::jsonb,
  full_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  sources_used JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '60 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_awareness_snapshots_user_place ON public.awareness_snapshots(user_id, place_id, generated_at DESC);

ALTER TABLE public.awareness_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "awareness_snapshots own all"
  ON public.awareness_snapshots
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
