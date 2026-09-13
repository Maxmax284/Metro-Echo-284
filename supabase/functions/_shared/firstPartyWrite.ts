// firstPartyWrite — the Act half of a first-party connection.
//
// Doctrine this file exists to hold:
//   - Nothing here runs on its own. It is only ever called by actions-execute,
//     which means a proposal was staged, a person said yes, and a receipt is
//     already waiting to be written.
//   - A write is not done until the provider says it is done. No optimistic
//     success, no "probably landed". If the response does not confirm, the
//     action fails and the receipt says so.
//   - Every attempt carries an idempotency key, so a retry after a timeout can
//     never create a second booking, payment or cancellation.
//   - Unconfigured is not broken. If the provider has not been wired up, this
//     returns `configured: false` and the caller says so in plain words rather
//     than inventing a connection.
//
// Provider-agnostic on purpose: CampCore and Fenrir Lock plug into the same
// contract by adding one row to PROVIDER_ENV.
import { signBridgeBody } from "./outboundBridge.ts";

/** Env var names per provider: base URL + shared secret. */
const PROVIDER_ENV: Record<string, { base: string; secret: string; token: string }> = {
  ground_truth_hub: { base: "GTH_WRITE_URL", secret: "GTH_WRITE_SECRET", token: "GTH_WRITE_TOKEN" },
  campcore: { base: "CAMPCORE_WRITE_URL", secret: "CAMPCORE_WRITE_SECRET", token: "CAMPCORE_WRITE_TOKEN" },
  fenrir_lock: { base: "FENRIR_WRITE_URL", secret: "FENRIR_WRITE_SECRET", token: "FENRIR_WRITE_TOKEN" },
};

function env(name: string): string | undefined {
  const g = globalThis as unknown as { Deno?: { env: { get(k: string): string | undefined } } };
  return g.Deno?.env.get(name) ?? undefined;
}

export type WriteTarget = { provider: string; url: string; secret: string; token: string | null };

/** Null means "this provider has not been wired up yet", not "something failed". */
export function resolveWriteTarget(provider: string): WriteTarget | null {
  const names = PROVIDER_ENV[provider];
  if (!names) return null;
  const url = env(names.base)?.trim();
  const secret = env(names.secret)?.trim();
  if (!url || !secret) return null;
  return { provider, url, secret, token: env(names.token)?.trim() ?? null };
}

/** The operations Echo is allowed to ask a first-party product to perform. */
export const WRITE_OPERATIONS = [
  "booking.update",
  "booking.cancel",
  "guest_message.send",
  "note.create",
  "task.create",
] as const;
export type WriteOperation = (typeof WRITE_OPERATIONS)[number];

export function isWriteOperation(v: unknown): v is WriteOperation {
  return typeof v === "string" && (WRITE_OPERATIONS as readonly string[]).includes(v);
}

export type WriteRequest = {
  provider: string;
  operation: WriteOperation;
  /** The provider's own id for the thing being changed. */
  subjectId: string | null;
  fields: Record<string, unknown>;
  /** Stable per-action key. A retry reuses it; the provider must collapse it. */
  idempotencyKey: string;
  actionId: string;
};

/** What the provider must send back for Echo to call a write done. */
export type WriteConfirmation = {
  ok: true;
  provider: string;
  operation: WriteOperation;
  /** The provider's id for the resulting record. */
  id: string;
  /** The provider's own word for where the record now stands. */
  state: string | null;
  confirmed_at: string;
  /** Anything the provider wants on the receipt, kept short. */
  detail?: Record<string, unknown>;
};

export class WriteNotConfirmed extends Error {}

/**
 * Read the provider's answer strictly. A 200 with a vague body is a failure:
 * a receipt that says "changed" has to be backed by the provider's own id.
 */
export function readConfirmation(
  provider: string,
  operation: WriteOperation,
  status: number,
  body: unknown,
): WriteConfirmation {
  const b = (body ?? {}) as Record<string, unknown>;
  if (status < 200 || status >= 300) {
    const reason = typeof b.error === "string" ? b.error : `HTTP ${status}`;
    throw new WriteNotConfirmed(reason);
  }
  if (b.ok !== true) throw new WriteNotConfirmed("the other side did not confirm the change");
  const id = typeof b.id === "string" && b.id ? b.id : null;
  if (!id) throw new WriteNotConfirmed("the other side confirmed without an id, so nothing can be proven");
  const confirmedAt = typeof b.confirmed_at === "string" ? b.confirmed_at : new Date().toISOString();
  return {
    ok: true,
    provider,
    operation,
    id,
    state: typeof b.state === "string" ? b.state : null,
    confirmed_at: confirmedAt,
    detail: (b.detail ?? undefined) as Record<string, unknown> | undefined,
  };
}

/** The exact body a first-party product receives. Signed, versioned, replay-safe. */
export function buildWriteBody(req: WriteRequest, timestamp: string) {
  return {
    version: 1,
    source: "metro_echo",
    operation: req.operation,
    subject_id: req.subjectId,
    fields: req.fields,
    idempotency_key: req.idempotencyKey,
    action_id: req.actionId,
    approved: true,
    sent_at: timestamp,
  };
}

/**
 * Perform one approved write. Throws when the provider is unreachable or does
 * not confirm — the caller turns that into a failed receipt, never a silent one.
 */
export async function performFirstPartyWrite(req: WriteRequest): Promise<WriteConfirmation> {
  const target = resolveWriteTarget(req.provider);
  if (!target) {
    throw new WriteNotConfirmed(
      "That connection can receive updates but cannot make changes yet, so nothing was changed.",
    );
  }
  const timestamp = String(Math.floor(Date.now() / 1000));
  const raw = JSON.stringify(buildWriteBody(req, timestamp));
  const signature = await signBridgeBody(target.secret, timestamp, raw);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Vanta-Signature": signature,
    "X-Vanta-Timestamp": timestamp,
    "Idempotency-Key": req.idempotencyKey,
  };
  if (target.token) headers.Authorization = `Bearer ${target.token}`;

  let status = 0;
  let body: unknown = null;
  try {
    const res = await fetch(target.url, { method: "POST", headers, body: raw });
    status = res.status;
    body = await res.json().catch(() => ({}));
  } catch {
    throw new WriteNotConfirmed("Could not reach that connection, so nothing was changed.");
  }
  return readConfirmation(req.provider, req.operation, status, body);
}
