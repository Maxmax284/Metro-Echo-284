// tripSession — the one server-side owner of the shared cross-surface session.
//
// A trip IS the session. There is no separate "Walk With Me" subsystem: a walk
// is a trip whose purpose says so, so Today, the Aware room, Ask, Telegram and
// any future device form all read the same row. Start it on your phone, end it
// from a chat, and there is exactly one record either way.
//
// Laws kept here, not re-invented per surface:
//  - Deliberate only. Nothing in this module starts a session because someone
//    moved. Every open needs an explicit ask.
//  - One open session per person. A second "start" returns the one already open
//    rather than quietly making a duplicate.
//  - Honest closure. A session left running is closed at the last point it had,
//    and the closure says what it could not know.
//  - No background tracking. Points arrive only when a surface hands one over.
//  - No sharing. Nothing here can send a location to anyone.

import { pathDistanceMeters, staleTripDiff, type Trip, type TripPoint } from "./trips.ts";

/** Trips whose purpose marks them as a walk session. Frozen wire value. */
export const WALK_PURPOSE = "walk_with_me";

const TRIP_COLS =
  "id, label, purpose, started_at, ended_at, start_label, end_label, distance_m, point_count, closed_by, updated_at";


export type TripScope = { userId: string; orgId?: string | null };

export type SessionRead = {
  trip: Trip | null;
  points: TripPoint[];
  distanceM: number | null;
  isWalk: boolean;
  /** Set when a stale session was closed on read. Report it; never hide it. */
  autoClosed: string | null;
};

function normalize(row: any): Trip {
  return { ...row, distance_m: row?.distance_m == null ? null : Number(row.distance_m) } as Trip;
}

function scoped(q: any, scope: TripScope) {
  const withUser = q.eq("user_id", scope.userId);
  return scope.orgId ? withUser.eq("organization_id", scope.orgId) : withUser.is("organization_id", null);
}

/** Points on a session, oldest first. */
export async function sessionPoints(admin: any, tripId: string): Promise<TripPoint[]> {
  const { data } = await admin
    .from("trip_points")
    .select("lat, lon, accuracy_m, kind, label, recorded_at")
    .eq("trip_id", tripId)
    .order("recorded_at", { ascending: true });
  return (data ?? []) as TripPoint[];
}

/**
 * The open session, if there is one. Reading is also when a session left running
 * for half a day gets closed — with its diff returned, so whichever surface
 * noticed can say what happened instead of the trip just disappearing.
 */
export async function activeSession(admin: any, scope: TripScope, now = Date.now()): Promise<SessionRead> {
  const { data } = await scoped(
    admin.from("trips").select(TRIP_COLS).is("ended_at", null),
    scope,
  ).order("started_at", { ascending: false }).limit(1).maybeSingle();

  if (!data) return { trip: null, points: [], distanceM: null, isWalk: false, autoClosed: null };
  const trip = normalize(data);
  const points = await sessionPoints(admin, trip.id);
  const distanceM = points.length > 1 ? pathDistanceMeters(points) : null;

  /* A held session measures its staleness clock from the hold, not the start. */
  const heldAt = trip.closed_by === "held" ? (trip.updated_at ?? null) : null;
  const diff = staleTripDiff(trip, points.length ? points[points.length - 1].recorded_at : null, now, heldAt);

  if (diff) {
    const endedAt = points.length ? points[points.length - 1].recorded_at : trip.started_at;
    await admin.from("trips").update({
      ended_at: endedAt,
      closed_by: "auto_stale",
      distance_m: distanceM,
      point_count: points.length,
    }).eq("id", trip.id);
    return { trip: null, points: [], distanceM: null, isWalk: false, autoClosed: diff };
  }

  return { trip, points, distanceM, isWalk: trip.purpose === WALK_PURPOSE, autoClosed: null };
}

/** Append one fix a surface handed over. Never sampled from here. */
export async function appendPoint(
  admin: any,
  scope: TripScope,
  tripId: string,
  fix: { lat: number; lon: number; accuracy_m?: number | null; kind?: string; label?: string | null },
): Promise<TripPoint | null> {
  const row = {
    trip_id: tripId,
    user_id: scope.userId,
    lat: fix.lat,
    lon: fix.lon,
    accuracy_m: fix.accuracy_m ?? null,
    kind: fix.kind ?? "sample",
    label: fix.label ?? null,
    recorded_at: new Date().toISOString(),
  };
  const { error } = await admin.from("trip_points").insert(row);
  if (error) {
    console.error("trip_points insert", error.message);
    return null;
  }
  return row as TripPoint;
}

