import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useSystemControls } from "@/hooks/useSystemControls";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Telescope, Loader2, ShieldAlert, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

type Mode = "quick" | "deep";
type ResearchRow = {
  id: string; question: string; mode: Mode; status: string;
  summary: string | null; error: string | null; created_at: string;
};
type SourceRow = {
  id: string; research_id: string; title: string | null; url: string | null;
  snippet: string | null; provider: string | null; position: number | null;
};

const CONFIRM_PHRASE = "run deep research";

export function ResearchPanel() {
  const { session } = useAuth();
  const { controls } = useSystemControls();
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<Mode>("quick");
  const [running, setRunning] = useState(false);
  const [items, setItems] = useState<ResearchRow[]>([]);
  const [sourcesByRun, setSourcesByRun] = useState<Record<string, SourceRow[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const refresh = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from("research_objects")
      .select("id,question,mode,status,summary,error,created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    setItems((data ?? []) as ResearchRow[]);
  }, [session]);

  useEffect(() => { refresh(); }, [refresh]);

  const loadSources = useCallback(async (id: string) => {
    if (sourcesByRun[id]) return;
    const { data } = await supabase
      .from("research_sources")
      .select("id,research_id,title,url,snippet,provider,position")
      .eq("research_id", id)
      .order("position", { ascending: true });
    setSourcesByRun(prev => ({ ...prev, [id]: (data ?? []) as SourceRow[] }));
  }, [sourcesByRun]);

  const fire = useCallback(async (chosenMode: Mode) => {
    if (!question.trim() || running) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("research-run", {
        body: { question: question.trim(), mode: chosenMode },
      });
      if (error) throw error;
      if (data?.status === "blocked") {
        toast.error(`Blocked: ${data.reason ?? "disabled"}`);
      } else if (data?.status === "failed") {
        toast.error(`Failed: ${data.error ?? "unknown"}`);
      } else {
        toast.success(`Research complete · ${data?.sources ?? 0} sources`);
        setQuestion("");
      }
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "research failed");
    } finally {
      setRunning(false);
    }
  }, [question, running, refresh]);

  const onSubmit = () => {
    if (!question.trim()) return;
    if (mode === "deep") {
      setConfirmText("");
      setConfirmOpen(true);
    } else {
      fire("quick");
    }
  };

  const deepEnabled = !!controls?.deep_research_enabled && !!controls?.external_apis_enabled
    && controls?.global_usage_mode !== "lockdown";

  return (
    <Card className="border-border/60 bg-surface-elevated/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Telescope className="h-4 w-4 text-primary" />
          Research
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant={mode === "quick" ? "default" : "ghost"}
            className="h-7 text-[11px]" onClick={() => setMode("quick")}>Quick</Button>
          <Button size="sm" variant={mode === "deep" ? "default" : "ghost"}
            className="h-7 text-[11px]" onClick={() => setMode("deep")}
            disabled={!deepEnabled}
            title={deepEnabled ? "Deep mode: up to 3 searches, requires typed confirm" : "Deep research disabled in Control Room"}>
            Deep
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={mode === "deep" ? "Deep research question…" : "Ask a research question…"}
          onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); }}
          disabled={running}
        />
        <Button onClick={onSubmit} disabled={!question.trim() || running} size="sm">
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Run"}
        </Button>
      </div>
      {mode === "deep" && (
        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-warn">
          <ShieldAlert className="mt-0.5 h-3 w-3" />
          Deep mode runs up to 3 searches and AI synthesis. Type-to-confirm required.
        </div>
      )}

      <div className="mt-4 space-y-2">
        {items.length === 0 && (
          <div className="text-[12px] text-muted-foreground">No research runs yet.</div>
        )}
        {items.map((r) => {
          const isOpen = expanded === r.id;
          return (
            <div key={r.id} className="rounded border border-border/50 bg-surface/40 p-2.5">
              <button className="flex w-full items-start justify-between gap-2 text-left"
                onClick={() => {
                  const next = isOpen ? null : r.id;
                  setExpanded(next);
                  if (next) loadSources(next);
                }}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] text-foreground">{r.question}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                    <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">{r.mode}</Badge>
                    <span>{r.status}</span>
                    <span>·</span>
                    <span>{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
                  </div>
                </div>
              </button>
              {isOpen && (
                <div className="mt-2 space-y-2 border-t border-border/40 pt-2">
                  {r.summary && (
                    <div className="whitespace-pre-wrap text-[12px] text-foreground/90">{r.summary}</div>
                  )}
                  {r.error && (
                    <div className="text-[11px] text-warn">Error: {r.error}</div>
                  )}
                  <ul className="space-y-1">
                    {(sourcesByRun[r.id] ?? []).map((s, i) => (
                      <li key={s.id} className="text-[11.5px]">
                        <a href={s.url ?? "#"} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-start gap-1 text-primary hover:underline">
                          <span className="text-muted-foreground">[{i + 1}]</span>
                          <span className="line-clamp-1">{s.title || s.url}</span>
                          <ExternalLink className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                        </a>
                        {s.snippet && (
                          <div className="line-clamp-2 pl-5 text-[10.5px] text-muted-foreground">{s.snippet}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm deep research</DialogTitle>
            <DialogDescription>
              Deep mode will run up to 3 SerpApi searches plus AI synthesis. Type{" "}
              <span className="font-mono text-foreground">{CONFIRM_PHRASE}</span> to proceed.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            className="font-mono text-sm"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button
              disabled={confirmText.trim().toLowerCase() !== CONFIRM_PHRASE || running}
              onClick={() => { setConfirmOpen(false); fire("deep"); }}>
              Run deep research
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
