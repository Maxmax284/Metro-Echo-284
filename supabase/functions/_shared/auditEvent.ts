// writeAuditEvent — one envelope for every receipt Echo leaves behind.
// Doctrine: every state change emits an event, scoped to the room it happened in.
// Pure module apart from the client passed in, so the envelope builder is testable.

export type AuditEnvelope = {
  user_id: string;
  organization_id: string | null;
  entity_type: string;
  entity_id: string | null;
  event: string;
  payload: Record<string, unknown>;
};

export type AuditEventInput = {
  actor: string; // user id
  organizationId?: string | null;
  entityType: string;
  entityId?: string | null;
  event: string;
  source?: string;
  previousState?: string | null;
  nextState?: string | null;
  success?: boolean;
  metadata?: Record<string, unknown>;
};

/** Build the canonical audit row. Specialised fields live under payload. */
export function buildAuditEnvelope(input: AuditEventInput): AuditEnvelope {
  const payload: Record<string, unknown> = { ...(input.metadata ?? {}) };
  if (input.source !== undefined) payload.source = input.source;
  if (input.previousState !== undefined && input.previousState !== null) payload.from = input.previousState;
  if (input.nextState !== undefined && input.nextState !== null) payload.to = input.nextState;
  if (input.success !== undefined) payload.success = input.success;
  return {
    user_id: input.actor,
    organization_id: input.organizationId ?? null,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    event: input.event,
    payload,
  };
}

type MinimalDb = { from: (table: string) => { insert: (row: unknown) => Promise<unknown> | unknown } };

/** Best-effort receipt write — never block or fail a request on an audit insert. */
export async function writeAuditEvent(db: MinimalDb, input: AuditEventInput): Promise<void> {
  try {
    await db.from("audit_log").insert(buildAuditEnvelope(input));
  } catch (e) {
    console.error("[vanta] audit write failed:", e instanceof Error ? e.message : e);
  }
}
