// useJourney — your trip as one thing, and the terminal you are sitting in.
//
// Doctrine:
//   - Derived from the flight plans already on record. No new source of truth.
//   - The pack is written to this device so the spine reads with no service, and
//     it carries when it was saved. A refresh reports the diff, never "synced".
//   - An override is your word over the airline's, and it leaves a receipt.
//   - Terminal listings are only fetched when you ask for that category. No
//     automatic fan-out, because every lookup costs.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import type { FlightPlan } from "@/lib/flightPlan";
import {
  type Journey,
  type LegStateKind,
  type OfflinePack,
  journeysFrom,
  offlinePack,
  packDiff,
  whereOnJourney,
} from "@/lib/journey";
import type { IntelPlace } from "@/lib/airportIntel";

const PACK_KEY = "vanta.journey.pack";

function readPack(journeyId: string): OfflinePack | null {
  try {
    const raw = localStorage.getItem(`${PACK_KEY}.${journeyId}`);
    return raw ? (JSON.parse(raw) as OfflinePack) : null;
  } catch {
    return null;
  }
}

function writePack(pack: OfflinePack) {
  try {
    localStorage.setItem(`${PACK_KEY}.${pack.journey_id}`, JSON.stringify(pack));
  } catch {
    /* A full or blocked store is not a reason to break the card. */
  }
}

export function useJourney(plans: FlightPlan[], onChanged?: () => void | Promise<void>) {
  const { user } = useAuth();
  const { withScope } = useScope();
  const journeys = useMemo(() => journeysFrom(plans), [plans]);
  const [news, setNews] = useState<string[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  /* Write the journey down as soon as it is known, and say what moved since the
     last time this device saw it. */
  useEffect(() => {
    const live = journeys[0];
    if (!live) return;
    const next = offlinePack(live);
    const prev = readPack(live.id);
    const diff = packDiff(prev, next);
    if (diff.length) setNews(diff);
    writePack(next);
    setSavedAt(next.saved_at);
  }, [journeys]);

  /** Your word over the airline's. */
  const setLegState = useCallback(
    async (planId: string, state: LegStateKind, note?: string) => {
      if (!user) return;
      const { error } = await supabase
        .from("flight_plans")
        .update({
          leg_state: state,
          leg_state_source: "you",
          leg_state_at: new Date().toISOString(),
          leg_state_note: note ?? null,
        })
        .eq("id", planId);
      if (error) throw new Error(error.message);
      await supabase.from("audit_log").insert(
        withScope({
          user_id: user.id,
          entity_type: "flight_plan",
          entity_id: planId,
          event: "flight.leg_state_set_by_person",
          payload: { plan_id: planId, state, source: "you" },
        }) as never,
      );
      await onChanged?.();
    },
    [user, withScope, onChanged],
  );

  /** Put it back to the airline's word. */
  const clearLegState = useCallback(
    async (planId: string) => {
      if (!user) return;
      const { error } = await supabase
        .from("flight_plans")
        .update({ leg_state: null, leg_state_source: null, leg_state_at: null, leg_state_note: null })
        .eq("id", planId);
      if (error) throw new Error(error.message);
      await supabase.from("audit_log").insert(
        withScope({
          user_id: user.id,
          entity_type: "flight_plan",
          entity_id: planId,
          event: "flight.leg_state_cleared",
          payload: { plan_id: planId },
        }) as never,
      );
      await onChanged?.();
    },
    [user, withScope, onChanged],
  );

  const current: Journey | null = journeys[0] ?? null;
  const where = useMemo(() => (current ? whereOnJourney(current) : null), [current]);

  return { journeys, current, where, news, savedAt, setLegState, clearLegState, dismissNews: () => setNews([]) };
}

export type IntelResult = {
  places: IntelPlace[];
  fetched_at: string | null;
  stale?: boolean;
  note?: string;
  error?: string;
};

/** Terminal listings, one category at a time, only when asked for. */
export function useAirportIntel(iata: string | null) {
  const [byCategory, setByCategory] = useState<Record<string, IntelResult>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setByCategory({});
  }, [iata]);

  const look = useCallback(
    async (category: string, refresh = false) => {
      if (!iata) return;
      setBusy(category);
      try {
        const { data, error } = await supabase.functions.invoke("airport-places", {
          body: { iata, category, refresh },
        });
        if (error) {
          const detail =
            typeof (error as { context?: { text?: () => Promise<string> } }).context?.text === "function"
              ? await (error as { context: { text: () => Promise<string> } }).context.text()
              : error.message;
          setByCategory((m) => ({ ...m, [category]: { places: [], fetched_at: null, error: detail } }));
          return;
        }
        const body = data as { places?: IntelPlace[]; fetched_at?: string; stale?: boolean; note?: string };
        setByCategory((m) => ({
          ...m,
          [category]: {
            places: body?.places ?? [],
            fetched_at: body?.fetched_at ?? null,
            stale: body?.stale,
            note: body?.note,
          },
        }));
      } finally {
        setBusy(null);
      }
    },
    [iata],
  );

  return { byCategory, busy, look };
}
