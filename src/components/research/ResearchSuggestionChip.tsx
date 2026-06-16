// ResearchSuggestionChip — Phase 3 of the Sherlock/Research/Recap roadmap.
//
// Plain-English chip that says "Want Vanta to look outside?" wherever
// outside context might help. Approval-gated: tapping the chip opens a
// short confirmation with a prefilled question. Only quick mode runs from
// here. Deep mode still lives in ResearchPanel behind the typed confirm.
//
// Surfaces using it today: Project Living Brief, Inbox notes.
// No new edge functions; reuses `research-run`.

import { useState } from "react";
import { Telescope, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";

export interface ResearchSuggestionChipProps {
  /** Prefilled question Vanta will ask outside. Editable in the confirm sheet. */
  prompt: string;
  /** Short label rendered on the chip. Defaults to "Look outside?". */
  label?: string;
  /** Optional entity link so the research row attaches to its source. */
  relatedEntityType?: string;
  relatedEntityId?: string;
  /** Optional callback fired when the run completes (success or otherwise). */
  onCompleted?: () => void;
  className?: string;
}

export function ResearchSuggestionChip({
  prompt,
  label = "Look outside?",
  relatedEntityType,
  relatedEntityId,
  onCompleted,
  className,
}: ResearchSuggestionChipProps) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState(prompt);
  const [running, setRunning] = useState(false);

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setQuestion(prompt);
    setOpen(true);
  };

  const run = async () => {
    const q = question.trim();
    if (!q || running) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("research-run", {
        body: {
          question: q,
          mode: "quick",
          ...(relatedEntityType ? { related_entity_type: relatedEntityType } : {}),
          ...(relatedEntityId ? { related_entity_id: relatedEntityId } : {}),
        },
      });
      if (error) throw error;
      if (data?.status === "blocked") {
        toast.error(vantaSay.researchBlocked(data.reason ?? "disabled"));
      } else if (data?.status === "failed") {
        toast.error(vantaSay.researchFailed(data.error ?? "unknown"));
      } else {
        toast.success(vantaSay.researchComplete(data?.sources ?? 0));
        setOpen(false);
      }
      onCompleted?.();
    } catch (e: any) {
      toast.fromError(e, vantaSay.researchFailed("unknown"));
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={
          "inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/40 px-2 py-0.5 " +
          "text-[10.5px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground " +
          (className ?? "")
        }
        aria-label="Suggest outside research"
      >
        <Telescope className="h-3 w-3 text-primary/80" />
        {label}
      </button>

      <Dialog open={open} onOpenChange={(o) => { if (!running) setOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Look outside?</DialogTitle>
            <DialogDescription>
              Vanta will run a quick web search and save the sources and a plain-English summary.
              Nothing is sent or published.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={4}
            className="text-sm"
            disabled={running}
            aria-label="Research question"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={running}>
              Cancel
            </Button>
            <Button onClick={run} disabled={!question.trim() || running}>
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Run quick research"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
