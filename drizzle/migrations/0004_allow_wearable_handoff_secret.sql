-- The watch hand-off token had nowhere legal to live: the key and name checks
-- predate the wearable loop, so every mint was rejected. Allow it explicitly.
ALTER TABLE public.integration_webhook_secrets
  DROP CONSTRAINT integration_webhook_secrets_key_check,
  DROP CONSTRAINT integration_webhook_secrets_name_check;

ALTER TABLE public.integration_webhook_secrets
  ADD CONSTRAINT integration_webhook_secrets_key_check
  CHECK (integration_key = ANY (ARRAY['ground_truth_hub','campcore','fenrir_lock','website_forms','whatsapp','wearable'])),
  ADD CONSTRAINT integration_webhook_secrets_name_check
  CHECK (secret_name = ANY (ARRAY['GTH_WEBHOOK_SECRET','CAMPCORE_WEBHOOK_SECRET','FENRIR_WEBHOOK_SECRET','WEBSITE_FORMS_SECRET','WHATSAPP_PROVIDER_TOKEN','WHATSAPP_WEBHOOK_VERIFY_TOKEN','Watch hand-off']));