// Receipt lookup — connects an action to its exact audit_log record.
// Doctrine: every execution leaves a receipt, and the user can always reach it
// from the card that ran the work.
import { supabase } from "@/integrations/supabase/client";

export type ReceiptRow = {
  id: string;
  event: string;
  entity_type: string;
  entity_id: string | null;
  payload: unknown;
  created_at: string;
};

/** Newest audit row for one action, or null when nothing has been written yet. */
export async function fetchActionReceipt(actionId: string): Promise<ReceiptRow | null> {
  const { data } = await supabase
    .from("audit_log")
    .select("id, event, entity_type, entity_id, payload, created_at")
    .eq("entity_type", "action")
    .eq("entity_id", actionId)
    .order("created_at", { ascending: false })
    .limit(1);
  return ((data ?? [])[0] as ReceiptRow | undefined) ?? null;
}

/**
 * Receipts are written by the edge function right after the executor returns,
 * so the row can land a beat after the client hears "ok". Poll briefly instead
 * of showing an empty drawer.
 */
export async function waitForActionReceipt(
  actionId: string,
  opts: { attempts?: number; delayMs?: number; since?: string } = {},
): Promise<ReceiptRow | null> {
  const attempts = opts.attempts ?? 6;
  const delayMs = opts.delayMs ?? 500;
  for (let i = 0; i < attempts; i++) {
    const row = await fetchActionReceipt(actionId);
    if (row && (!opts.since || row.created_at > opts.since)) return row;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return fetchActionReceipt(actionId);
}

/** Cross-surface hand-off: jump to Receipts filtered to one action. */
export const OPEN_RECEIPTS_EVENT = "vanta:open-receipts";

export function openReceiptsFor(actionId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<{ actionId: string }>(OPEN_RECEIPTS_EVENT, { detail: { actionId } }));
}
