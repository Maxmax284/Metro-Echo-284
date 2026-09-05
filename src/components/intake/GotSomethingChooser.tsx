// GotSomethingChooser — "I've got something." One door, three destinations.
//
// Doctrine: a first-time user should not need Vanta's taxonomy to get something
// in. They type it, then pick one of three plain choices. Nothing executes:
//   Just park it     -> a capture in Inbox
//   It's a promise   -> an open commitment, no date until you give one
//   It needs a step  -> a proposed action, which still needs your approval
//
// Routing is never guessed. If nothing is chosen, nothing is filed.
import { useState } from "react";
import { Inbox, CheckSquare, ListChecks, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { useStageAction } from "@/hooks/useStageAction";
import { vantaToast } from "@/lib/vantaVoice";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { cn } from "@/lib/utils";
import { MOTION_FOCUS } from "@/lib/motion";

export type IntakeDoor = "park" | "promise" | "step";

export const INTAKE_DOORS: {
  key: IntakeDoor;
  label: string;
  says: string;
  lands: string;
  Icon: typeof Inbox;
}[] = [
  {
    key: "park",
    label: "Just park it",
    says: "You are not sure yet. Keep it safe and decide later.",
    lands: "Lands in Inbox as a capture. Nothing else happens.",
    Icon: Inbox,
  },
  {
    key: "promise",
    label: "It's a promise",
    says: "Somebody is expecting this from you, or you from them.",
    lands: "Lands in Commitments as an open promise. Add the date whenever you know it.",
    Icon: CheckSquare,
  },
  {
    key: "step",
    label: "It needs a step",
    says: "Something has to be done, and you want it prepared.",
    lands: "Lands in Actions as a draft. It waits for your approval — nothing runs.",
    Icon: ListChecks,
  },
];

export function GotSomethingChooser({
  className,
  onFiled,
}: {
  className?: string;
  /** Lets the host room refresh its counts. Never used to execute anything. */
  onFiled?: (door: IntakeDoor) => void;
}) {
  const { user } = useAuth();
  const { withScope, destination } = useScope();
  const stageAction = useStageAction();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<IntakeDoor | null>(null);

  const trimmed = text.trim();

  async function file(door: IntakeDoor) {
    if (!user) return;
    if (!trimmed) {
      vantaToast.message("Write the thing first — Vanta will not guess what you meant.");
      return;
    }
    setBusy(door);
    try {
      /* A write is only real once the database says so. Every success line
         below is spoken after the insert came back clean, never before. */
      if (door === "park") {
        const { error } = await supabase.from("notes").insert(
          withScope({
            user_id: user.id,
            title: trimmed.slice(0, 60),
            body: trimmed,
            metadata: { source: "got_something", captured_at: new Date().toISOString() },
          }) as never,
        );
        if (error) throw error;
        vantaToast.success(`Parked in Inbox · ${destination}. Route it whenever you like.`);
      } else if (door === "promise") {
        const { error } = await supabase.from("commitments").insert(
          withScope({
            user_id: user.id,
            summary: trimmed.slice(0, 200),
            due_at: null,
          }) as never,
        );
        if (error) throw error;
        vantaToast.success(`Recorded as an open promise · ${destination}. Add a date in Commitments.`);
      } else {
        await stageAction({
          title: trimmed.slice(0, 120),
          description: trimmed,
          risk: "standard",
          status: "proposed",
          source: "got_something",
        });
        vantaToast.success("Drafted in Actions. It will not run until you approve it.");
      }
      onFiled?.(door);
      setText("");
      setOpen(false);
    } catch (e) {
      vantaToast.error(
        e instanceof Error ? `That did not save: ${e.message}` : "That did not save. Nothing was filed.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex min-h-[36px] items-center gap-1.5 rounded-[2px] border border-primary/40",
            "bg-primary/10 px-2.5 text-[11.5px] font-medium text-foreground hover:bg-primary/15",
            MOTION_FOCUS,
            className,
          )}
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          I've got something
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-[min(28rem,calc(100vw-1.5rem))]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">I've got something</DialogTitle>
          <DialogDescription className="text-[12px]">
            Write it plainly, then pick where it goes. You do not need to know Vanta's words for it.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Nikki needs the coach schedule by Friday"
          rows={3}
          className="text-[12.5px]"
          aria-label="What have you got?"
        />

        <div className="space-y-1.5">
          {INTAKE_DOORS.map((d) => {
            const Icon = d.Icon;
            return (
              <button
                key={d.key}
                type="button"
                disabled={busy !== null}
                onClick={() => void file(d.key)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-[2px] border border-border/60 px-2.5 py-2 text-left",
                  "hover:border-primary/40 disabled:opacity-60",
                  MOTION_FOCUS,
                )}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium text-foreground">
                    {busy === d.key ? "Filing…" : d.label}
                  </span>
                  <span className="block text-[10.5px] leading-snug text-muted-foreground">{d.says}</span>
                  <span className="block text-[10.5px] leading-snug text-muted-foreground/80">{d.lands}</span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-[10.5px] leading-snug text-muted-foreground/80">
          Not sure which one? Park it. Vanta would rather ask you later than file it wrong.
        </p>
        <AftermathHint text="Whatever you pick becomes a record you can read · nothing runs without your approval" />
      </DialogContent>
    </Dialog>
  );
}
