// In-project "+ Add to project" composer (slice 2b).
// Reuses SeedItemsPicker so the search/suggest/attach surface stays identical
// to the New Project flow. Excludes already-attached items so they don't
// reappear as suggestions.
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { attachToProject, type Project, type ProjectItem } from "@/lib/projects";
import { SeedItemsPicker } from "@/components/projects/SeedItemsPicker";
import type { SuggestedItem } from "@/lib/projectSuggestions";

interface Props {
  project: Project;
  attached: ProjectItem[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Called once attachments are saved so the parent can refresh. */
  onAttached: () => void;
}

export function AddToProjectComposer({
  project, attached, open, onOpenChange, onAttached,
}: Props) {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Map<string, SuggestedItem>>(new Map());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(new Map());
    }
  }, [open]);

  // Combine the project's own title with the user's typed query so suggestions
  // stay relevant even before they type anything.
  const searchSeed = useMemo(() => {
    const base = project.title;
    return query.trim() ? `${query} ${base}` : base;
  }, [query, project.title]);

  const excludeKeys = useMemo(
    () => new Set(attached.map((a) => `${a.item_type}:${a.item_id}`)),
    [attached],
  );

  function toggle(item: SuggestedItem) {
    const key = `${item.type}:${item.id}`;
    setSelected((cur) => {
      const next = new Map(cur);
      if (next.has(key)) next.delete(key);
      else next.set(key, item);
      return next;
    });
  }

  async function handleAttach() {
    if (!user || selected.size === 0) return;
    setSaving(true);
    try {
      await attachToProject({
        projectId: project.id,
        userId: user.id,
        items: Array.from(selected.values()).map((s) => ({ type: s.type, id: s.id })),
      });
      toast.success(`Attached ${selected.size} item${selected.size === 1 ? "" : "s"}`);
      setSelected(new Map());
      onAttached();
      onOpenChange(false);
    } catch (err) {
      console.error("[add-to-project] attach failed", err);
      toast.error("Couldn't attach");
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;
  const count = selected.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add to {project.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search captures, notes, files, commitments, actions…"
              className="pl-8"
              autoFocus
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium">Pick items to attach</span>
              {count > 0 && (
                <Badge variant="outline" className="text-[10px]">{count} selected</Badge>
              )}
            </div>
            <SeedItemsPicker
              userId={user.id}
              organizationId={project.organization_id}
              title={searchSeed}
              selected={new Set(selected.keys())}
              onToggle={toggle}
              excludeKeys={excludeKeys}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleAttach} disabled={saving || count === 0}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : count > 0 ? (
              `Attach ${count}`
            ) : (
              "Attach"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
