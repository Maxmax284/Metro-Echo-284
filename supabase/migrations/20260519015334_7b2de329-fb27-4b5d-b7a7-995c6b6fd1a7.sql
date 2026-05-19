CREATE TABLE IF NOT EXISTS public.awareness_overpass_cache (
  cell_key text PRIMARY KEY,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.awareness_overpass_cache ENABLE ROW LEVEL SECURITY;
-- No client-side policies: service-role only.
CREATE INDEX IF NOT EXISTS awareness_overpass_cache_fetched_at_idx
  ON public.awareness_overpass_cache (fetched_at);