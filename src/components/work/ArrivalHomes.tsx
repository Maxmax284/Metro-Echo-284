// ArrivalHomes — each unsorted arrival with where it probably goes.
//
// Suggest only. "File it" attaches and leaves a receipt, with a real undo.
// "Leave it" records the dismissal so that project stops asking. When the
// matcher isn't sure, the row says so and hands you the full picker.
import { useState } from "react";
import { FolderInput, Undo2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { attachToProject } from "@/lib/projects";
import { dismissSuggestion } from "@/lib/projectSuggestions";
import { vantaToast } from "@/lib/vantaVoice";
import { cn } from "@/lib/utils";
import { MOTION_FOCUS, MOTION_ROW } from "@/lib/motion";
import type { BriefingItem } from "@/lib/workBriefing";
import { SolariBoard } from "@/components/schedule/SolariBoard";

type Filed = { projectId: string; title: string };

export function ArrivalHomes({
  items,
  onOpenInbox,
  onChanged,
}: {
  items: BriefingItem[];
  onOpenInbox: () => void;
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const [filed, setFiled] = useState<Record<string, Filed>>({});
  const [left, setLeft] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  if (!user || items.length === 0) return null;

  const receipt = (event: string, it: BriefingItem, projectId: string) =>
    supabase.from("audit_log").insert({
      user_id: user.id,
      entity_type: "project_item",
      entity_id: it.id,
      event,
      payload: { project_id: projectId, item_type: it.itemType, item_id: it.id, via: "work_arrivals" },
    });

  const fileIt = async (it: BriefingItem) => {
    if (!it.suggestion || !it.itemType) return;
    setBusy(it.id);
    try {
      await attachToProject({
        projectId: it.suggestion.projectId,
        userId: user.id,
        items: [{ type: it.itemType, id: it.id }],
      });
      await receipt("project_items.inserted", it, it.suggestion.projectId);
      setFiled((f) => ({ ...f, [it.id]: it.suggestion! }));
    } catch (e) {
      vantaToast.fromError(e);
    } finally {
      setBusy(null);
    }
  };

  const undo = async (it: BriefingItem) => {
    const f = filed[it.id];
    if (!f || !it.itemType) return;
    setBusy(it.id);
    try {
      const { error } = await supabase
        .from("project_items")
        .delete()
        .eq("project_id", f.projectId)
        .eq("item_type", it.itemType)
        .eq("item_id", it.id);
      if (error) throw error;
      await receipt("project_items.removed", it, f.projectId);
      setFiled((x) => {
        const n = { ...x };
        delete n[it.id];
        return n;
      });
    } catch (e) {
      vantaToast.fromError(e);
    } finally {
      setBusy(null);
    }
  };

  const leaveIt = async (it: BriefingItem) => {
    if (!it.suggestion || !it.itemType) return;
    setBusy(it.id);
    try {
      await dismissSuggestion({ projectId: it.suggestion.projectId, userId: user.id, type: it.itemType, id: it.id });
      setLeft((s) => new Set(s).add(it.id));
      onChanged?.();
    } catch (e) {
      vantaToast.fromError(e);
    } finally {
      setBusy(null);
    }
  };

  const btn = cn(
    "inline-flex min-h-[40px] items-center gap-1 rounded-[2px] px-2.5 text-[11.5px] font-medium touch-manipulation",
    MOTION_FOCUS,
  );

  return (
    <div className="mt-3 space-y-1.5" aria-label="Arrived, with where it probably goes">
      <SolariBoard
        text={(() => { const n = items.filter((it) => !left.has(it.id)).length; return n === 1 ? "JUST IN" : `${n} LANDED`; })()}
        tone="primary"
      />
      {items
        .filter((it) => !left.has(it.id))
        .map((it) => {
          const f = filed[it.id];
          return (
            <div key={it.id} className={cn("vanta-inset px-3 py-2", MOTION_ROW)}>
              <p className="truncate text-xs font-medium text-foreground">{it.label}</p>
              {f ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-[11.5px] text-muted-foreground">Filed under {f.title}. Receipt kept.</span>
                  <button type="button" disabled={busy === it.id} onClick={() => void undo(it)} className={cn(btn, "text-primary")}>
                    <Undo2 className="h-3 w-3" /> Undo
                  </button>
                </div>
              ) : it.suggestion ? (
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="w-full text-[11.5px] text-muted-foreground">
                    Looks like it goes in <span className="font-medium text-foreground">{it.suggestion.title}</span>.
                  </span>
                  <button type="button" disabled={busy === it.id} onClick={() => void fileIt(it)} className={cn(btn, "bg-primary/15 text-primary")}>
                    <FolderInput className="h-3 w-3" /> File it
                  </button>
                  <button type="button" onClick={onOpenInbox} className={cn(btn, "text-foreground/80")}>
                    Somewhere else
                  </button>
                  <button type="button" disabled={busy === it.id} onClick={() => void leaveIt(it)} className={cn(btn, "text-muted-foreground")}>
                    <X className="h-3 w-3" /> Leave it
                  </button>
                </div>
              ) : (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-[11.5px] text-muted-foreground">Not sure where this goes.</span>
                  <button type="button" onClick={onOpenInbox} className={cn(btn, "text-primary")}>
                    Pick a project
                  </button>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