export type StartResult = {
  trip: Trip;
  /** True when a session was already open and this call reused it. */
  reused: boolean;
  autoClosed: string | null;
};

/**
 * Open a session because the person asked. If one is already open, that one
 * comes back — a chat and an app tap must never produce two live sessions.
 */
export async function startSession(
  admin: any,
  scope: TripScope,
  input: { label?: string | null; purpose?: string | null; startLabel?: string | null; notes?: string | null; via: string },
): Promise<StartResult | null> {
  const existing = await activeSession(admin, scope);
  if (existing.trip) return { trip: existing.trip, reused: true, autoClosed: existing.autoClosed };

  const { data, error } = await admin.from("trips").insert({
    user_id: scope.userId,
    organization_id: scope.orgId ?? null,
    label: input.label ?? null,
    purpose: input.purpose ?? null,
    start_label: input.startLabel ?? null,
    notes: input.notes ?? null,
    closed_by: "open",
  }).select(TRIP_COLS).single();
  if (error || !data) {
    console.error("trip start failed", error?.message);
    return null;
  }
  const trip = normalize(data);
  await admin.from("audit_log").insert({
    user_id: scope.userId,
    organization_id: scope.orgId ?? null,
    entity_type: "trip",
    entity_id: trip.id,
    event: "trip.started",
    payload: { via: input.via, purpose: input.purpose ?? null, label: input.label ?? null },
  });
  return { trip, reused: false, autoClosed: existing.autoClosed };
}

/** Close the open session from any surface. Idempotent: closing twice is fine. */
export async function endSession(
  admin: any,
  scope: TripScope,
  opts: { endLabel?: string | null; via: string } = { via: "unknown" },
): Promise<{ trip: Trip; distanceM: number | null } | null> {
  const open = await activeSession(admin, scope);
  if (!open.trip) return null;
  const points = open.points;
  const distance = points.length > 1 ? pathDistanceMeters(points) : null;
  await admin.from("trips").update({
    ended_at: new Date().toISOString(),
    end_label: opts.endLabel ?? null,
    distance_m: distance,
    point_count: points.length,
    closed_by: "you",
  }).eq("id", open.trip.id);
  await admin.from("audit_log").insert({
    user_id: scope.userId,
    organization_id: scope.orgId ?? null,
    entity_type: "trip",
    entity_id: open.trip.id,
    event: "trip.ended",
    payload: { via: opts.via, distance_m: distance, point_count: points.length },
  });
  return { trip: open.trip, distanceM: distance };
}

/**
 * Hold an open session so the stale reaper leaves it alone for now. Recorded as
 * a point, because that is what "still going" actually means.
 */
export async function holdSession(admin: any, scope: TripScope, via: string): Promise<Trip | null> {
  const open = await activeSession(admin, scope);
  if (!open.trip) return null;
  /* The hold is a mark on the session, not a fake location fix. `updated_at`
     moves with the write, which is what the stale clock reads. */
  await admin.from("trips").update({ closed_by: "held" }).eq("id", open.trip.id);
  await admin.from("audit_log").insert({
    user_id: scope.userId,
    organization_id: scope.orgId ?? null,
    entity_type: "trip",
    entity_id: open.trip.id,
    event: "trip.held_open",
    payload: { via, holds_for_hours: 12 },
  });
  return open.trip;
}

/**
 * One line describing the open session, in the same words on every surface.
 * Says what is known and refuses to guess an arrival time: Echo has no route,
 * no destination and no traffic, so "how much longer" is answered honestly.
 */
export function sessionLine(read: SessionRead, now = Date.now()): string {
  if (!read.trip) return "No trip or walk running right now.";
  const kind = read.isWalk ? "Walk" : "Trip";
  const dur = formatDuration(tripDurationMs(read.trip, now));
  const dist = read.distanceM == null ? "distance not measured yet" : formatDistance(read.distanceM);
  const held = read.trip.closed_by === "held" ? " Held open at your ask." : "";
  const from = read.trip.start_label ? ` Started at ${read.trip.start_label}.` : "";
  return `${kind} running ${dur} · ${dist}.${from}${held}`;
}

/** "How much longer?" — the honest version. */
export function noEtaLine(read: SessionRead, now = Date.now()): string {
  if (!read.trip) return "Nothing running, so there's nothing to time.";
  return `${sessionLine(read, now)} I can't tell you how much longer — you never gave me a destination, and I won't invent one.`;
}

