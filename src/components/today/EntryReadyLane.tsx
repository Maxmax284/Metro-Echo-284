// EntryReadyLane — the arrival-declaration cue, in the room you open first.
//
// Doctrine:
//   - It speaks only when the official filing window for a real, upcoming
//     border crossing is open, and goes quiet the moment you mark it done or
//     dismiss it. One entry, one cue.
//   - Reading only. The guide, the official link and the "I've filed it" mark
//     live on the flight card; this lane points there.
//   - This is an in-app cue. Nothing here is pushed to a phone.
import { useEffect, useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { useFlightPlans } from "@/hooks/useFlightPlans";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { airportZone, anchorToZone } from "@/lib/travelSense";
import {
  ENTRY_GUIDES,
  MAX_WINDOW_DAYS,
  airportCountry,
  entryRead,
  entryWindow,
  filingHandled,
  filingLatest,
  parseFilingMarks,
  type EntryIntent,
} from "@/lib/entryReadiness";
import { LEAD_BAR, MOTION_FOCUS, MOTION_ROW } from "@/lib/motion";
import { cn } from "@/lib/utils";

const readLS = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

export function EntryReadyLane({ onOpen }: { onOpen: () => void }) {
  const { plans } = useFlightPlans();
  const { prefs } = useUserPreferences();
  const [hidden, setHidden] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setTick((n) => n + 1);
  }, [plans.length]);

  const now = Date.now();
  const horizon = now + MAX_WINDOW_DAYS * 86_400_000;

  const row = plans
    .filter((plan) => plan.status === "confirmed" || plan.status === "prepared")
    .map((plan) => {
      const departAt = anchorToZone(
        plan.options.find((o) => o.depart_at)?.depart_at ?? null,
        airportZone((plan.origin ?? "").trim().toUpperCase() || null),
      );
      const arriveAt = anchorToZone(
        plan.options.find((o) => o.arrive_at)?.arrive_at ?? null,
        airportZone((plan.destination ?? "").trim().toUpperCase() || null),
      );
      return { plan, arriveAt, ms: departAt ? Date.parse(departAt) : Number.NaN };
    })
    .filter((r) => Number.isFinite(r.ms) && r.ms >= now && r.ms <= horizon)
    .sort((a, b) => a.ms - b.ms)[0];

  if (!row || hidden) return null;

  const country = airportCountry(row.plan.destination);
  const guide = country ? ENTRY_GUIDES[country] : null;
  if (!guide) return null;

  const intent = (readLS(`echo.entry.intent.${row.plan.id}`) as EntryIntent | null) ?? null;
  const marks = parseFilingMarks(readLS(`echo.entry.ack.c.${guide.countryCode}`));
  const handled = filingHandled(filingLatest(marks)?.state);
  const read = entryRead({
    fromIata: row.plan.origin,
    toIata: row.plan.destination,
    intent,
    nationality: prefs.entry?.nationality ?? null,
    filedFor: handled ? guide.countryCode : null,
  });
  if (read.kind !== "needed" && read.kind !== "needs_intent" && read.kind !== "needs_nationality") return null;
  if (handled) return null;
  if (readLS(`echo.entry.quiet.${guide.countryCode}`) === "1") return null;

  const filing = entryWindow({ guide, arriveAt: row.arriveAt });
  if (filing.kind === "early") return null;
  void tick;


  return (
    <section className={cn("vanta-card space-y-2 px-3 py-3", LEAD_BAR, "text-primary/50")}>
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium leading-snug text-foreground">
            Your {guide.country} arrival declaration window is open
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {read.kind === "needed"
              ? `${guide.cardName} — free, official, and better done a day or two early than in a boarding queue.`
              : `Echo needs one thing first: are you entering ${guide.country}, or only changing planes there?`}
          </p>
        </div>
        <button
          type="button"
          aria-label="Quiet this for now"
          onClick={() => {
            try {
              window.localStorage.setItem(`echo.entry.quiet.${guide.countryCode}`, "1");
            } catch {
              /* storage blocked — hidden for this visit only */
            }
            setHidden(true);
          }}
          className="shrink-0 rounded-md p-1 text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "w-full rounded-md border border-border/60 px-3 py-2 text-left text-[11.5px] text-foreground/90",
          MOTION_ROW,
          MOTION_FOCUS,
        )}
      >
        Open your flights for the official link and what to have ready
      </button>
    </section>
  );
}
