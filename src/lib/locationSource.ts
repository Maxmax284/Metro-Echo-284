// locationSource — the one way a real device fix becomes a place.
//
// Doctrine:
//   - a fix is only ever written as what it is: source "device", with the
//     accuracy the device reported. A pin a person dragged stays "manual".
//   - standing where a place already exists moves that pin instead of leaving a
//     second one on the same doorstep.
//   - the name is looked up straight away and waited for, because a place with
//     no name can never be spoken about.
//   - nothing here runs on its own. Every function is called from a tap.
import { supabase } from "@/integrations/supabase/client";
import { metersBetween } from "@/lib/trips";

export type PermissionRead = "granted" | "denied" | "prompt" | "unsupported";

export type Fix = { lat: number; lon: number; acc: number | null };

export type FixFailure =
  | "unsupported"
  | "denied"
  | "unavailable"
  | "timeout";

/** What the browser will say if we ask, without asking. */
export async function readLocationPermission(): Promise<PermissionRead> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return "unsupported";
  const perms = (navigator as any).permissions;
  if (!perms?.query) return "prompt";
  try {
    const status = await perms.query({ name: "geolocation" as PermissionName });
    if (status.state === "granted" || status.state === "denied" || status.state === "prompt") {
      return status.state;
    }
    return "prompt";
  } catch {
    return "prompt";
  }
}

export const FIX_FAILURE_COPY: Record<FixFailure, string> = {
  unsupported: "This device won't share a location, so set your place on the map instead.",
  denied: "Your browser is holding location back. Allow it for this site, then try again.",
  unavailable: "The device couldn't get a fix just now. Try again outdoors, or set the place by hand.",
  timeout: "The fix took too long. Try again, or set the place by hand on the map.",
};

/** Ask the device for one fix. Never watches, never repeats. */
export function requestFix(opts: { highAccuracy?: boolean } = {}): Promise<
  { ok: true; fix: Fix } | { ok: false; failure: FixFailure }
> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ ok: false, failure: "unsupported" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          ok: true,
          fix: {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            acc: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
          },
        }),
      (err) =>
        resolve({
          ok: false,
          failure: err.code === 1 ? "denied" : err.code === 3 ? "timeout" : "unavailable",
        }),
      { enableHighAccuracy: opts.highAccuracy ?? true, timeout: 10000, maximumAge: 0 },
    );
  });
}

export type PlaceRow = {
  id: string;
  label: string;
  geo: any;
  country: string | null;
  region: string | null;
  updated_at?: string;
};

export type RecordResult = {
  placeId: string;
  /** True when an existing pin was moved rather than a new one created. */
  moved: boolean;
  label: string;
  /** The place after the name lookup, when it came back in time. */
  place: PlaceRow | null;
};

/**
 * Write a device fix as the person's place, then wait for the name lookup so
 * the room has something to say about it.
 */
export async function recordDeviceFix(input: {
  userId: string;
  fix: Fix;
  /** Places already on record, used to avoid duplicate pins. */
  places: PlaceRow[];
  /** Name for a brand-new place. Ignored when an existing pin is moved. */
  label?: string;
}): Promise<RecordResult> {
  const { userId, fix, places } = input;

  const near = places.find((p) => {
    const g = (p.geo ?? {}) as any;
    if (!Number.isFinite(Number(g?.lat)) || !Number.isFinite(Number(g?.lon))) return false;
    return metersBetween({ lat: fix.lat, lon: fix.lon }, { lat: Number(g.lat), lon: Number(g.lon) }) <= 100;
  });

  let placeId: string;
  let label: string;
  let moved = false;

  if (near) {
    moved = true;
    placeId = near.id;
    label = near.label;
    const { error } = await supabase
      .from("awareness_places")
      .update({
        geo: { ...((near.geo ?? {}) as any), lat: fix.lat, lon: fix.lon, acc: fix.acc, source: "device" },
        updated_at: new Date().toISOString(),
      })
      .eq("id", near.id);
    if (error) throw error;
  } else {
    label = (input.label ?? "").trim() || "Where I am now";
    const { data, error } = await supabase
      .from("awareness_places")
      .insert({
        user_id: userId,
        label,
        geo: { lat: fix.lat, lon: fix.lon, acc: fix.acc, source: "device" },
      })
      .select("id,label,geo,country,region,updated_at")
      .single();
    if (error) throw error;
    placeId = (data as PlaceRow).id;
  }

  /* Wait for the name. A place with only coordinates cannot be spoken about,
     and the wait is what makes "You're at …" possible on the first tap. */
  let place: PlaceRow | null = null;
  try {
    await supabase.functions.invoke("awareness-geocode", { body: { place_id: placeId, force: true } });
    const { data } = await supabase
      .from("awareness_places")
      .select("id,label,geo,country,region,updated_at")
      .eq("id", placeId)
      .maybeSingle();
    place = (data as PlaceRow) ?? null;
  } catch {
    place = null;
  }

  return { placeId, moved, label: place?.label ?? label, place };
}

/** The plain sentence for what a fix's accuracy actually buys you. */
export function fixQualityLine(acc: number | null): string {
  if (acc == null) return "The device didn't say how precise that fix is, so Vanta treats it as an area.";
  if (acc <= 50) return "That fix is street-level, so timing and travel reads will be right.";
  if (acc <= 500) return "That fix is good to a neighbourhood — enough for timing, not for a doorstep.";
  if (acc <= 5000) return "That fix is city-level. Vanta will talk about the city, not the street.";
  return `That fix is only good to about ${Math.round(acc / 1000)}km, so set the place on the map if it matters.`;
}
