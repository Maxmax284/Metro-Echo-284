// archive — one way to get something off a desk without losing the record.
//
// Doctrine: clearing clutter is not forgetting. Archiving hides a row from the
// desks and leaves an audit event behind; deleting writes a snapshot receipt
// first, so provenance survives the row. Never a silent removal.
import { supabase } from "@/integrations/supabase/client";

export type ArchivableKind = "place" | "action";

const TABLE = {
  place: "awareness_places",
  action: "actions",
} as const satisfies Record<ArchivableKind, string>;

/** What the buttons promise, in one place so every surface says the same thing. */
export const ARCHIVE_COPY = {
  hint: "Archiving takes it off the desk. The record stays in Receipts, and you can bring it back.",
  deleteHint: "Deleting removes the row. Echo writes a receipt of what it was first.",
};

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function receipt(kind: ArchivableKind, id: string, event: string, payload: Record<string, unknown>) {
  const user_id = await currentUserId();
  if (!user_id) return;
  await supabase.from("audit_log").insert({
    user_id,
    entity_type: kind,
    entity_id: id,
    event,
    payload,
  } as never);
}

/** Soft-hide a row. Reversible, and it leaves an event behind. */
export async function archiveRecord(
  kind: ArchivableKind,
  id: string,
  opts: { label?: string | null; reason?: string } = {},
): Promise<void> {
  const { error } = await supabase
    .from(TABLE[kind])
    .update({ archived_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) throw error;
  await receipt(kind, id, `${kind}.archived`, {
    label: opts.label ?? null,
    reason: opts.reason ?? "cleared from the desk",
  });
}

/** Put it back on the desk exactly as it was. */
export async function restoreRecord(
  kind: ArchivableKind,
  id: string,
  opts: { label?: string | null } = {},
): Promise<void> {
  const { error } = await supabase
    .from(TABLE[kind])
    .update({ archived_at: null } as never)
    .eq("id", id);
  if (error) throw error;
  await receipt(kind, id, `${kind}.restored`, { label: opts.label ?? null });
}

/** Snapshot receipt written before a row is really gone. */
export async function recordDeletion(
  kind: ArchivableKind,
  id: string,
  snapshot: Record<string, unknown>,
): Promise<void> {
  await receipt(kind, id, `${kind}.deleted`, { snapshot });
}
