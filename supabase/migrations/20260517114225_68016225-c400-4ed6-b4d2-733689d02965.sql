-- ============================================================
-- Stage 1: Corrections, Field Notes, Audit Annotations
-- Private by default. No org/shared columns yet (additive later).
-- ============================================================

-- ----- corrections -----
CREATE TABLE public.corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  scope text NOT NULL DEFAULT 'private'
    CHECK (scope IN ('private','org','shared_candidate','shared_approved')),
  surface text NOT NULL
    CHECK (surface IN ('awareness','memory','sherlock','intake','companion',
                       'actions','commitments','audit','telegram','research','other')),
  target_type text NOT NULL,
  target_id text NOT NULL,
  feedback_type text NOT NULL
    CHECK (feedback_type IN ('wrong','correct','outdated','not_useful','useful',
                             'override','reject','source_bad','risk_adjust','style')),
  original_value jsonb,
  corrected_value jsonb,
  user_note text,
  source_label text NOT NULL DEFAULT 'user_feedback',
  confidence_impact text NOT NULL DEFAULT 'none'
    CHECK (confidence_impact IN ('lower','raise','invalidate','none')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','archived','dismissed','expired')),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX corrections_user_idx       ON public.corrections (user_id);
CREATE INDEX corrections_target_idx     ON public.corrections (target_type, target_id);
CREATE INDEX corrections_status_idx     ON public.corrections (status) WHERE status = 'active';

ALTER TABLE public.corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "corrections own all" ON public.corrections
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER corrections_set_updated_at
  BEFORE UPDATE ON public.corrections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ----- field_notes -----
CREATE TABLE public.field_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  place_id uuid REFERENCES public.awareness_places(id) ON DELETE SET NULL,
  geo jsonb,
  location_label text,
  note_type text NOT NULL DEFAULT 'custom'
    CHECK (note_type IN ('place_status','hazard','transport','payments',
                         'connectivity','etiquette','scam','timing',
                         'source_quality','custom')),
  summary text NOT NULL,
  details text,
  confidence text NOT NULL DEFAULT 'medium'
    CHECK (confidence IN ('low','medium','high')),
  freshness text NOT NULL DEFAULT 'live'
    CHECK (freshness IN ('live','cached','stale','unknown')),
  sensitive boolean NOT NULL DEFAULT false,
  share_intent text NOT NULL DEFAULT 'private_only'
    CHECK (share_intent IN ('private_only','ask','anonymized_ok','org_only')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','archived','expired','deleted')),
  expires_at timestamptz,
  seasonal_context jsonb,
  weather_context jsonb,
  source_label text NOT NULL DEFAULT 'user_field_note',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX field_notes_user_idx   ON public.field_notes (user_id);
CREATE INDEX field_notes_place_idx  ON public.field_notes (place_id);
CREATE INDEX field_notes_status_idx ON public.field_notes (status) WHERE status = 'active';

ALTER TABLE public.field_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "field_notes own all" ON public.field_notes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER field_notes_set_updated_at
  BEFORE UPDATE ON public.field_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ----- audit_annotations (append-only sibling of audit_log) -----
CREATE TABLE public.audit_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  audit_event_id uuid REFERENCES public.audit_log(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'note'
    CHECK (kind IN ('note','correct','wrong','unnecessary','should_be_high_risk','context')),
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_annotations_user_idx  ON public.audit_annotations (user_id);
CREATE INDEX audit_annotations_event_idx ON public.audit_annotations (audit_event_id);

ALTER TABLE public.audit_annotations ENABLE ROW LEVEL SECURITY;

-- Insert + select only. No update, no delete — annotations are immutable.
CREATE POLICY "audit_annotations own insert" ON public.audit_annotations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "audit_annotations own select" ON public.audit_annotations
  FOR SELECT USING (auth.uid() = user_id);