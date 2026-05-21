import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { CaptureItem, CaptureSource } from "./CaptureCard";

type MsgRow = { id: string; content: string; created_at: string; role: string; metadata: any };
type FileRow = { id: string; filename: string; status: string; source: string; created_at: string; note_id: string | null; metadata: any };
type FieldRow = { id: string; summary: string; note_type: string; created_at: string; confidence: string | null };

export type IntakeRow = CaptureItem & {
  snoozedUntil?: string | null;
  isSnoozed?: boolean;
  isDone?: boolean;
  _raw: { kind: "message" | "file" | "field_note"; row: any };
};

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

    const ROUTE_LABEL: Record<string, string> = {
      memory: "Saved to Memory",
      commitments: "Routed → Commitment",
      reminders: "Routed → Reminder",
      sherlock: "Sent to Sherlock",
      ignored: "Filed away",
    };

    // Heuristic only — neutral chip + cautionary copy, never blocks routing.
    const SENSITIVE_RE = /\b(passport|visa|ssn|social.security|medical|prescription|invoice|receipt|bank|iban|account.?number|tax|w-?2|w-?9|salary|payslip|contract|nda|waiver|insurance|dob|date.of.birth)\b/i;
    const isSensitive = (...parts: (string | undefined | null)[]) =>
      parts.some((p) => p && SENSITIVE_RE.test(p));

    const whyForMessage = (source: CaptureSource, meta: any, routed?: string) => {
      if (routed === "ignored") return "Filed away — undo to bring it back.";
      if (routed) return `Already ${ROUTE_LABEL[routed]?.toLowerCase() ?? routed}.`;
      if (meta.needs_review) return "Couldn't tell what this is — pick a lane.";
      if (meta.detected_type && meta.confidence === "low") return `Looks like a ${meta.detected_type}, but I'm not sure.`;
      if (meta.detected_type) return `Looks like a ${meta.detected_type}.`;
      return source === "telegram" ? "Came in from Telegram — needs a home." : "Captured — needs a home.";
    };
    const whyForFile = (f: any, meta: any) => {
      if (f.status === "failed" || f.status === "error") return "I couldn't read this one.";
      if (f.status === "pending") return "Still reading it.";
      if (meta.document_type) return `Read as a ${meta.document_type}.`;
      if (f.note_id) return "Saved to Memory.";
      return "Saved, but I couldn't tell what kind of file it is.";
    };
    const nowMs = Date.now();
    for (const m of (msgs.data ?? []) as MsgRow[]) {
      const meta = m.metadata ?? {};
      const source: CaptureSource = meta.source === "telegram" ? "telegram" : "companion";
      const routed = meta.routed_to as string | undefined;
      const snoozedUntil = (meta.snoozed_until as string | undefined) ?? null;
      const isSnoozed = !!snoozedUntil && new Date(snoozedUntil).getTime() > nowMs;
      const isDone = !!routed;
      const baseStatus = routed
        ? (ROUTE_LABEL[routed] ?? `Routed → ${routed}`)
        : meta.needs_review
          ? "Needs review"
          : "Captured";
      out.push({
        id: `msg:${m.id}`,
        source,
        text: m.content,
        detectedType: meta.detected_type ?? null,
        confidence: meta.confidence ?? null,
        status: isSnoozed ? `Snoozed until ${new Date(snoozedUntil!).toLocaleString()}` : baseStatus,
        routedTo: routed ?? null,
        needsReview: !!meta.needs_review || (!meta.detected_type && !routed),
        sensitive: meta.sensitive === true || isSensitive(m.content),
        ts: m.created_at,
        why: isSnoozed ? "Snoozed — I'll bring it back when it's due." : whyForMessage(source, meta, routed),
        snoozedUntil,
        isSnoozed,
        isDone,
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
        sensitive: meta.sensitive === true || isSensitive(f.filename, meta.document_type, meta.summary),
        ts: f.created_at,
        why: whyForFile(f, meta),
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
        sensitive: isSensitive(fn.summary),
        ts: fn.created_at,
        why: fn.note_type ? `Logged as a ${fn.note_type}.` : "Tied to a place you logged.",
        _raw: { kind: "field_note", row: fn },
      });
    }

    out.sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
    setItems(out.slice(0, limit));
    setLoading(false);
  }, [session, limit]);

  useEffect(() => { refresh(); }, [refresh]);

  // Wave 5 — realtime sync. Telegram captures, file ingests, and field notes
  // land in different tables; surface them live so the Inbox isn't a stale
  // snapshot. Debounce bursts (file pipeline writes 3-4 rows in <500ms).
  useEffect(() => {
    if (!session) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const nudge = () => { if (t) clearTimeout(t); t = setTimeout(() => refresh(), 400); };
    const channel = supabase
      .channel("intake-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, nudge)
      .on("postgres_changes", { event: "*", schema: "public", table: "ingested_files" }, nudge)
      .on("postgres_changes", { event: "*", schema: "public", table: "field_notes" }, nudge)
      .subscribe();
    return () => { if (t) clearTimeout(t); supabase.removeChannel(channel); };
  }, [session, refresh]);

  return { items, loading, refresh };
}
