// briefCore — the shared spine under every brief-shaped document.
//
// The composers differ in a real way (AI-composed briefs vs deterministic
// recaps vs project summaries), so they stay separate strategies. What they
// share now lives here once: types, signal hashing, receipt appendix building,
// persistence into brief_exports and the audit receipt.
//
// Output shapes are unchanged — this file adapts at the boundary.

import { writeAuditEvent } from "./auditEvent.ts";

export type BriefGrounding = { kind: string; id: string; label?: string };

export type BriefSectionKind = "prose" | "list" | "timeline" | "decision" | "receipts" | "pull_quote";

export type BriefSection = {
  id: string;
  heading?: string;
  kind?: BriefSectionKind;
  body: unknown;
  receipts?: BriefGrounding[];
};

export type BriefScopeKind = "system" | "entity" | "project" | "recap_weekly" | "recap_monthly";

/** Stable 24-char fingerprint of the signals a brief was built from. */
export async function signalsHash(input: unknown): Promise<string> {
  const buf = new TextEncoder().encode(typeof input === "string" ? input : JSON.stringify(input));
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 24);
}

/** Audit rows → the appendix receipts every brief carries. */
export function receiptAppendix(
  auditRows: Array<{ id: string; event?: string; created_at?: string }>,
  limit = 12,
): BriefGrounding[] {
  return auditRows.slice(0, limit).map((a) => ({
    kind: "audit",
    id: a.id,
    label: `${a.event ?? "event"} · ${a.created_at ?? ""}`,
  }));
}

type MinimalDb = { from: (table: string) => any };

/** Persist a composed brief as a draft export. Returns the new row id. */
export async function persistBriefDraft(
  db: MinimalDb,
  input: {
    userId: string;
    organizationId?: string | null;
    entityId?: string | null;
    projectId?: string | null;
    format: string;
    scopeKind: BriefScopeKind;
    title: string;
    subtitle?: string | null;
    brief: unknown;
    signalsHash?: string | null;
  },
): Promise<string | null> {
  const { data, error } = await db
    .from("brief_exports")
    .insert({
      user_id: input.userId,
      organization_id: input.organizationId ?? null,
      entity_id: input.entityId ?? null,
      project_id: input.projectId ?? null,
      format: input.format,
      scope_kind: input.scopeKind,
      title: input.title,
      subtitle: input.subtitle ?? null,
      brief: input.brief,
      signals_hash: input.signalsHash ?? null,
      status: "draft",
    })
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return (data?.id as string) ?? null;
}

/** One receipt shape for every brief-ish generation event. */
export async function writeBriefReceipt(
  db: MinimalDb,
  input: {
    userId: string;
    organizationId?: string | null;
    event: string;
    entityType?: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await writeAuditEvent(db, {
    actor: input.userId,
    organizationId: input.organizationId ?? null,
    entityType: input.entityType ?? "brief",
    entityId: input.entityId ?? null,
    event: input.event,
    metadata: input.metadata ?? {},
  });
}
