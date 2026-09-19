// countryFacts — how ordinary things work where you are standing.
//
// Doctrine:
//   - Kept by hand, every row stamped with the day it was checked. Nothing here
//     is scraped, inferred, or produced by a model.
//   - A country that is not written up returns nothing. Echo says it has no
//     notes rather than inventing a plug type or a tipping rule.
//   - Notes, not guarantees. Rules and rates move; the card says so.
//
// This is the practical layer under Ask: plugs, voltage, driving side, date and
// clock format, phone code, tax-inclusive pricing, tipping, transit payment,
// fuel units, SIM, and a handful of phrases. Emergency numbers stay in
// localHelp, which is the one place they are allowed to live.
//
// Pure module: no IO, no React.

import { helpFor } from "./localHelp.ts";

export const FACTS_LAW =
  "These are kept notes with the day they were checked on them. They are not a live feed and they are not advice — verify anything that costs you money, a flight, or a fine.";

export type CountryFacts = {
  cc: string;
  country: string;
  checked_on: string;
  /** International dialling code, written the way a person types it. */
  phone: string;
  /** Socket letters in the usual notation, e.g. "A, B". */
  plugs: string;
  voltage: string;
  /** "right" or "left". */
  driving: "right" | "left";
  date_format: string;
  clock: string;
  /** Whether the price on the shelf already contains the tax. */
  tax: string;
  tipping: string;
  paying: string;
  fuel: string;
  sim: string;
  phrases?: Array<{ words: string; means: string }>;
  note?: string;
};

