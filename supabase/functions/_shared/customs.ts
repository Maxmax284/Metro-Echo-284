// customs — how people actually behave where you are standing.
//
// Doctrine:
//   - Kept by hand, stamped with the day it was checked. No model wrote a row.
//   - A country with nothing written gets no guess. Silence over a stereotype.
//   - These are norms, not verdicts on people. Every row is written as "what is
//     usual", never as "what they are like".
//   - Where a norm varies inside a country, the row says so instead of picking.
//
// Money-facing norms (tipping, tax in the price, how people pay) stay in
// countryFacts, which is the one place they live. This module covers the social
// side: bargaining, dress, religious spaces, queues, formality, punctuality,
// tourist pricing patterns and what service looks like.
//
// Pure module: no IO, no React.

import { countryFacts } from "./countryFacts.ts";

export const CUSTOMS_LAW =
  "Kept notes on what is usual, with the day they were checked. Norms vary by city, age and setting — read them as a starting point, not a rule about people.";

export type CustomsTopic =
  | "bargaining"
  | "dress"
  | "religious"
  | "queue"
  | "formality"
  | "punctuality"
  | "tourist_pricing"
  | "service"
  | "contact";

export type Customs = {
  cc: string;
  country: string;
  checked_on: string;
} & Partial<Record<CustomsTopic, string>>;

const CHECKED = "2026-09-16";

