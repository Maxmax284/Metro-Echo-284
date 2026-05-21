ALTER TABLE public.system_controls
  ADD COLUMN IF NOT EXISTS gth_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS campcore_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fenrir_enabled boolean NOT NULL DEFAULT false;