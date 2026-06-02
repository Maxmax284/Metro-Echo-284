ALTER TABLE public.integration_webhook_secrets
DROP CONSTRAINT IF EXISTS integration_webhook_secrets_key_check;

UPDATE public.integration_webhook_secrets
SET integration_key = CASE integration_key
  WHEN 'gth' THEN 'ground_truth_hub'
  WHEN 'fenrir' THEN 'fenrir_lock'
  ELSE integration_key
END
WHERE integration_key IN ('gth', 'fenrir');

ALTER TABLE public.integration_webhook_secrets
ADD CONSTRAINT integration_webhook_secrets_key_check
CHECK (integration_key IN ('ground_truth_hub', 'campcore', 'fenrir_lock', 'website_forms', 'whatsapp'));

CREATE INDEX IF NOT EXISTS idx_integration_webhook_secrets_owner_key
ON public.integration_webhook_secrets(owner_id, integration_key);