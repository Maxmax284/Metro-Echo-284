// WorkFlowDemo — a replayable storyboard of the Work loop.
//
// Doctrine: this is drawn copy, not a sandbox. It writes nothing, deletes
// nothing, and touches no desk. It exists so a first-time user can watch the
// whole lap — capture, route, draft, approve, receipt, tomorrow — before they
// risk a single real record.
import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Keyboard,
  Inbox,
  FolderKanban,
  ListChecks,
  ShieldCheck,
  ScrollText,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Step = {
  pill: string;
  title: string;
  body: string;
  /** The pretend screen, so the loop is visible and not only described. */
  frame: { room: string; rows: string[] };
  icon: typeof Inbox;
};

const STEPS: Step[] = [
  {
    pill: "Step 1 — Capture",
    title: "Something arrives",
    body: "You type it, drop a file, or send it from your phone. Vanta takes it exactly as-is and makes no decisions.",
    frame: { room: "Capture", rows: ["\u201CNikki needs the coach schedule by Friday\u201D"] },
    icon: Keyboard,
  },
  {
    pill: "Step 2 — Inbox",
    title: "It waits as a draft",
    body: "Everything that arrives lands in Inbox first. Nothing is filed, nothing is shared, nothing runs.",
    frame: { room: "Inbox", rows: ["1 unsorted \u00b7 arrived just now \u00b7 draft"] },
    icon: Inbox,
  },
  {
    pill: "Step 3 — Route",
    title: "You decide where it belongs",
    body: "You file it to a project. That single choice is what turns an arrival into work Vanta can follow.",
    frame: { room: "Projects", rows: ["Lamai rollout \u2014 1 note attached"] },
    icon: FolderKanban,
  },
  {
    pill: "Step 4 — Promise",
    title: "The date becomes a promise",
    body: "Because it had a date in it, Vanta offers a commitment: \u201CSend Nikki the schedule by Friday.\u201D You confirm the wording.",
    frame: { room: "Commitments", rows: ["Send Nikki the schedule \u2014 due Friday \u00b7 open"] },
    icon: ListChecks,
  },
  {
    pill: "Step 5 — Draft",
    title: "Vanta prepares a step",
    body: "It drafts a reminder message and stops. This is the part people expect to be automatic \u2014 it is not.",
    frame: { room: "Actions", rows: ["Draft reminder to Nikki \u00b7 waiting on your approval"] },
    icon: ListChecks,
  },
  {
    pill: "Step 6 — Approve",
    title: "You approve, and only then it runs",
    body: "You read the details, then tap approve. Plan, approve, execute \u2014 always in that order, always inside Vanta.",
    frame: { room: "Actions", rows: ["Approved by you \u00b7 sent \u00b7 result recorded"] },
    icon: ShieldCheck,
  },
  {
    pill: "Step 7 — Receipt",
    title: "A receipt is written",
    body: "Every state change leaves evidence: what changed, when, and what it came from. Receipts cannot be edited.",
    frame: { room: "Receipts", rows: ["Action approved \u2192 executed \u00b7 traced to your capture"] },
    icon: ScrollText,
  },
  {
    pill: "Step 8 — Tomorrow",
    title: "It comes back when it matters",
    body: "Thursday night the promise is close, so Today surfaces it. None of that happened here \u2014 your desks are untouched.",
    frame: { room: "Today", rows: ["Due tomorrow: Send Nikki the schedule"] },
    icon: Sun,
  },
];

export function WorkFlowDemo({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [step, setStep] = useState(0);
  const total = STEPS.length;
  const s = STEPS[Math.min(step, total - 1)];
  const Icon = s.icon;
  const isLast = step >= total - 1;

  function close() {
    setStep(0);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-md gap-0 p-0 sm:max-w-md">
        <div className="relative flex flex-col">
          <button
            type="button"
            onClick={close}
            aria-label="Close the walkthrough"
            className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="space-y-3 px-5 pb-3 pt-6 sm:px-6">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/30">
                <Icon className="h-4 w-4 text-primary" />
              </span>
              <Badge variant="secondary" className="text-[10.5px] uppercase tracking-wider">
                {s.pill}
              </Badge>
            </div>
            <h2 className="text-[17px] font-semibold leading-tight text-foreground">{s.title}</h2>
            <p className="text-[13px] leading-relaxed text-foreground/85">{s.body}</p>

            {/* The pretend screen. Dashed on purpose: nothing here is real. */}
            <div className="rounded-md border border-dashed border-border/60 bg-surface-elevated/30 p-2.5">
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {s.frame.room} \u00b7 example
              </p>
              <ul className="mt-1.5 space-y-1">
                {s.frame.rows.map((r) => (
                  <li key={r} className="text-[11.5px] leading-snug text-foreground/85">{r}</li>
                ))}
              </ul>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Nothing on this screen is real. No captures, promises, approvals or receipts are created.
            </p>
          </div>

          <div className="flex items-center justify-center gap-1.5 px-5 py-2">
            {STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStep(i)}
                aria-label={`Go to step ${i + 1}`}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === step ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60",
                )}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border/40 bg-surface-elevated/40 px-4 py-3">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1 text-[12px]"
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Back
            </Button>
            <span className="text-[10.5px] text-muted-foreground">
              Step {step + 1} of {total}
            </span>
            {!isLast ? (
              <Button
                size="sm"
                className="h-8 gap-1 text-[12px]"
                onClick={() => setStep(Math.min(total - 1, step + 1))}
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button size="sm" className="h-8 text-[12px]" onClick={close}>
                Got it
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
