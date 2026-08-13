// ResumeWorkSection — "Continue where you left off".
//
// Derived from records that already exist in the active scope. It only renders
// when there is a real, fresh candidate; it never guesses, and it never runs
// anything — every row hands off to the surface that owns the work.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { History, MoreHorizontal, ArrowRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkingContext } from "@/hooks/useWorkingContext";
import { isAmbiguous, lastTouchedLabel } from "@/lib/workingContext";
import { useCompanion } from "@/components/companion/CompanionContext";
import type { SurfaceKey } from "@/components/shell/SurfaceTabs";

export function ResumeWorkSection({ onNavigate }: { onNavigate: (k: SurfaceKey) => void }) {
  const { loading, candidates, deltas, pin, dismiss, resolve } = useWorkingContext();
  const { openWithPrefill } = useCompanion();
  const [expanded, setExpanded] = useState(false);

  if (loading || candidates.length === 0) return null;

  const shown = expanded ? candidates.slice(0, 5) : candidates.slice(0, 2);
  const ambiguous = isAmbiguous(candidates);

  return (
    <section className="vanta-card p-4">
      <div className="flex items-start gap-2">
        <History className="mt-0.5 h-4 w-4 text-primary" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">Continue where you left off</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {ambiguous
              ? "Two threads look equally warm — pick the one you mean."
              : "Recent work in this space, with what's still open."}
          </p>
        </div>
        {candidates.length > 2 ? (
          <div className="ml-auto shrink-0">
            <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Less" : "More"}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="mt-3 space-y-1.5">
        {shown.map((c) => {
          const delta = c.projectId ? deltas[c.projectId] ?? [] : [];
          return (
            <div key={c.key} className="rounded-lg border border-border/50 bg-surface-elevated p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground/90">
                    {c.projectTitle ?? "Work outside a project"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    last worked on {lastTouchedLabel(c.lastActivityAt)}
                    {c.pinned ? " · pinned" : ""}
                  </p>
                  <p className="mt-1 text-[11.5px] leading-snug text-foreground/80">{c.summary}</p>
                  {delta.length > 0 ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">Since last time — {delta.join("; ")}.</p>
                  ) : null}
                </div>
                {c.projectId ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" aria-label="Row options">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => pin(c.projectId!, !c.pinned)}>
                        {c.pinned ? "Unpin" : "Pin to Resume work"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => dismiss(c.projectId!)}>Dismiss for a day</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => resolve(c.projectId!)}>Mark resolved</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onNavigate("projects")}>Fix project association</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>

              {c.unresolved.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {c.unresolved.map((u) => (
                    <li key={u} className="flex items-center gap-1.5 text-[11.5px] text-foreground/80">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn/70" />
                      <span className="min-w-0 flex-1 truncate">{u}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  className="min-h-[44px] gap-1 text-xs"
                  onClick={() => onNavigate(c.projectId ? "projects" : "actions")}
                >
                  Resume <ArrowRight className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-[44px] text-xs"
                  onClick={() =>
                    openWithPrefill(
                      `Where did I leave off on ${c.projectTitle ?? "the work outside a project"}, and what's still open?`,
                    )
                  }
                >
                  Ask Vanta
                </Button>
                {c.projectId ? (
                  <Button size="sm" variant="ghost" className="min-h-[44px] text-xs" onClick={() => onNavigate("projects")}>
                    Open project
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
