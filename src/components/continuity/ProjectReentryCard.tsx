// ProjectReentryCard — one project's re-entry point after a gap.
//
// Says where things stand, what changed, what was decided, and what's still
// open — all from recorded activity. It never runs anything.
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, ArrowRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { REASON_LABEL, STATE_LABEL, lastActiveLabel, type ContinuityCandidate } from "@/lib/continuity";

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
  onAsk: () => void;
  onOpen?: () => void;
  onPin?: (next: boolean) => void;
  onDismiss?: () => void;
  onFinish?: () => void;
}) {
  const where = c.projectTitle ?? "Work outside a project";

  return (
    <div className="rounded-lg border border-border/50 bg-surface-elevated p-3">
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
        <Button size="sm" variant="secondary" className="min-h-[44px] gap-1 text-xs" onClick={onResume}>
          Resume <ArrowRight className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="min-h-[44px] text-xs" onClick={onAsk}>
          Bring me up to speed
        </Button>
        {onOpen ? (
          <Button size="sm" variant="ghost" className="min-h-[44px] text-xs" onClick={onOpen}>
            Open project
          </Button>
        ) : null}
      </div>
    </div>
  );
}
