CREATE TABLE public.watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid,
  goal text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('action_settled','calendar_event')),
  subject_id uuid,
  source text NOT NULL DEFAULT 'app',
  state text NOT NULL DEFAULT 'on_it'
    CHECK (state IN ('on_it','watching','waiting','needs_you','done','couldnt_finish')),
  cadence_minutes integer NOT NULL DEFAULT 30,
  next_check_at timestamptz NOT NULL DEFAULT now(),
  last_check_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 96,
  stop_at timestamptz,
  success_when jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.watches TO authenticated;
GRANT ALL ON public.watches TO service_role;

ALTER TABLE public.watches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own watches are readable" ON public.watches
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own watches are insertable" ON public.watches
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own watches are updatable" ON public.watches
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own watches are deletable" ON public.watches
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX watches_due_idx ON public.watches (next_check_at)
  WHERE state IN ('on_it','watching','waiting');
CREATE INDEX watches_user_idx ON public.watches (user_id, updated_at DESC);