const ROWS: Customs[] = [
  {
    cc: "US", country: "United States", checked_on: CHECKED,
    bargaining: "Fixed prices nearly everywhere. Haggling is normal only for cars, furniture, and private sales.",
    dress: "Casual is accepted in most places. Smart-casual for nicer restaurants; a jacket is rarely required.",
    religious: "Cover shoulders in a church; nobody will stop you at the door in most denominations.",
    queue: "Single line, strictly in order, and cutting gets called out loudly.",
    formality: "First names immediately, including with people much older or senior. Small talk with strangers is normal, not intrusive.",
    punctuality: "On time means on time for business. Social invitations run ten to fifteen minutes late without comment.",
    tourist_pricing: "Rare outside airports and tourist strips. The usual sting is added tax and tips, not a different price.",
    service: "Attentive and fast, and staff are paid on the assumption of a tip. Being checked on repeatedly is service, not pressure.",
    contact: "Texting is default. An unannounced phone call reads as urgent; showing up unannounced is unusual.",
  },
  {
    cc: "GB", country: "United Kingdom", checked_on: CHECKED,
    bargaining: "Fixed prices. Markets and second-hand sales are the exception.",
    dress: "Casual almost everywhere. A few restaurants and clubs enforce no-trainers rules.",
    religious: "Churches and cathedrals are open and relaxed; mosques and temples expect covered shoulders and removed shoes.",
    queue: "Queueing is close to a moral matter. Join the back, do not hover.",
    formality: "First names quickly, plus a lot of understatement. 'Not bad' is praise; 'interesting' can be a warning.",
    punctuality: "On time for meetings. Social 'sevenish' means quarter past.",
    tourist_pricing: "Uncommon. Watch instead for discretionary service charges already added to a bill.",
    service: "Polite and unhurried. You usually have to ask for the bill; it will not arrive on its own.",
    contact: "Text or message first. Cold-calling a mobile is intrusive.",
  },
  {
    cc: "TH", country: "Thailand", checked_on: CHECKED,
    bargaining: "Normal in markets and for street goods and unmetered rides. Not in malls, supermarkets, 7-Eleven, or restaurants. Stay smiling — pushing hard loses you the room.",
    dress: "Loose and light, and cover up away from the beach. Beachwear in a shop or a temple reads badly.",
    religious: "Temples: shoulders and knees covered, shoes off, do not point your feet at a Buddha image or climb on one. Never touch a monk if you are a woman; monks avoid contact.",
    queue: "Orderly queues in transit and shops; loose ones at street stalls.",
    formality: "A wai returned politely goes a long way. Public anger loses face for everyone present — the calmer person wins the exchange.",
    punctuality: "Business runs on time. Social plans are elastic, and traffic is an accepted reason.",
    tourist_pricing: "Real and common in tourist areas: dual pricing at some attractions is posted openly, and unmetered taxi and tuk-tuk quotes run several times the meter. Ask for the meter, or agree the number first.",
    service: "Warm and non-confrontational. A 'no' often arrives as a soft answer rather than a refusal.",
    contact: "LINE is the default channel for almost everything, including businesses.",
  },
  {
    cc: "JP", country: "Japan", checked_on: CHECKED,
    bargaining: "Not done. A posted price is the price, including at most markets. Asking for a discount is awkward, not shrewd.",
    dress: "Neat and covered. Overly casual clothing stands out in offices and nicer restaurants more than it does elsewhere.",
    religious: "Shrines and temples: bow at the gate, wash hands at the basin, shoes off where indicated, and keep your voice down. Photography rules are posted and enforced.",
    queue: "Strict, marked, and respected — including on train platforms, where the floor tells you where to stand.",
    formality: "Surnames plus -san until told otherwise. Business cards are handed over with both hands and read, not pocketed.",
    punctuality: "Early is on time. Trains run to the minute, and so do meetings.",
    tourist_pricing: "Very rare; prices are posted and the same for everyone.",
    service: "Precise and formal. Tipping is not part of it, and staff will chase you to return money.",
    contact: "LINE for personal messaging. Email stays formal, phone calls for business hours only.",
  },
  {
    cc: "DE", country: "Germany", checked_on: CHECKED,
    bargaining: "Fixed prices. Flea markets and private sales are the exception.",
    dress: "Practical and unshowy. Smart-casual is safe for anything formal.",
    religious: "Churches are quiet spaces; cover shoulders and keep the noise down, especially during services.",
    queue: "Orderly. At bakeries and counters, the order of arrival is remembered and enforced by other customers.",
    formality: "Sie and surnames until invited otherwise, especially with anyone older or in an official role. Directness is courtesy, not rudeness.",
    punctuality: "Punctuality is taken seriously. Five minutes late needs a message.",
    tourist_pricing: "Rare. Watch instead for charged tap water and paid public toilets.",
    service: "Efficient and unfussy. You will not be checked on repeatedly, and you ask for the bill.",
    contact: "WhatsApp personally, email professionally, and Sunday quiet hours are real.",
  },
  {
    cc: "FR", country: "France", checked_on: CHECKED,
    bargaining: "Fixed prices. Brocantes and markets allow a little.",
    dress: "Put-together matters more than expensive. Sportswear outside sport stands out.",
    religious: "Churches are open and free; cover shoulders, stay quiet, and do not wander during a service.",
    queue: "Orderly, with a little more tolerance for a friendly interruption at counters.",
    formality: "Always open with bonjour before anything else — skipping it is the single most common way visitors get a cold reception. Vous until invited to tu.",
    punctuality: "On time for business, fifteen minutes late for a dinner invitation is normal politeness.",
    tourist_pricing: "Watch terrace pricing near landmarks and posted rates for a seat versus the bar counter.",
    service: "Professional rather than chatty. The bill comes when you ask.",
    contact: "WhatsApp personally. Business hours are respected and August is genuinely quiet.",
  },
  {
    cc: "IT", country: "Italy", checked_on: CHECKED,
    bargaining: "Fixed in shops; markets allow some. Never in a restaurant.",
    dress: "Dress well; it is noticed. Beachwear stays at the beach.",
    religious: "Churches enforce covered shoulders and knees, sometimes at the door. Carry a light layer in summer.",
    queue: "Loose in practice. Say who is next if it is unclear.",
    formality: "Lei with strangers and officials, first names quickly among peers. Greetings are warm and physical.",
    punctuality: "Business is punctual, social plans are flexible.",
    tourist_pricing: "Check for coperto (a per-person cover charge) and service on the bill, and for the price difference between standing at the bar and sitting down.",
    service: "Sociable and unhurried. Nobody will rush you out of a table.",
    contact: "WhatsApp for nearly everything, including small businesses.",
  },
  {
    cc: "ES", country: "Spain", checked_on: CHECKED,
    bargaining: "Fixed prices; markets allow a little.",
    dress: "Casual but tidy. Cover up away from the beach.",
    religious: "Cathedrals often charge entry and enforce covered shoulders.",
    queue: "Ask '¿quién es el último?' at counters — the queue is remembered, not physical.",
    formality: "First names quickly, tú widely, usted with the elderly and officials.",
    punctuality: "Business punctual; social plans late, and the day runs later than most visitors expect.",
    tourist_pricing: "Terrace-versus-bar pricing and tourist-menu markups near landmarks.",
    service: "Relaxed. Ask for the bill; it is rude to bring it early.",
    contact: "WhatsApp for everything.",
  },
  {
    cc: "NL", country: "Netherlands", checked_on: CHECKED,
    bargaining: "Fixed prices.",
    dress: "Practical, cycling-friendly, unpretentious.",
    religious: "Churches are relaxed and often part-museum.",
    queue: "Orderly and quiet.",
    formality: "Very direct, first names fast. Blunt feedback is not hostility.",
    punctuality: "On time, and appointments are made for most things — including seeing friends.",
    tourist_pricing: "Rare beyond central Amsterdam.",
    service: "Efficient, informal, not attentive.",
    contact: "WhatsApp, and a diary invitation rather than a spontaneous visit.",
  },
  {
    cc: "AE", country: "United Arab Emirates", checked_on: CHECKED,
    bargaining: "Expected in souks and for gold, electronics and taxis without a meter. Not in malls.",
    dress: "Modest in public: shoulders and knees covered in malls and government buildings. Beachwear at the beach and pool only.",
    religious: "Mosque visits need modest dress and a headscarf for women. During Ramadan, no eating, drinking or smoking in public in daylight.",
    queue: "Orderly, with separate queues for women and families in some offices.",
    formality: "Formal greetings and titles. Right hand for giving and receiving. Public displays of affection are not acceptable.",
    punctuality: "Business is punctual; social timing is looser. Fridays are the religious day.",
    tourist_pricing: "Souk quotes start high; taxis are metered and cheap by comparison.",
    service: "Formal and attentive.",
    contact: "WhatsApp for nearly everything, including businesses and government replies.",
  },
  {
    cc: "KR", country: "South Korea", checked_on: CHECKED,
    bargaining: "Rare. Traditional markets allow some; shops do not.",
    dress: "Neat and current. Covered shoulders are more usual than not.",
    religious: "Temples: shoes off in halls, quiet, no photos where marked.",
    queue: "Strict and marked, especially on transit.",
    formality: "Age and seniority shape address. Two hands when giving or receiving, and the younger or junior person pours.",
    punctuality: "Punctual, and work runs late.",
    tourist_pricing: "Uncommon; prices are posted.",
    service: "Fast, efficient, call-button culture in restaurants. No tipping.",
    contact: "KakaoTalk is the default for everything.",
  },
  {
    cc: "SG", country: "Singapore", checked_on: CHECKED,
    bargaining: "Fixed prices except at a few markets and electronics shops.",
    dress: "Light and casual, air-conditioning cold indoors.",
    religious: "A mix of temples, mosques and churches — shoes off and covered shoulders where posted.",
    queue: "Serious queueing. A packet of tissues on a hawker table means the seat is taken.",
    formality: "Polite and mixed. English works everywhere.",
    punctuality: "On time.",
    tourist_pricing: "Rare. Fines for small public offences, however, are real and enforced.",
    service: "Efficient. Service charge is often already on the bill.",
    contact: "WhatsApp.",
  },
  {
    cc: "MX", country: "Mexico", checked_on: CHECKED,
    bargaining: "Normal in markets and for crafts, not in shops or restaurants. Stay friendly about it.",
    dress: "Casual; smarter in cities and in churches.",
    religious: "Churches are active places of worship — cover shoulders, quiet, no photos during mass.",
    queue: "Orderly in banks and offices, informal on the street.",
    formality: "Usted with strangers and elders, warm greetings, and small talk before business.",
    punctuality: "Business punctual, social plans generously late.",
    tourist_pricing: "Common in resort areas: agree taxi fares before getting in and check whether a menu has a separate tourist price.",
    service: "Warm and attentive; tipping is expected.",
    contact: "WhatsApp for everything, businesses included.",
  },
];

