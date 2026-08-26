// ProjectReentryCard — one project's re-entry point after a gap.
//
// Says where things stand, what changed, what was decided, and what's still
// open — all from recorded activity. It never runs anything.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MOTION_HOVER_LIFT, MOTION_PRESS } from "@/lib/motion";
import { MoreHorizontal, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  REASON_LABEL,
  STATE_LABEL,
  catchUpSummary,
  lastActiveLabel,
  type ContinuityCandidate,
} from "@/lib/continuity";

export function ProjectReentryCard({
  candidate: c,
  changes = [],
  onResume,
  onAsk,
  onOpen,
  onPin,
  onDismiss,
  onFinish,
}: {
  candidate: ContinuityCandidate;
  changes?: string[];
  onResume: () => void;
  /** Optional hand-off to Vanta for a deeper read. Never the primary path. */
  onAsk?: () => void;
  onOpen?: () => void;
  onPin?: (next: boolean) => void;
  onDismiss?: () => void;
  onFinish?: () => void;
}) {
  const where = continuityName(c);
  const [briefOpen, setBriefOpen] = useState(false);
  const brief = catchUpSummary(c, changes);


  return (
    <div className={`vanta-inset vanta-grain p-3 ${MOTION_HOVER_LIFT}`}>

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-foreground">{where}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/80">{STATE_LABEL[c.state]}</span>
            {c.reason ? <span aria-hidden>·</span> : null}
            {c.reason ? <span>{REASON_LABEL[c.reason]}</span> : null}
            <span aria-hidden>·</span>
            <span>
              last activity {lastActiveLabel(c.lastActivityAt)}
              {c.anchorConfidence === "inferred" ? " (from records, not a visit)" : ""}
            </span>
          </div>
          <p className="mt-1.5 text-[11.5px] leading-snug text-foreground/80">{c.summary}</p>

          {changes.length > 0 ? (
            <p className="mt-1 text-[11px] text-muted-foreground">Since your last snapshot — {changes.join("; ")}.</p>
          ) : null}
          {c.decisions[0] ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Last decision: {c.decisions[0].label}
              {c.decisions[0].rationale ? ` — ${c.decisions[0].rationale}` : ""}
            </p>
          ) : null}
        </div>
        {onPin || onDismiss || onFinish ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" aria-label="Row options">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onPin ? (
                <DropdownMenuItem onClick={() => onPin(!c.pinned)}>
                  {c.pinned ? "Unpin" : "Keep this in view"}
                </DropdownMenuItem>
              ) : null}
              {onDismiss ? <DropdownMenuItem onClick={onDismiss}>Not the blocker — hide it</DropdownMenuItem> : null}
              {onFinish ? <DropdownMenuItem onClick={onFinish}>I already finished this</DropdownMenuItem> : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      {c.unresolved.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {c.unresolved.map((t) => (
            <li key={`${t.kind}-${t.sourceId ?? t.label}`} className="flex items-center gap-1.5 text-[11.5px] text-foreground/80">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.overdue ? "bg-destructive/70" : "bg-warn/70"}`} />
              <span className="min-w-0 flex-1 truncate">{t.label}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {c.related.length > 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">Worth knowing: {c.related.map((r) => r.label).join("; ")}.</p>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button size="sm" variant="secondary" className={`min-h-[44px] gap-1 text-xs ${MOTION_PRESS}`} onClick={onResume}>
          Resume <ArrowRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className={`min-h-[44px] gap-1 text-xs ${MOTION_PRESS}`}
          onClick={() => setBriefOpen((v) => !v)}
          aria-expanded={briefOpen}
        >
          {briefOpen ? "Hide the catch-up" : "Bring me up to speed"}
          {briefOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </Button>
        {onOpen ? (
          <Button size="sm" variant="ghost" className={`min-h-[44px] text-xs ${MOTION_PRESS}`} onClick={onOpen}>
            Open project
          </Button>
        ) : null}
      </div>

      {briefOpen ? (
        <div className="mt-2 rounded-md border border-border/50 bg-background/40 p-2.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Catch-up</p>
          <p className="mt-0.5 text-[11.5px] font-medium text-foreground/90">{brief.headline}</p>
          <ul className="mt-1.5 space-y-1">
            {brief.lines.map((l, i) => (
              <li key={i} className="text-[11.5px] leading-snug text-foreground/80">
                {l}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10.5px] italic text-muted-foreground/80">
            Read straight from your recorded activity — nothing here runs anything.
          </p>
          {onAsk ? (
            <Button
              size="sm"
              variant="ghost"
              className={`mt-1 min-h-[40px] px-0 text-[11px] ${MOTION_PRESS}`}
              onClick={onAsk}
            >
              Ask Vanta to go deeper
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>

  );
}
