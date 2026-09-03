ALTER TABLE public.commitments
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'you_owe',
  ADD COLUMN IF NOT EXISTS counterparty text;

ALTER TABLE public.commitments
  DROP CONSTRAINT IF EXISTS commitments_direction_check;

ALTER TABLE public.commitments
  ADD CONSTRAINT commitments_direction_check
  CHECK (direction IN ('you_owe', 'owed_to_you'));

CREATE INDEX IF NOT EXISTS commitments_direction_idx
  ON public.commitments (user_id, direction, status);