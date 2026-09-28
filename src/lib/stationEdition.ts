// stationEdition — a kept occasion, worn as a temporary station edition.
//
// The boot stamps a kept day once, at the door. This module is what the day
// leaves behind while its window holds: a small window decal on the Today
// concourse, in the same stamp language, that expires on its own when the
// window passes — no cleanup, no cron, the date math simply stops matching.
//
// Doctrine:
//   - Same law as the boot stamp: opt-in per device, a fresh fix only, a
//     country the kept list actually speaks. Anything less is honest nothing.
//   - Tone is part of the fact. A remembrance decal stays quiet grey; it
//     never borrows a celebration's ink.
//   - Every edition says when it leaves. "Held through Apr 15" is part of
//     the decal — a temporary edition that never said it was temporary
//     would be a quiet claim on the wall.
//   - Acknowledging that something is happening here is not assuming the
//     person celebrates it. The decal names the day, never the belief.
//
// Pure module: no IO, no React.

import { occasionFor, type OccasionTone } from "./occasions";

/** Visual accent families — one per kept day, a quiet default for any new one. */
export type EditionMotif =
  | "water" // Songkran
  | "lights" // Loy Krathong
  | "flag" // independence days
  | "harvest" // Thanksgiving
  | "remember" // Memorial Day
  | "turning" // Setsubun — the year turning
  | "journey" // Golden Week — the country on the move
  | "mas" // Carnival
  | "mark"; // the fallback: an honest stamp, no invented accent

export type StationEdition = {
  id: string;
  name: string;
  note: string;
  tone: OccasionTone;
  motif: EditionMotif;
  /** "Apr 15" — the last day the edition holds. Always shown, always real. */
  until: string;
};

const MOTIF: Record<string, EditionMotif> = {
  songkran: "water",
  "loy-krathong": "lights",
  "us-independence": "flag",
  thanksgiving: "harvest",
  "memorial-day": "remember",
  setsubun: "turning",
  "golden-week": "journey",
  carnival: "mas",
  "tt-independence": "flag",
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * The edition holding today where the person stands, or null — the common,
 * correct answer. Off means off; a stale fix wears nothing; an unmapped
 * country gets no decal guessed for it. The window comes from occasions.ts,
 * so the decal and the boot stamp can never disagree about the day.
 */
export function editionFor(
  at: Date,
  country: string | null | undefined,
  opts: { optedIn: boolean; stale: boolean },
): StationEdition | null {
  if (!opts.optedIn || opts.stale) return null;
  const o = occasionFor(at, country);
  if (!o) return null;
  const { end } = o.window(at.getFullYear());
  return {
    id: o.id,
    name: o.name,
    note: o.note,
    tone: o.tone,
    motif: MOTIF[o.id] ?? "mark",
    until: `${MONTHS[end[0] - 1]} ${end[1]}`,
  };
}
