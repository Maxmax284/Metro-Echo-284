CREATE TABLE public.integration_webhook_secrets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  integration_key TEXT NOT NULL,
  secret_name TEXT NOT NULL,
  secret_value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, secret_name),
  CONSTRAINT integration_webhook_secrets_key_check CHECK (integration_key IN ('gth', 'campcore', 'fenrir', 'website_forms', 'whatsapp')),
  CONSTRAINT integration_webhook_secrets_name_check CHECK (secret_name IN ('GTH_WEBHOOK_SECRET', 'CAMPCORE_WEBHOOK_SECRET', 'FENRIR_WEBHOOK_SECRET', 'WEBSITE_FORMS_SECRET', 'WHATSAPP_PROVIDER_TOKEN', 'WHATSAPP_WEBHOOK_VERIFY_TOKEN')),
  CONSTRAINT integration_webhook_secrets_value_length_check CHECK (char_length(secret_value) BETWEEN 16 AND 4096)
);

GRANT ALL ON public.integration_webhook_secrets TO service_role;

ALTER TABLE public.integration_webhook_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages integration webhook secrets"
ON public.integration_webhook_secrets
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX idx_integration_webhook_secrets_owner_name
ON public.integration_webhook_secrets(owner_id, secret_name);

CREATE TRIGGER update_integration_webhook_secrets_updated_at
BEFORE UPDATE ON public.integration_webhook_secrets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();