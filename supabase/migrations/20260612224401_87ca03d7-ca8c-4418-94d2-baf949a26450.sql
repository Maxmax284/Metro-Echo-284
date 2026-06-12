
-- Enums
CREATE TYPE public.document_kind AS ENUM ('nda','sow','service','lease','partnership','invoice','policy','letter','other','unknown');
CREATE TYPE public.document_status AS ENUM ('uploaded','extracting','extracted','reviewing','reviewed','failed');
CREATE TYPE public.document_version_source AS ENUM ('upload','extraction');
CREATE TYPE public.document_risk_severity AS ENUM ('low','medium','high');

-- documents
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  source_file_id uuid REFERENCES public.ingested_files(id) ON DELETE SET NULL,
  kind public.document_kind NOT NULL DEFAULT 'unknown',
  title text NOT NULL DEFAULT 'Untitled document',
  parties jsonb NOT NULL DEFAULT '[]'::jsonb,
  status public.document_status NOT NULL DEFAULT 'uploaded',
  latest_review_id uuid,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documents owner all" ON public.documents
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "documents org members read" ON public.documents
  FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "documents org members write" ON public.documents
  FOR UPDATE TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid()))
  WITH CHECK (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid()));
CREATE INDEX documents_user_idx ON public.documents(user_id, created_at DESC);
CREATE INDEX documents_project_idx ON public.documents(project_id);
CREATE INDEX documents_org_idx ON public.documents(organization_id);
CREATE TRIGGER documents_set_updated BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- document_versions
CREATE TABLE public.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  version_no integer NOT NULL DEFAULT 1,
  body_text text,
  body_storage_path text,
  source public.document_version_source NOT NULL DEFAULT 'extraction',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_versions TO authenticated;
GRANT ALL ON public.document_versions TO service_role;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_versions owner all" ON public.document_versions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE INDEX document_versions_doc_idx ON public.document_versions(document_id, version_no DESC);

-- document_reviews
CREATE TABLE public.document_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.document_versions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  summary text,
  parties jsonb NOT NULL DEFAULT '[]'::jsonb,
  key_dates jsonb NOT NULL DEFAULT '[]'::jsonb,
  money_terms jsonb NOT NULL DEFAULT '[]'::jsonb,
  obligations jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_or_unclear jsonb NOT NULL DEFAULT '[]'::jsonb,
  questions_to_ask jsonb NOT NULL DEFAULT '[]'::jsonb,
  verdict text,
  model text,
  generated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_reviews TO authenticated;
GRANT ALL ON public.document_reviews TO service_role;
ALTER TABLE public.document_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_reviews owner all" ON public.document_reviews
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE INDEX document_reviews_doc_idx ON public.document_reviews(document_id, generated_at DESC);

-- document_risks
CREATE TABLE public.document_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.document_reviews(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  severity public.document_risk_severity NOT NULL DEFAULT 'medium',
  title text NOT NULL,
  plain_english text,
  clause_ref text,
  suggested_question text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_risks TO authenticated;
GRANT ALL ON public.document_risks TO service_role;
ALTER TABLE public.document_risks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_risks owner all" ON public.document_risks
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE INDEX document_risks_review_idx ON public.document_risks(review_id);
CREATE INDEX document_risks_doc_idx ON public.document_risks(document_id);

-- document_obligations
CREATE TABLE public.document_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.document_reviews(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  party text,
  what text,
  when_text text,
  conditions text,
  source_clause_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_obligations TO authenticated;
GRANT ALL ON public.document_obligations TO service_role;
ALTER TABLE public.document_obligations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_obligations owner all" ON public.document_obligations
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE INDEX document_obligations_review_idx ON public.document_obligations(review_id);
CREATE INDEX document_obligations_doc_idx ON public.document_obligations(document_id);

-- Add FK from documents.latest_review_id after both tables exist
ALTER TABLE public.documents
  ADD CONSTRAINT documents_latest_review_fk
  FOREIGN KEY (latest_review_id) REFERENCES public.document_reviews(id) ON DELETE SET NULL;
