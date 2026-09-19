// useFlightPlans — preparing a flight, and confirming one.
//
// Doctrine:
//   - Preparing writes a draft. Confirming writes board entries. Neither buys a
//     ticket, and no code path here talks to an airline.
//   - Times and prices come from the person. Nothing is invented, nothing is
//     rounded, and the source is recorded with the plan.
//   - Every confirmation and drop leaves a receipt in audit_log.
//   - Scope-bound like every other desk.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { anchorLive, type LiveFlight } from "@/lib/flightStatus";
import { createEchoEvent, deleteEchoEvent } from "@/lib/echoCalendar";
import {
  canConfirm,
  cleanPlace,
  confirmedEntries,
  type FlightOption,
  type FlightOwnership,
  type FlightPlan,
  type FlightSource,
} from "@/lib/flightPlan";
import {
  bareOption,
  bareWords,
  fillFromLive,
  findSameFlight,
  liveAddedSomething,
  quickVerdict,
  routeFromLive,
} from "@/lib/flightQuick";
import type { LiveFlight } from "@/lib/flightStatus";

export type PrepareInput = {
  origin: string;
  destination: string;
  depart_on: string;
  return_on?: string | null;
  passengers?: number;
  currency?: string | null;
  source: FlightSource;
  options: FlightOption[];
};

function rowToPlan(r: any): FlightPlan {
  return {
    id: r.id,
    origin: r.origin,
    destination: r.destination,
    depart_on: r.depart_on,
    return_on: r.return_on ?? null,
    passengers: Number(r.passengers ?? 1),
    currency: r.currency ?? null,
    source: (r.source ?? "entered") as FlightSource,
    options: Array.isArray(r.options) ? (r.options as FlightOption[]) : [],
    chosen_option_id: r.chosen_option_id ?? null,
    status: (r.status ?? "prepared") as FlightPlan["status"],
    event_ids: Array.isArray(r.event_ids) ? r.event_ids : [],
    created_at: r.created_at,
    confirmed_at: r.confirmed_at ?? null,
    origin_kind: (r.origin_kind ?? "desk") as FlightPlan["origin_kind"],
    ownership: (r.ownership ?? "mine") as FlightPlan["ownership"],
    traveller_name: r.traveller_name ?? null,
    booking_ref: r.booking_ref ?? null,
    noticed_from: (r.noticed_from ?? null) as FlightPlan["noticed_from"],
    /* Pinned to each airport's own zone on the way in. A provider's times are
       airport wall clocks with no zone; parsed raw on a phone still set to the
       city you left, a Taipei landing reads hours away from where it is. */
    live_status: anchorLive((r.live_status ?? null) as LiveFlight | null),
    live_checked_at: r.live_checked_at ?? null,
    /* Your own word about this leg. Dropping it here was why "I am on it" never
       reached the card: the journey read the airline's feed and nothing else. */
    leg_state: r.leg_state ?? null,
    leg_state_source: r.leg_state_source ?? null,
    leg_state_at: r.leg_state_at ?? null,
    leg_state_note: r.leg_state_note ?? null,
  };
}


