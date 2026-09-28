ALTER TABLE public.watches DROP CONSTRAINT IF EXISTS watches_kind_check;
ALTER TABLE public.watches ADD CONSTRAINT watches_kind_check
  CHECK (kind = ANY (ARRAY['action_settled'::text, 'calendar_event'::text, 'web_page'::text, 'web_search'::text]));