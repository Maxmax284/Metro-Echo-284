// gateBoard — the four things somebody standing in a terminal actually asks:
// terminal, gate, how late it is, and when it lands.
//
// Doctrine:
//   - Facts only. Nothing here invents a gate, a terminal or a time. A field
//     that is not on record is said out loud as not on record.
//   - Voice: plain, direct, East Coast. Short sentences. No lecture.
// Pure module: no IO, no Deno globals.
import { airport } from "./airports.ts";
import { plainTimeWords } from "./preDeparture.ts";

export type BoardEnd = {
  iata: string | null;
  terminal: string | null;
  gate: string | null;
  /** Estimated, actual or scheduled — whichever the caller trusts most. */
  at: string | null;
  delayMin: number | null;
  landed?: boolean;
};

export type BoardLayover = {
  iata: string;
  arriveTerminal: string | null;
  departTerminal: string | null;
  terminalChange: string;
};

export type BoardFacts = {
  flightNo: string | null;
  /** What the airline calls it right now: scheduled, active, landed, cancelled. */
  status: string | null;
  departure: BoardEnd;
  arrival: BoardEnd;
  layover?: BoardLayover | null;
};

function clockAt(iso: string | null, iata: string | null, now: Date): string | null {
  if (!iso) return null;
  const tz = airport(iata)?.tz ?? "UTC";
  const words = plainTimeWords(iso, tz, now);
  return words === "not on record" ? null : words;
}

function lateWords(delayMin: number | null): string | null {
  if (delayMin == null || Math.abs(delayMin) < 5) return null;
  return delayMin > 0 ? `Running ${delayMin} minutes late.` : `Running ${Math.abs(delayMin)} minutes early.`;
}

function place(end: BoardEnd): string[] {
  const out: string[] = [];
  if (end.terminal && end.gate) out.push(`Terminal ${end.terminal}, gate ${end.gate}.`);
  else if (end.terminal) out.push(`Terminal ${end.terminal}. No gate posted yet.`);
  else if (end.gate) out.push(`Gate ${end.gate}. No terminal on record.`);
  else out.push("No terminal or gate posted yet — nobody has put one up.");
  return out;
}

/**
 * The board, in the order it gets asked for. Returns an empty list when there
 * is not one real fact to stand on, so the caller can stay quiet instead of
 * padding an answer.
 */
export function gateBoardWords(facts: BoardFacts, now: Date = new Date()): string[] {
  const dep = facts.departure;
  const arr = facts.arrival;
  const hasAnything =
    dep.terminal || dep.gate || dep.at || arr.terminal || arr.gate || arr.at || facts.status || dep.delayMin != null;
  if (!hasAnything) return [];

  const flight = facts.flightNo ? facts.flightNo : "This flight";
  const out: string[] = [];
  const flying = facts.status === "active";
  const landed = arr.landed || facts.status === "landed";

  if (landed) {
    const at = clockAt(arr.at, arr.iata, now);
    out.push(`${flight} is down${at ? ` — landed ${at} local` : ""}.`);
    out.push(...place(arr));
    const late = lateWords(arr.delayMin ?? null);
    if (late) out.push(late);
    return out;
  }

  if (flying) {
    const at = clockAt(arr.at, arr.iata, now);
    out.push(`${flight} is in the air${at ? `, due in ${at} local` : ""}.`);
    out.push(...place(arr));
    const late = lateWords(arr.delayMin ?? dep.delayMin ?? null);
    if (late) out.push(late);
    return out;
  }

  const off = clockAt(dep.at, dep.iata, now);
  out.push(`${flight} leaves ${off ? `${off} local` : "at a time nobody has filed yet"}.`);
  out.push(...place(dep));
  const late = lateWords(dep.delayMin);
  if (late) out.push(late);
  const lands = clockAt(arr.at, arr.iata, now);
  if (lands) out.push(`Lands ${lands} local.`);
  if (arr.terminal || arr.gate) {
    out.push(`On arrival: ${[arr.terminal ? `terminal ${arr.terminal}` : null, arr.gate ? `gate ${arr.gate}` : null].filter(Boolean).join(", ")}.`);
  }
  if (facts.layover) {
    const l = facts.layover;
    if (l.terminalChange === "yes" && l.arriveTerminal && l.departTerminal) {
      out.push(`At ${l.iata} you switch terminals — in at ${l.arriveTerminal}, out of ${l.departTerminal}. Leave yourself room.`);
    } else if (l.terminalChange === "no" && l.arriveTerminal) {
      out.push(`At ${l.iata} you stay in terminal ${l.arriveTerminal}.`);
    } else {
      out.push(`At ${l.iata} nobody has filed which terminals you are using.`);
    }
  }
  return out;
}
