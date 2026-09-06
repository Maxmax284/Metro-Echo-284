// briefs.ts — types + client helpers for the Command Center brief export pipeline.
// Doctrine: every compose is user-tap. Every export writes an audit event.
// Storage layout: {user_id}/briefs/{export_id}.pdf  (gates on existing memory-uploads RLS).

import { supabase } from "@/integrations/supabase/client";

export type BriefFormat =
  | "operator"        // tactical, for the user
  | "client"          // external, clean, no internal reasoning
  | "audit_packet"    // receipts-first
  | "weekly_review"   // across projects/entities — also recap_weekly
  | "audio_script"    // single spoken-prose block
  | "research_brief"  // outside-context brief attached to a project
  | "word_packet"     // Word (.docx) packet of a drafted document
  | "monthly_review"; // monthly recap (Phase 5)


export type BriefSectionKind =
  | "prose"
  | "list"
  | "timeline"
  | "decision"
  | "receipts"
  | "pull_quote"
  // Cross-reference layouts. Body shapes:
  // - field_table:  { columns: string[]; rows: string[][] }
  // - roster_card:  Array<{ title, subtitle?, lines: {label,value,note?}[] }>
  // - conflict_log: Array<{ what, readings: string[], resolution }>
  | "field_table"
  | "roster_card"
  | "conflict_log";

export type BriefClaim = {
  text: string;
  receipts?: BriefGrounding[];
};

export type BriefSection = {
  id: string;
  heading?: string;
  kind: BriefSectionKind;
  // Body shape per kind:
  // - prose / pull_quote: string OR BriefClaim
  // - list / timeline / receipts: string[] | BriefClaim[] | {when,what}[]
  // - decision: { decision, why, receipts? }
  body: any;
  receipts?: BriefGrounding[]; // section-level fallback grounding
};

export type BriefGrounding = {
  kind: string;
  id: string;
  label?: string;
};

export type Brief = {
  title: string;
  subtitle?: string | null;
  sections: BriefSection[];
  appendix_receipts: BriefGrounding[];
  grounding: Record<string, unknown>;
  signals_hash: string;
  format: BriefFormat;
  scope_kind: "system" | "entity" | "project" | "recap_weekly" | "recap_monthly";
  entity_id?: string | null;
  project_id?: string | null;
  audience?: BriefAudience | null;
  generated_at: string;
};

export type BriefExportRow = {
  id: string;
  user_id: string;
  organization_id: string | null;
  entity_id: string | null;
  project_id: string | null;
  format: BriefFormat;
  scope_kind: "system" | "entity" | "project" | "recap_weekly" | "recap_monthly";
  title: string;
  subtitle: string | null;
  brief: Brief;
  signals_hash: string | null;
  storage_path: string | null;
  status: "draft" | "approved" | "exported";
  approved_at: string | null;
  exported_at: string | null;
  created_at: string;
  updated_at: string;
};

export const FORMAT_LABEL: Record<BriefFormat, string> = {
  operator: "For me (operator)",
  client: "For a client",
  audit_packet: "Audit packet",
  weekly_review: "Weekly review",
  audio_script: "Audio briefing",
  research_brief: "Outside research",
  word_packet: "Word packet",
  monthly_review: "Monthly review",
};

export const FORMAT_DESCRIPTION: Record<BriefFormat, string> = {
  operator: "Tactical, for you. No fluff.",
  client: "Clean and professional. Internal reasoning removed.",
  audit_packet: "Receipts-focused. Timestamps, sources, decisions.",
  weekly_review: "What changed across your projects this week.",
  audio_script: "Spoken-style script. Read aloud or play in browser.",
  research_brief: "Plain-English outside context, with sources.",
  word_packet: "Editable Word file, kept alongside its receipt.",
  monthly_review: "What bigger pattern is forming this month.",
};


export type BriefAudience =
  | "me"
  | "internal_operator"
  | "client"
  | "audit"
  | "implementation"
  | "presentation";

export const AUDIENCE_LABEL: Record<BriefAudience, string> = {
  me: "For me",
  internal_operator: "For internal operator",
  client: "For client",
  audit: "For audit",
  implementation: "For implementation",
  presentation: "For presentation",
};