const FACTS: CountryFacts[] = [
  {
    cc: "US", country: "United States", checked_on: "2026-09-16",
    phone: "+1", plugs: "A, B", voltage: "120V, 60Hz", driving: "right",
    date_format: "month/day/year — 09/16/2026 is 16 September", clock: "12-hour, am and pm",
    tax: "Added at the till. Sales tax varies by state and city, so the shelf price is not what you pay.",
    tipping: "Expected: 18 to 20 percent in restaurants and bars, a couple of dollars for a taxi or delivery. Tipped staff are paid on the assumption you tip.",
    paying: "Card and phone almost everywhere. Cash is rarely needed but small vendors sometimes prefer it.",
    fuel: "Sold by the US gallon (3.785 litres), so a per-gallon price looks cheap next to a European per-litre one.",
    sim: "eSIM works on all major carriers. Prepaid tourist plans are easy; a physical SIM usually needs a store visit.",
  },
  {
    cc: "GB", country: "United Kingdom", checked_on: "2026-09-16",
    phone: "+44", plugs: "G", voltage: "230V, 50Hz", driving: "left",
    date_format: "day/month/year — 16/09/2026", clock: "12-hour in speech, 24-hour on tickets and timetables",
    tax: "VAT is already in the shelf price. What you see is what you pay.",
    tipping: "Around 10 percent in a sit-down restaurant, and check the bill first — a discretionary service charge is often already on it. No tipping in pubs at the bar.",
    paying: "Contactless for nearly everything, including buses and the Tube. Cash is optional.",
    fuel: "Sold by the litre. Petrol stations post pence per litre.",
    sim: "eSIM is standard on the main networks. Prepaid SIMs are sold in any supermarket.",
  },
  {
    cc: "TH", country: "Thailand", checked_on: "2026-09-16",
    phone: "+66", plugs: "A, B, C", voltage: "220V, 50Hz", driving: "left",
    date_format: "day/month/year, and official paperwork often uses the Buddhist era — 2569 is 2026",
    clock: "24-hour on transport, 12-hour in speech",
    tax: "VAT of 7 percent is usually in the price. Hotels and smarter restaurants add VAT plus a 10 percent service charge on top, printed in small type.",
    tipping: "Not expected. Rounding up, or 20 to 50 baht for good service, is plenty.",
    paying: "Cash and QR (PromptPay) rule outside malls. Street food, songthaews and small clinics are cash.",
    fuel: "Sold by the litre, and grades are labelled by octane and ethanol content (91, 95, E20, E85).",
    sim: "Tourist eSIMs work and airport counters sell prepaid data cheaply. 7-Eleven tops up.",
    phrases: [
      { words: "sawatdee khrap (m) / kha (f)", means: "hello" },
      { words: "khop khun khrap / kha", means: "thank you" },
      { words: "tao rai?", means: "how much?" },
      { words: "mai ao khrap / kha", means: "no thanks" },
    ],
  },
  {
    cc: "JP", country: "Japan", checked_on: "2026-09-16",
    phone: "+81", plugs: "A, B", voltage: "100V, 50Hz in the east and 60Hz in the west", driving: "left",
    date_format: "year/month/day — 2026/09/16", clock: "24-hour on transport, and late-night times are sometimes written as 25:00",
    tax: "Consumption tax is shown in the price by law, though some shops print the pre-tax figure larger. Read the smaller number.",
    tipping: "No tipping. Leaving money on the table causes confusion, not gratitude.",
    paying: "IC cards (Suica, Pasmo) cover trains, buses and convenience stores. Cash still matters at small restaurants, shrines and clinics.",
    fuel: "Sold by the litre. Many stations are self-service with a Japanese-only screen.",
    sim: "eSIM data plans for visitors are easy. Voice SIMs generally need residency.",
    phrases: [
      { words: "konnichiwa", means: "hello" },
      { words: "arigatou gozaimasu", means: "thank you" },
      { words: "ikura desu ka?", means: "how much is it?" },
      { words: "sumimasen", means: "excuse me / sorry" },
    ],
  },
  {
    cc: "DE", country: "Germany", checked_on: "2026-09-16",
    phone: "+49", plugs: "C, F", voltage: "230V, 50Hz", driving: "right",
    date_format: "day.month.year — 16.09.2026", clock: "24-hour",
    tax: "VAT is in the price. Restaurant bills are already inclusive.",
    tipping: "Round up and say the total you want to pay as you hand the money over. Five to ten percent is normal, and it goes to the person, not the bill.",
    paying: "Cash is still genuinely common, and plenty of smaller places take German debit but not credit. Do not assume a card works.",
    fuel: "Sold by the litre. Autobahn stations cost noticeably more than town ones.",
    sim: "eSIM is available on the main networks; prepaid SIMs need ID registration.",
    phrases: [
      { words: "hallo / guten Tag", means: "hello" },
      { words: "danke", means: "thank you" },
      { words: "was kostet das?", means: "how much is that?" },
      { words: "zahlen bitte", means: "the bill please" },
    ],
  },
  {
    cc: "FR", country: "France", checked_on: "2026-09-16",
    phone: "+33", plugs: "C, E", voltage: "230V, 50Hz", driving: "right",
    date_format: "day/month/year — 16/09/2026", clock: "24-hour",
    tax: "VAT is in the price, and service is legally included in restaurant bills.",
    tipping: "Optional. A euro or two, or rounding up, for good service. Nobody expects a percentage.",
    paying: "Card and contactless nearly everywhere, including bakeries. Some markets are cash only.",
    fuel: "Sold by the litre. Supermarket stations are cheaper than motorway ones.",
    sim: "eSIM is widely supported. Prepaid SIMs are sold in tabacs and phone shops.",
    phrases: [
      { words: "bonjour", means: "hello — say it on entering a shop" },
      { words: "merci", means: "thank you" },
      { words: "combien ça coûte ?", means: "how much does it cost?" },
      { words: "l'addition, s'il vous plaît", means: "the bill please" },
    ],
  },
  {
    cc: "ES", country: "Spain", checked_on: "2026-09-16",
    phone: "+34", plugs: "C, F", voltage: "230V, 50Hz", driving: "right",
    date_format: "day/month/year — 16/09/2026", clock: "24-hour",
    tax: "IVA is in the price.",
    tipping: "Small and optional. Loose change at a bar, a few euros at a restaurant.",
    paying: "Card is normal; small bars and markets still like cash.",
    fuel: "Sold by the litre.",
    sim: "eSIM works on the main networks; prepaid SIMs need ID.",
    phrases: [
      { words: "hola", means: "hello" },
      { words: "gracias", means: "thank you" },
      { words: "¿cuánto cuesta?", means: "how much is it?" },
      { words: "la cuenta, por favor", means: "the bill please" },
    ],
  },
  {
    cc: "IT", country: "Italy", checked_on: "2026-09-16",
    phone: "+39", plugs: "C, F, L", voltage: "230V, 50Hz", driving: "right",
    date_format: "day/month/year — 16/09/2026", clock: "24-hour",
    tax: "IVA is in the price, but restaurants often add a per-person coperto or a bread charge. That is legal and it is on the menu somewhere.",
    tipping: "Not expected once coperto is on the bill. Round up if you liked it.",
    paying: "Card is common in cities, cash still matters in small towns and at markets.",
    fuel: "Sold by the litre, and servito (served) costs more than fai da te (self-service).",
    sim: "eSIM is supported; prepaid SIMs need a passport.",
    phrases: [
      { words: "buongiorno", means: "hello / good day" },
      { words: "grazie", means: "thank you" },
      { words: "quanto costa?", means: "how much is it?" },
      { words: "il conto, per favore", means: "the bill please" },
    ],
  },
  {
    cc: "NL", country: "Netherlands", checked_on: "2026-09-16",
    phone: "+31", plugs: "C, F", voltage: "230V, 50Hz", driving: "right",
    date_format: "day-month-year — 16-09-2026", clock: "24-hour",
    tax: "VAT is in the price.",
    tipping: "Round up, or five percent for good service.",
    paying: "Cards are everywhere, but many places take Dutch debit (Maestro/V Pay) and refuse credit cards. Carry a debit card or cash.",
    fuel: "Sold by the litre and among the pricier in Europe.",
    sim: "eSIM is standard on the main networks.",
    phrases: [
      { words: "hallo", means: "hello" },
      { words: "dank je", means: "thank you" },
      { words: "hoeveel kost het?", means: "how much is it?" },
    ],
  },
  {
    cc: "PT", country: "Portugal", checked_on: "2026-09-16",
    phone: "+351", plugs: "C, F", voltage: "230V, 50Hz", driving: "right",
    date_format: "day/month/year — 16/09/2026", clock: "24-hour",
    tax: "IVA is in the price.",
    tipping: "Small and optional; round up or leave a euro or two.",
    paying: "Multibanco card network is everywhere. Cash still useful in small cafés.",
    fuel: "Sold by the litre.",
    sim: "eSIM is supported; prepaid SIMs are cheap and need ID.",
    phrases: [
      { words: "olá / bom dia", means: "hello / good morning" },
      { words: "obrigado (m) / obrigada (f)", means: "thank you" },
      { words: "quanto custa?", means: "how much is it?" },
    ],
  },
  {
    cc: "AU", country: "Australia", checked_on: "2026-09-16",
    phone: "+61", plugs: "I", voltage: "230V, 50Hz", driving: "left",
    date_format: "day/month/year — 16/09/2026", clock: "12-hour in speech, 24-hour on transport",
    tax: "GST is in the price.",
    tipping: "Not expected. Staff are paid a real wage. Round up if the service was genuinely good.",
    paying: "Contactless for nearly everything. Some places surcharge card payments and must disclose it.",
    fuel: "Sold by the litre, and prices swing on a weekly cycle in the big cities.",
    sim: "eSIM is standard. Prepaid SIMs are sold in supermarkets.",
  },
  {
    cc: "CA", country: "Canada", checked_on: "2026-09-16",
    phone: "+1", plugs: "A, B", voltage: "120V, 60Hz", driving: "right",
    date_format: "mixed — year-month-day officially, month/day/year in daily use. Read the month as a word when you can",
    clock: "12-hour, except Québec where 24-hour is common",
    tax: "Added at the till, and the rate depends on the province.",
    tipping: "Expected: 15 to 20 percent in restaurants and bars. Card terminals prompt you.",
    paying: "Card and phone everywhere; Interac debit is universal.",
    fuel: "Sold by the litre, unlike the United States — do not compare the two numbers directly.",
    sim: "eSIM is supported on the main carriers, and Canadian mobile plans are expensive by world standards.",
  },
  {
    cc: "SG", country: "Singapore", checked_on: "2026-09-16",
    phone: "+65", plugs: "G", voltage: "230V, 50Hz", driving: "left",
    date_format: "day/month/year — 16/09/2026", clock: "12-hour",
    tax: "GST is in the displayed price in most shops. Restaurants often quote pre-GST with a 10 percent service charge added, marked as ++ on the menu.",
    tipping: "Not expected, and service charge already covers it.",
    paying: "Contactless and QR everywhere; a bank card taps straight onto the MRT and buses.",
    fuel: "Sold by the litre. Owning a car is deliberately expensive here.",
    sim: "eSIM is easy and cheap. Tourist SIMs are sold at the airport and in 7-Eleven.",
  },
  {
    cc: "TW", country: "Taiwan", checked_on: "2026-09-19",
    phone: "+886", plugs: "A, B", voltage: "110V, 60Hz", driving: "right",
    date_format: "year/month/day — 2026/09/19", clock: "12-hour in speech, 24-hour on transport",
    tax: "Tax is normally included in displayed shop prices. A receipt may show it separately.",
    tipping: "Not expected. Hotels and higher-end restaurants may add a service charge.",
    paying: "Cards and EasyCard are common. Keep some cash for markets and smaller shops.",
    fuel: "Sold by the litre.",
    sim: "Visitor eSIMs and prepaid SIMs are available; airport mobile counters require identification.",
    phrases: [
      { words: "nǐ hǎo", means: "hello" },
      { words: "xiè xie", means: "thank you" },
      { words: "qǐng wèn", means: "excuse me / may I ask" },
      { words: "Táiběi chēzhàn", means: "Taipei Main Station" },
    ],
  },
  {
    cc: "KR", country: "South Korea", checked_on: "2026-09-16",
    phone: "+82", plugs: "C, F", voltage: "220V, 60Hz", driving: "right",
    date_format: "year.month.day — 2026.09.16", clock: "12-hour in speech, 24-hour on transport",
    tax: "VAT is in the price.",
    tipping: "No tipping. It is genuinely not part of the culture.",
    paying: "Card for nearly everything. T-money covers transit and convenience stores.",
    fuel: "Sold by the litre.",
    sim: "Visitor eSIM data plans are easy; a voice number needs more paperwork.",
    phrases: [
      { words: "annyeonghaseyo", means: "hello" },
      { words: "gamsahamnida", means: "thank you" },
      { words: "eolmayeyo?", means: "how much is it?" },
    ],
  },
  {
    cc: "AE", country: "United Arab Emirates", checked_on: "2026-09-16",
    phone: "+971", plugs: "G", voltage: "230V, 50Hz", driving: "right",
    date_format: "day/month/year — 16/09/2026", clock: "12-hour",
    tax: "VAT of 5 percent is usually in the price; hotels add municipality and tourism fees on top.",
    tipping: "10 to 15 percent is common in restaurants even when a service charge appears on the bill.",
    paying: "Card everywhere. Nol cards cover Dubai metro and buses.",
    fuel: "Sold by the litre, and the government resets the price monthly.",
    sim: "Tourist SIMs are handed out at the airport; eSIM works on both networks. Note that some voice and video calling apps are restricted.",
  },
  {
    cc: "MX", country: "Mexico", checked_on: "2026-09-16",
    phone: "+52", plugs: "A, B", voltage: "127V, 60Hz", driving: "right",
    date_format: "day/month/year — 16/09/2026", clock: "12-hour",
    tax: "IVA is in the price in shops and restaurants.",
    tipping: "10 to 15 percent in restaurants, small change for baggers and attendants.",
    paying: "Card in cities, cash for markets, street food and small towns. Withdraw at bank ATMs rather than standalone ones.",
    fuel: "Sold by the litre, and stations are attended — you do not pump it yourself.",
    sim: "Telcel prepaid is cheap and widely covered; eSIM is supported.",
    phrases: [
      { words: "hola / buenos días", means: "hello" },
      { words: "gracias", means: "thank you" },
      { words: "¿cuánto cuesta?", means: "how much is it?" },
      { words: "la cuenta, por favor", means: "the bill please" },
    ],
  },
];

