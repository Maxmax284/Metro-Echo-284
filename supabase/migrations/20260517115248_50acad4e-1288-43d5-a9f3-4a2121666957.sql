CREATE TABLE public.privacy_settings (
  user_id uuid NOT NULL PRIMARY KEY,
  default_share_intent text NOT NULL DEFAULT 'private_only',
  ask_before_contributing boolean NOT NULL DEFAULT true,
  sensitive_by_default boolean NOT NULL DEFAULT false,
  allow_shared_aggregation boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.privacy_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "privacy_settings own select"
  ON public.privacy_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "privacy_settings own insert"
  ON public.privacy_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "privacy_settings own update"
  ON public.privacy_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER privacy_settings_set_updated_at
  BEFORE UPDATE ON public.privacy_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();