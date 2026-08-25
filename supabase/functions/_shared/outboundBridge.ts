// Outbound bridge — Vanta → external hub (LMT Camp State / Ground Truth Hub).
//
// This is the mirror of externalPlatform.ts. Inbound signals become captures;
// outbound *awareness updates* become signed notices on the hub side. It is
// notification only: the hub is told what Vanta noticed, never what to do.
// Nothing here executes anything, and nothing here can approve anything.
//
// Reliability is the whole point of this module:
//   1. Every update is written to `outbound_bridge_deliveries` first (durable).
//   2. A dispatcher drains the queue with exponential backoff.
//   3. An idempotency key rides along so a retry is never a duplicate.
//   4. Every terminal outcome lands in `audit_log`.

export type BridgeTarget = {
  /** Stable key, e.g. "ground_truth_hub". */
  target: string;
  url: string;
  secret: string;
};

export type BridgeUpdate = {
  ownerId: string;
  organizationId?: string | null;
  /** e.g. "awareness.nudge", "capture.routed", "commitment.created" */
  eventType: string;
  title: string;
  lines?: string[];
  urgency?: "low" | "normal" | "high" | "critical";
  payload?: Record<string, unknown>;
  /** Stable per-situation key; retries reuse it, duplicates collapse on it. */
  idempotencyKey: string;
};

const MAX_ATTEMPTS = 6;
/** Backoff in seconds per attempt index: ~30s, 2m, 8m, 30m, 2h. */
const BACKOFF_SECONDS = [30, 120, 480, 1800, 7200, 21600];

/** Read an env var without assuming a Deno global (this module is also unit-tested). */
function env(name: string): string | undefined {
  const g = globalThis as unknown as { Deno?: { env: { get(k: string): string | undefined } } };
  return g.Deno?.env.get(name) ?? undefined;
}

/** Resolve the hub target from env. Returns null when the bridge is unconfigured. */
export function resolveBridgeTarget(target = "ground_truth_hub"): BridgeTarget | null {
  const map: Record<string, { url: string; secret: string }> = {
    ground_truth_hub: { url: "GTH_OUTBOUND_URL", secret: "GTH_OUTBOUND_SECRET" },
  };
  const names = map[target];
  if (!names) return null;
  const url = env(names.url)?.trim();
  const secret = env(names.secret)?.trim();
  if (!url || !secret) return null;
  return { target, url, secret };
}


export function backoffSecondsFor(attempts: number): number {
  const i = Math.max(0, Math.min(attempts, BACKOFF_SECONDS.length - 1));
  return BACKOFF_SECONDS[i];
}

export function isTerminalAttempt(attempts: number): boolean {
  return attempts >= MAX_ATTEMPTS;
}

/** Retry on transport errors, 429 and 5xx. A 4xx is the hub saying "never". */
export function shouldRetryStatus(status: number | null): boolean {
  if (status === null) return true;
  if (status === 429) return true;
  return status >= 500;
}

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Same signing scheme the inbound receivers verify: HMAC-SHA256 over `${ts}.${body}`. */
export async function signBridgeBody(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  return `sha256=${hex(sig)}`;
}

export function buildBridgeBody(update: BridgeUpdate, target: string) {
  return {
    source_platform: "vanta",
    target_platform: target,
    event_type: update.eventType,
    idempotency_key: update.idempotencyKey,
    sent_at: new Date().toISOString(),
    notice: {
      title: update.title,
      lines: update.lines ?? [],
      urgency: update.urgency ?? "normal",
    },
    // Notification only — the hub must not treat this as an instruction.
    execution: { allowed: false, reason: "Vanta forwards awareness, never commands." },
    payload: update.payload ?? {},
  };
}

/**
 * Durably queue an awareness update for the hub. Never throws: a bridge problem
 * must not break the capture that produced the update.
 */
