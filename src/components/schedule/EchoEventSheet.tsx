// EchoEventSheet — writing one entry Echo owns.
//
// Doctrine:
//   - Only Echo's own entries reach this sheet. A feed row is sense and stays
//     read-only, so it never opens here.
//   - The Google mirror is a stated outcome, never an assumption: the reply says
//     whether Google took the copy.
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { createEchoEvent, deleteEchoEvent, updateEchoEvent } from "@/lib/echoCalendar";
import { useScope } from "@/hooks/useScope";
import type { AgendaEvent } from "@/hooks/useAgenda";
import type { Project } from "@/lib/projects";

/** A datetime-local value for the browser field, from an instant. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EchoEventSheet({
  open,
  onOpenChange,
  event,
  defaultStart,
  projects = [],
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** An Echo row to edit, or null to write a new one. */
  event?: AgendaEvent | null;
  /** The day a new entry should land on, when opened from a planned day. */
  defaultStart?: Date | null;
  /** Projects in the room the person is standing in. Filing is optional. */
  projects?: Project[];
  onSaved: () => void;
}) {
  const { orgId } = useScope();
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(event?.title ?? "");
    /* A new entry opened on a chosen day starts at 9am on that day, not now. */
    const fresh = defaultStart
      ? new Date(
          defaultStart.getFullYear(),
          defaultStart.getMonth(),
          defaultStart.getDate(),
          9,
          0,
          0,
          0,
        ).toISOString()
      : new Date(Date.now() + 3_600_000).toISOString();
    setStart(toLocalInput(event?.starts_at ?? fresh));
    setEnd(toLocalInput(event?.ends_at ?? null));
    setAllDay(event?.all_day ?? false);
    setLocation(event?.location ?? "");
    setDescription(event?.description ?? "");
    setProjectId(event?.project_id ?? "");
  }, [open, event, defaultStart]);


  const save = async () => {
    if (!title.trim()) {
      toast.error("An entry needs a name.");
      return;
    }
    const startsAt = start ? new Date(start) : null;
    if (!startsAt || !Number.isFinite(startsAt.getTime())) {
      toast.error("That start time is not a real time.");
      return;
    }
    setBusy(true);
    try {
      const draft = {
        title: title.trim(),
        starts_at: startsAt.toISOString(),
        ends_at: end ? new Date(end).toISOString() : null,
        all_day: allDay,
        location: location.trim() || null,
        description: description.trim() || null,
        /* Filing is the person's own structure: it travels to Schedule and to
           anything Echo says about the entry later. */
        project_id: projectId || null,
        organization_id: orgId ?? null,
      };
      const res = event ? await updateEchoEvent(event.id, draft) : await createEchoEvent(draft);
      if (res.mirror === "error") toast.error(res.reply);
      else toast.success(res.reply);
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That entry could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!event) return;
    setBusy(true);
    try {
      const res = await deleteEchoEvent(event.id);
      if (res.mirror === "error") toast.error(res.reply);
      else toast.success(res.reply);
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That entry could not be deleted.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-sm">{event ? "Edit this entry" : "New entry"}</SheetTitle>
        </SheetHeader>
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[11px]" htmlFor="echo-event-title">What is it</Label>
            <Input
              id="echo-event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ADHD appointment"
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <Label className="text-[11.5px]" htmlFor="echo-event-allday">All day</Label>
            <Switch id="echo-event-allday" checked={allDay} onCheckedChange={setAllDay} />
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px]" htmlFor="echo-event-start">Starts</Label>
              <Input id="echo-event-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px]" htmlFor="echo-event-end">Ends (optional)</Label>
              <Input id="echo-event-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]" htmlFor="echo-event-where">Where (optional)</Label>
            <Input id="echo-event-where" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Clinic on Main St" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]" htmlFor="echo-event-notes">Notes (optional)</Label>
            <Textarea id="echo-event-notes" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          {projects.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-[11px]" htmlFor="echo-event-project">Part of a project (optional)</Label>
              <select
                id="echo-event-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="min-h-[44px] w-full rounded-md border border-border/60 bg-background px-3 text-[12.5px]"
              >
                <option value="">Not filed</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>
          )}


          <div className="flex gap-2 pt-1">
            <Button className="min-h-[44px] flex-1" disabled={busy} onClick={() => void save()}>
              {event ? "Save changes" : "Add to my calendar"}
            </Button>
            {event ? (
              <Button variant="outline" className="min-h-[44px]" disabled={busy} onClick={() => void remove()}>
                Delete
              </Button>
            ) : null}
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Yours to change any time. When Google mirroring is on, the same entry lands in Google and a change made there
            comes back here.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
