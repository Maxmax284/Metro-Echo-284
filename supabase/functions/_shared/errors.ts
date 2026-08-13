// Canonical server error vocabulary.
// Client-facing copy stays in Vanta voice: plain, calm, no exclamation marks,
// no provider payloads, no secrets. Internal detail goes to logs only.

import { jsonResponse } from "./http.ts";

export type FailureKind =
  | "unauthorized"
  | "forbidden"
  | "invalid_input"
  | "not_found"
  | "provider_disabled"
  | "budget_exceeded"
  | "rate_limited"
  | "provider_failed"
  | "internal";

const STATUS: Record<FailureKind, number> = {
  unauthorized: 401,
  forbidden: 403,
  invalid_input: 400,
  not_found: 404,
  provider_disabled: 503,
  budget_exceeded: 402,
  rate_limited: 429,
  provider_failed: 502,
  internal: 500,
};

const MESSAGE: Record<FailureKind, string> = {
  unauthorized: "Sign in and try again.",
  forbidden: "You do not have access to this in the current scope.",
  invalid_input: "That request was not valid. Check the details and retry.",
  not_found: "That record could not be found in this scope.",
  provider_disabled: "That capability is switched off right now.",
  budget_exceeded: "Usage limit reached. Try again later or raise the limit in Settings.",
  rate_limited: "Too many requests in a row. Wait a moment and retry.",
  provider_failed: "An outside service did not respond. Nothing was changed.",
  internal: "Something went wrong on our side. Nothing was changed.",
};

export function statusFor(kind: FailureKind): number {
  return STATUS[kind];
}

export function messageFor(kind: FailureKind): string {
  return MESSAGE[kind];
}

/** Standard failure response. `details` is only for validation field errors. */
export function failure(kind: FailureKind, details?: unknown): Response {
  const body: Record<string, unknown> = { error: kind, message: MESSAGE[kind] };
  if (details !== undefined) body.details = details;
  return jsonResponse(body, STATUS[kind]);
}

export const unauthorized = () => failure("unauthorized");
export const forbidden = () => failure("forbidden");
export const notFound = () => failure("not_found");
export const invalidInput = (details?: unknown) => failure("invalid_input", details);

/** Map an upstream provider HTTP status onto the canonical failure vocabulary. */
export function providerFailureKind(status: number): FailureKind {
  if (status === 429) return "rate_limited";
  if (status === 402) return "budget_exceeded";
  if (status === 401 || status === 403) return "provider_disabled";
  return "provider_failed";
}

/** Never let raw provider text or secrets reach the client. */
export function internalFailure(e: unknown): Response {
  console.error("[vanta] internal failure:", e instanceof Error ? e.message : e);
  return failure("internal");
}
