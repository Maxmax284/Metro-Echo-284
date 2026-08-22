// gth-inbound — LMT Camp State webhook receiver (legacy path name, current label).
// Signal-only: signed events create inbox drafts/review items, never executions.
import { handleExternalPlatformWebhook } from "../_shared/externalPlatform.ts";

Deno.serve((req) => handleExternalPlatformWebhook(req, "ground_truth_hub"));