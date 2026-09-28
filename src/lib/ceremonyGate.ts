// ceremonyGate — one welcome per landing.
//
// Metro Echo has four ceremonies: the once-per-account intro, the boot roll
// call, the dawn shutter on the first Today of the day, and the spray tag on
// the logged-out door. They used to be keyed separately and avoided stacking
// only by luck. This module is the arbiter:
//
//  - The boot claims the day the moment a full roll call is decided —
//    synchronously, at the shell's first render (vanta.boot.claimed), before
//    the boot component itself necessarily mounts — so the claim always
//    lands before the room effect that would lift the dawn shutter behind
//    the cover. The boot's own lift is that day's shutter moment.
//  - The dawn shutter is the cheapest ceremony and yields to every other:
//    a claimed boot day, its own earlier lift, or a pressured day — no
//    theatre when something needs you. Its niche is arrivals that skipped
//    the roll call.
//  - The spray is door theatre, pre-auth: in full once per device, a quiet
//    chrome sweep on return visits, static under reduced motion. Sound
//    follows the device sound switch (vanta.sound.v1); the gate never
//    unmutes anything, and the browser's gesture rule means a first-ever
//    visit is usually silent — the visuals carry it.
//  - Everything here is device-local, like the sound and motion prefs. The
//    decision functions stay pure so they can be tested; the storage reads
//    are the thin shell around them.
import { reducedMotion } from "@/lib/reducedMotion";

export const SPRAY_KEY = "vanta.ceremony.spray";
export const SHUTTER_DAY_KEY = "vanta.shutter.day";

export type SprayVariant = "full" | "sweep" | "static";

/** Pure: which door the spray gives you. */
export function sprayVariant(opts: { reduced: boolean; seen: boolean }): SprayVariant {
  if (opts.reduced) return "static";
  return opts.seen ? "sweep" : "full";
}

/** The door's variant for this visit, from this device's memory. */
export function decideSprayVariant(): SprayVariant {
  return sprayVariant({ reduced: reducedMotion(), seen: readSpraySeen() });
}

export function readSpraySeen(): boolean {
  try {
    return localStorage.getItem(SPRAY_KEY) === "1";
  } catch {
    return false;
  }
}

export function recordSpray(): void {
  try {
    localStorage.setItem(SPRAY_KEY, "1");
  } catch {
    /* a private window still gets its tag; it just forgets it happened */
  }
}

/**
 * Pure: may the dawn shutter lift on this arrival at Today? It yields to a
 * boot or intro that already claimed the day, to its own earlier lift, and
 * to pressure — no theatre on a day that needs you.
 */
export function dawnShutterAllowed(opts: {
  today: string;
  bootDay: string | null;
  shutterDay: string | null;
  pressured: boolean;
}): boolean {
  if (opts.pressured) return false;
  if (opts.shutterDay === opts.today) return false;
  if (opts.bootDay === opts.today) return false;
  return true;
}