export async function enqueueBridgeUpdate(
  admin: any,
  update: BridgeUpdate,
  targetKey = "ground_truth_hub",
): Promise<{ queued: boolean; reason: "queued" | "duplicate" | "not_configured" | "error" }> {
  const target = resolveBridgeTarget(targetKey);
  if (!target) return { queued: false, reason: "not_configured" };
  try {
    const { error } = await admin.from("outbound_bridge_deliveries").insert({
      owner_id: update.ownerId,
      organization_id: update.organizationId ?? null,
      target: target.target,
      event_type: update.eventType,
      idempotency_key: update.idempotencyKey,
      body: buildBridgeBody(update, target.target),
      status: "pending",
      next_attempt_at: new Date().toISOString(),
    });
    if (error) {
      // Unique violation on (target, idempotency_key) means it is already queued.
      if (String(error.code) === "23505") return { queued: false, reason: "duplicate" };
      console.error("bridge enqueue failed:", error.message);
      return { queued: false, reason: "error" };
    }
    return { queued: true, reason: "queued" };
  } catch (e) {
    console.error("bridge enqueue threw:", e instanceof Error ? e.message : e);
    return { queued: false, reason: "error" };
  }
}

export type BridgeAttemptOutcome = {
  ok: boolean;
  status: number | null;
  error: string | null;
};

export async function postBridgeUpdate(
  target: BridgeTarget,
  body: Record<string, unknown>,
  idempotencyKey: string,
): Promise<BridgeAttemptOutcome> {
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  try {
    const signature = await signBridgeBody(target.secret, timestamp, raw);
    const res = await fetch(target.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Vanta-Signature": signature,
        "X-Vanta-Timestamp": timestamp,
        "X-Vanta-Idempotency-Key": idempotencyKey,
      },
      body: raw,
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      return { ok: false, status: res.status, error: detail || `hub returned ${res.status}` };
    }
    await res.text().catch(() => "");
    return { ok: true, status: res.status, error: null };
  } catch (e) {
    return { ok: false, status: null, error: e instanceof Error ? e.message : "send failed" };
  }
}

/** Drain up to `limit` due rows. Safe to call on a schedule or by hand. */
export async function drainBridgeQueue(admin: any, limit = 25) {
  const summary = { attempted: 0, delivered: 0, retrying: 0, failed: 0, skipped: 0 };
  const { data: rows } = await admin
    .from("outbound_bridge_deliveries")
    .select("id, owner_id, organization_id, target, event_type, idempotency_key, body, attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(limit);

  for (const row of (rows ?? []) as any[]) {
    const target = resolveBridgeTarget(row.target);
    if (!target) {
      summary.skipped += 1;
      continue;
    }
    summary.attempted += 1;
    const outcome = await postBridgeUpdate(target, row.body, row.idempotency_key);
    const attempts = (row.attempts ?? 0) + 1;

    if (outcome.ok) {
      await admin.from("outbound_bridge_deliveries").update({
        status: "delivered",
        attempts,
        delivered_at: new Date().toISOString(),
        last_error: null,
      }).eq("id", row.id);
      summary.delivered += 1;
      await audit(admin, row, "ecosystem.bridge.delivered", { attempts, status: outcome.status });
      continue;
    }

    const retryable = shouldRetryStatus(outcome.status) && !isTerminalAttempt(attempts);
    if (retryable) {
      const next = new Date(Date.now() + backoffSecondsFor(attempts) * 1000).toISOString();
      await admin.from("outbound_bridge_deliveries").update({
        attempts,
        next_attempt_at: next,
        last_error: outcome.error,
      }).eq("id", row.id);
      summary.retrying += 1;
      continue;
    }

    await admin.from("outbound_bridge_deliveries").update({
      status: "failed",
      attempts,
      last_error: outcome.error,
    }).eq("id", row.id);
    summary.failed += 1;
    await audit(admin, row, "ecosystem.bridge.failed", {
      attempts,
      status: outcome.status,
      error: outcome.error,
    });
  }

  return summary;
}

async function audit(admin: any, row: any, event: string, extra: Record<string, unknown>) {
  await admin.from("audit_log").insert({
    user_id: row.owner_id,
    organization_id: row.organization_id ?? null,
    entity_type: "integration",
    entity_id: row.id,
    event,
    payload: {
      target: row.target,
      event_type: row.event_type,
      idempotency_key: row.idempotency_key,
      ...extra,
    },
  }).then(() => {}, () => {});
}