export function useFlightPlans() {
  const { user } = useAuth();
  const { applyScope, withScope, orgId, key } = useScope();
  const [plans, setPlans] = useState<FlightPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = (await applyScope(
      supabase.from("flight_plans").select("*").order("depart_on", { ascending: true }).limit(200) as never,
    )) as { data: any[] | null; error: { message: string } | null };
    if (err) setError(err.message);
    setPlans(((data ?? []) as any[]).map(rowToPlan));
    setLoading(false);
  }, [user, applyScope]);

  useEffect(() => {
    void load();
  }, [load, key]);

  /* The watcher stamps a new reading whenever a flight actually changes. Read it
     the moment it lands instead of waiting for the next sweep, so an open day
     rail moves with the gate change rather than minutes after it. Each hook
     instance owns one uniquely named channel — realtime reuses names. */
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;
    const channel = supabase
      .channel(`flight-plans-${userId}-${key}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "flight_plans", filter: `user_id=eq.${userId}` },
        () => { void loadRef.current(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user?.id, key]);

  const prepare = useCallback(
    async (input: PrepareInput) => {
      if (!user) return null;
      const { data, error: err } = await supabase
        .from("flight_plans")
        .insert(
          withScope({
            user_id: user.id,
            origin: cleanPlace(input.origin),
            destination: cleanPlace(input.destination),
            depart_on: input.depart_on,
            return_on: input.return_on || null,
            passengers: Math.max(1, Math.round(input.passengers ?? 1)),
            currency: input.currency || null,
            source: input.source,
            options: input.options as never,
            status: "prepared",
          }) as never,
        )
        .select("*")
        .single();
      if (err) throw new Error(err.message);
      await supabase.from("audit_log").insert(
        withScope({
          user_id: user.id,
          entity_type: "flight_plan",
          event: "flight.prepared",
          payload: { origin: input.origin, destination: input.destination, options: input.options.length },
        }) as never,
      );
      await load();
      return rowToPlan(data);
    },
    [user, withScope, load],
  );

  /** Your yes. Records the flight on the board — it buys nothing. */
  const confirm = useCallback(
    async (plan: FlightPlan, optionId: string) => {
      if (!user) return;
      const verdict = canConfirm(plan, optionId);
      if (!verdict.ok) throw new Error(verdict.reason ?? "That plan cannot be confirmed.");
      const option = plan.options.find((o) => o.id === optionId)!;
      const eventIds: string[] = [];
      for (const entry of confirmedEntries(plan, option)) {
        const res = await createEchoEvent({
          title: entry.title,
          starts_at: entry.starts_at,
          ends_at: entry.ends_at,
          all_day: false,
          location: entry.location,
          description: entry.description,
          project_id: null,
          organization_id: orgId ?? null,
        });
        if (res.id) eventIds.push(res.id);
      }
      const { error: err } = await supabase
        .from("flight_plans")
        .update({
          status: "confirmed",
          chosen_option_id: optionId,
          confirmed_at: new Date().toISOString(),
          event_ids: eventIds,
        })
        .eq("id", plan.id);
      if (err) throw new Error(err.message);
      await supabase.from("audit_log").insert(
        withScope({
          user_id: user.id,
          entity_type: "flight_plan",
          event: "flight.confirmed",
          payload: { plan_id: plan.id, option_id: optionId, entries: eventIds.length, bought: false },
        }) as never,
      );
      await load();
    },
    [user, orgId, withScope, load],
  );

  /* Removing a confirmed flight clears the exact entries it wrote — board and
     Google mirror both — before the card goes. Each removal leaves its own
     receipt; nothing is cancelled with the airline. */
  const drop = useCallback(
    async (plan: FlightPlan) => {
      if (!user) return;
      let cleared = 0;
      let failed = 0;
      for (const id of plan.event_ids ?? []) {
        try {
          await deleteEchoEvent(id);
          cleared += 1;
        } catch {
          failed += 1;
        }
      }
      const { error: err } = await supabase
        .from("flight_plans")
        .update({ status: "dropped", event_ids: [] })
        .eq("id", plan.id);
      if (err) throw new Error(err.message);
      await supabase.from("audit_log").insert(
        withScope({
          user_id: user.id,
          entity_type: "flight_plan",
          event: "flight.dropped",
          payload: {
            plan_id: plan.id,
            via: "desk",
            was_confirmed: plan.status === "confirmed",
            entries_cleared: cleared,
            entries_failed: failed,
          },
        }) as never,
      );
      await load();
    },
    [user, withScope, load],
  );

  /**
   * Your answer to "whose flight is this?". It files the draft, remembers the
   * sender so the question is asked once, and settles the nudge that asked.
   * Saying it is yours does not put it on your board — confirming still does.
   */
  const answerOwnership = useCallback(
    async (plan: FlightPlan, answer: Exclude<FlightOwnership, "unknown">) => {
      if (!user) return;
      const { error: err } = await supabase
        .from("flight_plans")
        .update({ ownership: answer, status: answer === "not_mine" ? "dropped" : plan.status })
        .eq("id", plan.id);
      if (err) throw new Error(err.message);

      const sender = plan.noticed_from?.sender ?? null;
      const key = (sender?.email ?? sender?.name ?? "").trim().toLowerCase();
      if (key) {
        const { data: existing } = (await applyScope(
          supabase.from("flight_senders").select("id, times_seen").eq("sender_key", key).limit(1) as never,
        )) as { data: Array<{ id: string; times_seen: number }> | null };
        const row = existing?.[0];
        if (row) {
          await supabase
            .from("flight_senders")
            .update({
              ownership: answer,
              sender_name: sender?.name ?? null,
              times_seen: Number(row.times_seen ?? 1) + 1,
              last_seen_at: new Date().toISOString(),
            })
            .eq("id", row.id);
        } else {
          await supabase.from("flight_senders").insert(
            withScope({
              user_id: user.id,
              sender_key: key,
              sender_name: sender?.name ?? null,
              ownership: answer,
            }) as never,
          );
        }
      }

      await supabase
        .from("nudges")
        .update({ status: "acted" })
        .eq("related_entity_id", plan.id)
        .eq("kind", "flight_noticed");

      await supabase.from("audit_log").insert(
        withScope({
          user_id: user.id,
          entity_type: "flight_plan",
          entity_id: plan.id,
          event: "flight.ownership_answered",
          payload: { plan_id: plan.id, answer, sender: key || null, bought: false },
        }) as never,
      );
      await load();
    },
    [user, applyScope, withScope, load],
  );

  /**
   * A disagreement between the flight on record and something Echo read later.
   *
   * Two honest answers, both recorded: keep what is on record, or take the
   * later reading. Nothing is written until you pick, and picking writes only
   * the one field in question. Airline-owned facts — status, gate, terminal —
   * never appear here, so they can never be settled from a picture.
   */
  const settleConflict = useCallback(
    async (plan: FlightPlan, key: string, choice: "keep" | "accept"): Promise<string> => {
      if (!user) throw new Error("Not signed in.");
      const noticed = (plan.noticed_from ?? {}) as NonNullable<FlightPlan["noticed_from"]>;
      const open = noticed.conflicts ?? [];
      const hit = open.find((c) => c.key === key);
      if (!hit) throw new Error("That disagreement is already settled.");

      const update: Record<string, unknown> = {};
      if (choice === "accept") {
        if (key === "origin") update.origin = cleanPlace(hit.seen);
        else if (key === "destination") update.destination = cleanPlace(hit.seen);
        else if (key === "booking_ref") update.booking_ref = hit.seen;
        else if (key === "traveller") update.traveller_name = hit.seen;
        else if (key === "depart_time" || key === "arrive_time") {
          const field = key === "depart_time" ? "depart_at" : "arrive_at";
          const day =
            key === "arrive_time"
              ? String((plan.options[0]?.arrive_at ?? "").slice(0, 10) || plan.depart_on)
              : plan.depart_on;
          update.options = plan.options.map((o, i) =>
            i === 0 ? { ...o, [field]: `${day}T${hit.seen}:00` } : o,
          );
        } else throw new Error("That fact cannot be settled here.");
      }

      const { error: err } = await supabase
        .from("flight_plans")
        .update({
          ...update,
          noticed_from: {
            ...noticed,
            conflicts: open.filter((c) => c.key !== key),
            settled: [
              ...((noticed as { settled?: unknown[] }).settled ?? []),
              { ...hit, choice, at: new Date().toISOString() },
            ],
          },
        } as never)
        .eq("id", plan.id);
      if (err) throw new Error(err.message);

      await supabase
        .from("nudges")
        .update({ status: "acted" })
        .eq("related_entity_id", plan.id)
        .eq("kind", "flight_evidence_conflict");

      await supabase.from("audit_log").insert(
        withScope({
          user_id: user.id,
          entity_type: "flight_plan",
          entity_id: plan.id,
          event: "flight.conflict_settled",
          payload: {
            fact: key,
            choice,
            kept: choice === "keep" ? hit.filed : hit.seen,
            dropped: choice === "keep" ? hit.seen : hit.filed,
            source_words: hit.source_words ?? null,
            bought: false,
          },
        }) as never,
      );
      await load();
      return choice === "keep"
        ? `Left as you have it — ${hit.filed}. The other reading stays on the receipt.`
        : `Filed ${hit.seen}. What you had before stays on the receipt.`;
    },
    [user, withScope, load],
  );

  /**
   * A sentence around the evidence that makes something wait on this flight,
   * kept as a real promise — on your word, never from the reading alone.
   */
  const keepCondition = useCallback(
    async (plan: FlightPlan): Promise<string> => {
      if (!user) throw new Error("Not signed in.");
      const noticed = (plan.noticed_from ?? {}) as NonNullable<FlightPlan["noticed_from"]>;
      const condition = noticed.condition ?? null;
      if (!condition || condition.kept_at) throw new Error("There is nothing waiting on this flight.");

      const { data: made, error: cErr } = await supabase
        .from("commitments")
        .insert(
          withScope({
            user_id: user.id,
            summary: condition.words.slice(0, 200),
            priority: "normal",
          }) as never,
        )
        .select("id")
        .single();
      if (cErr) throw new Error(cErr.message);

      /* The promise and the flight point at each other, so neither reads alone. */
      if (made?.id) {
        await supabase.rpc("cross_links_create", {
          _source_kind: "commitment",
          _source_id: made.id,
          _target_kind: "flight_plan",
          _target_id: plan.id,
          _relation: "about",
          _confidence: "high",
          _created_by: "user",
          _reason: "Kept from a line read alongside this flight.",
        } as never);
      }

      await supabase
        .from("flight_plans")
        .update({
          noticed_from: { ...noticed, condition: { ...condition, kept_at: new Date().toISOString() } },
        } as never)
        .eq("id", plan.id);

      await supabase
        .from("nudges")
        .update({ status: "acted" })
        .eq("related_entity_id", plan.id)
        .eq("kind", "flight_condition_noticed");

      await supabase.from("audit_log").insert(
        withScope({
          user_id: user.id,
          entity_type: "flight_plan",
          entity_id: plan.id,
          event: "flight.condition_kept",
          payload: { words: condition.words, commitment_id: made?.id ?? null, bought: false },
        }) as never,
      );
      await load();
      return "Kept as a promise, tied to this flight.";
    },
    [user, withScope, load],
  );

  /**
   * One reading of where the flight actually is. Reads; never rebooks.
   * `auto` marks the deck refreshing itself — the server holds those to the
   * flight's own window and the day's allowance of airline checks.
   */
  const checkStatus = useCallback(
    async (
      plan: FlightPlan,
      opts?: { auto?: boolean },
    ): Promise<{ words: string; news: string | null }> => {
      const { data, error: err } = await supabase.functions.invoke("flight-status", {
        body: { plan_id: plan.id, auto: opts?.auto ? true : undefined },
      });
      if (err) {
        const detail =
          typeof (err as { context?: { text?: () => Promise<string> } }).context?.text === "function"
            ? await (err as { context: { text: () => Promise<string> } }).context.text()
            : err.message;
        throw new Error(detail || "That flight could not be read.");
      }
      await load();
      const body = data as { words?: string; news?: string | null };
      return { words: body?.words ?? "Nothing was read.", news: body?.news ?? null };
    },
    [load],
  );

  /**
   * One official page read for where this flight checks in. Asked for, never
   * automatic: a zone is a dated page reading, so Echo only goes looking when a
   * person taps, and it never names one the page did not state.
   */
  const lookUpCheckIn = useCallback(
    async (plan: FlightPlan): Promise<string> => {
      const { data, error: err } = await supabase.functions.invoke("flight-checkin", {
        body: { plan_id: plan.id },
      });
      if (err) throw new Error(err.message || "That look-up did not go through.");
      await load();
      const body = data as { answer?: string };
      return body?.answer ?? "Nothing came back from that page.";
    },
    [load],
  );

  /**
   * A flight number and a day — the least a flight can be put in as. It files
   * one card, asks the provider once for the route and the times, and leaves
   * both blank if the provider carries nothing. The same flight on the same day
   * hands back the card that already exists rather than a second one.
   */
  const addByNumber = useCallback(
    async (
      rawNo: string,
      departOn: string,
    ): Promise<{ ok: boolean; reason?: string; already?: FlightPlan; words?: string }> => {
      if (!user) return { ok: false, reason: "Not signed in." };
      const verdict = quickVerdict(rawNo, departOn);
      if (!verdict.ok) return { ok: false, reason: verdict.reason };
      const flight_no = verdict.flight_no!;

      const already = findSameFlight(plans, flight_no, departOn);
      if (already) return { ok: false, already, reason: `${flight_no} on ${departOn} is already on your record.` };

      const option = bareOption(flight_no, departOn);
      const { data, error: err } = await supabase
        .from("flight_plans")
        .insert(
          withScope({
            user_id: user.id,
            origin: "",
            destination: "",
            depart_on: departOn,
            passengers: 1,
            currency: null,
            source: "entered",
            options: [option] as never,
            status: "prepared",
            origin_kind: "desk",
            ownership: "mine",
          }) as never,
        )
        .select("*")
        .single();
      if (err) return { ok: false, reason: err.message };
      const plan = rowToPlan(data);

      await supabase.from("audit_log").insert(
        withScope({
          user_id: user.id,
          entity_type: "flight_plan",
          entity_id: plan.id,
          event: "flight.added_by_number",
          payload: { flight_no, depart_on: departOn, bought: false },
        }) as never,
      );

      /* One reading, right away, so the card is not bare when it does not have
         to be. A provider that carries nothing leaves it bare, and says so. */
      let words = bareWords(flight_no, departOn);
      try {
        const { data: read } = await supabase.functions.invoke("flight-status", {
          body: { plan_id: plan.id, flight_no, flight_date: departOn },
        });
        const live = (read as { live?: LiveFlight | null } | null)?.live ?? null;
        if (liveAddedSomething(live)) {
          const route = routeFromLive(live);
          const filled = fillFromLive(option, live);
          await supabase
            .from("flight_plans")
            .update({
              origin: route.origin || plan.origin,
              destination: route.destination || plan.destination,
              options: [filled] as never,
            })
            .eq("id", plan.id);
          words = (read as { words?: string })?.words ?? words;
        } else {
          words = `${bareWords(flight_no, departOn)} The flight-data provider carries nothing for it yet — that is what it said, not that the flight is wrong.`;
        }
      } catch {
        words = `${bareWords(flight_no, departOn)} Live times could not be read just now.`;
      }

      await load();
      return { ok: true, words };
    },
    [user, plans, withScope, load],
  );

  /**
   * The two ends of a flight, in your words, when the provider carries none.
   * This is what turns a bare number into a leg the journey can reason about —
   * so it is your answer, recorded as yours, and never Echo's guess.
   */
  const setRoute = useCallback(
    async (plan: FlightPlan, from: string, to: string): Promise<{ ok: boolean; reason?: string }> => {
      if (!user) return { ok: false, reason: "Not signed in." };
      const code = (v: string) => {
        const t = (v ?? "").trim().toUpperCase();
        return /^[A-Z]{3}$/.test(t) ? t : null;
      };
      const origin_ = code(from);
      const destination_ = code(to);
      if (!origin_ || !destination_) {
        return { ok: false, reason: "Both ends need a three-letter airport code, like TPE." };
      }
      const { error: err } = await supabase
        .from("flight_plans")
        .update({ origin: origin_, destination: destination_ })
        .eq("id", plan.id);
      if (err) return { ok: false, reason: err.message };
      await supabase.from("audit_log").insert(
        withScope({
          user_id: user.id,
          entity_type: "flight_plan",
          entity_id: plan.id,
          event: "flight.route_said_by_person",
          payload: { plan_id: plan.id, origin: origin_, destination: destination_, source: "you" },
        }) as never,
      );
      await load();
      return { ok: true };
    },
    [user, withScope, load],
  );

  /** Hand Echo a booking you have in front of you. It reads; it files nothing on the board. */
  const noticeText = useCallback(
    async (input: { text: string; sender_name?: string; sender_email?: string }) => {
      const { data, error: err } = await supabase.functions.invoke("flight-notice", {
        body: {
          text: input.text,
          source: "pasted",
          sender_name: input.sender_name || undefined,
          sender_email: input.sender_email || undefined,
          organization_id: orgId ?? null,
        },
      });
      if (err) throw new Error(err.message);
      await load();
      return data as {
        created: number;
        asked: number;
        known: number;
        questions: string[];
        filled?: string[];
        conflicts?: string[];
      };
    },
    [orgId, load],
  );

  return {
    plans,
    loading,
    error,
    refresh: load,
    prepare,
    confirm,
    drop,
    answerOwnership,
    settleConflict,
    keepCondition,
    checkStatus,
    lookUpCheckIn,
    noticeText,
    addByNumber,
    setRoute,
  };
}