const BY_CC: Record<string, Customs> = (() => {
  const out: Record<string, Customs> = {};
  for (const r of ROWS) out[r.cc] = r;
  return out;
})();

/** Country, city or code in. Null when nothing is written for it. */
export function customsFor(place: string | null | undefined): Customs | null {
  const t = (place ?? "").trim();
  if (!t) return null;
  if (t.length === 2 && BY_CC[t.toUpperCase()]) return BY_CC[t.toUpperCase()];
  const facts = countryFacts(t);
  return facts ? (BY_CC[facts.cc] ?? null) : null;
}

export function customsWritten(): string[] {
  return ROWS.map((r) => r.country);
}

export function noCustomsWords(place: string | null | undefined): string {
  const named = (place ?? "").trim();
  return [
    `Echo keeps no notes on local custom for ${named || "there"}, and it will not fill the gap with a stereotype.`,
    `Written up so far: ${customsWritten().join(", ")}.`,
  ].join(" ");
}

const TOPIC_WORDS: Record<CustomsTopic, string[]> = {
  bargaining: ["bargain", "haggle", "negotiate the price", "discount", "market price"],
  dress: ["what should i wear", "dress code", "dress", "shorts", "cover up", "clothing"],
  religious: ["temple", "mosque", "church", "shrine", "religious", "ramadan", "shoes off"],
  queue: ["queue", "line up", "cut in line", "waiting line"],
  formality: ["formal", "polite", "manners", "etiquette", "rude", "how to greet", "greeting", "first names"],
  punctuality: ["late", "on time", "punctual", "lateness", "showing up"],
  tourist_pricing: ["tourist price", "tourist priced", "ripped off", "dual pricing", "am i being charged more", "overcharged"],
  service: ["service", "waiter", "how does service work", "attentive"],
  contact: ["call or text", "whatsapp", "messaging", "should i call", "line app", "kakao"],
};

