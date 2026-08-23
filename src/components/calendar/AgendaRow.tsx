// AgendaRow — one calendar entry, read-only, with the one thing the user can
// actually do to it: file it under a project.
//
// Doctrine: this is a sense, not a task. There is no complete, no reschedule, no
// reply. Filing is structural only and never touches the calendar itself.
import { useState } from "react";
import { FolderPlus, MapPin } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProjectPickerBody } from "@/components/projects/ProjectPickerPopover";
import { createProject, type Project } from "@/lib/projects";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { MachineText } from "@/components/ui/instrument";
import { LEAD_BAR, MOTION_FOCUS, MOTION_ROW } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { AskAboutButton } from "@/components/ask/AskAboutButton";
import type { AgendaEvent } from "@/hooks/useAgenda";

export function eventTimeLabel(e: AgendaEvent): string {
  if (e.all_day) return "all day";
  const start = new Date(e.starts_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (!e.ends_at) return start;
  const end = new Date(e.ends_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${start}–${end}`;
}

export function AgendaRow({
  event,
  onSetProject,
  showFiling = true,
}: {
  event: AgendaEvent;
  onSetProject?: (event: AgendaEvent, project: Project | null) => Promise<void>;
  /** Today shows a calm read; Work lets you file. */
  showFiling?: boolean;
}) {
  const { user } = useAuth();
  const { orgId } = useScope();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const pick = async (p: Project | null) => {
    if (!onSetProject) return;
    setBusyId(p?.id ?? "clear");
    try {
      await onSetProject(event, p);
      toast.success(p ? `Filed under “${p.title}”.` : "No longer filed under a project.");
      setOpen(false);
    } catch {
      toast.error("Could not file that entry.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className={cn(
        "flex min-h-[44px] items-start gap-2 vanta-inset px-3 py-2",
        MOTION_ROW,
        LEAD_BAR,
        event.all_day ? "text-border" : "text-primary/50",
      )}
    >
      <MachineText className="mt-0.5 w-[92px] shrink-0 text-[10px] text-muted-foreground">
        {eventTimeLabel(event)}
      </MachineText>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-foreground/90">{event.title?.trim() || "Untitled entry"}</div>
        <div className="mt-0.5 flex items-center gap-1.5 truncate text-[10px] text-muted-foreground">
          <MachineText>{event.feedLabel}</MachineText>
          {event.location ? (
            <>
              <span aria-hidden>·</span>
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{event.location}</span>
            </>
          ) : null}
          {event.projectTitle ? (
            <>
              <span aria-hidden>·</span>
              <span className="truncate text-primary/80">{event.projectTitle}</span>
            </>
          ) : null}
        </div>
      </div>

      <AskAboutButton
        kind="calendar"
        id={event.id}
        label={event.title?.trim() || "Calendar entry"}
        question={`What should I know about “${event.title?.trim() || "this entry"}”?`}
        size="icon"
        className={MOTION_FOCUS}
      />

      {showFiling && onSetProject ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              aria-label={`File ${event.title ?? "this entry"} under a project`}
              className={cn(
                "shrink-0 rounded-[2px] px-1.5 py-1 text-[10px] text-muted-foreground hover:text-primary",
                MOTION_FOCUS,
              )}
            >
              {event.projectTitle ? "Refile" : <FolderPlus className="h-3.5 w-3.5" />}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-0">
            <ProjectPickerBody
              heading="File this entry under"
              busyId={busyId}
              creating={creating}
              onPick={(p) => pick(p)}
              onCreate={async (title) => {
                if (!user) return;
                setCreating(true);
                try {
                  const p = await createProject({
                    title,
                    scope: { userId: user.id, organizationId: orgId ?? null },
                  });
                  await pick(p);
                } catch {
                  toast.error("Could not start that project.");
                } finally {
                  setCreating(false);
                }
              }}
            />
            {event.project_id ? (
              <div className="border-t border-border/50 p-2">
                <button
                  onClick={() => void pick(null)}
                  className={cn("w-full rounded-[2px] px-2 py-1.5 text-left text-[11px] text-muted-foreground hover:text-destructive", MOTION_FOCUS)}
                >
                  Remove from project
                </button>
              </div>
            ) : null}
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
