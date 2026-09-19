// GroundLead — one line about where to physically go next.
//
// Doctrine:
//   - It leads the card and it is one line. Everything else under it is at most
//     two supporting lines, so the card gets shorter as the journey gets clearer.
//   - It names the airline that flies the aircraft, because that is what the
//     boards and the counters say.
//   - A check-in area is never invented. When none is on record the line says so
//     and offers to read one official page for it.
//   - Nothing here checks in, drops a bag, or holds a seat.
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MOTION_FOCUS } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { GroundRead } from "@/lib/groundPath";

export function GroundLead({
  read,
  onLookUp,
  looking = false,
}: {
  read: GroundRead;
  /** Read one official page for the check-in area. Only offered, never automatic. */
  onLookUp?: () => void;
  looking?: boolean;
}) {
  if (read.step === "none") return null;
  return (
    <div className="vanta-inset space-y-1.5 px-3 py-2">
      <p className="text-[12.5px] font-medium leading-snug text-foreground">{read.lead}</p>
      {read.detail.map((line) => (
        <p key={line} className="text-[11px] leading-snug text-muted-foreground">
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
    </div>
  );
}
