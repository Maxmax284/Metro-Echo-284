// crossref.ts — client side of the cross-reference capability.
// Pure engine logic is shared with the edge functions; nothing is duplicated.
import { supabase } from "@/integrations/supabase/client";
import type { ActiveScope } from "@/lib/scope";

export * from "../../supabase/functions/_shared/crossref";
import {
  buildMatrix, fieldsForShape, normalizeField, SHAPE_SPEC,
  type Certainty, type Matrix, type OutputShape, type SourceRole,
} from "../../supabase/functions/_shared/crossref";

export type CaseStatus = "draft" | "reading" | "matrix_ready" | "reviewed" | "composed" | "failed";

export type CaseRow = {
  id: string;
  title: string;
  purpose: string | null;
  status: CaseStatus;
  summary: string | null;
  output_shape: string | null;
  style: string | null;
  thread_id: string | null;
  organization_id: string | null;
  brief_export_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CaseSourceRow = {
  id: string;
  case_id: string;
  ingested_file_id: string | null;
  filename: string;
  mime_type: string | null;
  role: SourceRole;
  authority_rank: number;
  authority_fields: string[];
  extraction_status: "pending" | "reading" | "read" | "unreadable";
  error: string | null;
};

export type CaseRecordRow = {
  id: string;
  record_key: string;
  display_label: string;
  match_confidence: Certainty;
  confirmed_by_user: boolean;
  position: number;
};

export type CaseClaimRow = {
  id: string;
  source_id: string | null;
  record_key: string;
  field: string;
  value_text: string | null;
  value_number: number | null;
  unit: string | null;
  certainty: Certainty;
  excerpt: string | null;
  sensitive: boolean;
  derived: boolean;
};

export type CaseConflictRow = {
  id: string;
  record_key: string;
  field: string;
  kind: "contradiction" | "missing" | "unreadable" | "duplicate" | "stale";
  claim_ids: string[];
  resolution: "pending" | "chose_claim" | "manual_value" | "left_open";
  resolved_value: string | null;
  resolved_claim_id: string | null;
};

export type CaseBundle = {
  case: CaseRow;
  sources: CaseSourceRow[];
  records: CaseRecordRow[];
  claims: CaseClaimRow[];
  conflicts: CaseConflictRow[];
  matrix: Matrix;
};

/** Start or continue a case. The edge function does the reading. */
export async function runCrossReference(args: {
  case_id?: string | null;
  ingested_file_ids?: string[];
  request?: string;
  title?: string;
  thread_id?: string | null;
  organization_id?: string | null;
}): Promise<{ case_id: string; summary: string }> {
  const { data, error } = await supabase.functions.invoke("crossref-run", { body: args });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { case_id: string; summary: string };
}

export async function loadCase(caseId: string): Promise<CaseBundle | null> {
  const [c, s, r, cl, cf] = await Promise.all([
    supabase.from("cross_ref_cases").select("*").eq("id", caseId).maybeSingle(),
    supabase.from("case_sources").select("*").eq("case_id", caseId).order("created_at"),
    supabase.from("case_records").select("*").eq("case_id", caseId).order("position"),
    supabase.from("case_claims").select("*").eq("case_id", caseId),
    supabase.from("case_conflicts").select("*").eq("case_id", caseId),
  ]);
  if (!c.data) return null;
  const sources = (s.data ?? []) as unknown as CaseSourceRow[];
  const records = (r.data ?? []) as unknown as CaseRecordRow[];
  const claims = ((cl.data ?? []) as unknown as CaseClaimRow[]).map((x) => ({
    ...x,
    value_number: x.value_number == null ? null : Number(x.value_number),
  }));
  const conflicts = (cf.data ?? []) as unknown as CaseConflictRow[];
  const matrix = buildMatrix(
    records.map((rec) => ({
      record_key: rec.record_key,
      display_label: rec.display_label,
      match_confidence: rec.match_confidence,
      labels: [rec.display_label],
      source_ids: [],
    })),
    claims,
    sources,
  );
  return { case: c.data as unknown as CaseRow, sources, records, claims, conflicts, matrix };
}

export async function listCases(scope: ActiveScope, limit = 10): Promise<CaseRow[]> {
  let q = supabase.from("cross_ref_cases").select("*").order("created_at", { ascending: false }).limit(limit);
  q = scope.kind === "organization" ? q.eq("organization_id", scope.organizationId) : q.is("organization_id", null);
  const { data } = await q;
  return (data ?? []) as unknown as CaseRow[];
}

/** Record the user's call on a conflict. Their answer always wins. */
export async function resolveConflict(args: {
  conflict: CaseConflictRow;
  choice: { kind: "claim"; claim_id: string; value: string | null } | { kind: "manual"; value: string } | { kind: "leave_open" };
}): Promise<void> {
  const patch =
    args.choice.kind === "claim"
      ? { resolution: "chose_claim" as const, resolved_claim_id: args.choice.claim_id, resolved_value: args.choice.value }
      : args.choice.kind === "manual"
        ? { resolution: "manual_value" as const, resolved_value: args.choice.value, resolved_claim_id: null }
        : { resolution: "left_open" as const, resolved_value: null, resolved_claim_id: null };
  const { error } = await supabase
    .from("case_conflicts")
    .update({ ...patch, resolved_at: new Date().toISOString() })
    .eq("id", args.conflict.id);
  if (error) throw error;
  const { data: userData } = await supabase.auth.getUser();
  if (userData.user?.id) {
    await supabase.from("audit_log").insert({
      user_id: userData.user.id,
      entity_type: "cross_ref_case",
      entity_id: args.conflict.id,
      event: "crossref.conflict_resolved",
      payload: { field: args.conflict.field, record: args.conflict.record_key, resolution: patch.resolution },
    });
  }
}

/** Flip which source is the spine, or hand it one field. Inferred stays visible. */
export async function setSourceAuthority(args: {
  source: CaseSourceRow;
  role?: SourceRole;
  authority_fields?: string[];
}): Promise<void> {
  const patch: Record<string, unknown> = { role_set_by: "user" };
  if (args.role) {
    patch.role = args.role;
    patch.authority_rank = args.role === "master" ? 90 : args.role === "supporting" ? 40 : 50;
  }
  if (args.authority_fields) patch.authority_fields = args.authority_fields.map(normalizeField);
  const { error } = await supabase.from("case_sources").update(patch).eq("id", args.source.id);
  if (error) throw error;
}

/** The value that would be printed today, after the user's corrections. */
export function verifiedValue(
  bundle: CaseBundle,
  record_key: string,
  field: string,
): { value: string | null; state: Matrix["cells"][number]["state"] | "corrected"; certainty: Certainty } {
  const key = normalizeField(field);
  const conflict = bundle.conflicts.find(
    (c) => c.record_key === record_key && normalizeField(c.field) === key && c.resolution !== "pending" && c.resolution !== "left_open",
  );
  if (conflict) return { value: conflict.resolved_value, state: "corrected", certainty: "verified" };
  const cell = bundle.matrix.cells.find((c) => c.record_key === record_key && c.field === key);
  return { value: cell?.value ?? null, state: cell?.state ?? "missing", certainty: cell?.certainty ?? "uncertain" };
}

export type ArtifactPlan = {
  shape: OutputShape;
  printed: string[];
  held_back: string[];
  unresolved: number;
};

/** What the artifact will contain, before anything is generated. */
export function planArtifact(
  bundle: CaseBundle,
  shape: OutputShape,
  includeSensitive: string[] = [],
): ArtifactPlan {
  const available = [...new Set(bundle.claims.map((c) => normalizeField(c.field)))].sort();
  const { printed, held_back } = fieldsForShape(shape, available, { include_sensitive: includeSensitive });
  const unresolved = bundle.conflicts.filter(
    (c) => c.resolution === "pending" && (c.kind === "contradiction" || c.kind === "unreadable"),
  ).length;
  return { shape, printed, held_back, unresolved };
}

export const SHAPE_OPTIONS = (Object.keys(SHAPE_SPEC) as OutputShape[]).map((k) => ({
  value: k,
  label: SHAPE_SPEC[k].label,
  blurb: SHAPE_SPEC[k].blurb,
}));

/** Plain-English state word for a cell. Never softened. */
export const STATE_LABEL: Record<string, string> = {
  agrees: "Sources agree",
  conflicts: "Sources disagree",
  missing: "Not on any source",
  unreadable: "Vanta could not read this",
  calculated: "Calculated",
  corrected: "You set this",
};
