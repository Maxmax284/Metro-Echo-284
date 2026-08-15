// Attach one item to a project. The picker itself lives in
// ProjectPickerPopover so this file only owns the trigger + what attaching means.
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useActiveOrgId } from "@/providers/WorkspaceProvider";
import {
  attachToProject,
  createProject,
  type Project,
  type ProjectItemType,
} from "@/lib/projects";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, FolderPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { useActivity } from "@/components/workstatus/ActivityStore";
import { stepsInboxAttach, humanizeWorkError } from "@/lib/workStatus";
import { ProjectPickerBody } from "@/components/projects/ProjectPickerPopover";

interface AttachToProjectMenuProps {
  itemType: ProjectItemType;
  itemId: string;
  itemLabel?: string;
  /** Compact icon-only trigger (for tight rows) */
  variant?: "chip" | "icon";
  className?: string;
  onAttached?: (project: Project) => void;
}

export function AttachToProjectMenu({
  itemType,
  itemId,
  itemLabel,
  variant = "chip",
  className,
  onAttached,
}: AttachToProjectMenuProps) {
  const { user } = useAuth();
  const orgId = useActiveOrgId();
  const activity = useActivity();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [justAttached, setJustAttached] = useState(false);

  const flashAttached = () => {
    setJustAttached(true);
    setTimeout(() => setJustAttached(false), 1600);
  };

  async function doAttach(p: Project) {
    if (!user) return;
    setBusyId(p.id);
    const handle = activity.start({
      kind: "attach",
      title: itemLabel ? `Attaching “${itemLabel}”` : "Attaching note",
      projectName: p.title,
      steps: stepsInboxAttach(p.title),
    });
    try {
      handle.advance(1);
      await attachToProject({
        projectId: p.id,
        userId: user.id,
        items: [{ type: itemType, id: itemId }],
      });
      handle.advance(2);
      handle.complete({ destination: `Attached to ${p.title}.` });
      toast.success(`Attached to “${p.title}”`);
      flashAttached();
      onAttached?.(p);
      setOpen(false);
    } catch (err) {
      console.error("[attach] failed", err);
      handle.fail({ message: humanizeWorkError("attach") });
      toast.error("Couldn't attach");
    } finally {
      setBusyId(null);
    }
  }

  async function doCreateAndAttach(titleGuess: string) {
    if (!user) return;
    setCreating(true);
    const handle = activity.start({
      kind: "attach",
      title: `Creating “${titleGuess}” and attaching`,
      projectName: titleGuess,
      steps: ["Creating the project", ...stepsInboxAttach(titleGuess)],
    });
    try {
      const p = await createProject({
        title: titleGuess,
        summary: itemLabel ?? "",
        scope: { userId: user.id, organizationId: orgId },
      });
      handle.advance(1);
      await attachToProject({
        projectId: p.id,
        userId: user.id,
        items: [{ type: itemType, id: itemId }],
      });
      handle.advance(3);
      handle.complete({ destination: `Attached to ${p.title}.` });
      toast.success(`Created “${p.title}” and attached`);
      flashAttached();
      onAttached?.(p);
      setOpen(false);
    } catch (err) {
      console.error("[attach] create failed", err);
      handle.fail({ message: humanizeWorkError("attach") });
      toast.error("Couldn't create");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === "icon" ? (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-7 w-7 text-muted-foreground hover:text-foreground",
              justAttached && "text-primary",
              className,
            )}
            title="Attach to project"
            aria-label="Attach to project"
          >
            {justAttached ? (
              <Check key="ok" className="h-4 w-4 motion-confirm" />
            ) : (
              <FolderPlus className="h-4 w-4" />
            )}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 shrink-0 snap-start whitespace-nowrap gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground",
              justAttached && "text-primary",
              className
            )}
          >
            {justAttached ? (
              <>
                <Check key="ok" className="h-3.5 w-3.5 motion-confirm" /> Attached
              </>
            ) : (
              <>
                <FolderPlus className="h-3.5 w-3.5" /> Attach
              </>
            )}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        {open && (
          <ProjectPickerBody
            heading="Attach to project"
            onPick={doAttach}
            onCreate={doCreateAndAttach}
            busyId={busyId}
            creating={creating}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
