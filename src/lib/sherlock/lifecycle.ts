// Sherlock 3 — lifecycle helpers for client-side finding management.
// Doctrine: every state change writes an audit_log row. Cooldown is enforced
// at insert time. Accept/edit/dismiss never executes downstream effects —
// callers do that themselves after the helper resolves successfully.
import { supabase } from "@/integrations/supabase/client";
import type {
  SherlockConfidence,
  SherlockFinding,
  SherlockMode,
  SherlockSourceType,
  SherlockStatus,
} from "./types";

type Json = Record<string, any>;

async function writeAudit(params: {
  userId: string;
  event: string;
  entityType: string;
  entityId?: string | null;
  payload?: Json;
  organizationId?: string | null;
}) {
  const { error } = await supabase.from("audit_log").insert({
    user_id: params.userId,
    organization_id: params.organizationId ?? null,
    event: params.event,
    entity_type: params.entityType,
    entity_id: params.entityId ?? null,
    payload: params.payload ?? {},
  });
  if (error) console.warn("[sherlock] audit write failed", error.message);
}

export interface CreateFindingInput {
  userId: string;
  /** Owning workspace, or null for personal. Findings never cross rooms. */
  organizationId?: string | null;
  sourceObjectType: SherlockSourceType | string;
  sourceObjectId?: string | null;
  mode: SherlockMode;
  findingType: string;
  summary: string;
  confidence?: SherlockConfidence;
  rationale?: string | null;
  extractedData?: Json;
  suggestedAction?: string | null;
  suggestedRelationType?: string | null;
  targetObjectId?: string | null;
  targetObjectType?: string | null;
  surfaceOrigin?: string | null;
  sensitiveFlag?: boolean;
  evidenceHash?: string | null;
}

/**
 * Create a finding, honouring dismissed-suggestion cooldown.
 * Returns the new finding, or null if it was suppressed by cooldown.
 */
export async function createFinding(input: CreateFindingInput): Promise<SherlockFinding | null> {
  // Cooldown check: same source + suggested_action + target still under cooldown?
  if (input.suggestedAction || input.targetObjectId) {
    let q = supabase
      .from("sherlock_findings")
      .select("id, cooldown_until, status")
      .eq("user_id", input.userId)
      .eq("source_object_type", input.sourceObjectType)
      .eq("status", "dismissed");
    q = input.organizationId ? q.eq("organization_id", input.organizationId) : q.is("organization_id", null);
    if (input.sourceObjectId) q = q.eq("source_object_id", input.sourceObjectId);
    if (input.suggestedAction) q = q.eq("suggested_action", input.suggestedAction);
    if (input.targetObjectId) q = q.eq("target_object_id", input.targetObjectId);
    const { data: existing } = await q.limit(1);
    const blocker = existing?.[0];
    if (blocker?.cooldown_until && new Date(blocker.cooldown_until) > new Date()) {
      await writeAudit({
        userId: input.userId,
        event: "sherlock_auto_suggestion_suppressed",
        entityType: "sherlock_finding",
        entityId: blocker.id,
        payload: {
          reason: "cooldown",
          source_object_type: input.sourceObjectType,
          source_object_id: input.sourceObjectId ?? null,
          suggested_action: input.suggestedAction ?? null,
        },
      });
      return null;
    }
  }

  const { data, error } = await supabase
    .from("sherlock_findings")
    .insert({
      user_id: input.userId,
      organization_id: input.organizationId ?? null,
      source_object_type: input.sourceObjectType,
      source_object_id: input.sourceObjectId ?? null,
      mode: input.mode,
      finding_type: input.findingType,
      summary: input.summary,
      confidence: input.confidence ?? "medium",
      rationale: input.rationale ?? null,
      extracted_data: input.extractedData ?? {},
      suggested_action: input.suggestedAction ?? null,
      suggested_relation_type: input.suggestedRelationType ?? null,
      target_object_id: input.targetObjectId ?? null,
      target_object_type: input.targetObjectType ?? null,
      surface_origin: input.surfaceOrigin ?? null,
      sensitive_flag: input.sensitiveFlag ?? false,
      evidence_hash: input.evidenceHash ?? null,
      status: "pending",
    })
    .select("*")
    .single();
  if (error) throw error;

  await writeAudit({
    userId: input.userId,
    event: "sherlock_finding_created",
    entityType: "sherlock_finding",
    entityId: data.id,
    payload: {
      mode: data.mode,
      confidence: data.confidence,
      surface: data.surface_origin,
      source: { type: data.source_object_type, id: data.source_object_id },
      sensitive: data.sensitive_flag,
    },
  });

  if (input.sensitiveFlag) {
    await writeAudit({
      userId: input.userId,
      event: "sherlock_sensitive_file_flagged",
      entityType: "sherlock_finding",
      entityId: data.id,
      payload: { source: { type: data.source_object_type, id: data.source_object_id } },
    });
  }

  return data as SherlockFinding;
}

