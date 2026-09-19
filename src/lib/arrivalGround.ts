// arrivalGround — the ground pack for the other end, readable with no signal.
//
// Doctrine:
//   - Every field comes from a kept airport/country table already bundled with
//     the app, so the whole pack reads offline. Nothing here fetches.
//   - Missing stays missing; no rate, route, phrase or phone number is inferred.
//   - Every practical line carries the day it was checked, so nothing reads as
//     live when it isn't.
import { arrivalFacts } from "./arrivalFacts";
import { countryFacts } from "./countryFacts";
import { countryNotes } from "./countryNotes";

export type ArrivalPhrase = { words: string; means: string };
export type ArrivalNote = { line: string; checked_on: string };

export type ArrivalGroundPack = {
  iata: string;
  city: string | null;
  country: string | null
  currency: string | null;
  currencySymbol: string | null;
  phrases: ArrivalPhrase[];
  /** The first transit line, kept for the one-line summary on the stamp. */
  transit: string | null;
  transitCheckedOn: string | null;
  /** Getting out of the airport and into the city. */
  transitNotes: ArrivalNote[];
  /** Cash, cards, ATMs and what the local travel card covers. */
  moneyNotes: ArrivalNote[];
  /** What catches people out here. */
  watchOut: ArrivalNote[];
  /** How you actually pay for things, when written up. */
  paying: string | null;
  tipping: string | null;
  /** Sockets and voltage, so a charger question has an answer. */
  plugs: string | null;
  voltage: string | null;
  /** Getting a local number or data. */
  sim: string | null;
  /** Dialling code, written the way a person types it. */
  phone: string | null;
  emergency: Array<{ label: string; number: string }>;
  emergencyNote: string | null;
  /** The day the country write-up was last checked. */
  checkedOn: string | null;
};

export function arrivalGroundPack(iata: string | null | undefined): ArrivalGroundPack | null {
  const base = arrivalFacts(iata, null);
  if (!base) return null;
  const facts = countryFacts(base.cc);
  const notes = countryNotes(base.cc);
  const help = base.help;
  const emergency: ArrivalGroundPack["emergency"] = [];
  const add = (label: string, number: string | null | undefined) => {
    const value = (number ?? "").trim();
    if (!value || emergency.some((row) => row.number === value)) return;
    emergency.push({ label, number: value });
  };
  add("Emergency", help?.general);
  add("Police", help?.police);
  add("Ambulance", help?.ambulance);
  add("Fire", help?.fire);

  return {
    iata: base.iata,
    city: base.city,
    country: base.country,
    currency: base.currency,
    currencySymbol: base.currencySymbol,
    phrases: (facts?.phrases ?? []).slice(0, 6),
    transit: notes?.transport[0]?.line ?? null,
    transitCheckedOn: notes?.transport[0]?.checked_on ?? null,
    transitNotes: notes?.transport ?? [],
    moneyNotes: notes?.money ?? [],
    watchOut: notes?.watch_out ?? [],
    paying: facts?.paying ?? null,
    tipping: facts?.tipping ?? null,
    plugs: facts?.plugs ?? null,
    voltage: facts?.voltage ?? null,
    sim: facts?.sim ?? null,
    phone: facts?.phone ?? null,
    emergency,
    emergencyNote: help?.note ?? null,
    checkedOn: facts?.checked_on ?? null,
  };
}
