// useStagedUpload — single source of truth for the staged → upload → extract
// flow used by FileUploadCard, ConversationSurface, and the Files tile.
//
// Doctrine:
//  - Capture is deliberate. Files stage before they upload.
//  - Every per-file state change is visible and audited.
//  - No auto AI. files-ingest extracts; aftermath actions are opt-in.
import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { logFileEvent } from "@/lib/fileAudit";
import { vantaSay } from "@/lib/vantaVoice";

export type StagedStatus =
  | "staged"
  | "queued"
  | "uploading"
  | "reading"
  | "saved"
  | "failed";

export type StagedFile = {
  key: string;            // local id (random)
  file: File;
  status: StagedStatus;
  note?: string;
  progress?: number;      // 0..1 — only set when known
  ingestedFileId?: string;
  errorLabel?: string;    // human copy via vantaSay
  batchId?: string;       // set when >1 file staged in one stage() call
};

const MAX_BYTES = 20 * 1024 * 1024;

function newKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function newBatchId() {
  // RFC4122 v4-ish — random enough for client-generated grouping.
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useStagedUpload(opts?: {
  source?: "upload" | "conversation" | "command";
  onSaved?: (s: StagedFile) => void;
}) {
  const { user } = useAuth();
  const [staged, setStaged] = useState<StagedFile[]>([]);
  // ref mirror so async loops always read fresh items
  const ref = useRef<StagedFile[]>([]);
  ref.current = staged;

  const patch = useCallback((key: string, p: Partial<StagedFile>) => {
    setStaged((prev) => prev.map((s) => (s.key === key ? { ...s, ...p } : s)));
  }, []);

  const stage = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      // Only mint a batch when there's more than one file in this stage call.
      const batchId = list.length > 1 ? newBatchId() : undefined;
      const next: StagedFile[] = [];
      for (const f of list) {
        if (f.size > MAX_BYTES) {
          next.push({
            key: newKey(),
            file: f,
            status: "failed",
            errorLabel: vantaSay.fileTooLarge(f.name),
            batchId,
          });
          continue;
        }
        next.push({ key: newKey(), file: f, status: "staged", batchId });
      }
      setStaged((prev) => [...prev, ...next]);
      if (user) {
        for (const s of next) {
          if (s.status === "staged") {
            void logFileEvent(user.id, "file.staged", null, {
              filename: s.file.name,
              size: s.file.size,
              mime: s.file.type || null,
              source: opts?.source ?? "upload",
              batch_id: batchId ?? null,
            });
          }
        }
      }
      return next.map((n) => n.key);
    },
    [user, opts?.source],
  );

  const remove = useCallback((key: string) => {
    setStaged((prev) => prev.filter((s) => s.key !== key));
  }, []);

  const setNote = useCallback((key: string, note: string) => {
    patch(key, { note });
  }, [patch]);

  const clearCompleted = useCallback(() => {
    setStaged((prev) => prev.filter((s) => s.status !== "saved"));
  }, []);

  // upload a single staged file (or retry one). Returns when fully settled.
  const uploadOne = useCallback(
    async (key: string) => {
      if (!user) return;
      const s = ref.current.find((x) => x.key === key);
      if (!s) return;
      if (s.status === "uploading" || s.status === "reading" || s.status === "saved") return;
      patch(key, { status: "uploading", progress: undefined, errorLabel: undefined });
      void logFileEvent(user.id, "file.upload_started", null, {
        filename: s.file.name,
        source: opts?.source ?? "upload",
      });
      const path = `${user.id}/${Date.now()}-${s.file.name.replace(/[^A-Za-z0-9._-]/g, "_")}`;
      try {
        const { error: upErr } = await supabase.storage
          .from("memory-uploads")
          .upload(path, s.file, { contentType: s.file.type || undefined });
        if (upErr) throw upErr;
        const { data: rec, error: insErr } = await supabase
          .from("ingested_files")
          .insert({
            user_id: user.id,
            filename: s.file.name,
            mime_type: s.file.type || null,
            size_bytes: s.file.size,
            storage_path: path,
            source: opts?.source ?? "upload",
            status: "pending",
            metadata: s.note ? { note: s.note } : {},
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        patch(key, { ingestedFileId: rec.id, status: "reading" });
        void logFileEvent(user.id, "file.uploaded", rec.id, { filename: s.file.name });
        void logFileEvent(user.id, "file.extraction_started", rec.id, {
          filename: s.file.name,
        });
        const { error: fnErr } = await supabase.functions.invoke("files-ingest", {
          body: { ingested_file_id: rec.id },
        });
        if (fnErr) throw fnErr;
        patch(key, { status: "saved" });
        void logFileEvent(user.id, "file.extracted", rec.id, { filename: s.file.name });
        const saved = ref.current.find((x) => x.key === key);
        if (saved) opts?.onSaved?.(saved);
      } catch (e: unknown) {
        const sNow = ref.current.find((x) => x.key === key);
        const isExtract = sNow?.status === "reading";
        const label = isExtract ? vantaSay.file.cantRead() : vantaSay.errorWith("This one did not upload", "Try again.");
        patch(key, { status: "failed", errorLabel: label });
        void logFileEvent(
          user.id,
          isExtract ? "file.extraction_failed" : "file.upload_failed",
          sNow?.ingestedFileId ?? null,
          { filename: s.file.name, error: (e as Error)?.message ?? String(e) },
        );
      }
    },
    [user, patch, opts],
  );

  // Commit every still-staged file.
  const commitAll = useCallback(async () => {
    const keys = ref.current
      .filter((s) => s.status === "staged")
      .map((s) => s.key);
    // serial to keep storage / RLS calm
    for (const k of keys) await uploadOne(k);
  }, [uploadOne]);

  const retry = useCallback(
    async (key: string) => {
      patch(key, { status: "staged", errorLabel: undefined });
      await uploadOne(key);
    },
    [patch, uploadOne],
  );

  return {
    staged,
    stage,
    remove,
    setNote,
    commitAll,
    retry,
    clearCompleted,
  };
}
