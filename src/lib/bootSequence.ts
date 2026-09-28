// bootSequence — whether the doors get a roll call, and what it may say.
//
// The boot is a station announcement, not a splash screen: it speaks only
// verified facts (place with its freshness, the clock, already-fetched
// weather, the operational state) and it gets out of the way. Pure module:
// no IO, no React — every rule here is unit-tested.
//
// Hard rules:
//   - A deep link (notification tap, saved room link) skips the boot: the
//     person asked for something specific, not a ceremony.
//   - Pressure (overdue promises, a real alert) skips the boot: when
//     something needs you, Today paints immediately.
//   - Offline never claims ALL CLEAR. Unknown is said as unknown.
//   - A quick reopen gets a nod, not the full roll call.

import type { Daypart } from "./daylight";
import { STAMP_COPY } from "./welcomeStamp";

export type BootMode = "skip" | "micro" | "full";

export type BootDecision = { mode: BootMode; reason: string };

/** Reopening inside this window means the last boot just happened. */
export const BOOT_JUST_NOW_MS = 10_000;
/**
 * localStorage key for the sign-in encore. Set just before a sign-in (Google
 * redirect or email), consumed once by the boot. Signing back in must never
 * read as a "quick reopen" — the round trip home gets the full roll call.
 */
export const BOOT_ENCORE_KEY = "vanta.boot.encore";
/** Longer than this since the last boot counts as a cold start. */
export const BOOT_COLD_MS = 4 * 60 * 60 * 1000;
/**
 * Power-up: how long the cover may wait for the facts (auth, the intro gate,
 * the place read) before the roll speaks anyway — with honest unknowns, never
 * invented ones. Load time must never stall the ceremony.
 */
export const POWER_UP_CAP_MS = 4000;
/** The roll speaks one drum at a time; this is the gap between flips. */
export const BOOT_STAGGER_MS = 1100;

/**
 * Clack timings for a roll of `count` drums. Drum one is already lit from
 * power-up, so the schedule covers drums 1..count-1, each clack landing with
 * its flip.
 */
export function bootClackSchedule(count: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < count; i++) out.push((i - 1) * BOOT_STAGGER_MS);
  return out;
}

export type BootDecisionInput = {
  now: number;
  /** Timestamp of the last completed boot, or null. */
  lastBootAt: number | null;
  /** Local day string (yyyy-mm-dd) of the last completed boot, or null. */
  lastBootDay: string | null;
  /** Local day string for `now`, same format. */
  today: string;
  /** The URL asked for a specific room/record (notification tap, saved link). */
  deepLink: boolean;
  /** Operational pressure is live — boot would be in the way. */
  urgent: boolean;
};

export function decideBoot(input: BootDecisionInput): BootDecision {
  if (input.deepLink) return { mode: "skip", reason: "deep-link" };
  if (input.urgent) return { mode: "skip", reason: "pressure" };
  if (input.lastBootAt != null && input.now - input.lastBootAt < BOOT_JUST_NOW_MS) {
    return { mode: "skip", reason: "just-booted" };
  }
  const cold = input.lastBootAt == null || input.now - input.lastBootAt > BOOT_COLD_MS;
  if (input.lastBootDay !== input.today || cold) {
    return { mode: "full", reason: input.lastBootDay !== input.today ? "first-of-day" : "cold" };
  }
  return { mode: "micro", reason: "reopen" };
}

export type BootFacts = {
  /** Verified place name at speakable precision, or null. */
  placeName: string | null;
  /** True while the place read is still in flight — drum two says so instead
   *  of claiming NEW GROUND it hasn't checked for. */
  placePending?: boolean | null;
  /** True when the fix is old enough to be "last known", not "now". */
  placeStale: boolean;
  /** Plain age of the fix ("2 hours ago"), or null. */
  placeAge: string | null;
  /** "06:47 GMT+7" — the clock where the person actually is. */
  clockLabel: string;
  /** Already-fetched weather, fresh: "29° clear". Null when unknown/stale. */
  weatherLabel: string | null;
  /** Operational state as the shell currently reads it, or null while unread. */
  operational: "calm" | "drift" | "pressure" | null;
  /** Browser reach. Offline changes what may be claimed. */
  online: boolean;
  /** The turn of day on the clock where the person is — frames the ceremony. */
  daypart?: Daypart | null;
  /** The station's season as an inline word ("wet season"), or null. */
  seasonLabel?: string | null;
  /** A kept occasion holding today where the person stands, or null. Opt-in
   *  only; arrives as provenance on the place line and a stamp, never a drum. */
  occasion?: { name: string; tone: "celebration" | "observance" | "remembrance" } | null;
  /** Your own welcome stamp. "here" — the place you stand in is stamped;
   *  "near" — you're back within earshot of ground you stamped before.
   *  Never set for a stale fix. */
  stamp?: { word: string; spoken: string; kind: "here" | "near"; label?: string | null } | null;
};

