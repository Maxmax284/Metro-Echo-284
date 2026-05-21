
-- Sherlock 3 — Ambient Recognition Layer schema

CREATE TABLE IF NOT EXISTS public.sherlock_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_object_id uuid,
  source_object_type text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('observe','extract','relate','suggest','investigate')),
  finding_type text NOT NULL,
  summary text NOT NULL,
  extracted_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  suggested_action text,
  suggested_relation_type text,
  target_object_id uuid,
  target_object_type text,
  confidence text NOT NULL DEFAULT 'medium' CHECK (confidence IN ('low','medium','high')),
  rationale text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','edited','dismissed','expired')),
  surface_origin text,
  sensitive_flag boolean NOT NULL DEFAULT false,
  cooldown_until timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  audit_event_id uuid,
  evidence_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sherlock_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sherlock_findings own all"
ON public.sherlock_findings
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sherlock_findings_pending
  ON public.sherlock_findings (user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sherlock_findings_source
  ON public.sherlock_findings (user_id, source_object_type, source_object_id);
CREATE INDEX IF NOT EXISTS idx_sherlock_findings_target
  ON public.sherlock_findings (user_id, target_object_type, target_object_id);
CREATE INDEX IF NOT EXISTS idx_sherlock_findings_cooldown
  ON public.sherlock_findings (user_id, status, cooldown_until)
  WHERE status = 'dismissed';

CREATE TRIGGER trg_sherlock_findings_updated
  BEFORE UPDATE ON public.sherlock_findings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE IF NOT EXISTS public.sherlock_settings (
  user_id uuid PRIMARY KEY,
  ambient_enabled boolean NOT NULL DEFAULT true,
  show_low_confidence boolean NOT NULL DEFAULT false,
  sensitive_caution boolean NOT NULL DEFAULT true,
  show_in_canvas boolean NOT NULL DEFAULT true,
  show_in_briefings boolean NOT NULL DEFAULT true,
  dismissed_cooldown_days integer NOT NULL DEFAULT 7 CHECK (dismissed_cooldown_days >= 0),
  manual_only_for_sensitive boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sherlock_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sherlock_settings own all"
ON public.sherlock_settings
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_sherlock_settings_updated
  BEFORE UPDATE ON public.sherlock_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
