import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Investigation = {
  id: string;
  question: string;
  status: string;
  summary: string | null;
  created_at: string;
};

type Finding = {
  id: string;
  investigation_id: string;
  claim: string;
  confidence: string;
  source_kind: string | null;
  source_excerpt: string | null;
};

export function SherlockSurface() {
  const { user } = useAuth();
  const [question, setQuestion] = useState("");
  const [running, setRunning] = useState(false);
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [findingsByInv, setFindingsByInv] = useState<Record<string, Finding[]>>({});
  const [openId, setOpenId] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("investigations")
      .select("id, question, status, summary, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    setInvestigations((data ?? []) as Investigation[]);
  };

  useEffect(() => { load(); }, [user]);

  const loadFindings = async (id: string) => {
    if (findingsByInv[id]) return;
    const { data } = await supabase
      .from("investigation_findings")
      .select("id, investigation_id, claim, confidence, source_kind, source_excerpt")
      .eq("investigation_id", id);
    setFindingsByInv((m) => ({ ...m, [id]: (data ?? []) as Finding[] }));
  };

  const run = async () => {
    if (!question.trim() || running) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("sherlock-investigate", {
        body: { question: question.trim() },
      });
      if (error) throw error;
      toast.success(`Investigation complete · ${data?.findings_count ?? 0} findings`);
      setQuestion("");
      await load();
      if (data?.id) {
        setOpenId(data.id);
        await loadFindings(data.id);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Investigation failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-y-auto p-4 pb-32 md:pb-6">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-medium">Sherlock</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Ask anything across your notes, commitments, actions, and awareness. Findings are cited.
          </p>
        </header>

        <Card className="p-3 space-y-2">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What did I commit to last week about the Lisbon trip?"
            rows={3}
            className="resize-none"
          />
          <div className="flex justify-end">
            <Button onClick={run} disabled={running || !question.trim()} size="sm" className="gap-1.5">
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Investigate
            </Button>
          </div>
        </Card>

        <div className="space-y-2">
          {investigations.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">No investigations yet.</p>
          )}
          {investigations.map((inv) => {
            const isOpen = openId === inv.id;
            const findings = findingsByInv[inv.id] ?? [];
            return (
              <Card key={inv.id} className="p-3 space-y-2">
                <button
                  className="w-full text-left"
                  onClick={() => {
                    const next = isOpen ? null : inv.id;
                    setOpenId(next);
                    if (next) loadFindings(next);
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-snug">{inv.question}</p>
                    <Badge variant="outline" className="shrink-0 text-[10px]">{inv.status}</Badge>
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(inv.created_at), { addSuffix: true })}
                  </p>
                </button>

                {isOpen && (
                  <div className="space-y-2 border-t border-border/60 pt-2">
                    {inv.summary && <p className="text-sm leading-relaxed text-foreground/90">{inv.summary}</p>}
                    {findings.length > 0 && (
                      <ul className="space-y-1.5">
                        {findings.map((f) => (
                          <li key={f.id} className="rounded-md bg-surface-elevated p-2 text-xs">
                            <div className="flex items-start justify-between gap-2">
                              <span className="leading-snug">{f.claim}</span>
                              <Badge
                                variant="outline"
                                className="shrink-0 text-[9px]"
                              >
                                {f.confidence}
                              </Badge>
                            </div>
                            {f.source_kind && (
                              <p className="mt-1 text-[10px] text-muted-foreground">
                                source: {f.source_kind}{f.source_excerpt ? ` — "${f.source_excerpt}"` : ""}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
