CREATE TABLE public.external_platform_webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  source_platform TEXT NOT NULL,
  event_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  signature_status TEXT NOT NULL DEFAULT 'unknown',
  accepted BOOLEAN NOT NULL DEFAULT false,
  rejection_reason TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, source_platform, idempotency_key),
  CONSTRAINT external_platform_events_signature_status_check CHECK (signature_status IN ('unknown', 'missing', 'valid', 'invalid', 'not_required'))
);

GRANT SELECT ON public.external_platform_webhook_events TO authenticated;
GRANT ALL ON public.external_platform_webhook_events TO service_role;

ALTER TABLE public.external_platform_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their external webhook events"
ON public.external_platform_webhook_events
FOR SELECT
TO authenticated
USING (auth.uid() = owner_id AND public.has_role(auth.uid(), 'owner'::public.app_role));

CREATE POLICY "Service role manages external webhook events"
ON public.external_platform_webhook_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX idx_external_platform_events_owner_source_received
ON public.external_platform_webhook_events(owner_id, source_platform, received_at DESC);

CREATE TABLE public.external_platform_webhook_diagnostics (
  owner_id UUID NOT NULL,
  source_platform TEXT NOT NULL,
  display_name TEXT NOT NULL,
  webhook_configured BOOLEAN NOT NULL DEFAULT false,
  secret_fingerprint TEXT,
  last_received_at TIMESTAMPTZ,
  last_accepted_at TIMESTAMPTZ,
  last_rejected_at TIMESTAMPTZ,
  last_rejection_reason TEXT,
  last_event_type TEXT,
  last_idempotency_key TEXT,
  signature_status TEXT NOT NULL DEFAULT 'unknown',
  enabled BOOLEAN NOT NULL DEFAULT false,
  last_health_status TEXT NOT NULL DEFAULT 'unknown',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, source_platform),
  CONSTRAINT external_platform_diagnostics_signature_status_check CHECK (signature_status IN ('unknown', 'missing', 'valid', 'invalid', 'not_required')),
  CONSTRAINT external_platform_diagnostics_health_check CHECK (last_health_status IN ('unknown', 'healthy', 'warning', 'error', 'disabled'))
);

GRANT SELECT ON public.external_platform_webhook_diagnostics TO authenticated;
GRANT ALL ON public.external_platform_webhook_diagnostics TO service_role;

ALTER TABLE public.external_platform_webhook_diagnostics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their external webhook diagnostics"
ON public.external_platform_webhook_diagnostics
FOR SELECT
TO authenticated
USING (auth.uid() = owner_id AND public.has_role(auth.uid(), 'owner'::public.app_role));

CREATE POLICY "Service role manages external webhook diagnostics"
ON public.external_platform_webhook_diagnostics
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX idx_external_platform_diagnostics_updated
ON public.external_platform_webhook_diagnostics(owner_id, updated_at DESC);

CREATE TRIGGER update_external_platform_webhook_diagnostics_updated_at
BEFORE UPDATE ON public.external_platform_webhook_diagnostics
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();