// JourneySummary — the trips on the books, at the top of Receipts.
//
// A compact, read-only summary of completed flight legs and the corrections
// along the way — what flew, what landed, whose word said so, and how many
// changes Echo recorded. Derived from flight_plans and audit_log on read;
// nothing is merged, moved or deleted, and the full record sits one level
// deeper exactly as before. "The international trip is finished" never means
// "the whole journey is finished" — each trip is named by its own airports.
import { useEffect, useState } from "react";
import { Plane } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { airportWords } from "@/lib/airports";

type LegRow = {
  id: string;
  origin: string;
  destination: string;
  status: string;
  leg_state: string | null;
  leg_state_source: string | null;
  updated_at: string;
};

type TripGroup = { key: string; legs: LegRow[]; corrections: number; latest: string };

/** Your word that a trip is closed, read from the receipts themselves. */
type WrapWord = { at: string; route: string | null } | null;

function whenWords(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const mins = Math.floor((Date.now() - ms) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function wordsFor(leg: LegRow): string {
  const from = leg.origin || "?";
  const to = airportWords((leg.destination ?? "").toUpperCase()) || leg.destination || "?";
  if (leg.status === "dropped") return `${from} → ${to} — set aside`;
  if (leg.leg_state === "landed" && leg.leg_state_source === "you") return `${from} → ${to} — landed, your word`;
  if (leg.leg_state === "landed" || leg.status === "flown") return `${from} → ${to} — landed`;
  return `${from} → ${to} — on record`;
}

export function JourneySummary() {
  const { user } = useAuth();
  const [trips, setTrips] = useState<TripGroup[]>([]);
  /* Only ever read from recorded events — never inferred from the legs. */
  const [wrapped, setWrapped] = useState<WrapWord>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
      const [plansRes, auditRes, wrapRes] = await Promise.all([
        supabase
          .from("flight_plans")
          .select("id, origin, destination, status, leg_state, leg_state_source, updated_at")
          .eq("user_id", user.id)
          .gte("updated_at", since)
          .order("updated_at", { ascending: true }),
        supabase
          .from("audit_log")
          .select("entity_id, created_at")
          .eq("user_id", user.id)
          .like("event", "flight.%")
          .gte("created_at", since),
        supabase
          .from("audit_log")
          .select("event, created_at, payload")
          .eq("user_id", user.id)
          .in("event", ["journey.wrapped_up", "journey.wrap_up_reopened"])
          .order("created_at", { ascending: false })
          .limit(1),
      ]);
      if (alive) {
        const last = wrapRes.data?.[0] as
          | { event: string; created_at: string; payload: { route?: string } | null }
          | undefined;
        setWrapped(
          last && last.event === "journey.wrapped_up"
            ? { at: last.created_at, route: last.payload?.route ?? null }
            : null,
        );
      }
      if (!alive || plansRes.error || !plansRes.data?.length) {
        if (alive) setTrips([]);
        return;
      }
      const corrections = new Map<string, number>();
      for (const ev of auditRes.data ?? []) {
        if (!ev.entity_id) continue;
        corrections.set(ev.entity_id, (corrections.get(ev.entity_id) ?? 0) + 1);
      }
      // One trip group for now — legs in time order, kept whole.
      const legs = plansRes.data as LegRow[];
      const group: TripGroup = {
        key: "recent",
        legs,
        corrections: [...corrections.values()].reduce((a, b) => a + b, 0),
        latest: legs[legs.length - 1]?.updated_at ?? "",
      };
      setTrips([group]);
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  if (!trips.length) return null;

  return (
    <section
      aria-label="Trips on the books"
      className="space-y-1.5 rounded-xl border border-border/60 bg-card/60 p-3"
    >
      {trips.map((trip) => {
        const done = trip.legs.every((l) => l.status === "flown" || l.status === "dropped" || l.leg_state === "landed");
        const flown = trip.legs.filter((l) => l.status !== "dropped");
        const title = flown.length
          ? `${flown[0].origin} → ${flown[flown.length - 1].destination}`
          : "Flights";
        return (
          <div key={trip.key} className="space-y-1">
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
              <Plane className="h-3.5 w-3.5 text-primary" aria-hidden />
              {done ? `Trip finished — ${title}` : `On the books — ${title}`}
            </p>
            <ul className="space-y-0.5">
              {trip.legs.map((leg) => (
                <li key={leg.id} className="text-[12px] leading-snug text-foreground/90">
                  {wordsFor(leg)}
                </li>
              ))}
            </ul>
            <p className="text-[10.5px] text-muted-foreground">
              {trip.corrections > 0
                ? `${trip.corrections} change${trip.corrections === 1 ? "" : "s"} on record — times you gave, times the airline filed, and what Echo noticed. Every one is below.`
                : "Every reading and word of yours is below."}
            </p>
          </div>
        );
      })}
    </section>
  );
}
