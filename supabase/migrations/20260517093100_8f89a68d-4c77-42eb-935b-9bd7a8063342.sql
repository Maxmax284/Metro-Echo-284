ALTER TABLE public.awareness_briefings
  ADD COLUMN IF NOT EXISTS signal jsonb;

COMMENT ON COLUMN public.awareness_briefings.signal IS
  'Structured VantaSignal JSON: signal_type, confidence, source_labels, freshness, why_it_matters, what_to_do_next, requires_confirmation, available_routes, etc. Nullable for back-compat with prose-era rows.';