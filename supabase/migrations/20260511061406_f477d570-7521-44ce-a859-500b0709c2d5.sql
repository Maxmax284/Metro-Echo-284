CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TYPE public.executor_kind AS ENUM ('webhook', 'telegram');

CREATE TABLE public.action_executors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  kind public.executor_kind NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.action_executors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "executors own all" ON public.action_executors
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_action_executors_updated_at
  BEFORE UPDATE ON public.action_executors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_action_executors_user ON public.action_executors(user_id);