export const AUDIENCE_DESCRIPTION: Record<BriefAudience, string> = {
  me: "Direct, operational, no fluff.",
  internal_operator: "Clean operational summary, easy to act on.",
  client: "Polished and professional. Hides internal noise.",
  audit: "Receipts-first. Timestamps and proof.",
  implementation: "Requirements, decisions, risks, next steps.",
  presentation: "One clean page. Summary, topics, decisions, next move.",
};

export type ComposeBriefInput = {
  format: BriefFormat;
  scope_kind: "system" | "entity" | "project" | "recap_weekly" | "recap_monthly";
  entity_id?: string | null;
  project_id?: string | null;
  audience?: BriefAudience;
  range_days?: number;
};

export async function composeBrief(input: ComposeBriefInput): Promise<Brief> {
  const { data, error } = await supabase.functions.invoke("compose-brief", { body: input });
  if (error) throw error;
  return data as Brief;
}

export async function saveBriefDraft(args: {
  brief: Brief;
  organization_id?: string | null;
}): Promise<BriefExportRow> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("brief_exports")
    .insert({
      user_id: uid,
      organization_id: args.organization_id ?? null,
      entity_id: args.brief.entity_id ?? null,
      project_id: args.brief.project_id ?? null,
      format: args.brief.format,
      scope_kind: args.brief.scope_kind,
      title: args.brief.title,
      subtitle: args.brief.subtitle ?? null,
      brief: args.brief as any,
      signals_hash: args.brief.signals_hash,
      status: "draft",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as BriefExportRow;
}

export async function approveAndExportBrief(args: {
  row: BriefExportRow;
  pdfBlob?: Blob | null;
}): Promise<BriefExportRow> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Not authenticated");

  let storage_path: string | null = args.row.storage_path;

  if (args.pdfBlob) {
    const path = `${uid}/briefs/${args.row.id}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("memory-uploads")
      .upload(path, args.pdfBlob, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (upErr) throw upErr;
    storage_path = path;

    await supabase.from("audit_log").insert({
      user_id: uid,
      entity_type: "brief_export",
      entity_id: args.row.id,
      event: "pdf.generated",
      payload: { format: args.row.format, scope_kind: args.row.scope_kind, storage_path },
    });
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("brief_exports")
    .update({
      status: "exported",
      approved_at: now,
      exported_at: now,
      storage_path,
    })
    .eq("id", args.row.id)
    .select("*")
    .single();
  if (error) throw error;

  const eventName =
    args.row.format === "audit_packet"
      ? "audit_packet.generated"
      : args.row.format === "audio_script"
      ? "audio_brief.generated"
      : "brief.exported";

  await supabase.from("audit_log").insert({
    user_id: uid,
    entity_type: "brief_export",
    entity_id: args.row.id,
    event: eventName,
    payload: { format: args.row.format, scope_kind: args.row.scope_kind, storage_path },
  });

  return data as unknown as BriefExportRow;
}

export async function listBriefExports(args: {
  entity_id?: string | null;
  project_id?: string | null;
  limit?: number;
}): Promise<BriefExportRow[]> {
  let q = supabase
    .from("brief_exports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(args.limit ?? 20);
  if (args.entity_id) q = q.eq("entity_id", args.entity_id);
  if (args.project_id) q = q.eq("project_id", args.project_id);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as BriefExportRow[];
}

export async function getBriefDownloadUrl(storage_path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("memory-uploads")
    .createSignedUrl(storage_path, 60 * 10);
  if (error) return null;
  return data?.signedUrl ?? null;
}

// ---- Entity rollup ----
export type EntityRollup = {
  entity: {
    id: string;
    display_name: string;
    kind: string;
    slug: string | null;
    summary: string | null;
    parent_entity_id: string | null;
    pinned: boolean;
    last_seen_at: string;
  };
  counts: {
    notes: number;
    commitments_open: number;
    commitments_overdue: number;
    actions_pending: number;
    actions_high_risk: number;
    actions_executed_7d: number;
    files: number;
    messages: number;
    sherlock_pending: number;
    cross_links: number;
    audit_7d: number;
  };
  recent_changes: { kind: string; id: string; label: string; ts: string }[];
  recent_audit: { id: string; event: string; entity_type: string; entity_id: string; created_at: string }[];
  suggested_next: { label: string; surface: string } | null;
  generated_at: string;
};

export async function fetchEntityRollup(entity_id: string): Promise<EntityRollup> {
  const { data, error } = await supabase.rpc("entity_rollup" as any, { _entity_id: entity_id });
  if (error) throw error;
  return data as unknown as EntityRollup;
}
