// ResumeWorkSection — "Continue where you left off" plus long-gap re-entry.
//
// Derived from records that already exist in the active scope. Fresh work shows
// first; dormant-but-unresolved work appears only when it earns a reason. It
// never guesses, and it never runs anything.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { History } from "lucide-react";
import { useContinuity } from "@/hooks/useContinuity";
import { clarificationPrompt, type ContinuityCandidate } from "@/lib/continuity";
import { ProjectReentryCard } from "@/components/continuity/ProjectReentryCard";
import { useAskContext } from "@/hooks/useAskContext";
import { SectionNote } from "@/components/ui/section-note";
import { sectionNote } from "@/lib/roomCopy";

import type { SurfaceKey } from "@/components/shell/SurfaceTabs";

export function ResumeWorkSection({ onNavigate }: { onNavigate: (k: SurfaceKey) => void }) {
  const { loading, live, dormant, changes, pin, dismiss, markFinished } = useContinuity();
  const { openAskWithContext } = useAskContext();
  const [expanded, setExpanded] = useState(false);

  if (loading || (live.length === 0 && dormant.length === 0)) return null;

  const shown = expanded ? live.slice(0, 5) : live.slice(0, 2);
  const ask = clarificationPrompt(live);

  const render = (c: ContinuityCandidate) => (
    <ProjectReentryCard
      key={c.key}
      candidate={c}
      changes={changes[c.key] ?? []}
      onResume={() => onNavigate(c.projectId ? "projects" : "actions")}
      onAsk={() =>
        void openAskWithContext({
          kind: "project",
          id: c.projectId ?? null,
          label: c.projectTitle ?? "Work outside a project",
          question: `Bring me back up to speed on ${c.projectTitle ?? "the work outside a project"} — what changed, what was decided, what's still open?`,
        })
      }
      onOpen={c.projectId ? () => onNavigate("projects") : undefined}
      onPin={c.projectId ? (next) => void pin(c.projectId!, next) : undefined}
      onDismiss={c.projectId ? () => void dismiss(c.projectId!) : undefined}
      onFinish={c.projectId ? () => void markFinished(c.projectId!) : undefined}
    />
  );

  return (
    <section className="vanta-card p-4">
      <div className="flex items-start gap-2">
        <History className="mt-0.5 h-4 w-4 text-primary" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">Continue where you left off</h2>
          {/* One line, and it gets out of the way once the section is familiar.
              A real clarification question always outranks the description. */}
          {ask ? (
            <p className="mt-0.5 text-[12px] text-muted-foreground">{ask}</p>
          ) : (
            <SectionNote className="mt-0.5" sectionKey="today.resume">
              {sectionNote("today.resume")}
            </SectionNote>
          )}
        </div>


        {live.length > 2 ? (
          <div className="ml-auto shrink-0">
            <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Less" : "More"}
            </Button>
          </div>
        ) : null}
      </div>

      {shown.length > 0 ? <div className="mt-3 space-y-1.5">{shown.map(render)}</div> : null}

      {dormant.length > 0 ? (
        <div className="mt-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Quiet for a while, still open
          </p>
          <div className="mt-2 space-y-1.5">{dormant.slice(0, 3).map(render)}</div>
        </div>
      ) : null}
    </section>
  );
}
