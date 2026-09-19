// GroundLead — one line about where to physically go next.
//
// Doctrine:
//   - It leads the card and it is one line. Everything else under it is at most
//     two supporting lines, so the card gets shorter as the journey gets clearer.
//   - It names the airline that flies the aircraft, because that is what the
//     boards and the counters say.
//   - A check-in area is never invented. When none is on record the line says so
//     and offers to read one official page for it.
//   - The one tap here says where you are standing. It changes what leads the
//     card; it changes no fact, so it leaves no receipt.
//   - Nothing here checks in, drops a bag, or holds a seat.
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MOTION_FOCUS } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { GroundRead } from "@/lib/groundPath";
import { STAGE_DONE, STAGE_LABEL, nextStage, type GroundStage } from "@/lib/groundStage";

export function GroundLead({
  read,
  onLookUp,
  looking = false,
  stage,
  onStage,
  lead = false,
}: {
  read: GroundRead;
  /** Read one official page for the check-in area. Only offered, never automatic. */
  onLookUp?: () => void;
  looking?: boolean;
  /** Where this device says you are standing. */
  stage?: GroundStage;
  onStage?: (stage: GroundStage) => void;
  /** True when this block leads the whole screen and should read larger. */
  lead?: boolean;
}) {
  if (read.step === "none") return null;
  const step = stage ? nextStage(stage) : null;
  return (
    <div
      className={cn(
        "space-y-1.5",
        lead ? "vanta-card px-3 py-3" : "vanta-inset px-3 py-2",
      )}
    >
      <p
        className={cn(
          "font-medium leading-snug text-foreground",
          lead ? "text-[15px]" : "text-[12.5px]",
        )}
      >
        {read.lead}
      </p>
      {read.detail.map((line) => (
        <p key={line} className={cn("leading-snug text-muted-foreground", lead ? "text-[12px]" : "text-[11px]")}>
          {line}
        </p>
      ))}
      {read.needsCheckIn && onLookUp && (
        <Button
          size="sm"
          variant="outline"
          className={cn("h-8 w-full gap-1.5 text-[11px]", MOTION_FOCUS)}
          onClick={onLookUp}
          disabled={looking}
        >
          {looking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          {looking ? "Reading an airline page…" : "Look up where to check in"}
        </Button>
      )}
      {onStage && (step || (stage && stage !== "away")) && (
        <div className="space-y-1.5 pt-0.5">
          {stage && stage !== "away" && (
            <p className="text-[11px] leading-snug text-muted-foreground">{STAGE_DONE[stage]}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {step && (
              <Button
                size="sm"
                variant="secondary"
                className={cn("h-8 text-[11px]", MOTION_FOCUS)}
                onClick={() => onStage(step)}
              >
                {STAGE_LABEL[step]}
              </Button>
            )}
            {stage && stage !== "away" && (
              <Button
                size="sm"
                variant="ghost"
                className={cn("h-8 text-[11px]", MOTION_FOCUS)}
                onClick={() => onStage("away")}
              >
                Undo
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
