-- The watch hand-off link could not be minted: no role held any privilege on
-- this table, so even service_role inserts failed silently. Grants are for the
-- backend only; the client never reads secrets.
GRANT ALL ON public.integration_webhook_secrets TO service_role;