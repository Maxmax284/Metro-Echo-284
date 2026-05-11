
CREATE TYPE public.nudge_status AS ENUM ('pending','seen','dismissed','acted');

CREATE TABLE public.nudges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  related_entity_type TEXT,
  related_entity_id UUID,
  priority INT NOT NULL DEFAULT 50,
  status public.nudge_status NOT NULL DEFAULT 'pending',
  dedupe_key TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.nudges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nudges own all" ON public.nudges
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE UNIQUE INDEX uniq_nudges_user_dedupe
  ON public.nudges(user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('pending','seen');

CREATE INDEX idx_nudges_user_status_priority
  ON public.nudges(user_id, status, priority DESC, created_at DESC);

CREATE TRIGGER trg_nudges_updated_at
  BEFORE UPDATE ON public.nudges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
