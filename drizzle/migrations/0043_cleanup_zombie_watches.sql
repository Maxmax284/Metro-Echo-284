-- Remove the old failed Bangkok watch and reset the stale WhatsApp headline
-- on the active one so the next sweep writes a real sitrep.
DELETE FROM public.watches WHERE id = '954f9bf4-e127-4c23-899e-5b43748e5af8';
UPDATE public.watches SET last_read = NULL, updated_at = now() WHERE id = '0583d597-2074-48c5-832c-696ac120dfcb';