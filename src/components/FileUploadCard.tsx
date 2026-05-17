import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, FileText, Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useSherlock } from "@/components/sherlock/SherlockContext";
import { StatusDot, ingestStatusTone } from "@/components/ui/status-dot";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  status: string;
  source: string;
  note_id: string | null;
  error: string | null;
  created_at: string;
};

const MAX_BYTES = 20 * 1024 * 1024;

export function FileUploadCard() {
  const { user } = useAuth();
  const { openSherlock } = useSherlock();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const { data } = await supabase
      .from("ingested_files")
      .select("id,filename,mime_type,size_bytes,status,source,note_id,error,created_at")
      .order("created_at", { ascending: false })
      .limit(8);
    setRows((data ?? []) as Row[]);
  };

  useEffect(() => { refresh(); }, []);

  const handleFiles = async (files: FileList | File[]) => {
    if (!user) return;
    const list = Array.from(files);
    setBusy(true);
    for (const f of list) {
      try {
        if (f.size > MAX_BYTES) { toast.error(`${f.name} exceeds 20MB`); continue; }
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
        toast.success(`${f.name} ingested`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      }
    }
    setBusy(false);
    refresh();
  };

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Files into memory</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 text-xs transition-colors ${drag ? "border-primary bg-accent/40" : "border-muted-foreground/30"}`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-5 w-5 text-muted-foreground" />}
          <span className="text-muted-foreground">Drop files or click to upload (max 20MB)</span>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
        </div>

        <div className="space-y-1">
          {rows.length === 0 && <p className="text-xs text-muted-foreground">No files yet.</p>}
          {rows.map((r) => (
            <div key={r.id} className="flex items-start gap-2 rounded-md border border-border/40 p-2 text-xs">
              <FileText className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.filename}</div>
                <div className="text-[10px] text-muted-foreground">
                  {r.source} · {r.status} · {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                  {r.error ? ` · ${r.error}` : ""}
                </div>
              </div>
              {r.note_id && r.status === "done" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[10px] gap-1"
                  title="Investigate with Sherlock"
                  onClick={async () => {
                    const { data: note } = await supabase
                      .from("notes")
                      .select("id, title, body")
                      .eq("id", r.note_id!)
                      .maybeSingle();
                    if (!note) { toast.error("Note not found"); return; }
                    openSherlock({
                      entity_type: "file",
                      entity_id: note.id,
                      title: note.title ?? r.filename,
                      text: note.body ?? "",
                    });
                  }}
                >
                  <Search className="h-3 w-3" /> Investigate
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={refresh}>↻</Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
