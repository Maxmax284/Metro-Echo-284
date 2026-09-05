// ProjectEditDialog — change a project's name, its running summary, whether it
// is active, and where it happens.
//
// The place is always something you set: tap the map, or take one fix from this
// device. Echo never quietly attaches a location to a project.
import { useEffect, useState } from "react";
import { Loader2, MapPin, Crosshair, Trash2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ProjectsMap } from "@/components/projects/ProjectsMap";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { FIX_FAILURE_COPY, requestFix } from "@/lib/locationSource";
import {
  projectPlace,
  updateProject,
  setProjectPlace,
  type Project,
  type ProjectPlace,
} from "@/lib/projects";

export function ProjectEditDialog({
  project,
  onOpenChange,
  onSaved,
}: {
  project: Project | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (next: Project) => void;
}) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [active, setActive] = useState(true);
  const [pinned, setPinned] = useState(false);
  const [place, setPlace] = useState<ProjectPlace | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!project) return;
    setTitle(project.title);
    setSummary(project.summary ?? "");
    setActive(project.status === "active");
    setPinned(Boolean(project.pinned));
    setPlace(projectPlace(project));
  }, [project?.id]);

  const takeFix = async () => {
    setLocating(true);
    const res = await requestFix();
    setLocating(false);
    if (!("fix" in res)) {
      toast.error(FIX_FAILURE_COPY[res.failure]);
      return;
    }
    setPlace({ lat: res.fix.lat, lon: res.fix.lon, label: place?.label || title.trim() || "Here" });
    toast("Pin moved to where you are. Nothing is saved until you save.");
  };

  const save = async () => {
    if (!project) return;
    if (!title.trim()) {
      toast.error("Give the project a name first.");
      return;
    }
    setSaving(true);
    try {
      const next = await updateProject(project.id, {
        title: title.trim(),
        summary,
        status: active ? "active" : "paused",
        pinned,
      });
      const withPlace = await setProjectPlace(next, place);
      toast.success("Saved. Nothing else moved.");
      onSaved(withPlace);
    } catch (err) {
      console.error("[projects] save failed", err);
      toast.error("Couldn't save that. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(project)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Name</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            <p className="mt-1 text-[11px] text-muted-foreground">
              This is the name document cards will show when they attach here.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Summary</label>
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium">Still active</div>
              <p className="text-[11px] text-muted-foreground">
                Turn this off and Echo stops raising it in your day. Nothing is deleted.
              </p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} aria-label="Still active" />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium">Keep it at the top</div>
              <p className="text-[11px] text-muted-foreground">Pinned projects sit first in the list.</p>
            </div>
            <Switch checked={pinned} onCheckedChange={setPinned} aria-label="Keep it at the top" />
          </div>

          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" /> Where it happens
            </div>
            <ProjectsMap
              height={200}
              center={place ? [place.lat, place.lon] : null}
              pins={place ? [{ id: "this", lat: place.lat, lon: place.lon, label: place.label || title }] : []}
              onPick={(lat, lon) =>
                setPlace((cur) => ({ lat, lon, label: cur?.label || title.trim() || "Pinned spot" }))
              }
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Tap the map to place it, or use this device. Optional — a project without a place still works.
            </p>
            <Input
              className="mt-2"
              placeholder="Name this place — Lamai gym, the Bangkok office"
              value={place?.label ?? ""}
              disabled={!place}
              onChange={(e) => setPlace((cur) => (cur ? { ...cur, label: e.target.value } : cur))}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={takeFix} disabled={locating}>
                {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
                Use this device
              </Button>
              {place ? (
                <Button variant="ghost" size="sm" className="h-9 gap-1.5" onClick={() => setPlace(null)}>
                  <Trash2 className="h-4 w-4" /> Remove the place
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
