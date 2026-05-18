import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, HelpCircle, Link2, Sparkles, ShieldAlert, GitBranch, EyeOff, MessageSquarePlus, NotebookPen, ListPlus, BellPlus, CheckSquare } from "lucide-react";
import { useSherlock, SherlockFindings } from "./SherlockContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { generateEmbedding } from "@/lib/embeddings";
import { cn } from "@/lib/utils";

const sections: Array<{
  key: keyof SherlockFindings;
  label: string;
  Icon: typeof AlertTriangle;
  defaultOpen?: boolean;
}> = [
  { key: "risks", label: "Risk", Icon: AlertTriangle, defaultOpen: true },
  { key: "missing_info", label: "Missing Information", Icon: HelpCircle, defaultOpen: true },
  { key: "related", label: "Related Context", Icon: Link2, defaultOpen: true },
  { key: "contradictions", label: "Contradictions", Icon: ShieldAlert },
  { key: "assumptions", label: "Weak Assumptions", Icon: Sparkles },
  { key: "dependencies", label: "Dependencies", Icon: GitBranch },
  { key: "blind_spots", label: "Blind Spots", Icon: EyeOff },
];

export function SherlockOverlay() {
  const { open, scope, findings, loading, closeSherlock, setFindings, setLoading } = useSherlock();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    Object.fromEntries(sections.map((s) => [s.key, !!s.defaultOpen]))
  );

  useEffect(() => {
    if (!open || !scope || findings) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("sherlock-investigate", {
          body: {
            mode: "overlay",
            scope: {
              entity_type: scope.entity_type,
              entity_id: scope.entity_id ?? null,
              text: scope.text ?? scope.title ?? "",
            },
          },
        });
        if (error) throw error;
        if (!cancelled) setFindings(data?.findings ?? {});
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Sherlock failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, scope, findings, setFindings, setLoading]);

  const saveToNotes = async (text: string) => {
    if (!user) return;
    const { data } = await supabase
      .from("notes")
      .insert({ user_id: user.id, title: `Sherlock: ${scope?.title ?? "finding"}`.slice(0, 80), body: text })
      .select("id")
      .single();
    if (data) generateEmbedding("note", data.id);
    toast.success(vantaSay.noteSaved());
  };

  const turnIntoAction = async (text: string) => {
    if (!user) return;
    await supabase.from("actions").insert({
      user_id: user.id,
      title: text.slice(0, 80),
      description: text,
      risk: "standard",
      status: "staged",
      source: "sherlock",
    });
    toast.success(vantaSay.actionStaged());
  };

  const createCommitment = async (text: string) => {
    if (!user) return;
    const { data } = await supabase
      .from("commitments")
      .insert({ user_id: user.id, summary: text.slice(0, 200) })
      .select("id")
      .single();
    if (data) generateEmbedding("commitment", data.id);
    toast.success(vantaSay.commitmentAdded());
  };

  const addReminder = async (text: string) => {
    if (!user) return;
    const remind_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("commitments").insert({
      user_id: user.id,
      summary: text.slice(0, 200),
      remind_at,
      priority: "high",
    });
    toast.success("Reminder set for tomorrow.");
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && closeSherlock()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md md:max-w-lg p-0 flex flex-col"
      >
        <SheetHeader className="border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <SheetTitle className="text-base">Sherlock</SheetTitle>
            {findings?.confidence && (
              <Badge variant="outline" className="ml-auto text-[10px]">
                confidence: {findings.confidence}
              </Badge>
            )}
          </div>
          {scope?.title && (
            <p className="line-clamp-2 text-xs text-muted-foreground">{scope.title}</p>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm">Investigating…</span>
            </div>
          )}

          {!loading && findings?.summary && (
            <p className="text-sm leading-relaxed text-foreground/90">{findings.summary}</p>
          )}

          {!loading &&
            findings &&
            sections.map(({ key, label, Icon }) => {
              const items = (findings[key] as any[]) || [];
              if (!items.length) return null;
              const isOpen = expanded[key as string];
              return (
                <div key={String(key)} className="rounded-lg border border-border/60 overflow-hidden">
                  <button
                    onClick={() => setExpanded((p) => ({ ...p, [key as string]: !isOpen }))}
                    className="flex w-full items-center gap-2 bg-surface-elevated/40 px-3 py-2 text-left"
                  >
                    <Icon className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-medium">{label}</span>
                    <Badge variant="outline" className="ml-auto text-[10px]">
                      {items.length}
                    </Badge>
                  </button>
                  {isOpen && (
                    <ul className="divide-y divide-border/60">
                      {items.map((f, i) => {
                        const text = f.claim || f.snippet || "";
                        return (
                          <li key={i} className="p-3 space-y-2">
                            <p className="text-xs leading-relaxed">{text}</p>
                            {(f.rationale || f.snippet) && f.claim && (
                              <p className="text-[10px] text-muted-foreground leading-relaxed">
                                {f.rationale || f.snippet}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-1">
                              <QuickBtn onClick={() => saveToNotes(text)} icon={NotebookPen} label="Save" />
                              <QuickBtn onClick={() => turnIntoAction(text)} icon={ListPlus} label="Action" />
                              <QuickBtn onClick={() => createCommitment(text)} icon={CheckSquare} label="Commit" />
                              <QuickBtn onClick={() => addReminder(text)} icon={BellPlus} label="Remind" />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}

          {!loading && findings && Object.values(findings).every((v) => !v || (Array.isArray(v) && !v.length)) && (
            <p className="text-xs text-muted-foreground text-center py-8">
              Nothing notable. Sherlock didn't find risks, gaps, or contradictions in this context.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function QuickBtn({ onClick, icon: Icon, label }: { onClick: () => void; icon: typeof MessageSquarePlus; label: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className={cn("h-7 gap-1 px-2 text-[10px]")}
    >
      <Icon className="h-3 w-3" />
      {label}
    </Button>
  );
}