async function transition(
  finding: Pick<SherlockFinding, "id" | "user_id" | "status" | "mode" | "confidence" | "source_object_type" | "source_object_id">,
  next: SherlockStatus,
  event: string,
  extraPayload: Json = {},
  cooldownDays?: number,
) {
  const reviewedAt = new Date().toISOString();
  const cooldownUntil = next === "dismissed" && cooldownDays && cooldownDays > 0
    ? new Date(Date.now() + cooldownDays * 86400_000).toISOString()
    : null;
  const { error } = await supabase
    .from("sherlock_findings")
    .update({
      status: next,
      reviewed_at: reviewedAt,
      reviewed_by: finding.user_id,
      ...(cooldownUntil ? { cooldown_until: cooldownUntil } : {}),
    })
    .eq("id", finding.id);
  if (error) throw error;
  await writeAudit({
    userId: finding.user_id,
    event,
    entityType: "sherlock_finding",
    entityId: finding.id,
    payload: {
      previous_status: finding.status,
      new_status: next,
      mode: finding.mode,
      confidence: finding.confidence,
      source: { type: finding.source_object_type, id: finding.source_object_id },
      ...extraPayload,
    },
  });
}

export const acceptFinding = (f: SherlockFinding) =>
  transition(f, "accepted", "sherlock_suggestion_accepted");

export const editFinding = (f: SherlockFinding, edits: Json) =>
  transition(f, "edited", "sherlock_suggestion_edited", { edits });

export const dismissFinding = (f: SherlockFinding, cooldownDays = 7, reason?: string) =>
  transition(f, "dismissed", "sherlock_suggestion_dismissed", reason ? { reason } : {}, cooldownDays);

export const expireFinding = (f: SherlockFinding) =>
  transition(f, "expired", "sherlock_suggestion_dismissed", { reason: "expired" });

export async function listFindingsForSource(
  userId: string,
  sourceObjectType: string,
  sourceObjectId: string,
  organizationId: string | null = null,
): Promise<SherlockFinding[]> {
  let base = supabase
    .from("sherlock_findings")
    .select("*")
    .eq("user_id", userId)
    .eq("source_object_type", sourceObjectType)
    .eq("source_object_id", sourceObjectId);
  base = organizationId ? base.eq("organization_id", organizationId) : base.is("organization_id", null);
  const { data, error } = await base.order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SherlockFinding[];
}

export async function listPending(
  userId: string,
  opts: { includeLowConfidence?: boolean; organizationId?: string | null } = {},
) {
  let q = supabase
    .from("sherlock_findings")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pending");
  q = opts.organizationId ? q.eq("organization_id", opts.organizationId) : q.is("organization_id", null);
  q = q.order("updated_at", { ascending: false });
  if (!opts.includeLowConfidence) q = q.in("confidence", ["medium", "high"]);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as SherlockFinding[];
}
