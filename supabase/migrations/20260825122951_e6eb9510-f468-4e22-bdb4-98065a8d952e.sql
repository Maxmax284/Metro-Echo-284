CREATE TABLE public.outbound_bridge_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NULL,
  target text NOT NULL,
  event_type text NOT NULL,
  idempotency_key text NOT NULL,
  body jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz NULL,
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX outbound_bridge_deliveries_dedupe
  ON public.outbound_bridge_deliveries (target, idempotency_key);
CREATE INDEX outbound_bridge_deliveries_due
  ON public.outbound_bridge_deliveries (status, next_attempt_at);
CREATE INDEX outbound_bridge_deliveries_owner
  ON public.outbound_bridge_deliveries (owner_id, created_at DESC);

GRANT SELECT ON public.outbound_bridge_deliveries TO authenticated;
GRANT ALL ON public.outbound_bridge_deliveries TO service_role;

ALTER TABLE public.outbound_bridge_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their own bridge deliveries"
  ON public.outbound_bridge_deliveries FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE TRIGGER outbound_bridge_deliveries_set_updated_at
  BEFORE UPDATE ON public.outbound_bridge_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

SELECT cron.schedule(
  'vanta-bridge-dispatch',
  '*/5 * * * *',
  $$select net.http_post(
      url := 'https://dsyjofggptfblxftqtpv.supabase.co/functions/v1/bridge-dispatch',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{"source":"cron"}'::jsonb
    ) as request_id;$$
);