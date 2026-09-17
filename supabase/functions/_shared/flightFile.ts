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

/**
 * The board entries a confirmed card wrote, cleared with it — including the
 * Google mirror, one entry at a time, with a receipt for each removal.
 */
async function clearFlightEntries(
  sb: Db,
  scope: FileScope,
  planId: string,
): Promise<DropCleared> {
  const cleared: DropCleared = { entries: 0, google_removed: 0, google_failed: 0 };
  const { data: plan } = await sb.from("flight_plans").select("event_ids").eq("id", planId).maybeSingle();
  const ids = (Array.isArray(plan?.event_ids) ? plan!.event_ids : []).filter((v: unknown) => typeof v === "string");
  if (!ids.length) return cleared;

  const { data: rows } = await sb
    .from("calendar_events")
    .select("id, title, google_event_id, google_calendar_id, organization_id")
    .in("id", ids)
    .eq("origin", "echo");
  const events = (rows ?? []) as Array<{
    id: string;
    title: string | null;
    google_event_id: string | null;
    google_calendar_id: string | null;
    organization_id: string | null;
  }>;
  if (!events.length) return cleared;

  const conn = events.some((e) => e.google_event_id) ? await googleCalendarConnection(scope.userId) : null;
  for (const event of events) {
    let mirrored: "removed" | "none" | "failed" = "none";
    if (conn && event.google_event_id) {
      try {
        await deleteEchoEventFromGoogle(conn, event.google_event_id, event.google_calendar_id ?? "primary");
        mirrored = "removed";
        cleared.google_removed += 1;
      } catch {
        mirrored = "failed";
        cleared.google_failed += 1;
      }
    }
    const { error } = await sb.from("calendar_events").delete().eq("id", event.id);
    if (error) continue;
    cleared.entries += 1;
    await sb.from("audit_log").insert({
      user_id: scope.userId,
      organization_id: event.organization_id ?? scope.orgId ?? null,
      entity_type: "calendar_event",
      entity_id: event.id,
      event: "calendar.event_deleted",
      payload: { title: event.title, google: mirrored, because: "flight_dropped", plan_id: planId },
    } as never);
  }
  return cleared;
}

/** Taking one known card off the record, with its receipt. */
export async function dropFlightPlan(
  sb: Db,
  scope: FileScope,
  hit: FlightHit,
  input: { flight_no: string; via: "desk" | "telegram" | "chat" | "ask" },
): Promise<{ dropped: boolean; words: string; cleared?: DropCleared }> {
  const cleared = hit.status === "confirmed" ? await clearFlightEntries(sb, scope, hit.id) : undefined;
  const { error } = await sb
    .from("flight_plans")
    .update({ status: "dropped", ...(cleared ? { event_ids: [] } : {}) })
    .eq("id", hit.id);
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
      entries_cleared: cleared?.entries ?? 0,
      google_removed: cleared?.google_removed ?? 0,
      google_failed: cleared?.google_failed ?? 0,
    },
  } as never);
  return { dropped: true, words: droppedWords(input.flight_no, hit, cleared), cleared };
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
