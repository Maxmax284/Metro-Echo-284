// useFindingEvidence — the real items behind a finding, by category.
//
// Doctrine: read-only. This hook resolves the records the scanner named plus
// anything already linked to them. It never writes, never links, never routes.
// Every query is scope-filtered, so a personal room never shows workspace rows.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import type { SherlockFinding } from "@/lib/sherlock/types";

export type EvidenceCategory = "notes" | "actions" | "calendar" | "inbox" | "documents" | "linked";

export type EvidenceItem = {
  id: string;
  category: EvidenceCategory;
  /** What it is, in the platform's own noun: "Note", "Draft action". */
  kindLabel: string;
  title: string;
  detail?: string | null;
  /** Which surface opens it. */
  surface?: string | null;
  href?: string | null;
};

type Ref = { type: string; id: string };

/** Maps a stored object type onto the desk it belongs to. */
const CATEGORY: Record<string, EvidenceCategory> = {
  note: "notes",
  action: "actions",
  commitment: "actions",
  calendar_event: "calendar",
  message: "inbox",
  capture: "inbox",
  file: "inbox",
  ingested_file: "inbox",
  field_note: "inbox",
  document: "documents",
  entity: "linked",
};

export function categoryOf(type: string | null | undefined): EvidenceCategory | null {
  if (!type) return null;
  return CATEGORY[type] ?? null;
}

export function useFindingEvidence(finding: SherlockFinding | null, open: boolean) {
  const { applyScope, key: scopeKey } = useScope();
  const [items, setItems] = useState<EvidenceItem[] | null>(null);

  const load = useCallback(async () => {
    if (!finding) return;
    setItems(null);
    const refs: Ref[] = [];
    if (finding.source_object_id && finding.source_object_type) {
      refs.push({ type: finding.source_object_type, id: finding.source_object_id });
    }
    if (finding.target_object_id && finding.target_object_type) {
      refs.push({ type: finding.target_object_type, id: finding.target_object_id });
    }

    const out: EvidenceItem[] = [];

    for (const ref of refs) {
      const resolved = await resolveRef(ref, applyScope);
      if (resolved) out.push(resolved);
    }

    // Anything you or Vanta already linked to the source object.
    const linkKind = LINK_KIND[finding.source_object_type ?? ""] ?? null;
    if (linkKind && finding.source_object_id) {
      const { data } = await supabase.rpc("cross_links_for_item", {
        _kind: linkKind,
        _id: finding.source_object_id,
      });
      for (const row of (data ?? []) as any[]) {
        const resolved = await resolveRef({ type: row.other_kind, id: row.other_id }, applyScope);
        if (!resolved) continue;
        if (out.some((i) => i.id === resolved.id)) continue;
        out.push({ ...resolved, detail: resolved.detail ?? `Linked as ${row.relation}` });
      }
    }

    setItems(out);
  }, [finding?.id, scopeKey]);

  useEffect(() => {
    if (open && finding) void load();
    if (!open) setItems(null);
  }, [open, finding?.id, load]);

  return { items, reload: load };
}

/** cross_links kinds the RPC understands, keyed by stored object type. */
const LINK_KIND: Record<string, string> = {
  note: "note",
  commitment: "commitment",
  action: "action",
  file: "file",
  ingested_file: "file",
  message: "message",
  capture: "capture",
  entity: "entity",
};

async function resolveRef(
  ref: Ref,
  applyScope: <Q extends { eq: any; is: any }>(q: Q) => Q,
): Promise<EvidenceItem | null> {
  const category = categoryOf(ref.type);
  if (!category) return null;
  try {
    switch (ref.type) {
      case "note": {
        const { data } = await applyScope(
          supabase.from("notes").select("id, title, body, updated_at").eq("id", ref.id) as never,
        );
        const r = (data as any[] | null)?.[0];
        if (!r) return null;
        return {
          id: r.id, category: "notes", kindLabel: "Note",
          title: r.title || String(r.body ?? "").slice(0, 60) || "Untitled note",
          detail: null, surface: "memory",
        };
      }
      case "commitment": {
        const { data } = await applyScope(
          supabase.from("commitments").select("id, summary, status, due_at").eq("id", ref.id) as never,
        );
        const r = (data as any[] | null)?.[0];
        if (!r) return null;
        return {
          id: r.id, category: "actions", kindLabel: "Promise",
          title: r.summary ?? "Commitment",
          detail: r.due_at ? `Due ${new Date(r.due_at).toLocaleString()}` : r.status,
          surface: "commitments",
        };
      }
      case "action": {
        const { data } = await applyScope(
          supabase.from("actions").select("id, title, status, risk").eq("id", ref.id) as never,
        );
        const r = (data as any[] | null)?.[0];
        if (!r) return null;
        return {
          id: r.id, category: "actions", kindLabel: "Action",
          title: r.title ?? "Action", detail: `${r.status}${r.risk ? ` · ${r.risk} risk` : ""}`,
          surface: "actions",
        };
      }
      case "calendar_event": {
        const { data } = await applyScope(
          supabase.from("calendar_events").select("id, title, starts_at").eq("id", ref.id) as never,
        );
        const r = (data as any[] | null)?.[0];
        if (!r) return null;
        return {
          id: r.id, category: "calendar", kindLabel: "Meeting",
          title: r.title ?? "Meeting",
          detail: r.starts_at ? new Date(r.starts_at).toLocaleString() : null,
          surface: "schedule",
        };
      }
      case "message":
      case "capture": {
        const { data } = await applyScope(
          supabase.from("messages").select("id, content, created_at").eq("id", ref.id) as never,
        );
        const r = (data as any[] | null)?.[0];
        if (!r) return null;
        return {
          id: r.id, category: "inbox", kindLabel: "Capture",
          title: String(r.content ?? "").slice(0, 70) || "Capture",
          detail: null, surface: "inbox",
        };
      }
      case "file":
      case "ingested_file": {
        const { data } = await applyScope(
          supabase.from("ingested_files").select("id, filename, source").eq("id", ref.id) as never,
        );
        const r = (data as any[] | null)?.[0];
        if (!r) return null;
        return {
          id: r.id, category: "inbox", kindLabel: "File",
          title: r.filename ?? "File", detail: r.source ?? null, surface: "inbox",
        };
      }
      case "document": {
        const { data } = await applyScope(
          supabase.from("documents").select("id, title, status").eq("id", ref.id) as never,
        );
        const r = (data as any[] | null)?.[0];
        if (!r) return null;
        return {
          id: r.id, category: "documents", kindLabel: "Document",
          title: r.title ?? "Document", detail: r.status ?? null, href: "/documents",
        };
      }
      case "entity": {
        const { data } = await applyScope(
          supabase.from("entities").select("id, display_name, kind").eq("id", ref.id) as never,
        );
        const r = (data as any[] | null)?.[0];
        if (!r) return null;
        return {
          id: r.id, category: "linked", kindLabel: "Subject",
          title: r.display_name ?? "Subject", detail: r.kind ?? null, surface: "memory",
        };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}
