// FindingFeedback — two taps to teach Sherlock, and nothing else.
//
// Doctrine: feedback is a signal, not an execution. "Helpful" and "Not right"
// record what you thought; neither accepts, dismisses, files or links anything.
// "Not right" additionally quiets that finding for the cooldown period, because
// being told something is wrong and showing it again tomorrow is not listening.
import { useState } from "react";
import { ThumbsUp, ThumbsDown, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { cn } from "@/lib/utils";
import type { SherlockFinding } from "@/lib/sherlock/types";

type Verdict = "useful" | "wrong";

export function FindingFeedback({
  finding,
  cooldownDays = 7,
  onChanged,
  className,
}: {
  finding: SherlockFinding;
  cooldownDays?: number;
  onChanged?: () => void;
  className?: string;
}) {
  const { orgId } = useScope();
  const [busy, setBusy] = useState<Verdict | null>(null);
  const [given, setGiven] = useState<Verdict | null>(null);

  const send = async (verdict: Verdict) => {
    if (busy || given) return;
    setBusy(verdict);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: inserted, error } = await supabase.from("corrections").insert({
        user_id: u.user.id,
        organization_id: orgId ?? null,
        surface: "sherlock",
        target_type: "sherlock_finding",
        target_id: finding.id,
        feedback_type: verdict,
        confidence_impact: verdict === "useful" ? "raise" : "invalidate",
        original_value: {
          finding_type: finding.finding_type,
          confidence: finding.confidence,
          summary: finding.summary,
        } as never,
        source_label: "user_feedback",
      }).select("id").single();
      if (error) throw error;

      // Receipt: a correction is a recorded event, traceable in Receipts.
      await supabase.from("audit_log").insert({
        user_id: u.user.id,
        organization_id: orgId ?? null,
        entity_type: "correction",
        entity_id: inserted?.id ?? null,
        event: `correction:${verdict}`,
        payload: { surface: "sherlock", target_type: "sherlock_finding", target_id: finding.id } as never,
      });

      if (verdict === "wrong") {
        // Quiet this one for the cooldown window. Status is untouched: being
        // wrong is not the same as being dismissed.
        await supabase
          .from("sherlock_findings")
          .update({ cooldown_until: new Date(Date.now() + cooldownDays * 86400_000).toISOString() })
          .eq("id", finding.id);
      }

      setGiven(verdict);
      toast.success(
        verdict === "useful"
          ? "Noted — more like this."
          : `Noted — this kind stays quiet for ${cooldownDays} day${cooldownDays === 1 ? "" : "s"}.`,
      );
      onChanged?.();
    } catch {
      toast.error("Couldn't record that. Try again.");
    } finally {
      setBusy(null);
    }
  };

  if (given) {
    return (
      <span
        className={cn("inline-flex items-center gap-1 text-[10.5px] text-muted-foreground", className)}
      >
        <Check className="h-3 w-3 text-primary" aria-hidden />
        {given === "useful" ? "Marked helpful" : "Marked not right"}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <button
        type="button"
        onClick={() => void send("useful")}
        disabled={Boolean(busy)}
        aria-label="This finding was helpful"
        className="inline-flex h-7 min-w-[44px] items-center justify-center gap-1 rounded-full px-2 text-[10.5px] text-muted-foreground ring-1 ring-border/60 transition hover:text-primary hover:ring-primary/40 disabled:opacity-50"
      >
        <ThumbsUp className="h-3 w-3" aria-hidden /> Helpful
      </button>
      <button
        type="button"
        onClick={() => void send("wrong")}
        disabled={Boolean(busy)}
        aria-label="This finding was not right"
        className="inline-flex h-7 min-w-[44px] items-center justify-center gap-1 rounded-full px-2 text-[10.5px] text-muted-foreground ring-1 ring-border/60 transition hover:text-destructive hover:ring-destructive/40 disabled:opacity-50"
      >
        <ThumbsDown className="h-3 w-3" aria-hidden /> Not right
      </button>
    </span>
  );
}
