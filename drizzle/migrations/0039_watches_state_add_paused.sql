ALTER TABLE public.watches DROP CONSTRAINT watches_state_check;
ALTER TABLE public.watches ADD CONSTRAINT watches_state_check
  CHECK (state = ANY (ARRAY['on_it','watching','waiting','needs_you','done','couldnt_finish','paused']));