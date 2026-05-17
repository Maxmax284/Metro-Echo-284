ALTER TABLE public.system_controls
  ADD COLUMN IF NOT EXISTS community_reddit_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS community_public_fallback_enabled boolean NOT NULL DEFAULT true;