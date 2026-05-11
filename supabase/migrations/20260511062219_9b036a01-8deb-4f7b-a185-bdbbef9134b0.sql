
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TYPE public.investigation_status AS ENUM ('pending','running','complete','failed');

CREATE TABLE public.investigations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  question TEXT NOT NULL,
  status public.investigation_status NOT NULL DEFAULT 'pending',
  summary TEXT,
  related_note_ids UUID[] NOT NULL DEFAULT '{}',
  related_commitment_ids UUID[] NOT NULL DEFAULT '{}',
  related_action_ids UUID[] NOT NULL DEFAULT '{}',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.investigations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "investigations own all" ON public.investigations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.investigation_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id UUID NOT NULL REFERENCES public.investigations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  claim TEXT NOT NULL,
  confidence TEXT NOT NULL DEFAULT 'medium',
  source_kind TEXT,
  source_id UUID,
  source_excerpt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.investigation_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "investigation_findings own all" ON public.investigation_findings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_investigations_user_created ON public.investigations(user_id, created_at DESC);
CREATE INDEX idx_findings_investigation ON public.investigation_findings(investigation_id);

CREATE TRIGGER trg_investigations_updated_at
  BEFORE UPDATE ON public.investigations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
