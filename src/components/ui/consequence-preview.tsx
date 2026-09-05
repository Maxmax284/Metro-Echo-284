// ConsequencePreview — the six-part read before anything moves.
//
// Same shape everywhere: Before / After / What changes / What does not change /
// What gets notified / What stays reversible, then the same closing sentence.
// It shows; it never runs.
import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { consequenceRows, NOTHING_YET, type Consequence } from "@/lib/consequence";

export function ConsequencePreview({ consequence, className }: { consequence: Consequence; className?: string }) {
  const rows = consequenceRows(consequence);
  return (
    <div className={cn("rounded-lg border border-border/60 bg-surface-elevated/60 p-2.5", className)}>
      <dl className="space-y-2">
        {rows.map((r) => (
          <div key={r.label}>
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{r.label}</dt>
            <dd className="mt-0.5 space-y-0.5 text-xs leading-snug text-foreground/90">
              {r.lines.filter(Boolean).map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 border-t border-border/50 pt-2 text-[11px] font-medium text-muted-foreground">{NOTHING_YET}</p>
    </div>
  );
}

/**
 * One dialog for the small consequential taps that have no staged action behind
 * them: closing a promise, moving one, sending a reply.
 */
export function ConfirmConsequenceDialog({
  open,
  title,
  consequence,
  confirmLabel,
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  consequence: Consequence | null;
  confirmLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <Dialog open={open && !!consequence} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>
        {consequence ? <ConsequencePreview consequence={consequence} /> : null}
        <DialogFooter>
          <Button variant="ghost" className="min-h-[44px]" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="min-h-[44px] gap-1.5" disabled={busy} onClick={() => void onConfirm()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Inline version for anywhere a preview should sit under a button, not in a dialog. */
export function ConsequenceDisclosure({ consequence, label = "What this changes" }: { consequence: Consequence; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="min-h-[32px] text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
      >
        {open ? "Hide what this changes" : label}
      </button>
      {open ? <ConsequencePreview consequence={consequence} className="mt-1.5" /> : null}
    </div>
  );
}
