// ExplainThisButton — the escape hatch when a room doesn't explain itself.
//
// Doctrine: the answer is grounded. The room description is written down, not
// generated, so tapping this never costs an AI call and never guesses. If the
// user wants more, they hand the room to Ask from here.
import { HelpCircle, Map, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useCompanion } from "@/components/companion/CompanionContext";
import { ROOM_EXPLAIN, type RoomKey } from "@/lib/roomCopy";
import { MOTION_FOCUS, MOTION_MICRO } from "@/lib/motion";
import { cn } from "@/lib/utils";

const ROOM_LABEL: Record<RoomKey, string> = {
  today: "Today",
  work: "Work",
  ask: "Ask",
  receipts: "Receipts",
  settings: "Settings",
};

export function ExplainThisButton({ room, className }: { room: RoomKey; className?: string }) {
  const { openWithPrefill } = useCompanion();
  const lines = ROOM_EXPLAIN[room];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`What is ${ROOM_LABEL[room]}?`}
          title={`What is ${ROOM_LABEL[room]}?`}
          className={cn(
            "shrink-0 rounded-[2px] p-1 text-muted-foreground/80 hover:text-foreground",
            MOTION_MICRO,
            MOTION_FOCUS,
            className,
          )}
        >
          <HelpCircle className="h-4 w-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[19rem] p-3 text-[12px] leading-relaxed">
        <p className="vanta-machine-label mb-1.5 text-foreground/70">What is {ROOM_LABEL[room]}?</p>
        <div className="space-y-1.5 text-muted-foreground">
          {lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="mt-2 h-8 w-full justify-start gap-1.5 px-2 text-xs"
          onClick={() => openWithPrefill(`Explain what I'm looking at in ${ROOM_LABEL[room]} right now.`)}
        >
          <MessageSquare className="h-3.5 w-3.5" /> Ask Vanta about this room
        </Button>
        {/* The structural answer, one tap away — never a trip through Settings. */}
        <Button asChild size="sm" variant="ghost" className="mt-0.5 h-8 w-full justify-start gap-1.5 px-2 text-xs">
          <Link to="/how">
            <Map className="h-3.5 w-3.5" /> See how Vanta is organized
          </Link>
        </Button>
      </PopoverContent>
    </Popover>
  );
}
