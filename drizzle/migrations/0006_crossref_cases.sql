-- Cross-reference: multi-source investigation cases.
CREATE TABLE public.cross_ref_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid NULL,
  title text NOT NULL DEFAULT 'Cross-reference',
  purpose text NULL,
  recipe_id text NULL,
  thread_id uuid NULL,
  status text NOT NULL DEFAULT 'draft',
  output_shape text NULL,
  style text NULL,
  summary text NULL,
  brief_export_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cross_ref_cases_status_chk CHECK (status IN ('draft','reading','matrix_ready','reviewed','composed','failed'))
);

CREATE TABLE public.case_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cross_ref_cases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  ingested_file_id uuid NULL,
  filename text NOT NULL,
  mime_type text NULL,
  content_hash text NULL,
  role text NOT NULL DEFAULT 'unknown',
  authority_rank int NOT NULL DEFAULT 50,
  authority_fields text[] NOT NULL DEFAULT '{}',
  role_set_by text NOT NULL DEFAULT 'inferred',
  page_count int NOT NULL DEFAULT 1,
  extraction_status text NOT NULL DEFAULT 'pending',
  extracted_text text NULL,
  error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_sources_role_chk CHECK (role IN ('master','supporting','unknown')),
  CONSTRAINT case_sources_extraction_chk CHECK (extraction_status IN ('pending','reading','read','unreadable'))
);

CREATE TABLE public.case_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cross_ref_cases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  record_key text NOT NULL,
  display_label text NOT NULL,
  match_confidence text NOT NULL DEFAULT 'inferred',
  confirmed_by_user boolean NOT NULL DEFAULT false,
  source_ids uuid[] NOT NULL DEFAULT '{}',
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_records_conf_chk CHECK (match_confidence IN ('verified','inferred','uncertain'))
);

CREATE TABLE public.case_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cross_ref_cases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  source_id uuid NULL REFERENCES public.case_sources(id) ON DELETE CASCADE,
  record_key text NOT NULL,
  field text NOT NULL,
  value_text text NULL,
  value_number numeric NULL,
  unit text NULL,
  certainty text NOT NULL DEFAULT 'verified',
  page int NULL,
  excerpt text NULL,
  sensitive boolean NOT NULL DEFAULT false,
  derived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_claims_certainty_chk CHECK (certainty IN ('verified','inferred','uncertain'))
);

CREATE TABLE public.case_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cross_ref_cases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  record_key text NOT NULL,
  field text NOT NULL,
  kind text NOT NULL DEFAULT 'contradiction',
  claim_ids uuid[] NOT NULL DEFAULT '{}',
  resolution text NOT NULL DEFAULT 'pending',
  resolved_value text NULL,
  resolved_claim_id uuid NULL,
  resolved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_conflicts_kind_chk CHECK (kind IN ('contradiction','missing','unreadable','duplicate','stale')),
  CONSTRAINT case_conflicts_resolution_chk CHECK (resolution IN ('pending','chose_claim','manual_value','left_open'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cross_ref_cases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_claims TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_conflicts TO authenticated;
GRANT ALL ON public.cross_ref_cases TO service_role;
GRANT ALL ON public.case_sources TO service_role;
GRANT ALL ON public.case_records TO service_role;
GRANT ALL ON public.case_claims TO service_role;
GRANT ALL ON public.case_conflicts TO service_role;

ALTER TABLE public.cross_ref_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own cases" ON public.cross_ref_cases FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own case sources" ON public.case_sources FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own case records" ON public.case_records FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own case claims" ON public.case_claims FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own case conflicts" ON public.case_conflicts FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX cross_ref_cases_user_idx ON public.cross_ref_cases (user_id, created_at DESC);
CREATE INDEX case_sources_case_idx ON public.case_sources (case_id);
CREATE INDEX case_records_case_idx ON public.case_records (case_id, position);
CREATE INDEX case_claims_case_idx ON public.case_claims (case_id, record_key, field);
CREATE INDEX case_conflicts_case_idx ON public.case_conflicts (case_id, resolution);

CREATE TRIGGER cross_ref_cases_set_updated_at BEFORE UPDATE ON public.cross_ref_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();