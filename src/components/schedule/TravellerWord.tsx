// TravellerWord — your own word about where you are on this flight.
//
// Doctrine:
//   - The airline's feed is the default. This is the one place your word beats
//     it, and it always leaves a receipt.
//   - It records a state. It books nothing, checks nobody in, and moves no seat.
//   - Saying you did not make a flight freezes the rest of the journey rather
//     than assuming the next leg happened.
//   - Your word can always be taken back, and the card says whose word it is on.
import { useState } from "react";
import { Loader2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { MOTION_FOCUS } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { OVERRIDE_CHOICES, type LegStateKind } from "@/lib/journey";
import { vantaToast } from "@/lib/vantaVoice";

export function TravellerWord({
  /** Whose word the leg is currently on, when yours. */
  yourWord = null,
  onSay,
  onClear,
}: {
  yourWord?: LegStateKind | null;
  onSay: (state: LegStateKind) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>, said: string) => {
    setBusy(true);
    try {
      await fn();
      vantaToast.success(said);
      setOpen(false);
    } catch (e) {
      vantaToast.warning(e instanceof Error ? e.message : "That could not be recorded.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button size="sm" variant="outline" className={cn("h-9 text-[12px]", MOTION_FOCUS)}>
          <UserCheck className="mr-1 h-3.5 w-3.5" aria-hidden />
          Where are you?
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle className="text-[15px]">Tell Echo where you are</DrawerTitle>
          <DrawerDescription className="text-[12px]">
            The airline's feed leads by default. Your word beats it, and it is kept as your word — not the
            airline's. Nothing here checks you in or moves a booking.
          </DrawerDescription>
        </DrawerHeader>
        <div className="space-y-2 px-4 pb-1">
          {OVERRIDE_CHOICES.map((choice) => (
            <button
              key={choice.value}
              type="button"
              disabled={busy}
              onClick={() => void run(() => onSay(choice.value), `Recorded: ${choice.label.toLowerCase()}.`)}
              className={cn(
                "w-full rounded-lg border p-3 text-left transition-colors",
                yourWord === choice.value
                  ? "border-primary/60 bg-primary/5"
                  : "border-border/60 hover:bg-muted/40",
                MOTION_FOCUS,
              )}
            >
              <p className="text-[13px] font-medium text-foreground">{choice.label}</p>
              <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{choice.description}</p>
            </button>
          ))}
        </div>
        <DrawerFooter className="gap-2">
          {yourWord && (
            <Button
              variant="ghost"
              disabled={busy}
              className="h-9 text-[12px]"
              onClick={() => void run(onClear, "Back to the airline's word.")}
            >
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Go back to the airline's word
            </Button>
          )}
          <DrawerClose asChild>
            <Button variant="outline" className="h-9 text-[12px]">
              Leave it as it is
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
