-- Flight readings reach an open day rail the moment they land.
-- The watcher stamps a flight only when something actually changed; broadcasting
-- that row lets the rail re-time itself immediately instead of waiting for the
-- next sweep. RLS still decides who may read the row.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.flight_plans;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- A removal has to carry its owner and room, or the client cannot tell whose
-- rail it belongs to.
ALTER TABLE public.flight_plans REPLICA IDENTITY FULL;