const BY_CC: Record<string, CountryFacts> = (() => {
  const out: Record<string, CountryFacts> = {};
  for (const row of FACTS) out[row.cc] = row;
  return out;
})();

const NAME_TO_CC: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const row of FACTS) out[row.country.toLowerCase()] = row.cc;
  Object.assign(out, {
    usa: "US", america: "US", "united states of america": "US", "the states": "US",
    uk: "GB", england: "GB", scotland: "GB", wales: "GB", britain: "GB", "great britain": "GB", london: "GB",
    thailand: "TH", bangkok: "TH", phuket: "TH", "chiang mai": "TH",
    japan: "JP", tokyo: "JP", osaka: "JP",
    germany: "DE", berlin: "DE", munich: "DE",
    france: "FR", paris: "FR",
    spain: "ES", madrid: "ES", barcelona: "ES",
    italy: "IT", rome: "IT", milan: "IT",
    netherlands: "NL", holland: "NL", amsterdam: "NL",
    portugal: "PT", lisbon: "PT", porto: "PT",
    australia: "AU", sydney: "AU", melbourne: "AU",
    canada: "CA", toronto: "CA", vancouver: "CA", montreal: "CA",
    singapore: "SG",
    taiwan: "TW", taipei: "TW",
    korea: "KR", "south korea": "KR", seoul: "KR",
    uae: "AE", emirates: "AE", dubai: "AE", "abu dhabi": "AE",
    mexico: "MX", "mexico city": "MX", "cdmx": "MX",
  });
  return out;
})();

