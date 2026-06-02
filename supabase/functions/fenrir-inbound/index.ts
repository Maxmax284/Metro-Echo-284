// fenrir-inbound — Fenrir Lock webhook receiver.
// Signal-only: signed events create inbox drafts/review items, never executions.
import { handleExternalPlatformWebhook } from "../_shared/externalPlatform.ts";

Deno.serve((req) => handleExternalPlatformWebhook(req, "fenrir_lock"));