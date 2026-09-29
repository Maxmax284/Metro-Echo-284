-- What Echo actually saw on the last check, so the radar can show a real
-- headline instead of a bare "nothing moved". Written by the sweep only.
ALTER TABLE public.watches ADD COLUMN IF NOT EXISTS last_read text;