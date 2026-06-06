// Project health — situations first, counts second.
// Pure derivation from EntityRollup counts. No queries, no AI.
import type { EntityRollup } from "@/lib/briefs";

export type ProjectHealth = {
  status: "needs_attention" | "blocked" | "waiting" | "review_required" | "on_track" | "calm";
  label: string;
  reason: string;
  tone: "warn" | "primary" | "muted" | "accent";
};

export function deriveProjectHealth(rollup: EntityRollup | null): ProjectHealth {
  const c = rollup?.counts;
  if (!c) {
    return {
      status: "calm",
      label: "Calm",
      reason: "No recent activity in this project.",
      tone: "muted",
    };
  }

  const overdue = c.commitments_overdue ?? 0;
  const highRisk = c.actions_high_risk ?? 0;
  const sherlock = c.sherlock_pending ?? 0;
  const pendingActions = c.actions_pending ?? 0;
  const openCommit = c.commitments_open ?? 0;
  const recent = c.audit_7d ?? 0;

  if (overdue > 0 || highRisk > 0) {
    const bits: string[] = [];
    if (overdue > 0) bits.push(`${overdue} overdue commitment${overdue === 1 ? "" : "s"}`);
    if (highRisk > 0) bits.push(`${highRisk} high-risk action${highRisk === 1 ? "" : "s"}`);
    return {
      status: "needs_attention",
      label: "Needs attention",
      reason: bits.join(" · "),
      tone: "warn",
    };
  }
  if (sherlock > 0) {
    return {
      status: "review_required",
      label: "Review required",
      reason: `${sherlock} Sherlock finding${sherlock === 1 ? "" : "s"} waiting for you.`,
      tone: "accent",
    };
  }
  if (pendingActions > 0) {
    return {
      status: "waiting",
      label: "Waiting",
      reason: `${pendingActions} action${pendingActions === 1 ? "" : "s"} pending approval.`,
      tone: "accent",
    };
  }
  if (openCommit > 0 || recent > 0) {
    return {
      status: "on_track",
      label: "On track",
      reason: openCommit > 0
        ? `${openCommit} open commitment${openCommit === 1 ? "" : "s"} · ${recent} receipt${recent === 1 ? "" : "s"} this week.`
        : `${recent} receipt${recent === 1 ? "" : "s"} this week.`,
      tone: "primary",
    };
  }
  return {
    status: "calm",
    label: "Calm",
    reason: "No open items, no recent activity.",
    tone: "muted",
  };
}

/** "Why am I seeing this?" — plain-English bullets derived from the rollup. */
export function whyAmISeeingThis(rollup: EntityRollup | null): string[] {
  const c = rollup?.counts;
  if (!c) return ["Pinned project · Vanta keeps it visible even when quiet."];
  const out: string[] = [];
  if ((c.audit_7d ?? 0) > 0) out.push(`${c.audit_7d} receipt${c.audit_7d === 1 ? "" : "s"} in the last 7 days.`);
  if ((c.commitments_open ?? 0) > 0) out.push(`${c.commitments_open} commitment${c.commitments_open === 1 ? "" : "s"} still open.`);
  if ((c.commitments_overdue ?? 0) > 0) out.push(`${c.commitments_overdue} overdue.`);
  if ((c.actions_pending ?? 0) > 0) out.push(`${c.actions_pending} action${c.actions_pending === 1 ? "" : "s"} waiting for approval.`);
  if ((c.actions_high_risk ?? 0) > 0) out.push(`${c.actions_high_risk} high-risk action${c.actions_high_risk === 1 ? "" : "s"} flagged.`);
  if ((c.sherlock_pending ?? 0) > 0) out.push(`${c.sherlock_pending} Sherlock finding${c.sherlock_pending === 1 ? "" : "s"} pending.`);
  if ((c.files ?? 0) > 0) out.push(`${c.files} file${c.files === 1 ? "" : "s"} attached.`);
  if (out.length === 0) out.push("Pinned project · kept visible even when quiet.");
  return out;
}

export function healthClasses(tone: ProjectHealth["tone"]): string {
  switch (tone) {
    case "warn":    return "border-warn/40 bg-warn/10 text-warn";
    case "accent":  return "border-accent/40 bg-accent/10 text-foreground";
    case "primary": return "border-primary/40 bg-primary/10 text-primary";
    case "muted":
    default:        return "border-border/50 bg-muted/20 text-muted-foreground";
  }
}

/** Urgency rank for Command Center sorting. Lower = more urgent. */
export function urgencyRank(h: ProjectHealth): number {
  switch (h.status) {
    case "needs_attention": return 0;
    case "review_required": return 1;
    case "waiting":         return 2;
    case "blocked":         return 3;
    case "on_track":        return 4;
    case "calm":
    default:                return 5;
  }
}
