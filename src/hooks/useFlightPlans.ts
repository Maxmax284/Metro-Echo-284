// useFlightPlans — preparing a flight, and confirming one.
//
// Doctrine:
//   - Preparing writes a draft. Confirming writes board entries. Neither buys a
//     ticket, and no code path here talks to an airline.
//   - Times and prices come from the person. Nothing is invented, nothing is
//     rounded, and the source is recorded with the plan.
//   - Every confirmation and drop leaves a receipt in audit_log.
//   - Scope-bound like every other desk.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { createEchoEvent } from "@/lib/echoCalendar";
import {
  canConfirm,
  cleanPlace,
  confirmedEntries,
  type FlightOption,
  type FlightOwnership,
  type FlightPlan,
  type FlightSource,
} from "@/lib/flightPlan";

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
    live_status: r.live_status ?? null,
    live_checked_at: r.live_checked_at ?? null,
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

  const drop = useCallback(
    async (plan: FlightPlan) => {
      if (!user) return;
      const { error: err } = await supabase.from("flight_plans").update({ status: "dropped" }).eq("id", plan.id);
      if (err) throw new Error(err.message);
      await supabase.from("audit_log").insert(
        withScope({
          user_id: user.id,
          entity_type: "flight_plan",
          event: "flight.dropped",
          payload: { plan_id: plan.id },
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

  /** One reading of where the flight actually is. Reads; never rebooks. */
  const checkStatus = useCallback(
    async (plan: FlightPlan): Promise<{ words: string; news: string | null }> => {
      const { data, error: err } = await supabase.functions.invoke("flight-status", {
        body: { plan_id: plan.id },
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
      return data as { created: number; asked: number; known: number; questions: string[] };
    },
    [orgId, load],
  );

  return { plans, loading, error, refresh: load, prepare, confirm, drop, answerOwnership, checkStatus, noticeText };
}
