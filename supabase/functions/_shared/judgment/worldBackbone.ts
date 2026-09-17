// worldBackbone — one source-aware slot for practical international facts.
//
// Doctrine:
//   - This is the backbone, not the content. It is where already-live country,
//     currency, help and travel data hangs, with one freshness and provenance
//     contract instead of six ad hoc ones. Filling in the missing world is the
//     next approved expansion, not this pass.
//   - Unknown says unknown. A missing plug type is never a guessed plug type.
//   - Current official or provider data beats any cultural generalisation. No
//     stereotypes, ever — a topic with no sourced fact is simply empty.
//
// Pure module.

import { type SourceStamp, freshnessWords, outranks } from "./situationSense.ts";

export type WorldTopic =
  | "emergency"
  | "currency"
  | "units"
  | "date_format"
  | "clock_format"
  | "phone_format"
  | "payment"
  | "tipping"
  | "tax"
  | "plugs"
  | "voltage"
  | "driving_side"
  | "transport"
  | "sizing"
  | "medicine_names"
  | "local_terms"
  | "hours";

export const WORLD_TOPICS: WorldTopic[] = [
  "emergency",
  "currency",
  "units",
  "date_format",
  "clock_format",
  "phone_format",
  "payment",
  "tipping",
  "tax",
  "plugs",
  "voltage",
  "driving_side",
  "transport",
  "sizing",
  "medicine_names",
  "local_terms",
  "hours",
];

export const TOPIC_WORDS: Record<WorldTopic, string> = {
  emergency: "emergency and non-emergency numbers",
  currency: "currency",
  units: "unit system",
  date_format: "how dates are written",
  clock_format: "how the clock is written",
  phone_format: "how phone numbers are written",
  payment: "how people actually pay",
  tipping: "tipping convention",
  tax: "tax shown on the price or added after",
  plugs: "plug type",
  voltage: "voltage",
  driving_side: "which side people drive on",
  transport: "how transport is paid for",
  sizing: "sizing",
  medicine_names: "what medicines are called locally",
  local_terms: "local terms worth knowing",
  hours: "business and service hours",
};

export type WorldFact = {
  topic: WorldTopic;
  /** Two-letter country code, uppercase. */
  country: string;
  /** The fact in plain words. */
  value: string;
  stamp: SourceStamp;
};

/** What is actually held for a country. Nothing is filled in. */
export function factsFor(facts: WorldFact[], country: string): WorldFact[] {
  const cc = country.trim().toUpperCase();
  return facts.filter((f) => f.country.trim().toUpperCase() === cc);
}

export function topicsKnown(facts: WorldFact[], country: string): WorldTopic[] {
  return [...new Set(factsFor(facts, country).map((f) => f.topic))];
}

export function topicsMissing(facts: WorldFact[], country: string): WorldTopic[] {
  const known = new Set(topicsKnown(facts, country));
  return WORLD_TOPICS.filter((t) => !known.has(t));
}

/**
 * When two sources say different things, the more authoritative and fresher one
 * wins — and disagreement is returned, not smoothed over.
 */
export function reconcile(
  facts: WorldFact[],
  now = new Date(),
): { held: WorldFact[]; disagreements: Array<{ topic: WorldTopic; country: string; values: WorldFact[] }> } {
  const groups = new Map<string, WorldFact[]>();
  for (const f of facts) {
    const key = `${f.country.trim().toUpperCase()}:${f.topic}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const held: WorldFact[] = [];
  const disagreements: Array<{ topic: WorldTopic; country: string; values: WorldFact[] }> = [];
  for (const rows of groups.values()) {
    const winner = rows.reduce((best, next) => (outranks(next.stamp, best.stamp, now) ? next : best));
    held.push(winner);
    const differing = rows.filter((r) => r.value.trim().toLowerCase() !== winner.value.trim().toLowerCase());
    if (differing.length) {
      disagreements.push({ topic: winner.topic, country: winner.country, values: rows });
    }
  }
  return { held, disagreements };
}

export function worldFactLine(fact: WorldFact, now = new Date()): string {
  const fresh = freshnessWords(fact.stamp, now);
  return `${TOPIC_WORDS[fact.topic]}: ${fact.value} — ${fact.stamp.source}${fresh ? `, ${fresh}` : ""}.`;
}

/** Recorded fact for a prompt. Says what is not held, so nothing is invented. */
export function worldBlock(facts: WorldFact[], country: string, now = new Date()): string {
  const rows = factsFor(facts, country);
  if (!rows.length) {
    return `Local practical facts for ${country.toUpperCase()}: none recorded. Say that plainly. Do not fill it in from general knowledge about the country.`;
  }
  const missing = topicsMissing(facts, country);
  return [
    `Local practical facts for ${country.toUpperCase()} (recorded, with source and freshness):`,
    ...rows.map((f) => `- ${worldFactLine(f, now)}`),
    missing.length ? `- Not recorded: ${missing.map((t) => TOPIC_WORDS[t]).join(", ")}. Say so rather than generalising.` : "",
    "Current local or official data beats any cultural generalisation. Never speak about people, only about published practicalities.",
  ].filter(Boolean).join("\n");
}
