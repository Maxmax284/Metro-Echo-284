// TravelLane — the travel plan Echo can already see, in one place.
//
// It reads the calendar entries you sync, classifies flights, stays and ground
// transport, and orders them. It invents nothing: an entry with no end time
// says so. When there is no travel on the books this renders nothing at all —
// Today stays quiet.
import { format, formatDistanceToNow } from "date-fns";
import { Plane, BedDouble, Bus, Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MachineText } from "@/components/ui/instrument";
import { legLabel, legRunning, travelLegs, travelWindow, type TravelLeg } from "@/lib/travelLane";
import { LEAD_BAR, MOTION_FOCUS, MOTION_ROW } from "@/lib/motion";
import { cn } from "@/lib/utils";

type EventLike = Parameters<typeof travelLegs>[0][number];

const ICON = { flight: Plane, stay: BedDouble, transport: Bus } as const;

function whenLine(leg: TravelLeg, now: number): string {
  const start = new Date(leg.starts_at);
  if (legRunning(leg, now)) {
    const end = leg.ends_at ? new Date(leg.ends_at) : null;
    return end ? `running — through ${format(end, leg.all_day ? "EEE d MMM" : "EEE d MMM, HH:mm")}` : "running";
  }
  if (start.getTime() > now) {
    return `${format(start, leg.all_day ? "EEE d MMM" : "EEE d MMM, HH:mm")} — in ${formatDistanceToNow(start)}`;
  }
  return leg.ends_at ? format(start, "EEE d MMM") : `${format(start, "EEE d MMM")} — no end time on file`;
}

export function TravelLane({
  events,
  onOpenMap,
}: {
  events: EventLike[];
  onOpenMap: () => void;
}) {
  const now = Date.now();
  const legs = travelLegs(events, now).slice(0, 6);
  if (legs.length === 0) return null;
  const window = travelWindow(legs);

  return (
    <section className="vanta-card space-y-2 px-3 py-3">
      <div className="flex items-baseline gap-2">
        <p className="min-w-0 flex-1 text-[12.5px] font-medium leading-snug text-foreground">
          {window
            ? window.to
              ? `Travel from ${format(window.from, "d MMM")} through ${format(window.to, "d MMM")}`
              : `Travel from ${format(window.from, "d MMM")} — no end date on file`
            : "Travel on the books"}
        </p>
        <Button
          size="sm"
          variant="ghost"
          className={cn("h-8 shrink-0 gap-1.5 text-[11px]", MOTION_FOCUS)}
          onClick={onOpenMap}
        >
          <MapIcon className="h-3.5 w-3.5" />
          Map desk
        </Button>
      </div>
      <ul className="space-y-1.5">
        {legs.map((leg) => {
          const Icon = ICON[leg.kind];
          const running = legRunning(leg, now);
          return (
            <li
              key={leg.id}
              className={cn(
                "vanta-inset flex items-start gap-2 px-3 py-2",
                MOTION_ROW,
                LEAD_BAR,
                running ? "text-primary/60" : "text-primary/25",
              )}
            >
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-foreground/90">{leg.title}</p>
                <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">
                  <MachineText className="uppercase tracking-[0.1em]">{legLabel(leg.kind)}</MachineText>
                  {" · "}
                  {whenLine(leg, now)}
                  {leg.location ? ` · ${leg.location}` : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[10.5px] leading-snug text-muted-foreground/80">
        Read from the calendars you subscribed to. Echo never writes back to them.
      </p>
    </section>
  );
}
