import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { FileText, Loader2, RefreshCw, AlertCircle, Search as SearchIcon, ExternalLink, Bell, ListChecks, Archive, Eye, Inbox, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { useSherlock } from "@/components/sherlock/SherlockContext";
import { ReminderComposer } from "@/components/reminders/ReminderComposer";
import { LinkChips, readLinks } from "@/components/links/LinkChips";

const MAX_BYTES = 20 * 1024 * 1024;

export type FileRow = {
  id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  source: string;
  status: string;
  note_id: string | null;
  metadata: any;
  created_at: string;
};

const DOC_TYPES = [
  "receipt", "invoice", "contract", "admin", "visa", "booking", "screenshot", "image", "checklist", "unknown",
];

const STATUS_COPY: Record<string, { label: string; tone: "muted" | "primary" | "warn" | "danger" | "ok" }> = {
  pending: { label: "Reading it…", tone: "muted" },
  processing: { label: "Classifying…", tone: "primary" },
  done: { label: "Saved", tone: "ok" },
  failed: { label: "Couldn't read this one", tone: "danger" },
  error: { label: "Couldn't read this one", tone: "danger" },
  uploaded: { label: "Uploaded", tone: "muted" },
};

const TONE: Record<string, string> = {
  muted: "bg-muted/20 text-muted-foreground ring-border/60",
  primary: "bg-primary/10 text-primary ring-primary/30",
  warn: "bg-warn/10 text-warn ring-warn/30",
  danger: "bg-destructive/10 text-destructive ring-destructive/30",
  ok: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
};

export function MemoryFilesView() {
  const { user } = useAuth();
  const { openSherlock } = useSherlock();
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "review" | "archived">("all");
  const [composingFor, setComposingFor] = useState<string | null>(null);
  const [typeMenuFor, setTypeMenuFor] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ingested_files")
      .select("id, filename, mime_type, size_bytes, source, status, note_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    setFiles((data ?? []) as FileRow[]);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const handleFiles = async (fileList: FileList | File[]) => {
    if (!user) return;
    const list = Array.from(fileList);
    if (list.length === 0) return;
    setUploading(true);
    for (const f of list) {
      try {
        if (f.size > MAX_BYTES) { toast.error(vantaSay.fileTooLarge(f.name)); continue; }
        const path = `${user.id}/${Date.now()}-${f.name.replace(/[^A-Za-z0-9._-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("memory-uploads").upload(path, f, { contentType: f.type || undefined });
        if (upErr) throw upErr;
        const { data: rec, error: insErr } = await supabase
          .from("ingested_files")
          .insert({
            user_id: user.id,
            filename: f.name,
            mime_type: f.type || null,
            size_bytes: f.size,
            storage_path: path,
            source: "upload",
            status: "pending",
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        const { error: fnErr } = await supabase.functions.invoke("files-ingest", {
          body: { ingested_file_id: rec.id },
        });
        if (fnErr) throw fnErr;
        toast.success(vantaSay.fileIngested(f.name));
      } catch (e) {
        toast.fromError(e);
      }
    }
    setUploading(false);
    refresh();
  };

  const audit = async (fileId: string, event: string, payload: Record<string, any> = {}) => {
    if (!user) return;
    await supabase.from("audit_log").insert({
      user_id: user.id,
      entity_type: "ingested_file",
      entity_id: fileId,
      event,
      payload,
    });
  };

  const setDocType = async (f: FileRow, doc_type: string) => {
    const meta = { ...(f.metadata ?? {}), document_type: doc_type, confidence: "high" };
    await supabase.from("ingested_files").update({ metadata: meta }).eq("id", f.id);
    await audit(f.id, "file.type_corrected", { document_type: doc_type });
    toast.success({ title: vantaSay.fileTypeSet(doc_type) });
    setTypeMenuFor(null);
    refresh();
  };

  const archive = async (f: FileRow) => {
    const meta = { ...(f.metadata ?? {}), archived: true };
    await supabase.from("ingested_files").update({ metadata: meta }).eq("id", f.id);
    await audit(f.id, "file.archived");
    toast.message({ title: vantaSay.fileArchived() });
    refresh();
  };

  const unarchive = async (f: FileRow) => {
    const meta = { ...(f.metadata ?? {}), archived: false };
    await supabase.from("ingested_files").update({ metadata: meta }).eq("id", f.id);
    await audit(f.id, "file.unarchived");
    refresh();
  };

  const createReminderForFile = async (
    f: FileRow,
    due: string,
    remind: string,
    tz: string,
    title?: string,
  ) => {
    if (!user) return;
    const summary = (title && title.trim()) || `Review ${f.filename}`;
    const { data } = await supabase.from("commitments").insert({
      user_id: user.id,
      summary,
      due_at: due,
      remind_at: remind,
      priority: "normal",
    }).select("id").single();
    const meta = { ...(f.metadata ?? {}), reminder_id: data?.id, timezone: tz };
    await supabase.from("ingested_files").update({ metadata: meta }).eq("id", f.id);
    await audit(f.id, "file.reminder_created", {
      commitment_id: data?.id,
      timezone: tz,
      remind_lead_minutes: Math.round((new Date(due).getTime() - new Date(remind).getTime()) / 60000),
    });
    toast.success({ title: vantaSay.reminderSet(new Date(due).toLocaleString()) });
    setComposingFor(null);
    refresh();
  };

  const retryIngest = async (f: FileRow) => {
    try {
      await supabase.from("ingested_files").update({ status: "pending", error: null }).eq("id", f.id);
      const { error } = await supabase.functions.invoke("files-ingest", { body: { ingested_file_id: f.id } });
      if (error) throw error;
      await audit(f.id, "file.ingest_retried");
      toast.success({ title: "Re-reading it." });
      refresh();
    } catch (e) {
      toast.fromError(e);
    }
  };

  const sendToSherlock = async (f: FileRow) => {
    openSherlock({
      entity_type: "note",
      entity_id: f.note_id ?? undefined,
      title: f.filename,
      text: "",
    });
    await audit(f.id, "file.sent_to_sherlock");
  };

  const filtered = files.filter((f) => {
    const archived = !!f.metadata?.archived;
    if (filter === "archived") return archived;
    if (archived) return false;
    if (filter === "review") {
      return !f.metadata?.document_type || f.status === "failed" || f.status === "error";
    }
    return true;
  });

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => !uploading && inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-4 text-xs transition-colors",
          drag ? "border-primary bg-primary/10" : "border-border/60 hover:border-muted-foreground/60",
        )}
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Upload className="h-4 w-4 text-muted-foreground" />}
        <span className="text-[11.5px] text-muted-foreground">
          {uploading ? "Ingesting…" : "Drop files or tap to upload"}
        </span>
        <span className="text-[10px] text-muted-foreground/70">PDF, text, markdown · max 20MB</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>
      <div className="-mx-1 flex snap-x snap-mandatory items-center gap-1.5 overflow-x-auto px-1">
        {([
          { id: "all", label: "All" },
          { id: "review", label: "Needs review" },
          { id: "archived", label: "Archived" },
        ] as const).map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "shrink-0 snap-start rounded-full border px-2.5 py-1 text-[11px] transition-colors",
              filter === f.id
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border/60 bg-surface-elevated/40 text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={refresh}
          className="ml-auto shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
          aria-label="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {loading && (
        <div className="rounded-md border border-dashed border-border/60 py-6 text-center text-[12px] text-muted-foreground">
          <Loader2 className="mx-auto h-4 w-4 animate-spin" />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border/60 py-10 text-center text-[12px] text-muted-foreground">
          <Inbox className="h-5 w-5 opacity-50" />
          {filter === "archived" ? "Nothing archived." : "No files yet. Upload one from Settings."}
        </div>
      )}

      <ul className="space-y-2">
        {filtered.map((f) => {
          const meta = f.metadata ?? {};
          const docType = meta.document_type as string | undefined;
          const needsType = !docType && f.status === "done";
          const status = STATUS_COPY[f.status] ?? { label: f.status, tone: "muted" as const };
          const links = readLinks(meta);
          return (
            <li key={f.id} className="space-y-2 rounded-xl surface-elevated p-3 ring-1 ring-border/60">
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{f.filename}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1", TONE[status.tone])}>
                      {status.label}
                    </span>
                    {docType ? (
                      <span className="rounded-full bg-muted/30 px-2 py-0.5 ring-1 ring-border/50">{docType}</span>
                    ) : needsType ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-warn/10 px-2 py-0.5 text-warn ring-1 ring-warn/30">
                        <AlertCircle className="h-3 w-3" /> Needs review
                      </span>
                    ) : null}
                    {f.source && <span className="rounded-full bg-muted/20 px-2 py-0.5 ring-1 ring-border/50">{f.source}</span>}
                    {f.note_id && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary ring-1 ring-primary/30">→ Memory</span>}
                    <span>· {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}</span>
                  </div>
                  {meta.chars ? (
                    <p className="mt-1 text-[10.5px] italic text-muted-foreground/80">
                      {Number(meta.chars).toLocaleString()} chars extracted via {meta.extraction ?? "—"}.
                    </p>
                  ) : f.status === "error" || f.status === "failed" ? (
                    <p className="mt-1 text-[10.5px] italic text-destructive/80">
                      {meta.error || "Extraction failed."}
                    </p>
                  ) : null}
                </div>
              </div>

              {!meta.archived && (
                <>
                  <LinkChips entityKind="ingested_file" entityId={f.id} links={links} onChange={refresh} compact />

                  <div className="-mx-1 flex snap-x snap-mandatory gap-1.5 overflow-x-auto px-1 sm:flex-wrap sm:overflow-visible">
                    {f.note_id && (
                      <Button size="sm" variant="outline" className="h-7 shrink-0 snap-start whitespace-nowrap px-2 text-[11px]" onClick={() => window.location.hash = `#note-${f.note_id}`}>
                        <Eye className="mr-1 h-3 w-3" /> Open note
                      </Button>
                    )}
                    <div className="relative shrink-0 snap-start">
                      <Button
                        size="sm" variant="outline" className="h-7 whitespace-nowrap px-2 text-[11px]"
                        onClick={() => setTypeMenuFor(typeMenuFor === f.id ? null : f.id)}
                      >
                        {docType ? "Change type" : "Set type"}
                      </Button>
                      {typeMenuFor === f.id && (
                        <div className="absolute left-0 top-8 z-10 grid w-44 grid-cols-2 gap-1 rounded-md bg-surface-elevated p-1.5 shadow-lg ring-1 ring-border/60">
                          {DOC_TYPES.map((t) => (
                            <button
                              key={t}
                              onClick={() => setDocType(f, t)}
                              className="rounded px-1.5 py-1 text-left text-[11px] text-foreground hover:bg-primary/10 hover:text-primary"
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button size="sm" variant="outline" className="h-7 shrink-0 snap-start whitespace-nowrap px-2 text-[11px]"
                      onClick={() => setComposingFor(composingFor === f.id ? null : f.id)}>
                      <Bell className="mr-1 h-3 w-3" /> Reminder
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 shrink-0 snap-start whitespace-nowrap px-2 text-[11px]"
                      onClick={() => sendToSherlock(f)}>
                      <SearchIcon className="mr-1 h-3 w-3" /> Sherlock
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 shrink-0 snap-start whitespace-nowrap px-2 text-[11px] text-muted-foreground"
                      onClick={() => archive(f)}>
                      <Archive className="mr-1 h-3 w-3" /> Archive
                    </Button>
                  </div>
                </>
              )}

              {meta.archived && (
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => unarchive(f)}>
                    Undo archive
                  </Button>
                </div>
              )}

              {composingFor === f.id && (
                <ReminderComposer
                  initialText=""
                  defaultDayOffset={1}
                  onCancel={() => setComposingFor(null)}
                  onConfirm={(r) => createReminderForFile(f, r.due_at, r.remind_at, r.timezone)}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
