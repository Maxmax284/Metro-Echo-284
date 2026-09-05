// FollowOneNoteDemo — a replayable storyboard showing the full Echo loop.
// Capture → Inbox → Connect → Project card → Operational briefing → Brief → Export → Receipts.
// Doctrine: does not actually execute anything. It explains what happens
// when YOU tap. Closes back to wherever you were.
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { ChevronLeft, ChevronRight, X,
  Mic, Inbox, Link as LinkIcon, Folder, FileText, Download, ScrollText, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";

type Step = {
  pill: string;
  title: string;
  body: string;
  icon: typeof Mic;
};

const STEPS: Step[] = [
  {
    pill: "Step 1 — Capture",
    title: "You capture a thought",
    body: "Type, dictate, drop a file, or forward a message. Echo accepts it as-is — no decisions yet. This is the only place where anything enters the system.",
    icon: Mic,
  },
  {
    pill: "Step 2 — Inbox",
    title: "It lands in your Inbox",
    body: "Memory → Inbox is the staging area. Your note sits here until you decide what it belongs to. Nothing has executed. Nothing has been shared.",
    icon: Inbox,
  },
  {
    pill: "Step 3 — Connect",
    title: "You connect it to something",
    body: "Tap Connect to link the note to a project, a person, a place, or another note. This is how Echo learns where things belong. You can connect to many things at once.",
    icon: LinkIcon,
  },
  {
    pill: "Step 4 — Project card",
    title: "The project card updates",
    body: "Open Command Center → the project card now counts your note, shows the most recent change, and surfaces a situation (on track / needs attention / review required).",
    icon: Folder,
  },
  {
    pill: "Step 5 — Operational briefing",
    title: "Echo summarizes what's going on",
    body: "The Operations Briefing reads from your projects and tells you in plain English what's happening, what needs you, and why it appears now.",
    icon: CheckSquare,
  },
  {
    pill: "Step 6 — Create a brief",
    title: "You ask for a shareable summary",
    body: "Tap Create brief. Pick a format (For me, For a client, Audit packet, Weekly review, Audio). Echo drafts it. Nothing leaves yet.",
    icon: FileText,
  },
  {
    pill: "Step 7 — Approve & export",
    title: "You approve. PDF is generated.",
    body: "If anything looks sensitive, Echo flags it first. You tick the box, approve, and the PDF is saved to your Saved exports. You can re-download anytime.",
    icon: Download,
  },
  {
    pill: "Step 8 — Receipts",
    title: "Every claim points back to your note",
    body: "Open the brief and tap the receipts chip on any claim. You'll see the audit events, notes, and files Echo used — including your original capture.",
    icon: ScrollText,
  },
];

const DEMO_KEY = "vanta:demo:follow-one-note:seen";

export function FollowOneNoteDemo({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [step, setStep] = useState(0);
  const total = STEPS.length;
  const s = STEPS[Math.min(step, total - 1)];
  const Icon = s.icon;
  const isLast = step >= total - 1;

  function close(completed: boolean) {
    if (completed) {
      try { localStorage.setItem(DEMO_KEY, new Date().toISOString()); } catch { /* noop */ }
    }
    setStep(0);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(false); }}>
      <DialogContent className="max-w-md gap-0 p-0 sm:max-w-md">
        <div className="relative flex flex-col">
          <button
            onClick={() => close(false)}
            aria-label="Close demo"
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
            <p className="text-[13.5px] leading-relaxed text-foreground/85">{s.body}</p>
            <p className="text-[11px] text-muted-foreground">
              This is a replay — no real captures, links, or exports are created.
            </p>
          </div>

          <div className="flex items-center justify-center gap-1.5 px-5 py-2">
            {STEPS.map((_, i) => (
              <button
                key={i}
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
              size="sm" variant="ghost"
              className="h-8 gap-1 text-[12px]"
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Back
            </Button>
            {!isLast ? (
              <Button
                size="sm"
                className="h-8 gap-1 text-[12px]"
                onClick={() => setStep(Math.min(total - 1, step + 1))}
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button size="sm" className="h-8 text-[12px]" onClick={() => close(true)}>
                Done
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
