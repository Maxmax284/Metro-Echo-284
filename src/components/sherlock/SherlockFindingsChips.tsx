// Phase 2 — Sherlock Background Guidance.
// Ambient chip strip that reads pending Sherlock findings tied to a source
// object and renders them as plain-English chips with an inline "Why?"
// receipt. Nothing executes; tap either opens the Sherlock overlay (when a
// scope is supplied) or expands the rationale in place.
import { useState } from "react";
import { useSherlockFindings } from "@/hooks/useSherlockFindings";
import { useSherlock, type SherlockScope } from "@/components/sherlock/SherlockContext";
import { SherlockSuggestionChip } from "@/components/sherlock/SherlockSuggestionChip";
import { sherlockTitle, sherlockWhyFallback } from "@/lib/plainEnglish";
import type { SherlockFinding, SherlockSourceType } from "@/lib/sherlock/types";
import { cn } from "@/lib/utils";

interface Props {
  sourceObjectType: SherlockSourceType | string;
  sourceObjectId: string;
  /** When provided, tapping a chip opens the SherlockOverlay with this scope. */
  scope?: SherlockScope;
  /** Hide low-confidence chips (default: true). */
  hideLowConfidence?: boolean;
  /** Cap visible chips before "+N more". */
  max?: number;
  className?: string;
}

export function SherlockFindingsChips({
  sourceObjectType,
  sourceObjectId,
  scope,
  hideLowConfidence = true,
  max = 3,
  className,
}: Props) {
  const { findings, loading } = useSherlockFindings(sourceObjectType, sourceObjectId);
  const { openSherlock } = useSherlock();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading || !findings.length) return null;

  const filtered = findings.filter(
    (f) => (hideLowConfidence ? f.confidence !== "low" : true) && !f.sensitive_flag,
  );
  if (!filtered.length) return null;

  const visible = filtered.slice(0, max);
  const overflow = filtered.length - visible.length;

  const openOrExpand = (f: SherlockFinding) => {
    if (scope) {
      openSherlock(scope, {
        summary: f.summary,
        rationale: f.rationale ?? undefined,
        suggested_route: f.suggested_action ?? undefined,
        confidence: f.confidence,
      });
      return;
    }
    setExpanded((cur) => (cur === f.id ? null : f.id));
  };

  const labelFor = (f: SherlockFinding) =>
    (f.summary && f.summary.length ? f.summary : sherlockTitle(f)).slice(0, 80);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex flex-wrap items-center gap-1">
        {visible.map((f) => (
          <SherlockSuggestionChip
            key={f.id}
            operation={(f.mode as any) ?? "observe"}
            label={labelFor(f)}
            confidence={f.confidence}
            onOpen={() => openOrExpand(f)}
            title="Tap for why — nothing applies yet."
          />
        ))}
        {overflow > 0 && (
          <span className="text-[10px] text-muted-foreground">+{overflow} more</span>
        )}
      </div>
      {expanded && (() => {
        const f = filtered.find((x) => x.id === expanded);
        if (!f) return null;
        return (
          <div className="rounded-md border border-border/50 bg-surface-elevated/60 px-2 py-1.5 text-[11.5px] text-muted-foreground">
            <span className="font-medium text-foreground/80">Why: </span>
            {f.rationale?.trim() || sherlockWhyFallback(f)}
          </div>
        );
      })()}
    </div>
  );
}
