// DeskStartHere — "Start from here" on a desk card. Opens the orientation
// walkthrough at the slide that explains this desk's tier. Reading only: it
// never navigates the desk and never runs anything.
import { GraduationCap } from "lucide-react";
import { useTutorial } from "@/components/tutorial/TutorialProvider";
import { slideForDesk } from "@/components/tutorial/tutorialCopy";
import { DESK_ROLES, type DeskKey } from "@/lib/deskRoles";
import { cn } from "@/lib/utils";
import { MOTION_FOCUS } from "@/lib/motion";

export function DeskStartHere({ deskKey, className }: { deskKey: DeskKey; className?: string }) {
  const { startTutorialAt } = useTutorial();
  const role = DESK_ROLES[deskKey];

  return (
    <button
      type="button"
      aria-label={`Start the orientation walkthrough at the slide explaining ${role.label}`}
      title={`Start from here — how ${role.label} fits in`}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        startTutorialAt(slideForDesk(deskKey));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") e.stopPropagation();
      }}
      className={cn(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[2px]",
        "text-muted-foreground hover:text-foreground md:h-7 md:w-7",
        MOTION_FOCUS,
        className,
      )}
    >
      <GraduationCap className="h-4 w-4 md:h-3.5 md:w-3.5" aria-hidden="true" />
    </button>
  );
}
