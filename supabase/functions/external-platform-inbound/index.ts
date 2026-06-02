// external-platform-inbound — generic future platform webhook receiver.
// Source is selected from the signed envelope's source_platform field.
import { handleExternalPlatformWebhook } from "../_shared/externalPlatform.ts";

Deno.serve((req) => handleExternalPlatformWebhook(req));