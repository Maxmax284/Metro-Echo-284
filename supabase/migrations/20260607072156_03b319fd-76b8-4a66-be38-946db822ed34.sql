
CREATE TABLE public.project_suggestion_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  item_id uuid NOT NULL,
  user_id uuid NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, item_type, item_id)
);

CREATE INDEX idx_psd_project ON public.project_suggestion_dismissals (project_id);

GRANT SELECT, INSERT, DELETE ON public.project_suggestion_dismissals TO authenticated;
GRANT ALL ON public.project_suggestion_dismissals TO service_role;

ALTER TABLE public.project_suggestion_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "psd_select_own" ON public.project_suggestion_dismissals
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "psd_insert_own" ON public.project_suggestion_dismissals
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "psd_delete_own" ON public.project_suggestion_dismissals
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
