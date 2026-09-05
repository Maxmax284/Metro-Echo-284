-- Trips: deliberate start/end only. Nothing starts on its own, every trip is
-- deletable, and points are only written while a trip is explicitly running.
CREATE TABLE public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  label text,
  purpose text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  start_place_id uuid REFERENCES public.awareness_places(id) ON DELETE SET NULL,
  end_place_id uuid REFERENCES public.awareness_places(id) ON DELETE SET NULL,
  start_label text,
  end_label text,
  distance_m numeric,
  point_count integer NOT NULL DEFAULT 0,
  closed_by text NOT NULL DEFAULT 'open',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.trip_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  accuracy_m double precision,
  kind text NOT NULL DEFAULT 'sample',
  label text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX trips_user_started_idx ON public.trips (user_id, started_at DESC);
CREATE INDEX trip_points_trip_idx ON public.trip_points (trip_id, recorded_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_points TO authenticated;
GRANT ALL ON public.trip_points TO service_role;

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own trips"
ON public.trips FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage their own trip points"
ON public.trip_points FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trips_set_updated_at BEFORE UPDATE ON public.trips
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();