// arrivalGround — the smallest useful pack for the ground at the other end.
//
// Every field comes from a kept airport/country table. Missing stays missing;
// no rate, route, phrase or phone number is inferred.
import { arrivalFacts } from "./arrivalFacts";
import { countryFacts } from "./countryFacts";
import { countryNotes } from "./countryNotes";

export type ArrivalPhrase = { words: string; means: string };

export type ArrivalGroundPack = {
  iata: string;
  city: string | null;
  country: string | null;
  currency: string | null;
  currencySymbol: string | null;
  phrases: ArrivalPhrase[];
  transit: string | null;
  transitCheckedOn: string | null;
  emergency: Array<{ label: string; number: string }>;
  emergencyNote: string | null;
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
    phrases: (facts?.phrases ?? []).slice(0, 3),
    transit: notes?.transport[0]?.line ?? null,
    transitCheckedOn: notes?.transport[0]?.checked_on ?? null,
    emergency,
    emergencyNote: help?.note ?? null,
  };
}