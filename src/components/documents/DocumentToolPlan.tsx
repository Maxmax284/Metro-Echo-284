// DocumentToolPlan — Phase 7 Tooling Addendum gap #1.
// When a contextual ask resolves to a multi-step run (read → review → packet),
// show the numbered plan and a single Approve button before any tool fires.
// Reuses the existing per-step handlers — no new edge functions.
import { useMemo, useState } from "react";
import { CheckCircle2, Circle, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ToolPlanStepKey = "extract" | "review" | "export-operator";

interface Props {
  status: string;
  isDraft: boolean;
  busy: boolean;
  hasReview: boolean;
  onRun: (steps: ToolPlanStepKey[]) => Promise<void> | void;
}

const STEP_LABEL: Record<ToolPlanStepKey, string> = {
  "extract": "Read the document",
  "review": "Plain-English review",
  "export-operator": "Build operator packet",
};

export function DocumentToolPlan({ status, isDraft, busy, hasReview, onRun }: Props) {
  const [running, setRunning] = useState<ToolPlanStepKey[]>([]);
  const [done, setDone] = useState<ToolPlanStepKey[]>([]);

  const steps = useMemo<ToolPlanStepKey[]>(() => {
    if (isDraft) return [];
    const out: ToolPlanStepKey[] = [];
    if (status === "uploaded" || status === "failed") out.push("extract");
    if (!hasReview || status === "extracted" || status === "reviewed") out.push("review");
    out.push("export-operator");
    return out;
  }, [status, isDraft, hasReview]);

  if (isDraft || steps.length < 2) return null;

  const approve = async () => {
    setDone([]);
    setRunning(steps);
    try {
      await onRun(steps);
      setDone(steps);
    } finally {
      setRunning([]);
    }
  };

  const active = running.length > 0;

  return (
    <section className="space-y-2 rounded-lg border border-primary/20 bg-primary/[0.04] p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-primary/80">
        <Sparkles className="h-3 w-3" /> Review and create a packet
      </div>
      <ol className="space-y-1.5">
        {steps.map((s, i) => {
          const isDone = done.includes(s);
          const isActive = active && !isDone;
          return (
            <li key={s} className="flex items-center gap-2 text-xs text-foreground/85">
              <span className="text-muted-foreground">{i + 1}.</span>
              {isDone ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : isActive ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-muted-foreground/60" />
              )}
              <span>{STEP_LABEL[s]}</span>
            </li>
          );
        })}
      </ol>
      <div className="flex items-center justify-between gap-2 pt-1">
        <p className="text-[11px] text-muted-foreground">
          Nothing runs until you tap Approve.
        </p>
        <Button size="sm" onClick={approve} disabled={busy || active} className="h-8 gap-1.5 text-xs">
          {active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Approve plan
        </Button>
      </div>
    </section>
  );
}
