import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, HelpCircle, Link2, Sparkles, ShieldAlert, GitBranch, EyeOff, MessageSquarePlus, NotebookPen, ListPlus, BellPlus, CheckSquare, Check, X } from "lucide-react";
import { useSherlock, SherlockFindings } from "./SherlockContext";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { useStageAction } from "@/hooks/useStageAction";
import { useAuth } from "@/lib/auth";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { generateEmbedding } from "@/lib/embeddings";
import { cn } from "@/lib/utils";
import { StatusDot, confidenceTone } from "@/components/ui/status-dot";
import { useFlipEntry } from "@/hooks/useFlipEntry";

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

const SINGLE_OPS = new Set(["observe", "extract", "relate", "suggest"]);

export function SherlockOverlay() {
  const { open, scope, findings, loading, closeSherlock, setFindings, setLoading } = useSherlock();
  const { user } = useAuth();
  const { orgId } = useScope();
  const stageAction = useStageAction();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    Object.fromEntries(sections.map((s) => [s.key, !!s.defaultOpen]))
  );
  const operation = scope?.operation;
  const isSingleOp = !!operation && SINGLE_OPS.has(operation);

  // The subject Sherlock reads: the passed text, else the title. Empty strings don't count.
  const subjectText = (scope?.text?.trim() || scope?.title?.trim() || "");
  const subjectId = scope?.entity_id ?? null;
  const hasSubject = !!subjectText || !!subjectId;

  useEffect(() => {
    if (!open || !scope || findings) return;
    if (!hasSubject) return; // nothing to look at — never call with an empty scope
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Single-op modes call their own mode directly; legacy overlay uses overlay mode.
        const mode = isSingleOp ? operation! : "overlay";
        const { data, error } = await supabase.functions.invoke("sherlock-investigate", {
          body: {
            mode,
            organization_id: orgId,
            scope: {
              entity_type: scope.entity_type,
              entity_id: subjectId,
              text: subjectText,
            },
          },
        });
        if (error) throw error;
        if (!cancelled) setFindings(data?.findings ?? {});
      } catch (e) {
        const why = e instanceof Error ? e.message : "the check couldn't finish";
        if (!cancelled) {
          toast.error(`Didn't run — ${why}. Nothing changed. Try again in a moment.`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, scope, findings, setFindings, setLoading, isSingleOp, operation]);

  const writeAudit = async (event: "approved" | "dismissed") => {
    if (!user || !scope) return;
    await supabase.from("audit_log").insert({
      user_id: user.id,
      entity_type: `sherlock_${operation ?? "overlay"}`,
      entity_id: scope.entity_id ?? null,
      event,
      payload: {
        operation,
        target_entity_type: scope.entity_type,
        suggested_route: findings?.suggested_route,
        confidence: findings?.confidence,
      },
    });
  };

  const approveSuggestion = async () => {
    if (!user || !scope || !findings) return;
    const route = findings.suggested_route;
    const text = findings.title || scope.text || scope.title || "";
    try {
      if (route === "commitment") {
        const { data } = await supabase.from("commitments").insert({
          user_id: user.id, summary: text.slice(0, 200),
        }).select("id").single();
        if (data) generateEmbedding("commitment", data.id);
      } else if (route === "action") {
        await stageAction({
          title: text.slice(0, 80), description: text,
          risk: findings.risk, status: "staged", source: "sherlock",
        });
      } else if (route === "reminder") {
        const remind_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await supabase.from("commitments").insert({
          user_id: user.id, summary: text.slice(0, 200), remind_at, priority: "high",
        });
      } else if (route === "memory") {
        const { data } = await supabase.from("notes").insert({
          user_id: user.id, title: text.slice(0, 80), body: text,
        }).select("id").single();
        if (data) generateEmbedding("note", data.id);
      }
      await writeAudit("approved");
      toast.success(vantaSay.sherlock.approved());
      closeSherlock();
    } catch (e) {
      toast.fromError(e);
    }
  };

  const dismissSuggestion = async () => {
    await writeAudit("dismissed");
    toast.message(vantaSay.sherlock.dismissed());
    closeSherlock();
  };

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
    await stageAction({
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

  /* The overlay grows out of the finding row that opened it. */
  const flipRef = useFlipEntry<HTMLDivElement>(open);

  const opLabel = operation ? vantaSay.sherlock.operation[operation as keyof typeof vantaSay.sherlock.operation] : null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && closeSherlock()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md md:max-w-lg p-0 flex flex-col"
        ref={flipRef}
      >
        <SheetHeader className="border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <SheetTitle className="text-base">Sherlock</SheetTitle>
            {opLabel && (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                {opLabel}
              </Badge>
            )}
            {findings?.confidence && (
              <Badge variant="outline" className="ml-auto text-[10px]">
                <StatusDot tone={confidenceTone(findings.confidence)} className="mr-1.5" />
                {findings.confidence} confidence
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

          {/* Single-op result panels (observe / extract / relate / suggest) */}
          {!loading && findings && isSingleOp && (
            <div className="rounded-lg border border-border/60 bg-surface-elevated/30 p-3 space-y-2">
              {operation === "observe" && (
                <>
                  {findings.kind && (
                    <p className="text-sm">{vantaSay.sherlock.looksLike(findings.kind)}</p>
                  )}
                  {findings.salient && (
                    <p className="text-xs text-muted-foreground">{vantaSay.sherlock.salient(findings.salient)}</p>
                  )}
                </>
              )}
              {operation === "extract" && (
                <>
                  {findings.document_type && (
                    <p className="text-sm">Detected: <strong>{findings.document_type}</strong></p>
                  )}
                  {findings.summary && (
                    <p className="text-xs text-foreground/85 leading-relaxed">{findings.summary}</p>
                  )}
                </>
              )}
              {operation === "relate" && (
                <>
                  <p className="text-sm">
                    {vantaSay.sherlock.relatedCount(findings.related?.length ?? 0)}
                  </p>
                  {findings.related && findings.related.length > 0 && (
                    <ul className="space-y-1">
                      {findings.related.slice(0, 8).map((r, i) => (
                        <li key={i} className="rounded-md bg-surface-elevated/60 p-2 text-xs">
                          <div className="flex items-center gap-1.5">
                            {r.confidence && <StatusDot tone={confidenceTone(r.confidence)} />}
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.kind}</span>
                          </div>
                          {r.why && <p className="mt-0.5 text-foreground/85">{r.why}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
              {operation === "suggest" && (
                <>
                  {findings.suggested_route && (
                    <p className="text-sm">
                      {vantaSay.sherlock.suggests(findings.suggested_route)}
                    </p>
                  )}
                  {findings.rationale && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{findings.rationale}</p>
                  )}
                  {findings.due_hint && (
                    <p className="text-[10.5px] text-muted-foreground">When: {findings.due_hint}</p>
                  )}
                </>
              )}
              <p className="text-[10px] italic text-muted-foreground/80">
                {vantaSay.sherlock.notExecuting()}
              </p>
              <div className="flex gap-1.5 pt-1">
                {operation === "suggest" && findings.suggested_route &&
                  ["commitment", "action", "reminder", "memory"].includes(findings.suggested_route) && (
                  <Button size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={approveSuggestion}>
                    <Check className="h-3 w-3" /> Approve
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" onClick={dismissSuggestion}>
                  <X className="h-3 w-3" /> Dismiss
                </Button>
              </div>
            </div>
          )}

          {!loading && !isSingleOp && findings?.summary && (
            <p className="text-sm leading-relaxed text-foreground/90">{findings.summary}</p>
          )}

          {!loading && !isSingleOp && findings &&
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

          {!loading && !isSingleOp && findings && Object.values(findings).every((v) => !v || (Array.isArray(v) && !v.length)) && (
            <p className="text-xs text-muted-foreground text-center py-8">
              {vantaSay.sherlock.nothingFound()}
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
