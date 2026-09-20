// gatePass — the walking traveller's reading: boarding time, gate, seat, zone.
//
// Doctrine:
//   - Boarding time and departure time are different facts. A departure time is
//     never turned into a boarding time. When boarding is unknown, Echo says so
//     and may offer a clearly labelled planning window — never a time.
//   - What the traveller confirmed off the pass, the board or staff outranks a
//     feed, and is never quietly replaced by an estimate.
//   - Two confirmed sources that disagree are both shown. Echo picks neither and
//     sends the person to the live display or the gate staff.
import type { LocalFactSource, LocalTransferVerification } from "./transferVerification";
import { LOCAL_SOURCE_WORDS } from "./transferVerification";

/** How early airlines usually call boarding. A habit, never a filed fact. */
export const BOARDING_EARLY_MIN = 40;
export const BOARDING_LATE_MIN = 30;

export const ESTIMATE_WORDS =
  "No boarding time on record. Airlines usually call boarding 30 to 40 minutes before departure — a planning window, not a boarding time.";
export const UNKNOWN_WORDS =
  "Boarding time is not on record, and there is no departure time to plan around yet.";
export const CHECK_LOCALLY =
  "Check the live airport display or ask the gate staff.";

/** Minutes past midnight from any text carrying a clock reading. */
export function clockMinutes(text: string | null | undefined): number | null {
  const m = /(\d{1,2}):(\d{2})/.exec(text ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  const pm = /p\.?m\.?/i.test(text ?? "") && h < 12;
  const am = /a\.?m\.?/i.test(text ?? "") && h === 12;
  return (pm ? h + 12 : am ? 0 : h) * 60 + min;
}

/**
 * The instant a confirmed boarding clock lands on, worked back from the
 * departure instant so no timezone is guessed. A gap wider than twelve hours is
 * not a boarding time, so nothing is returned.
 */
export function boardingInstant(input: {
  boarding: string | null | undefined;
  departAt: string | null | undefined;
  departLocal: string | null | undefined;
}): string | null {
  const b = clockMinutes(input.boarding);
  const d = clockMinutes(input.departLocal);
  if (b === null || d === null || !input.departAt) return null;
  const t = Date.parse(input.departAt);
  if (!Number.isFinite(t)) return null;
  const back = ((d - b) % 1440 + 1440) % 1440;
  if (back > 12 * 60) return null;
  return new Date(t - back * 60_000).toISOString();
}

/** Plain countdown words. Never a bare number, never a fake precision. */
export function untilWords(instant: string | null, nowIso: string): string | null {
  if (!instant) return null;
  const t = Date.parse(instant);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(t) || !Number.isFinite(now)) return null;
  const mins = Math.round((t - now) / 60_000);
  if (mins > 90) {
    const h = Math.floor(mins / 60);
    const rest = mins % 60;
    return `in ${h}h${rest ? ` ${rest}m` : ""}`;
  }
  if (mins > 1) return `in ${mins} min`;
  if (mins >= -1) return "now";
  const late = Math.abs(mins);
  if (late < 90) return `${late} min ago`;
  return "earlier today";
}

export type BoardingRead =
  | { kind: "confirmed"; time: string; sourceWords: string; verifiedAt: string | null }
  | { kind: "estimate"; window: string; words: string }
  | { kind: "unknown"; words: string };

/**
 * What can honestly be said about boarding. A confirmed clock wins outright; a
 * departure time alone only ever buys a labelled window.
 */
export function boardingRead(input: {
  local?: LocalTransferVerification | null;
  departAt?: string | null;
  fmt?: (iso: string) => string;
}): BoardingRead {
  const said = (input.local?.boarding_time ?? "").trim();
  if (said) {
    return {
      kind: "confirmed",
      time: said,
      sourceWords: `${LOCAL_SOURCE_WORDS[input.local?.source ?? "traveler"]} · your word`,
      verifiedAt: input.local?.verified_at ?? null,
    };
  }
  const dep = input.departAt ? Date.parse(input.departAt) : NaN;
  if (Number.isFinite(dep) && input.fmt) {
    const early = input.fmt(new Date(dep - BOARDING_EARLY_MIN * 60_000).toISOString());
    const late = input.fmt(new Date(dep - BOARDING_LATE_MIN * 60_000).toISOString());
    if (early && late) {
      return { kind: "estimate", window: `${early}–${late}`, words: ESTIMATE_WORDS };
    }
  }
  return { kind: "unknown", words: UNKNOWN_WORDS };
}

