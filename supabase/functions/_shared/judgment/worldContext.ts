// worldContext — the one place practical world facts become stamped evidence.
//
// Doctrine:
//   - This is not a converter page, a tools menu or a world dashboard. It is a
//     read: hand-kept country notes, customs notes and emergency numbers walk
//     in, stamped WorldFacts walk out, and the existing worldBackbone contract
//     does the wording, the freshness and the disagreement.
//   - Region beats country when a region fact exists. In the US, sales tax and
//     tipping vary by state; the state row wins and says so. Elsewhere the same
//     rule applies to whatever the equivalent regional level is.
//   - A topic with nothing kept for it stays missing. No general knowledge is
//     poured into the hole.
//   - Nothing here is user-facing on its own and nothing here does IO.

import { countryFacts, type CountryFacts } from "../countryFacts.ts";
import { customsFor } from "../customs.ts";
import { helpFor } from "../localHelp.ts";
import type { SourceStamp } from "./situationSense.ts";
import {
  type WorldFact,
  type WorldTopic,
  reconcile,
  worldBlock,
  TOPIC_WORDS,
} from "./worldBackbone.ts";

/** A fact that is only true inside one state / province / region. */
export type RegionFact = {
  country: string;
  /** Region code or name as a person would say it: "VA", "Virginia". */
  region: string;
  topic: WorldTopic;
  value: string;
  checkedOn: string;
};

/**
 * Region rows kept by hand. Deliberately thin: every row here exists because
 * the country-level answer would be wrong or misleading inside that region.
 */
export const REGION_FACTS: RegionFact[] = [
  {
    country: "US", region: "VA", topic: "tax", checkedOn: "2026-09-17",
    value: "Virginia adds sales tax at the till: 5.3% most places, 6% or 7% in some areas, and a lower rate on groceries. The shelf price is not what you pay.",
  },
  {
    country: "US", region: "DC", topic: "tax", checkedOn: "2026-09-17",
    value: "Washington DC adds sales tax at the till, and restaurant meals carry a higher rate than shop goods.",
  },
  {
    country: "US", region: "DC", topic: "transport", checkedOn: "2026-09-17",
    value: "Metro and bus run on a tap card or a phone wallet; fares vary by distance and time of day.",
  },
];

function stampFor(source: string, checkedOn: string): SourceStamp {
  return { source, authority: "public", checkedOn };
}

/** Which country-note field feeds which backbone topic. */
const COUNTRY_TOPIC: Array<[WorldTopic, (f: CountryFacts) => string | null]> = [
  ["phone_format", (f) => f.phone],
  ["plugs", (f) => f.plugs],
  ["voltage", (f) => f.voltage],
  ["driving_side", (f) => `They drive on the ${f.driving}.`],
  ["date_format", (f) => f.date_format],
  ["clock_format", (f) => f.clock],
  ["tax", (f) => f.tax],
  ["tipping", (f) => f.tipping],
  ["payment", (f) => f.paying],
  ["transport", (f) => f.fuel],
  ["local_terms", (f) => (f.phrases?.length ? f.phrases.map((p) => `${p.words} — ${p.means}`).join("; ") : null)],
];

/**
 * Every fact Echo actually holds for a place, stamped. `region` narrows the
 * read; a region row replaces the country row for the same topic.
 */
export function worldFacts(
  country: string | null | undefined,
  region?: string | null,
): WorldFact[] {
  const facts = countryFacts(country);
  if (!facts) return [];
  const cc = facts.cc;
  const out: WorldFact[] = [];

  for (const [topic, read] of COUNTRY_TOPIC) {
    const value = read(facts);
    if (value && value.trim()) {
      out.push({ topic, country: cc, value: value.trim(), stamp: stampFor(`${facts.country} notes`, facts.checked_on) });
    }
  }

  const help = helpFor(cc);
  if (help) {
    const numbers = [
      help.general ? `${help.general} for anything` : null,
      help.police ? `${help.police} police` : null,
      help.ambulance ? `${help.ambulance} ambulance` : null,
      help.fire ? `${help.fire} fire` : null,
    ].filter(Boolean).join(", ");
    if (numbers) {
      out.push({
        topic: "emergency",
        country: cc,
        value: help.note ? `${numbers}. ${help.note}` : numbers,
        stamp: stampFor("kept emergency numbers", facts.checked_on),
      });
    }
  }

  const customs = customsFor(cc);
  if (customs?.tourist_pricing) {
    out.push({
      topic: "hours",
      country: cc,
      value: customs.tourist_pricing,
      stamp: stampFor(`${customs.country} customs notes`, customs.checked_on),
    });
  }

  const wanted = (region ?? "").trim().toUpperCase();
  if (wanted) {
    for (const row of REGION_FACTS) {
      if (row.country.toUpperCase() !== cc) continue;
      if (row.region.toUpperCase() !== wanted) continue;
      const idx = out.findIndex((f) => f.topic === row.topic);
      const fact: WorldFact = {
        topic: row.topic,
        country: cc,
        value: `${row.value} (${row.region})`,
        stamp: stampFor(`${row.region} notes`, row.checkedOn),
      };
      if (idx >= 0) out[idx] = fact;
      else out.push(fact);
    }
  }

  return reconcile(out).held;
}

/** True when a region row exists that would overrule the country answer. */
export function regionOverrules(
  country: string | null | undefined,
  region: string | null | undefined,
  topic: WorldTopic,
): boolean {
  const facts = countryFacts(country);
  if (!facts) return false;
  const wanted = (region ?? "").trim().toUpperCase();
  if (!wanted) return false;
  return REGION_FACTS.some(
    (r) => r.country.toUpperCase() === facts.cc && r.region.toUpperCase() === wanted && r.topic === topic,
  );
}

/**
 * The prompt block for a place. Empty-handed when nothing is kept, so a model
 * never fills the gap from general knowledge about a country.
 */
export function worldContextBlock(
  country: string | null | undefined,
  region?: string | null,
  now = new Date(),
): string {
  const facts = countryFacts(country);
  if (!facts) return "";
  const rows = worldFacts(country, region);
  if (!rows.length) return "";
  const head = region?.trim()
    ? `Where they are: ${facts.country}, ${region.trim()}. A regional note replaces the country note for the same topic.`
    : `Where they are: ${facts.country}.`;
  return [head, worldBlock(rows, facts.cc, now)].join("\n");
}

/** Plain words for a single topic Echo holds, or null when it holds nothing. */
export function worldTopicLine(
  country: string | null | undefined,
  region: string | null | undefined,
  topic: WorldTopic,
): string | null {
  const row = worldFacts(country, region).find((f) => f.topic === topic);
  if (!row) return null;
  return `${TOPIC_WORDS[topic]}: ${row.value}`;
}
