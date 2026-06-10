CREATE TABLE public.intake_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_kind text NOT NULL CHECK (item_kind IN ('message','file','field_note','capture_group','note')),
  item_id text NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  restored_at timestamptz,
  reason text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_intake_dismissals_lookup
  ON public.intake_dismissals (user_id, item_kind, item_id, dismissed_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.intake_dismissals TO authenticated;
GRANT ALL ON public.intake_dismissals TO service_role;

ALTER TABLE public.intake_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intake_dismissals owner all"
  ON public.intake_dismissals FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.intake_dismissals;