export function customsTopicsAsked(text: string | null | undefined): CustomsTopic[] {
  const t = (text ?? "").toLowerCase();
  if (!t) return [];
  const hits: CustomsTopic[] = [];
  for (const [topic, words] of Object.entries(TOPIC_WORDS) as Array<[CustomsTopic, string[]]>) {
    if (words.some((w) => t.includes(w))) hits.push(topic);
  }
  return hits;
}

const LABEL: Record<CustomsTopic, string> = {
  bargaining: "Bargaining",
  dress: "Dress",
  religious: "Religious spaces",
  queue: "Queues",
  formality: "Manners",
  punctuality: "Timekeeping",
  tourist_pricing: "Tourist pricing",
  service: "Service",
  contact: "Reaching people",
};

const DEFAULT_TOPICS: CustomsTopic[] = ["formality", "dress", "bargaining", "punctuality", "tourist_pricing"];

/** One answer, only on the topics asked about, only where a row exists. */
export function customsAnswer(place: string | null | undefined, question?: string | null): string {
  const c = customsFor(place);
  if (!c) return noCustomsWords(place);
  const asked = customsTopicsAsked(question);
  const topics = (asked.length ? asked : DEFAULT_TOPICS).filter((t) => !!c[t]);
  if (!topics.length) {
    return `Echo has notes on ${c.country} but nothing written on what you asked about. ${CUSTOMS_LAW}`;
  }
  return [
    `${c.country}, as of ${c.checked_on}.`,
    ...topics.map((t) => `${LABEL[t]}: ${c[t]}`),
    CUSTOMS_LAW,
  ].join(" ");
}
