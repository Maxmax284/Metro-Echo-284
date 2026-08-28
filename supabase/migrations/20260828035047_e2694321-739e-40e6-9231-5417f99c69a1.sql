CREATE TABLE public.calendar_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  feed_id uuid NOT NULL REFERENCES public.calendar_feeds(id) ON DELETE CASCADE,
  event_uid text NOT NULL,
  title text,
  change text NOT NULL CHECK (change IN ('added','moved','cancelled')),
  old_starts_at timestamptz,
  new_starts_at timestamptz,
  was_filed boolean NOT NULL DEFAULT false,
  detected_at timestamptz NOT NULL DEFAULT now(),
  signaled_at timestamptz
);

GRANT SELECT, DELETE ON public.calendar_changes TO authenticated;
GRANT ALL ON public.calendar_changes TO service_role;

ALTER TABLE public.calendar_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own calendar changes"
  ON public.calendar_changes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users clear their own calendar changes"
  ON public.calendar_changes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX calendar_changes_user_detected_idx ON public.calendar_changes (user_id, detected_at DESC);
CREATE INDEX calendar_changes_pending_idx ON public.calendar_changes (user_id, signaled_at) WHERE signaled_at IS NULL;

ALTER TABLE public.calendar_feeds
  ADD COLUMN IF NOT EXISTS last_added integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_moved integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_cancelled integer NOT NULL DEFAULT 0;