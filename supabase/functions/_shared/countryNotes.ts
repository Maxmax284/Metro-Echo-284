// countryNotes — what a person who has been there would tell you.
//
// Doctrine:
//   - Written and kept by hand, and every line carries the day it was checked.
//     Nothing here is scraped, generated, or inferred from a search.
//   - A country that is not written up returns nothing. Echo says it has no
//     notes rather than producing plausible-sounding travel advice.
//   - These are notes, not guarantees. Prices drift, trains change, rules change.
//     The card says so.
//
// Pure module: no IO, no React.

export type Note = { line: string; checked_on: string };

export type CountryNotes = {
  cc: string;
  country: string;
  currency: string;
  emergency: string;
  transport: Note[];
  money: Note[];
  watch_out: Note[];
};

export const NOTES_LAW =
  "These are kept notes with the day they were checked on them. They are not a live feed, and they are not advice — verify anything that costs you money or a flight.";

const NOTES: CountryNotes[] = [
  {
    cc: "TH",
    country: "Thailand",
    currency: "THB",
    emergency: "191 police, 1669 ambulance, 1155 tourist police",
    transport: [
      { line: "Suvarnabhumi (BKK): Airport Rail Link into Phaya Thai, roughly 45 THB, about 30 minutes, runs early morning to midnight.", checked_on: "2026-08-14" },
      { line: "Official taxis are the ground-floor rank with a ticket machine. Metered fare plus a 50 THB airport surcharge plus tolls.", checked_on: "2026-08-14" },
      { line: "Grab and Bolt both work and quote up front. The airport pickup point is signed, not at the kerb.", checked_on: "2026-08-14" },
      { line: "Don Mueang (DMK) is a separate airport from BKK. Allow well over an hour between them and do not assume a shuttle is waiting.", checked_on: "2026-08-14" },
    ],
    money: [
      { line: "Cash still matters outside malls. Street food, songthaews and small clinics are cash.", checked_on: "2026-08-14" },
      { line: "ATM withdrawal fee is around 220 THB per withdrawal on top of your own bank's cut, so take out larger amounts less often.", checked_on: "2026-08-14" },
      { line: "SuperRich and similar in-town exchange counters beat airport rates noticeably. Change a little at the airport, the rest in town.", checked_on: "2026-08-14" },
    ],
    watch_out: [
      { line: "\"Meter's broken, 500 baht\" at the taxi rank. Walk to the next car or open Grab.", checked_on: "2026-08-14" },
      { line: "Tuk-tuk offering a cheap tour: it ends at a gem shop or a tailor who pays commission.", checked_on: "2026-08-14" },
      { line: "Jet ski and scooter damage claims, especially in Phuket and Samui. Photograph the whole vehicle before you take it, and never hand over your passport as a deposit.", checked_on: "2026-08-14" },
      { line: "Someone telling you a temple is closed for a ceremony is usually steering you to a shop. The Grand Palace does not close for that.", checked_on: "2026-08-14" },
    ],
  },
  {
    cc: "JP",
    country: "Japan",
    currency: "JPY",
    emergency: "110 police, 119 fire and ambulance",
    transport: [
      { line: "Narita (NRT) to Tokyo is 60 to 90 minutes: Narita Express to Tokyo Station, or Keisei Skyliner to Nippori and Ueno.", checked_on: "2026-08-14" },
      { line: "Haneda (HND) is much closer in — 30 to 45 minutes on the Keikyu line or the Tokyo Monorail.", checked_on: "2026-08-14" },
      { line: "Last trains run around midnight and stop dead. After that it is a taxi at a serious price, so watch the clock, not the vibe.", checked_on: "2026-08-14" },
      { line: "Suica and Pasmo work as tap cards on almost everything, and Suica lives in Apple Wallet.", checked_on: "2026-08-14" },
      { line: "NRT and HND are on opposite sides of Tokyo. A connection between them is a two-hour ground move, not a transfer.", checked_on: "2026-08-14" },
    ],
    money: [
      { line: "Cards are widely taken in cities, but small restaurants, shrines and some ticket machines are still cash.", checked_on: "2026-08-14" },
      { line: "7-Eleven and Japan Post ATMs reliably take foreign cards. Many bank ATMs do not.", checked_on: "2026-08-14" },
    ],
    watch_out: [
      { line: "Very few outright scams. The real costs are missing the last train and taxi fares after it.", checked_on: "2026-08-14" },
      { line: "Kabukicho and Roppongi touts pulling you into bar-tab traps. If someone on the street invites you upstairs, keep walking.", checked_on: "2026-08-14" },
      { line: "Luggage does not fit everywhere. Use a coin locker or luggage forwarding rather than dragging cases onto rush-hour trains.", checked_on: "2026-08-14" },
    ],
  },
  {
    cc: "US",
    country: "United States",
    currency: "USD",
    emergency: "911",
    transport: [
      { line: "Dulles (IAD): Silver Line Metro runs from the terminal into DC, about 50 to 60 minutes to downtown.", checked_on: "2026-08-14" },
      { line: "Uber and Lyft pickups at big airports are on a separate level or a garage, not at arrivals.", checked_on: "2026-08-14" },
      { line: "Domestic connections still need 60 to 90 minutes at hubs; security is the variable, not the walk.", checked_on: "2026-08-14" },
    ],
    money: [
      { line: "Cards everywhere, tipping expected: 18 to 20 percent for table service.", checked_on: "2026-08-14" },
      { line: "Quoted prices exclude sales tax in most states. The number on the shelf is not what you pay.", checked_on: "2026-08-14" },
    ],
    watch_out: [
      { line: "Unmarked \"taxis\" hustling at arrivals. Use the official rank or the app.", checked_on: "2026-08-14" },
      { line: "Global Entry and Mobile Passport Control cut arrivals time badly at IAD and JFK; without one, budget an hour on a bad day.", checked_on: "2026-08-14" },
    ],
  },
  {
    cc: "SG",
    country: "Singapore",
    currency: "SGD",
    emergency: "999 police, 995 ambulance and fire",
    transport: [
      { line: "Changi to downtown is 30 to 45 minutes on the MRT, or about 20 to 30 minutes by taxi.", checked_on: "2026-08-14" },
      { line: "Taxis are metered and honest; airport and late-night surcharges are real and printed.", checked_on: "2026-08-14" },
      { line: "Terminals are joined by the Skytrain, but T4 is a shuttle bus ride. Jewel sits between T1, T2 and T3 and is landside.", checked_on: "2026-08-14" },
    ],
    money: [
      { line: "Cards and QR pay everywhere. Small hawker stalls may still want cash.", checked_on: "2026-08-14" },
    ],
    watch_out: [
      { line: "Leaving the transit area to visit Jewel means clearing immigration and going back through security. Do not do it on a tight connection.", checked_on: "2026-08-14" },
      { line: "Rules are enforced, not decorative: vaping is illegal to possess, and fines are real.", checked_on: "2026-08-14" },
    ],
  },
  {
    cc: "TW",
    country: "Taiwan",
    currency: "TWD",
    emergency: "110 police, 119 ambulance and fire, 0800-024-111 travel hotline",
    transport: [
      { line: "Taoyuan (TPE): follow Airport MRT signs down from arrivals. Purple Express trains run to Taipei Main Station in roughly 35 to 40 minutes; Blue Commuter trains stop everywhere and take longer for the same fare.", checked_on: "2026-09-19" },
      { line: "Airport MRT to Taipei Main Station is about 150 TWD. Buy a single-journey token at the machines, or tap an EasyCard straight through the gate.", checked_on: "2026-09-19" },
      { line: "Airport taxis leave from the signed ranks outside arrivals, metered. Use the official queue rather than an offer made to you inside the terminal.", checked_on: "2026-09-19" },
      { line: "Airport buses (Kuo-Kuang and others) run through the night when the MRT is closed, from the bus terminals beside arrivals. Slower, but they cover the gap.", checked_on: "2026-09-19" },
      { line: "Uber works in Taiwan and quotes up front, but airport pickup is at a signed pickup point rather than the arrivals kerb.", checked_on: "2026-09-19" },
    ],
    money: [
      { line: "EasyCard covers the Airport MRT, Taipei Metro, buses and most convenience stores. Buy one at the MRT counter or any 7-Eleven and load cash onto it.", checked_on: "2026-09-19" },
      { line: "Convenience-store ATMs are everywhere and generally take foreign cards — 7-Eleven and FamilyMart machines are the usual fallback.", checked_on: "2026-09-19" },
      { line: "Airport bank counters in arrivals change cash at a fair rate with a small fixed commission. Changing a little on landing is normal.", checked_on: "2026-09-19" },
      { line: "Night markets, small noodle shops and temples are cash. Carry small notes and coins.", checked_on: "2026-09-19" },
    ],
    watch_out: [
      { line: "TPE is outside central Taipei. Allow for the airport-to-city trip rather than treating the airport as downtown.", checked_on: "2026-09-19" },
      { line: "The Airport MRT stops overnight. Landing very late means a bus or a taxi, not a train.", checked_on: "2026-09-19" },
      { line: "Taoyuan has two terminals joined by a short shuttle. Check which one your onward flight leaves from before you settle in.", checked_on: "2026-09-19" },
      { line: "Typhoon season runs summer into autumn and shuts transport, not just flights. Check before committing to a day trip.", checked_on: "2026-09-19" },
    ],
  },
  {
    cc: "AE",
    country: "United Arab Emirates",
    currency: "AED",
    emergency: "999 police, 998 ambulance",
    transport: [
      { line: "DXB to Dubai Marina is 30 to 50 minutes depending on traffic. The Metro serves T1 and T3 and closes around midnight.", checked_on: "2026-08-14" },
      { line: "Careem and Uber both run. Airport taxis are metered with an airport surcharge.", checked_on: "2026-08-14" },
      { line: "DXB terminal changes are long walks or a bus. Emirates connections are usually within T3.", checked_on: "2026-08-14" },
    ],
    money: [{ line: "Cards everywhere. Cash is rarely needed beyond tips.", checked_on: "2026-08-14" }],
    watch_out: [
      { line: "A long layover with a visa-on-arrival is enough to see the city, but count immigration both ways before you commit.", checked_on: "2026-08-14" },
      { line: "Prescription medication rules are strict. Carry the prescription for anything controlled.", checked_on: "2026-08-14" },
    ],
  },
  {
    cc: "QA",
    country: "Qatar",
    currency: "QAR",
    emergency: "999",
    transport: [
      { line: "Hamad International to Doha centre is about 20 minutes by taxi, or the Doha Metro Red Line from the terminal.", checked_on: "2026-08-14" },
      { line: "The whole airport is one building. A connection here is a walk, not a transfer.", checked_on: "2026-08-14" },
    ],
    money: [{ line: "Cards widely taken. ATMs in the terminal are fine.", checked_on: "2026-08-14" }],
    watch_out: [
      { line: "Qatar Airways sometimes provides a transit hotel on long layovers — ask at the transfer desk rather than assuming.", checked_on: "2026-08-14" },
    ],
  },
  {
    cc: "KR",
    country: "South Korea",
    currency: "KRW",
    emergency: "112 police, 119 ambulance and fire",
    transport: [
      { line: "Incheon to Seoul Station is about 45 minutes on the AREX express, or an hour on the all-stop.", checked_on: "2026-08-14" },
      { line: "T1 and T2 at Incheon are 15 to 20 minutes apart by shuttle. Check which one your next flight leaves from.", checked_on: "2026-08-14" },
      { line: "T-money cards work on subway, bus and convenience stores.", checked_on: "2026-08-14" },
    ],
    money: [{ line: "Cards are standard. Some markets are cash only.", checked_on: "2026-08-14" }],
    watch_out: [
      { line: "Incheon transit tours exist for layovers over about five hours, run from the airport itself.", checked_on: "2026-08-14" },
    ],
  },
  {
    cc: "GB",
    country: "United Kingdom",
    currency: "GBP",
    emergency: "999, or 111 for non-emergency medical",
    transport: [
      { line: "Heathrow to central London is 15 minutes on the Heathrow Express to Paddington, or about an hour on the Piccadilly line for a fraction of the price.", checked_on: "2026-08-14" },
      { line: "Contactless tap works on all London transport. No ticket needed.", checked_on: "2026-08-14" },
      { line: "Heathrow terminal changes mean a bus or a train and a fresh security check. Ninety minutes minimum.", checked_on: "2026-08-14" },
    ],
    money: [{ line: "Card and contactless everywhere; cash is genuinely optional.", checked_on: "2026-08-14" }],
    watch_out: [
      { line: "Heathrow, Gatwick, Stansted and Luton are nowhere near each other. A connection between two of them is a ground journey of hours.", checked_on: "2026-08-14" },
    ],
  },
];

const BY_CC = new Map(NOTES.map((n) => [n.cc, n]));

/** Notes for a country, or null. Null means nothing is written up — not that there is nothing to know. */
export function countryNotes(cc: string | null | undefined): CountryNotes | null {
  const code = (cc ?? "").trim().toUpperCase();
  return code ? (BY_CC.get(code) ?? null) : null;
}

export function haveNotesFor(cc: string | null | undefined): boolean {
  return countryNotes(cc) !== null;
}

export function noNotesWords(country: string | null | undefined): string {
  return country
    ? `Nothing is written up for ${country} yet. Echo would rather say that than invent travel advice.`
    : "Nothing is written up for this country yet.";
}

/** The oldest check date in a set of notes, so a card can say how stale it is. */
export function notesCheckedOn(n: CountryNotes): string {
  return [...n.transport, ...n.money, ...n.watch_out]
    .map((x) => x.checked_on)
    .sort()[0] ?? "an unrecorded date";
}

export function countriesWritten(): string[] {
  return NOTES.map((n) => n.cc);
}
