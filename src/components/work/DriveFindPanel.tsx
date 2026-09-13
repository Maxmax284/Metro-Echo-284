// DriveFindPanel — find a file by name, and decide per file what happens next.
//
// Doctrine:
//   - Searching shows names and dates. That is browsing, not reading.
//   - Reading what is inside one file is its own yes, for that file, and it is
//     recorded. Open in Google is always the other choice.
//   - Quiet when Drive is not switched on: Settings owns that conversation.
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, FolderSearch, ScanText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { vantaToast as toast } from "@/lib/vantaVoice";

type DriveFile = {
  id: string;
  name: string;
  kind: string;
  mimeType: string;
  modifiedAt: string | null;
  link: string | null;
};

type ReadFile = { name: string; kind: string; text: string };

export function DriveFindPanel() {
  const { orgId } = useScope();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [term, setTerm] = useState("");
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [reading, setReading] = useState<ReadFile | null>(null);

  const search = useCallback(async (query: string) => {
    setBusy("search");
    try {
      const { data, error } = await supabase.functions.invoke("drive-find", { body: { query } });
      if (error) throw error;
      const body = data as { connected?: boolean; files?: DriveFile[] } | null;
      setConnected(!!body?.connected);
      setFiles(body?.files ?? []);
    } catch {
      setConnected(false);
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    void search("");
  }, [search]);

  const readIt = async (file: DriveFile) => {
    setBusy(file.id);
    try {
      const { data, error } = await supabase.functions.invoke("drive-read", {
        body: { file_id: file.id, confirmed: true, organization_id: orgId ?? null },
      });
      if (error) throw error;
      const body = data as
        | { readable?: boolean; name?: string; kind?: string; text?: string; detail?: string }
        | null;
      if (!body?.readable) {
        toast.info(body?.detail ?? "Echo cannot read that kind of file.");
        return;
      }
      setReading({ name: body.name ?? file.name, kind: body.kind ?? file.kind, text: body.text ?? "" });
    } catch {
      toast.error("That file would not open.");
    } finally {
      setBusy(null);
    }
  };

  if (connected === false) return null;

  return (
    <div className="vanta-card p-3">
      <div className="flex items-center gap-2">
        <FolderSearch className="h-3.5 w-3.5 text-primary" />
        <h3 className="text-xs font-medium">Find a file in Drive</h3>
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search(term);
        }}
      >
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Part of the file name"
          className="h-9 text-[12.5px]"
        />
        <Button size="sm" className="vanta-focus h-9 shrink-0 text-[11.5px]" disabled={busy === "search"}>
          Look
        </Button>
      </form>
      <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">
        Echo sees names and dates here. Reading inside a file is a separate yes, per file.
      </p>
      {files.length === 0 ? (
        <p className="mt-2 text-[11.5px] text-muted-foreground">
          {busy === "search" ? "Looking…" : "Nothing by that name."}
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {files.map((file) => (
            <li key={file.id} className="vanta-inset px-3 py-2">
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{file.name}</span>
                  <span className="mt-0.5 block text-[10.5px] text-muted-foreground">{file.kind}</span>
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {file.link ? (
                  <a
                    href={file.link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-[36px] items-center text-[11px] text-primary hover:underline"
                  >
                    <ExternalLink className="mr-1 h-3 w-3" />
                    Open in Google
                  </a>
                ) : null}
                <button
                  onClick={() => void readIt(file)}
                  disabled={busy === file.id}
                  className="inline-flex min-h-[36px] items-center text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <ScanText className="mr-1 h-3 w-3" />
                  {busy === file.id ? "Reading…" : "Let Echo read it"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!reading} onOpenChange={(v) => !v && setReading(null)}>
        <DialogContent className="max-h-[85svh] max-w-[92vw] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[13px]">{reading?.name}</DialogTitle>
            <DialogDescription className="text-[11.5px]">
              {reading?.kind} · Echo read this because you said so, and it is on your receipts.
            </DialogDescription>
          </DialogHeader>
          <p className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-muted-foreground">
            {reading?.text?.slice(0, 8000) || "That file had no readable text."}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
