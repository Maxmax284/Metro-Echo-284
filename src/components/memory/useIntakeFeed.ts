import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { CaptureItem, CaptureSource } from "./CaptureCard";

type MsgRow = { id: string; content: string; created_at: string; role: string; metadata: any };
type FileRow = { id: string; filename: string; status: string; source: string; created_at: string; note_id: string | null; metadata: any };
type FieldRow = { id: string; summary: string; note_type: string; created_at: string; confidence: string | null };

export type IntakeRow = CaptureItem & { _raw: { kind: "message" | "file" | "field_note"; row: any } };

/**
 * Pull the last N captures across channels and normalize them into the same shape.
 * Read-only — routing actions live in the views that use this hook.
 */
export function useIntakeFeed(limit = 60) {
  const { session } = useAuth();
  const [items, setItems] = useState<IntakeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    const [msgs, files, fieldNotes] = await Promise.all([
      supabase.from("messages")
        .select("id, content, created_at, role, metadata")
        .eq("role", "user")
        .order("created_at", { ascending: false })
        .limit(limit),
      supabase.from("ingested_files")
        .select("id, filename, status, source, created_at, note_id, metadata")
        .order("created_at", { ascending: false })
        .limit(limit),
      supabase.from("field_notes")
        .select("id, summary, note_type, created_at, confidence")
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);

    const out: IntakeRow[] = [];

    for (const m of (msgs.data ?? []) as MsgRow[]) {
      const meta = m.metadata ?? {};
      const source: CaptureSource = meta.source === "telegram" ? "telegram" : "companion";
      out.push({
        id: `msg:${m.id}`,
        source,
        text: m.content,
        detectedType: meta.detected_type ?? null,
        confidence: meta.confidence ?? null,
        status: meta.routed_to ? "Routed" : meta.needs_review ? "Needs review" : "Captured",
        routedTo: meta.routed_to ?? null,
        needsReview: !!meta.needs_review || (!meta.detected_type && !meta.routed_to),
        ts: m.created_at,
        _raw: { kind: "message", row: m },
      });
    }

    for (const f of (files.data ?? []) as FileRow[]) {
      const meta = f.metadata ?? {};
      const statusCopy =
        f.status === "done" ? "Saved"
        : f.status === "failed" || f.status === "error" ? "Couldn't read this one"
        : f.status === "pending" ? "Looking at it…"
        : f.status;
      out.push({
        id: `file:${f.id}`,
        source: "file",
        text: f.filename,
        detectedType: meta.document_type ?? null,
        confidence: meta.confidence ?? null,
        status: statusCopy,
        routedTo: f.note_id ? "Memory" : null,
        needsReview: !meta.document_type && f.status === "done",
        ts: f.created_at,
        _raw: { kind: "file", row: f },
      });
    }

    for (const fn of (fieldNotes.data ?? []) as FieldRow[]) {
      out.push({
        id: `field:${fn.id}`,
        source: "field_note",
        text: fn.summary,
        detectedType: fn.note_type,
        confidence: (fn.confidence as any) ?? "medium",
        status: "Saved",
        routedTo: "Awareness",
        needsReview: false,
        ts: fn.created_at,
        _raw: { kind: "field_note", row: fn },
      });
    }

    out.sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
    setItems(out.slice(0, limit));
    setLoading(false);
  }, [session, limit]);

  useEffect(() => { refresh(); }, [refresh]);

  return { items, loading, refresh };
}