/** Country name, city Echo has been told about, or ISO code in. Null when unwritten. */
export function countryFacts(place: string | null | undefined): CountryFacts | null {
  const t = (place ?? "").trim().toLowerCase();
  if (!t) return null;
  if (t.length === 2 && BY_CC[t.toUpperCase()]) return BY_CC[t.toUpperCase()];
  const cc = NAME_TO_CC[t];
  return cc ? (BY_CC[cc] ?? null) : null;
}

export function haveFactsFor(place: string | null | undefined): boolean {
  return countryFacts(place) != null;
}

export function countriesWritten(): string[] {
  return FACTS.map((f) => f.country);
}

export function noFactsWords(place: string | null | undefined): string {
  const named = (place ?? "").trim();
  const where = named ? named : "there";
  return `Echo has no kept notes for ${where}, so it will not put plugs, tipping or tax rules on it. Written up so far: ${countriesWritten().join(", ")}.`;
}

/** Which topics a question is actually asking about, so Echo answers that and not everything. */
export type FactTopic =
  | "plugs" | "driving" | "dates" | "clock" | "phone" | "tax" | "tipping" | "paying" | "fuel" | "sim" | "phrases";

const TOPIC_WORDS: Record<FactTopic, string[]> = {
  plugs: ["plug", "socket", "adapter", "adaptor", "voltage", "volt", "charger", "outlet", "hz"],
  driving: ["driving side", "drive on", "which side", "left or right", "steering", "rental car", "drive there"],
  dates: ["date format", "written date", "dd/mm", "mm/dd", "what does the date mean"],
  clock: ["24 hour", "24-hour", "12 hour", "12-hour", "am pm", "clock format", "military time"],
  phone: ["country code", "dialling code", "dialing code", "phone code", "calling code", "prefix"],
  tax: ["tax", "vat", "gst", "iva", "sales tax", "tax included", "included in the price", "shelf price"],
  tipping: ["tip", "tipping", "gratuity", "service charge"],
  paying: ["cash or card", "card accepted", "take cards", "contactless", "how do people pay", "payment", "transit card", "metro card"],
  fuel: ["fuel", "petrol", "gas price", "gasoline", "diesel", "per litre", "per liter", "per gallon"],
  sim: ["sim", "esim", "data plan", "mobile data", "phone plan"],
  phrases: ["phrase", "how do you say", "say hello", "language", "words", "thank you in"],
};