/** How the boot addresses this turn of the day. The default is the original
 *  boarding call, so a missing daypart changes nothing. */
export type BootTurn = { header: string; lead: string };

const TURNS: Record<Daypart, BootTurn> = {
  dawn: { header: "Early boarding", lead: "First light. The board lights up with what Echo can verify." },
  day: { header: "Now boarding", lead: "Midday turn. The board lights up with what Echo can verify." },
  golden: { header: "Now boarding", lead: "Golden hour. The board lights up with what Echo can verify." },
  dusk: { header: "Evening boarding", lead: "Evening turn. The board lights up with what Echo can verify." },
  night: { header: "Late boarding", lead: "Late turn. The board lights up with what Echo can verify." },
};

const DEFAULT_TURN: BootTurn = {
  header: "Now boarding",
  lead: "The board lights up with what Echo can verify.",
};

export function bootTurn(daypart: Daypart | null | undefined): BootTurn {
  return daypart ? TURNS[daypart] : DEFAULT_TURN;
}

export type BootCall = {
  /** Big drum word, uppercase, kept short for the split-flap. */
  word: string;
  /** Small provenance line under the drum. */
  line: string;
};

const DRUM_MAX = 14;

function drum(text: string): string {
  return text.toUpperCase().slice(0, DRUM_MAX);
}

/**
 * The roll call: three drums, each with its provenance. Every word is a
 * verified fact or an honest unknown — there is no path here that invents
 * a place, a sky, or an all-clear.
 */
export function buildRollCall(facts: BootFacts): BootCall[] {
  const calls: BootCall[] = [];
  const seasonBit = facts.seasonLabel ? ` · ${facts.seasonLabel}` : "";
  const occasionBit = facts.occasion ? ` · ${facts.occasion.name}` : "";
  const stampBit = facts.stamp
    ? ` · ${facts.stamp.kind === "here"
        ? STAMP_COPY.onFile(facts.stamp.spoken)
        : STAMP_COPY.stampedGround(facts.stamp.label ?? "this ground", facts.stamp.spoken)}`
    : "";

  calls.push({
    word: "METRO ECHO",
    line: bootTurn(facts.daypart).lead,
  });

  if (facts.placeName) {
    calls.push({
      word: drum(facts.placeStale ? "LAST KNOWN" : facts.placeName),
      line: facts.placeStale
        ? `${facts.placeName} — last place Echo knew${facts.placeAge ? `, ${facts.placeAge}` : ""}${seasonBit}.`
        : `Where you are${facts.placeAge ? ` — fix ${facts.placeAge}` : ""}${seasonBit}${occasionBit}${stampBit}.`,
    });
  } else if (facts.placePending) {
    calls.push({
      word: "READING",
      line: "Still fixing where you are — nothing claimed yet.",
    });
  } else {
    calls.push({
      word: "NEW GROUND",
      line: "No place on record yet — Echo won't invent one.",
    });
  }

  const skyBit = facts.weatherLabel ? ` · ${facts.weatherLabel}` : "";
  if (!facts.online) {
    calls.push({
      word: "NO SIGNAL",
      line: `${facts.clockLabel}${skyBit} — offline, so nothing here claims to be current.`,
    });
    return calls;
  }

  switch (facts.operational) {
    case "calm":
      calls.push({ word: "ALL CLEAR", line: `${facts.clockLabel}${skyBit} — nothing needs you right now.` });
      break;
    case "drift":
      calls.push({ word: "NEEDS A LOOK", line: `${facts.clockLabel}${skyBit} — something is slipping; Today has it.` });
      break;
    case "pressure":
      /* The decision layer skips boot under pressure; if it still renders,
         say so plainly rather than decorating over it. */
      calls.push({ word: "NEEDS YOU", line: `${facts.clockLabel}${skyBit} — go straight in.` });
      break;
    default:
      calls.push({ word: "READING", line: `${facts.clockLabel}${skyBit} — Echo is still counting the day.` });
  }
  return calls;
}

/** Hold times per mode, before the shutter lifts. Feel knob scales these.
 *  Full boot keeps the board up long enough to actually read the roll call —
 *  around 6.5s of hold, landing at roughly 7s with the shutter lift. */
export function bootHoldMs(mode: BootMode, motionReduced: boolean): number {
  if (mode === "micro") return 340;
  if (motionReduced) return 2200;
  return 6500;
}