export type PassCell = { label: string; value: string; note: string };

/** Seat and zone are the traveller's own facts or nothing at all. */
export function passCells(local: LocalTransferVerification | null | undefined): PassCell[] {
  const seat = (local?.seat ?? "").trim().toUpperCase();
  const zone = (local?.zone ?? "").trim().toUpperCase();
  const words = local ? `${LOCAL_SOURCE_WORDS[local.source]} · your word` : "Not on record";
  return [
    { label: "Seat", value: seat || "—", note: seat ? words : "Not on your record yet" },
    { label: "Zone", value: zone || "—", note: zone ? words : "Not on your record yet" },
  ];
}

/**
 * Disagreements worth a traveller's eyes. Nothing is resolved here — both
 * readings stay named, with the one move that settles it.
 */
export function passConflicts(input: {
  providerGate?: string | null;
  providerDepartLocal?: string | null;
  local?: LocalTransferVerification | null;
}): string[] {
  const out: string[] = [];
  const local = input.local;
  const provider = (input.providerGate ?? "").trim().toUpperCase();
  const mine = (local?.gate ?? "").trim().toUpperCase();
  if (provider && mine && provider !== mine) {
    out.push(
      `The airline feed says gate ${provider}; your ${LOCAL_SOURCE_WORDS[local?.source ?? "traveler"].toLowerCase()} says gate ${mine}. ${CHECK_LOCALLY}`,
    );
  }
  const b = clockMinutes(local?.boarding_time);
  const d = clockMinutes(input.providerDepartLocal);
  if (b !== null && d !== null) {
    const back = ((d - b) % 1440 + 1440) % 1440;
    if (back === 0 || back > 12 * 60) {
      out.push(
        `Boarding ${local?.boarding_time} does not sit before the departure time on record. ${CHECK_LOCALLY}`,
      );
    }
  }
  return out;
}

/** True when this flight's departure falls on the same day as now, where it leaves from. */
export function sameLocalDay(departAt: string | null | undefined, nowIso: string): boolean {
  if (!departAt) return false;
  const off = /([+-]\d{2}):?(\d{2})$/.exec(departAt);
  const t = Date.parse(departAt);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(t) || !Number.isFinite(now)) return false;
  const mins = off ? (Number(off[1]) < 0 ? -1 : 1) * (Math.abs(Number(off[1])) * 60 + Number(off[2])) : 0;
  const day = (ms: number) => new Date(ms + mins * 60_000).toISOString().slice(0, 10);
  return day(t) === day(now);
}

/**
 * Gate mode: the flight leaves today and has not gone. Everything else on the
 * card is stowed while a person is walking to a gate.
 */
export function gateMode(input: {
  departAt?: string | null;
  nowIso: string;
  landed?: boolean;
  inAir?: boolean;
}): boolean {
  if (input.landed || input.inAir) return false;
  return sameLocalDay(input.departAt, input.nowIso);
}

export type PassDraft = {
  boarding_time?: string | null;
  gate?: string | null;
  seat?: string | null
  zone?: string | null;
};

/** What a person typed or a photo read, cleaned. Nothing is invented for a blank. */
export function cleanDraft(d: PassDraft): PassDraft {
  const clean = (v: string | null | undefined, up = true) => {
    const s = (v ?? "").trim();
    if (!s) return null;
    return up ? s.toUpperCase().slice(0, 12) : s.slice(0, 12);
  };
  const time = (v: string | null | undefined) => {
    const m = /(\d{1,2}):(\d{2})/.exec(v ?? "");
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return `${String(h).padStart(2, "0")}:${m[2]}`;
  };
  return {
    boarding_time: time(d.boarding_time),
    gate: clean(d.gate),
    seat: clean(d.seat),
    zone: clean(d.zone),
  };
}

export function draftEmpty(d: PassDraft): boolean {
  return !d.boarding_time && !d.gate && !d.seat && !d.zone;
}

export const PASS_SOURCE_CHOICES: Array<{ id: LocalFactSource; label: string }> = [
  { id: "boarding_pass", label: "My boarding pass" },
  { id: "departures_board", label: "Airport board" },
  { id: "airline_staff", label: "Airline staff" },
];
