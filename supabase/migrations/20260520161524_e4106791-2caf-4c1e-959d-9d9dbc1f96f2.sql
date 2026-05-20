CREATE UNIQUE INDEX IF NOT EXISTS nudges_user_dedupe_uniq
  ON public.nudges (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;