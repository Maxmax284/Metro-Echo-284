// CaptureToast — single capture feedback surface for files arriving from
// any source (upload, conversation, Telegram, email). Subscribes to
// `ingested_files` realtime and dedupes by id. Silent by default.
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { logFileEvent } from "@/lib/fileAudit";

type Row = {
  id: string;
  filename: string;
  source: string | null;
  status: string | null;
  review_status: string | null;
  user_id: string;
};

const LABELS: Record<string, string> = {
  upload: "Upload",
  conversation: "Conversation",
  telegram: "Telegram",
  email: "Email",
  voice: "Voice",
  share: "Shared in",
};

function statusVerb(status: string | null, review: string | null): string {
  if (status === "pending" || status === "processing" || status === "extracting") return "Reading it…";
  if (status === "failed" || status === "error") return "Could not read it";
  if (review === "needs_review" || review === "new") return "Saved · needs review";
  return "Saved to Files";
}

export function CaptureToastProvider({
  onOpenFile,
}: {
  onOpenFile?: (id: string) => void;
}) {
  const { user } = useAuth();
  const seen = useRef<Set<string>>(new Set());
  const lastStatusByFile = useRef<Map<string, string>>(new Map());
  const startedAt = useRef<number>(Date.now());

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("capture-toast")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ingested_files", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as Row & { created_at?: string };
          // Skip rows created before mount (i.e. backfill). Prefer row.created_at over
          // commit_timestamp which can be stale on Telegram/email realtime replays.
          const createdMs = row.created_at ? new Date(row.created_at).getTime() : Date.now();
          if (createdMs < startedAt.current - 5000) return;
          if (seen.current.has(row.id)) return;
          seen.current.add(row.id);
          const source = LABELS[row.source ?? ""] ?? "Capture";
          toast({ title: `${source} · ${row.filename}`, description: statusVerb(row.status, row.review_status) });
          void logFileEvent(user.id, "capture.toast_shown", row.id, { source: row.source });
          lastStatusByFile.current.set(row.id, row.status ?? "");
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "ingested_files", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as Row;
          const prev = lastStatusByFile.current.get(row.id);
          const now = row.status ?? "";
          if (prev === now) return;
          lastStatusByFile.current.set(row.id, now);
          // Only re-toast on terminal transitions.
          if (now === "done" || now === "failed" || now === "error") {
            const source = LABELS[row.source ?? ""] ?? "Capture";
            const sonner = (toast as unknown as (m: string, o?: Record<string, unknown>) => unknown);
            sonner(`${source} · ${row.filename}`, {
              description: statusVerb(row.status, row.review_status),
              action: onOpenFile
                ? {
                    label: "Open",
                    onClick: () => {
                      void logFileEvent(user.id, "capture.toast_opened", row.id, {});
                      onOpenFile(row.id);
                    },
                  }
                : undefined,
            });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, onOpenFile]);

  return null;
}
