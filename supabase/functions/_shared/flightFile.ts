// flightFile — putting a flight on your record from anywhere you can type.
//
// Doctrine:
//   - One flight per number per day. A second attempt hands back the card that
//     already exists, whatever surface it was typed on.
//   - Filing is capture. It writes a prepared card and a receipt; it does not
//     put anything on the board. Confirming still happens inside the platform.
//   - Missing stays missing. A flight the provider does not carry stays bare —
//     no route, no times, and it says so.
//   - Dropping is allowed from anywhere, because a card is a note, not a ticket.
import { bareWords, fillFromLive, liveAddedSomething, routeFromLive } from "./flightQuick.ts";
import { statusWords, type LiveFlight } from "./flightStatus.ts";
import { TERMINAL_CAVEAT } from "./journey.ts";
import { countedRead } from "./flightProvider.ts";
import { bareOption } from "./flightQuick.ts";
import type { FlightOption, FlightPlan } from "./flightPlan.ts";
import { dropConfirmWords, droppedWords } from "./flightChat.ts";

type Db = { from: (t: string) => any };

export type FileScope = { userId: string; orgId: string | null };

export type FileResult = {
  status: "filed" | "already" | "failed";
  plan_id: string | null;
  words: string;
};

function sameCode(options: unknown, flight_no: string): boolean {
  return (Array.isArray(options) ? (options as FlightOption[]) : []).some(
    (o) => (o.flight_no ?? "").replace(/\s+/g, "").toUpperCase() === flight_no,
  );
}

async function findExisting(sb: Db, scope: FileScope, flight_no: string, depart_on: string) {
  let q = sb
    .from("flight_plans")
    .select("id, options, status, depart_on")
    .eq("user_id", scope.userId)
    .neq("status", "dropped")
    .eq("depart_on", depart_on)
    .limit(50);
  q = scope.orgId ? q.eq("organization_id", scope.orgId) : q.is("organization_id", null);
  const { data } = await q;
  return ((data ?? []) as Array<{ id: string; options: unknown }>).find((r) => sameCode(r.options, flight_no)) ?? null;
}

/**
 * A number and a day, filed. Asks the provider once, inside the day's ceiling,
 * and leaves the card exactly as bare as the provider left it.
 */
export async function fileFlightByNumber(
  sb: Db,
  scope: FileScope,
  input: { flight_no: string; depart_on: string; via: "desk" | "telegram" | "ask" },
): Promise<FileResult> {
  const { flight_no, depart_on } = input;

  const already = await findExisting(sb, scope, flight_no, depart_on);
  if (already) {
    return {
      status: "already",
      plan_id: already.id,
      words: `${flight_no} on ${depart_on} is already on your record — I didn't make a second one.`,
    };
  }

  const option = bareOption(flight_no, depart_on);
  const { data, error } = await sb
    .from("flight_plans")
    .insert({
      user_id: scope.userId,
      organization_id: scope.orgId ?? null,
      origin: "",
      destination: "",
      depart_on,
      passengers: 1,
      source: "entered",
      options: [option],
      status: "prepared",
      origin_kind: "desk",
      ownership: "mine",
      noticed_from: input.via === "desk" ? null : { source: input.via },
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("flightFile insert failed", error);
    return { status: "failed", plan_id: null, words: "That flight couldn't be written down just now." };
  }
  const planId = String(data.id);

  await sb.from("audit_log").insert({
    user_id: scope.userId,
    organization_id: scope.orgId ?? null,
    entity_type: "flight_plan",
    entity_id: planId,
    event: "flight.added_by_number",
    payload: { flight_no, depart_on, via: input.via, bought: false },
  } as never);

  /* One reading, right away, so the card is not bare when it does not have to be. */
  let words = bareWords(flight_no, depart_on);
  const read = await countedRead(sb, { userId: scope.userId, feature: `flight-file:${input.via}`, planId }, flight_no, depart_on);
  if (read.over_budget) {
    words = `${words} I didn't spend a reading on it — today's flight-data ceiling is used up. It'll fill in on the next sweep.`;
  } else if (liveAddedSomething(read.live)) {
    const live = read.live as LiveFlight;
    const route = routeFromLive(live);
    const filled = fillFromLive(option, live);
    await sb
      .from("flight_plans")
      .update({
        origin: route.origin || "",
        destination: route.destination || "",
        options: [filled],
        live_status: live as never,
        live_checked_at: live.checked_at,
      })
      .eq("id", planId);
    words = `${flight_no} on ${depart_on} is on your record. ${statusWords(live)}`;
  } else {
    words = `${words} The flight-data provider carries nothing for it yet — that's what it said, not that the flight is wrong.`;
  }

  return { status: "filed", plan_id: planId, words: `${words}\n\n${TERMINAL_CAVEAT}` };
}

export type FlightHit = { id: string; depart_on: string; status: string };

/**
 * The one card a typed flight number means: the soonest one still ahead, or the
 * most recent past one when they all are. Nothing is changed by looking.
 */
export async function findFlightByNumber(
  sb: Db,
  scope: FileScope,
  flight_no: string,
): Promise<FlightHit | null> {
  let q = sb
    .from("flight_plans")
    .select("id, options, depart_on, status")
    .eq("user_id", scope.userId)
    .neq("status", "dropped")
    .order("depart_on", { ascending: true })
    .limit(50);
  q = scope.orgId ? q.eq("organization_id", scope.orgId) : q.is("organization_id", null);
  const { data } = await q;
  const rows = (data ?? []) as Array<{ id: string; options: unknown; depart_on: string; status: string }>;
  const today = new Date().toISOString().slice(0, 10);
  const matches = rows.filter((r) => sameCode(r.options, flight_no));
  const hit = matches.find((r) => String(r.depart_on).slice(0, 10) >= today) ?? matches[0];
  if (!hit) return null;
  return { id: hit.id, depart_on: String(hit.depart_on).slice(0, 10), status: hit.status };
}

/** Taking one known card off the record, with its receipt. */
export async function dropFlightPlan(
  sb: Db,
  scope: FileScope,
  hit: FlightHit,
  input: { flight_no: string; via: "desk" | "telegram" | "chat" | "ask" },
): Promise<{ dropped: boolean; words: string }> {
  const { error } = await sb.from("flight_plans").update({ status: "dropped" }).eq("id", hit.id);
  if (error) return { dropped: false, words: "That flight couldn't be dropped just now." };
  await sb.from("audit_log").insert({
    user_id: scope.userId,
    organization_id: scope.orgId ?? null,
    entity_type: "flight_plan",
    entity_id: hit.id,
    event: "flight.dropped",
    payload: {
      flight_no: input.flight_no,
      depart_on: hit.depart_on,
      via: input.via,
      was_confirmed: hit.status === "confirmed",
    },
  } as never);
  return { dropped: true, words: droppedWords(input.flight_no, hit) };
}

/** Dropping a card. Not an execution, so it can be done from anywhere. */
export async function dropFlightByNumber(
  sb: Db,
  scope: FileScope,
  flight_no: string,
): Promise<{ dropped: boolean; words: string }> {
  const hit = await findFlightByNumber(sb, scope, flight_no);
  if (!hit) {
    return { dropped: false, words: `I don't have ${flight_no} on your record, so there's nothing to drop.` };
  }
  return dropFlightPlan(sb, scope, hit, { flight_no, via: "chat" });
}

export { dropConfirmWords, droppedWords };
export type { FlightPlan };
