// flightIdentity — a flight is not one name.
//
// A ticket can say Thai Airways TG6285 while the aircraft, the counter and every
// board in the terminal say EVA Air BR3. Echo keeps both, says which is which,
// and always sends a traveller looking for the operating one.
//
// Doctrine:
//   - Who flies it is the provider's word (its codeshare block), then booking
//     evidence, then the person. Never inferred from the ticket number.
//   - What to look for on a board is always the operating identity when one is
//     on record. That is what is printed in the terminal.
//   - A check-in area is a dated reading of an official page, never a live fact
//     and never a guess. It always carries where it was read and when.
//   - Absent stays absent. No carrier is filled in from a two-letter code Echo
//     does not keep.
//
// Pure module: no IO, no React.

export const IDENTITY_LAW =
  "The board in the terminal prints the airline that flies the aircraft. Echo names that one, and says which number is on your ticket.";

export type CarrierId = {
  /** Airline name as the source gave it, tidied. */
  carrier: string | null;
  /** Two-letter code, when a source carried one. */
  carrier_code: string | null;
  /** Flight number as it would be printed, e.g. BR3. */
  flight_no: string | null;
};

/** A check-in area as read off an official page, with its receipt attached. */
export type CheckInRead = {
  /** Verbatim-ish answer: "EVA Air, Zone 2, main terminal". */
  where: string;
  source_url: string | null;
  source_host: string | null;
  /** ISO instant of the read. */
  read_at: string;
};

export type FlightIdentity = {
  /** The identity on the ticket. */
  marketing: CarrierId | null;
  /** The airline that actually flies it, when a source said they differ. */
  operating: CarrierId | null;
  /** Every other number the same flight answers to. */
  aliases: CarrierId[];
  /** Where to check in, when a page has been read for it. */
  check_in?: CheckInRead | null;
};

function str(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t : null;
}

/* Airlines whose own name is written in capitals. A traveller matching a sign
   should see the name the sign uses. Anything not listed is simply title-cased. */
const SHOUTED = new Set(["eva", "klm", "ana", "jal", "tap", "lot", "sas", "aua", "bra"]);

function tidyName(v: unknown): string | null {
  const t = str(v);
  if (!t) return null;
  /* Providers hand back "eva air". Title-case it so a card does not shout or mumble. */
  return t
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\b[A-Za-z]{3}\b/g, (w) => (SHOUTED.has(w.toLowerCase()) ? w.toUpperCase() : w));
}

export function carrierId(raw: {
  carrier?: unknown;
  carrier_code?: unknown;
  flight_no?: unknown;
}): CarrierId | null {
  const id: CarrierId = {
    carrier: tidyName(raw.carrier),
    carrier_code: str(raw.carrier_code)?.toUpperCase() ?? null,
    flight_no: str(raw.flight_no)?.replace(/\s+/g, "").toUpperCase() ?? null,
  };
  return id.carrier || id.carrier_code || id.flight_no ? id : null;
}

function sameId(a: CarrierId | null, b: CarrierId | null): boolean {
  if (!a || !b) return false;
  return !!a.flight_no && a.flight_no === b.flight_no;
}

/**
 * One identity out of everything on record for a flight: what the ticket says,
 * what the airline reading says, and anything a previous source filled in.
 * Later truth never erases earlier truth — it takes its own slot.
 */
export function mergeIdentity(
  kept: FlightIdentity | null | undefined,
  incoming: Partial<FlightIdentity> | null | undefined,
): FlightIdentity {
  const base: FlightIdentity = {
    marketing: kept?.marketing ?? null,
    operating: kept?.operating ?? null,
    aliases: Array.isArray(kept?.aliases) ? [...kept!.aliases] : [],
    check_in: kept?.check_in ?? null,
  };
  if (!incoming) return base;
  const out: FlightIdentity = {
    marketing: incoming.marketing ?? base.marketing,
    operating: incoming.operating ?? base.operating,
    aliases: base.aliases,
    check_in: incoming.check_in ?? base.check_in,
  };
  /* An identity that is no longer the headline is still a name this flight
     answers to, so it becomes an alias rather than disappearing. */
  const pool = [
    ...(Array.isArray(incoming.aliases) ? incoming.aliases : []),
    ...(base.marketing && !sameId(base.marketing, out.marketing) ? [base.marketing] : []),
    ...(base.operating && !sameId(base.operating, out.operating) ? [base.operating] : []),
  ];
  for (const a of pool) {
    if (!a?.flight_no) continue;
    if (sameId(a, out.marketing) || sameId(a, out.operating)) continue;
    if (out.aliases.some((x) => sameId(x, a))) continue;
    out.aliases.push(a);
  }
  return out;
}

/** True when the ticket and the aircraft carry different numbers. */
export function isCodeshare(id: FlightIdentity | null | undefined): boolean {
  if (!id?.marketing || !id?.operating) return false;
  return !sameId(id.marketing, id.operating);
}

/** The identity a traveller should hunt for on signs, boards and counters. */
export function boardIdentity(id: FlightIdentity | null | undefined): CarrierId | null {
  return id?.operating ?? id?.marketing ?? null;
}

function idWords(id: CarrierId | null): string | null {
  if (!id) return null;
  if (id.carrier && id.flight_no) return `${id.carrier} ${id.flight_no}`;
  return id.flight_no ?? id.carrier ?? id.carrier_code ?? null;
}

/**
 * What to look for, in one sentence, with the ticket number named second so the
 * traveller can match their booking without hunting for the wrong airline.
 */
export function boardWords(id: FlightIdentity | null | undefined, toPlace?: string | null): string | null {
  const board = idWords(boardIdentity(id));
  if (!board) return null;
  const to = str(toPlace) ? ` to ${str(toPlace)}` : "";
  if (!isCodeshare(id)) return `Look for ${board}${to} on the board.`;
  const ticket = idWords(id?.marketing ?? null);
  return `Look for ${board}${to} on the board. Your ticket says ${ticket}, and the board will not.`;
}

/** Who flies the aircraft, said plainly, or null when nothing says. */
export function operatorWords(id: FlightIdentity | null | undefined): string | null {
  const op = id?.operating ?? null;
  const name = op?.carrier ?? null;
  if (!name) return null;
  return isCodeshare(id) ? `${name} operates this flight, not ${id?.marketing?.carrier ?? "the airline on your ticket"}.` : `${name} operates this flight.`;
}

/** Where to check in, with the page and the date it was read. */
export function checkInWords(id: FlightIdentity | null | undefined): string | null {
  const c = id?.check_in ?? null;
  if (!c?.where) return null;
  const host = c.source_host ? `, read from ${c.source_host}` : "";
  const on = c.read_at ? ` on ${c.read_at.slice(0, 10)}` : "";
  return `Check in at ${c.where}${host}${on}. The counter signs win over this.`;
}

/** The airline whose check-in desks you want: the one that flies it. */
export function checkInCarrier(id: FlightIdentity | null | undefined): string | null {
  return boardIdentity(id)?.carrier ?? null;
}