export function topicsAsked(text: string | null | undefined): FactTopic[] {
  const t = (text ?? "").toLowerCase();
  if (!t) return [];
  const hits: FactTopic[] = [];
  for (const [topic, words] of Object.entries(TOPIC_WORDS) as Array<[FactTopic, string[]]>) {
    if (words.some((w) => t.includes(w))) hits.push(topic);
  }
  return hits;
}

const LINE: Record<FactTopic, (f: CountryFacts) => string> = {
  plugs: (f) => `Plugs ${f.plugs}, ${f.voltage}.`,
  driving: (f) => `They drive on the ${f.driving}.`,
  dates: (f) => `Dates: ${f.date_format}.`,
  clock: (f) => `Clock: ${f.clock}.`,
  phone: (f) => `Country code ${f.phone}.`,
  tax: (f) => `Tax: ${f.tax}`,
  tipping: (f) => `Tipping: ${f.tipping}`,
  paying: (f) => `Paying: ${f.paying}`,
  fuel: (f) => `Fuel: ${f.fuel}`,
  sim: (f) => `SIM: ${f.sim}`,
  phrases: (f) =>
    f.phrases?.length
      ? `Phrases: ${f.phrases.map((p) => `${p.words} — ${p.means}`).join("; ")}.`
      : `Echo keeps no phrase list for ${f.country}.`,
};

/** The default spread when somebody just asks what they should know. */
const DEFAULT_TOPICS: FactTopic[] = ["plugs", "driving", "tax", "tipping", "paying", "phone"];

export function factsAnswer(place: string | null | undefined, question?: string | null): string {
  const f = countryFacts(place);
  if (!f) return noFactsWords(place);
  const asked = topicsAsked(question);
  const topics = asked.length ? asked : DEFAULT_TOPICS;
  const lines = topics.map((t) => LINE[t](f));
  const help = helpFor(f.cc);
  const emergency = help ? ` Emergency: ${help.general ?? help.police ?? ""}${help.note ? ` (${help.note})` : ""}`.trimEnd() : "";
  return [
    `${f.country}, as of ${f.checked_on}.`,
    ...lines,
    emergency,
    FACTS_LAW,
  ].filter(Boolean).join(" ");
}
