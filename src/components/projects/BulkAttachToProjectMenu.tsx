// Push many items into one project in a single call. Shares the picker with
// AttachToProjectMenu via ProjectPickerPopover; only the write differs.
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useActiveOrgId } from "@/providers/WorkspaceProvider";
import {
  attachToProject,
  createProject,
  type Project,
  type ProjectItemType,
} from "@/lib/projects";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FolderPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { ProjectPickerBody } from "@/components/projects/ProjectPickerPopover";

export interface BulkAttachItem {
  type: ProjectItemType;
  id: string;
}

interface Props {
  items: BulkAttachItem[];
  disabled?: boolean;
  className?: string;
  label?: string;
  onAttached?: (project: Project, count: number) => void;
}

export function BulkAttachToProjectMenu({
  items,
  disabled,
  className,
  label,
  onAttached,
}: Props) {
  const { user } = useAuth();
  const orgId = useActiveOrgId();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function doBulkAttach(projectId: string, projectTitle: string) {
    if (!user || items.length === 0) return;
    await attachToProject({
      projectId,
      userId: user.id,
      items: items.map((it) => ({ type: it.type, id: it.id })),
    });
    // Single rolled-up audit event so receipts stay readable.
    await supabase.from("audit_log").insert({
      user_id: user.id,
      entity_type: "project",
      entity_id: projectId,
      event: "inbox.bulk_attached",
      payload: {
        project_id: projectId,
        count: items.length,
        items: items.map((it) => ({ type: it.type, id: it.id })),
      } as never,
    });
    toast.success(`${items.length} pushed to “${projectTitle}”`);
  }

  async function pickExisting(p: Project) {
    setBusyId(p.id);
    try {
      await doBulkAttach(p.id, p.title);
      onAttached?.(p, items.length);
      setOpen(false);
    } catch (err) {
      console.error("[bulk-attach] failed", err);
      toast.error("Couldn't attach");
    } finally {
      setBusyId(null);
    }
  }

  async function createAndAttach(title: string) {
    if (!user) return;
    setCreating(true);
    try {
      const p = await createProject({
        title,
        scope: { userId: user.id, organizationId: orgId },
      });
      await doBulkAttach(p.id, p.title);
      onAttached?.(p, items.length);
      setOpen(false);
    } catch (err) {
      console.error("[bulk-attach] create failed", err);
      toast.error("Couldn't create");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          className={cn("h-9 gap-1 text-[11.5px]", className)}
          disabled={disabled || items.length === 0}
        >
          <FolderPlus className="h-3.5 w-3.5" />
          {label ?? `Push to project${items.length ? ` (${items.length})` : ""}`}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        {open && (
          <ProjectPickerBody
            heading={`Push ${items.length} item${items.length === 1 ? "" : "s"} to…`}
            onPick={pickExisting}
            onCreate={createAndAttach}
            busyId={busyId}
            creating={creating}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
