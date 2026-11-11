// offlineOutbox — the one door for writes that happen while the bars are gone.
//
// Doctrine:
//   - A capture offline is still a capture. It lands on the device with a
//     receipt ("Saved on this device — will sync"), never in a silent limbo.
//   - Replay is idempotent: the row's id is minted on the device, so a retried
//     sync hits the primary key and is recognised as already-there — never a
//     duplicate record.
//   - The sync leaves its own receipt (capture.synced_from_device) with the
//     original queue time, so the audit trail shows both beats: saved on
//     device, then landed on the record.
import { supabase } from "@/integrations/supabase/client";
import { vantaToast } from "@/lib/vantaVoice";

const STORAGE_KEY = "vanta.offline_outbox.v1";

export type OutboxTable = "notes" | "commitments";

/** The route receipt a capture would have written had it been online. */
export type OutboxRoute = {
  captureKind: string;
  source?: string | null;
  suggestedRoute?: string | null;
  userAction: string;
  newStatus?: string | null;
  auditEvent: string;
  payload?: Record<string, unknown>;
  /** Scope fields (organization_id) captured at queue time. */
  scope: Record<string, unknown>;
};

export type OutboxItem = {
  /** Also the row's primary key — minted here so replay can never double-write. */
  id: string;
  table: OutboxTable;
  row: Record<string, unknown>;
  route?: OutboxRoute | null;
  /** Plain words for the toast and the receipt. */
  label: string;
  queuedAt: string;
};

export function readOutbox(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOutbox(items: OutboxItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* A full device store is the one place we cannot keep the receipt. */
  }
}

export function outboxCount(): number {
  return readOutbox().length;
}

/** True when the failure is the network, not the server saying no. */
export function isOfflineLike(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  /* PostgREST errors are plain objects, not Error instances. */
  const msg =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown } | null)?.message === "string"
        ? (error as { message: string }).message
        : String(error ?? "");
  return /failed to fetch|networkerror|network request failed|fetch failed|load failed/i.test(msg);
}

function isDuplicateKey(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return e?.code === "23505" || /duplicate key/i.test(e?.message ?? "");
}

export type InsertOutcome =
  | { queued: false; id: string }
  | { queued: true; id: string }
  | { queued: false; error: unknown };

/**
 * Insert a capture row, or park it on the device when the network is the
 * problem. The id is minted here either way, so a queued row and a live row
 * are the same record — replay can never create a twin.
 */
export async function insertWithOutbox(
  table: OutboxTable,
  row: Record<string, unknown>,
  opts: { label: string; route?: OutboxRoute | null },
): Promise<InsertOutcome> {
  const id = crypto.randomUUID();
  const fullRow = { ...row, id };

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    enqueue({ id, table, row: fullRow, route: opts.route ?? null, label: opts.label, queuedAt: new Date().toISOString() });
    return { queued: true, id };
  }

  const { error } = await supabase.from(table).insert(fullRow as never);
  if (!error) return { queued: false, id };
  if (isOfflineLike(error)) {
    enqueue({ id, table, row: fullRow, route: opts.route ?? null, label: opts.label, queuedAt: new Date().toISOString() });
    return { queued: true, id };
  }
  return { queued: false, error };
}

function enqueue(item: OutboxItem): void {
  writeOutbox([...readOutbox(), item]);
  vantaToast.message(`${item.label} — saved on this device. It syncs itself when you're back on signal.`);
}

/** Replay one queued route receipt after its row landed. */
async function replayRoute(item: OutboxItem): Promise<void> {
  const route = item.route;
  if (!route) return;
  const userId = item.row.user_id as string;
  const auditPayload = {
    capture_kind: route.captureKind,
    capture_id: item.id,
    source: route.source ?? null,
    suggested_route: route.suggestedRoute ?? null,
    new_status: route.newStatus ?? null,
    synced_from_device: true,
    queued_at: item.queuedAt,
    ...(route.payload ?? {}),
  };
  const { data: audit } = await supabase
    .from("audit_log")
    .insert({
      user_id: userId,
      ...route.scope,
      entity_type: "capture",
      entity_id: null,
      event: route.auditEvent,
      payload: auditPayload,
    } as never)
    .select("id")
    .single();
  await supabase.from("capture_routes").insert({
    user_id: userId,
    ...route.scope,
    capture_kind: route.captureKind,
    capture_id: item.id,
    source: route.source ?? null,
    suggested_route: route.suggestedRoute ?? null,
    user_action: route.userAction,
    new_status: route.newStatus ?? null,
    audit_event_id: audit?.id ?? null,
    payload: { ...(route.payload ?? {}), synced_from_device: true, queued_at: item.queuedAt },
  } as never);
}

/**
 * Replay everything the device held, oldest first. Stops at the first network
 * failure — what remains stays queued for the next reconnect. A duplicate-key
 * answer means an earlier replay already landed: recognised, not an error.
 * Returns how many records synced this pass.
 */
export async function flushOutbox(): Promise<number> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return 0;
  const items = readOutbox();
  if (!items.length) return 0;

  const remaining: OutboxItem[] = [];
  let synced = 0;
  for (const item of items) {
    const { error } = await supabase.from(item.table).insert(item.row as never);
    if (error && isOfflineLike(error)) {
      remaining.push(item, ...items.slice(items.indexOf(item) + 1));
      break;
    }
    /* Duplicate key = an earlier replay already landed it. Still make sure the
       route receipt exists, then let the item go. */
    try {
      await replayRoute(item);
    } catch {
      /* The receipt retrying next pass is cheaper than blocking the queue. */
      if (error && !isDuplicateKey(error)) {
        remaining.push(item);
        continue;
      }
    }
    await supabase.from("audit_log").insert({
      user_id: item.row.user_id as string,
      ...(item.route?.scope ?? {}),
      entity_type: "capture",
      entity_id: item.id,
      event: "capture.synced_from_device",
      payload: { table: item.table, label: item.label, queued_at: item.queuedAt },
    } as never);
    synced++;
  }
  writeOutbox(remaining);
  if (synced > 0) {
    vantaToast.success(
      synced === 1
        ? "Back on signal — 1 capture synced from this device."
        : `Back on signal — ${synced} captures synced from this device.`,
    );
  }
  return synced;
}

let flushWired = false;

/** Wire the reconnect flush once per app load, and flush anything held over. */
export function initOutboxFlush(): void {
  if (flushWired || typeof window === "undefined") return;
  flushWired = true;
  window.addEventListener("online", () => {
    void flushOutbox();
  });
  /* Something queued before the last shutdown syncs now, without waiting for
     a network event that may never fire. */
  void flushOutbox();
}
