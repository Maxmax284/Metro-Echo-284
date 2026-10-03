// echoReads — the desk reads, defined once, executed once.
//
// Doctrine: one Echo. Ask and Telegram were two brains with different hands —
// Telegram ran a real server-side read loop and could hold a follow-up, while
// Ask fired a client intent that pasted a canned paragraph the model itself had
// never seen. Same question, two different answers, and no way to say "which one
// should I start with?" in Ask.
//
// So the read tools live here: one definition (so a description can never drift
// between surfaces) and one executor over the shared `workReads` helpers (so a
// count can never drift either). Every read is read-only by construction —
// nothing in this file writes, stages, or executes.

// Structural client type: keeps this module importable from both Deno (edge)
// and the Vite/vitest typecheck, which can't resolve https: specifiers.
type SupabaseClient = { from: (table: string) => any };
import {
  whatsWaiting,
  whatsDue,
  whatsChanged,
  projectStatus,
  whereYouStand,
  type ScopeArgs,
} from "./workReads.ts";
import { findNotes, formatNoteHits, whatWasDecided } from "./noteReads.ts";
import { fetchRates, moneyAnswer, toCode } from "./currency.ts";
import { helpAnswer } from "./localHelp.ts";
import { measureAnswer, parseMeasureAsk, shoeAnswer } from "./measures.ts";
import { factsAnswer } from "./countryFacts.ts";
import { troubleAnswer } from "./trouble.ts";
import { frictionAnswer, type Option } from "./friction.ts";
import { customsAnswer } from "./customs.ts";
import { housingAnswer, leaseWords, type Place } from "./housing.ts";
import { bankRead } from "./bankRead.ts";
import { bodyCompare, bodyRead } from "./bodyRead.ts";
import { reachWords } from "./reachBody.ts";
import { careRead } from "./careRead.ts";
import { flightRead } from "./flightRead.ts";
import { weatherRead } from "./weatherRead.ts";

/** Every read Echo can perform on the person's own desks. */
export const ECHO_READ_NAMES = [
  "whats_waiting",
  "whats_due",
  "whats_changed",
  "project_status",
  "find_note",
  "what_was_decided",
  "where_do_i_stand",
  "convert_money",
  "local_help",
  "body_read",
  "money_read",
  "care_nearby",
  "flights_prepared",
  "convert_measure",
  "how_things_work",
  "what_to_do",
  "compare_options",
  "local_customs",
  "cost_of_living",
  "lease_checks",
  "body_compare",
  "how_echo_reaches_you",
  "weather_read",
] as const;

export type EchoReadName = (typeof ECHO_READ_NAMES)[number];

export function isEchoRead(name: string): name is EchoReadName {
  return (ECHO_READ_NAMES as readonly string[]).includes(name);
}

/** The room a read answers from, so "Why this?" can name it in plain English. */
export const READ_SOURCE: Record<EchoReadName, string> = {
  whats_waiting: "what is waiting on you",
  whats_due: "your promises and their dates",
  whats_changed: "what moved recently",
  project_status: "one project's record",
  where_do_i_stand: "the whole board",
  find_note: "your captured notes",
  what_was_decided: "what your captures recorded as mattering",
  convert_money: "a published exchange rate, read just now",
  local_help: "the published emergency numbers for that country",
  body_read: "what your watch recorded",
  body_compare: "your recent readings against your own earlier days",
  how_echo_reaches_you: "the rules for which surface Echo speaks through",
  money_read: "what your bank recorded",
  care_nearby: "the emergency number for that country and the care you kept",
  flights_prepared: "the flights you prepared",
  convert_measure: "exact conversion factors Echo keeps written down",
  how_things_work: "kept practical notes for that country, with the day they were checked",
  what_to_do: "the kept playbook for that situation, with the day it was checked",
  compare_options: "the numbers you gave, compared on price, time and hassle",
  local_customs: "kept notes on local custom, with the day they were checked",
  cost_of_living: "the housing figures you gave, added up as real monthly cost",
  lease_checks: "the questions a lease has to answer before you sign",
  weather_read: "live model weather for your exact stamped coordinates",
};

/**
 * OpenAI-shaped function definitions. One copy, both surfaces, so Ask and
 * Telegram describe the same read with the same words.
 */
export const ECHO_READ_TOOLS = [
  {
    type: "function",
    function: {
      name: "whats_waiting",
      description:
        "Read-only: what is waiting on the user right now (drafts awaiting approval, overdue promises, Inbox items needing a lane). Use for 'what's waiting', 'what do I owe', 'anything on me'.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "whats_due",
      description:
        "Read-only: promises due soon or overdue. Use for 'what's due', 'what's slipping', 'anything this week'.",
      parameters: {
        type: "object",
        properties: { days: { type: "number", description: "How far ahead to look. Defaults to 7." } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "whats_changed",
      description:
        "Read-only: what moved recently across captures, promises, drafts and flagged items. Use for 'what changed', 'what have I missed'.",
      parameters: {
        type: "object",
        properties: { days: { type: "number", description: "How far back to look. Defaults to 7." } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "project_status",
      description: "Read-only: status of one project by name. Use for 'how's <project> going'.",
      parameters: {
        type: "object",
        properties: { project: { type: "string" } },
        required: ["project"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_note",
      description:
        "Read-only: find the user's own captured notes by keyword. Use for 'find the note where we discussed X', 'did I write anything about Y'.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Words to look for in the note." } },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "what_was_decided",
      description:
        "Read-only: what recent captures recorded as decisions, follow-ups and open questions. Use for 'what did we decide', 'pull out the follow-ups'. Reports only what was already recorded on the capture.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Optional subject to narrow to." },
          want: { type: "string", enum: ["decisions", "followUps", "all"] },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "where_do_i_stand",
      description:
        "Read-only: one compact read of where everything stands — what is waiting on them, what is open, what moved, what can wait, what is already handled. Use for 'where do I stand', 'give me the state of things', 'what actually needs me', 'catch me up'.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "convert_money",
      description:
        "Read-only: convert an amount between currencies using a published rate read at that moment. Use for 'what's 50 dollars in baht', 'how much is that in euros'. Never advises on money.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number" },
          from: { type: "string", description: "Currency code or word, e.g. USD or dollars." },
          to: { type: "string", description: "Currency code or word, e.g. THB or baht." },
        },
        required: ["amount", "from", "to"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "local_help",
      description:
        "Read-only: the published emergency numbers for a country, and what to say first. Use for 'who do I call here', 'what's the emergency number'. Echo never dials.",
      parameters: {
        type: "object",
        properties: { place: { type: "string", description: "Country name or two-letter code." } },
        required: ["place"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "body_read",
      description:
        "Read-only: what this person's watch recorded recently. Use for 'how did I sleep', 'what's my heart rate'. Reports recorded numbers only — never a diagnosis or advice.",
      parameters: {
        type: "object",
        properties: { days: { type: "number", description: "How far back to look. Defaults to 7." } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "money_read",
      description:
        "Read-only: balances and settled entries this person's own bank recorded, plus what the days spent. Use for 'what's my balance', 'can I afford', 'what did I spend'. Never moves money and never advises.",
      parameters: {
        type: "object",
        properties: { days: { type: "number", description: "How far back to look. Defaults to 30." } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "care_nearby",
      description:
        "Read-only: the published emergency number where this person is, plus the hospitals, clinics and pharmacies they kept. Use for 'where is the nearest hospital', 'I need a pharmacy', 'I need a doctor'. Echo never calls and never books.",
      parameters: {
        type: "object",
        properties: { place: { type: "string", description: "Country name or two-letter code, when the person named one." } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "flights_prepared",
      description:
        "Read-only: the flights this person prepared, their times and recorded prices, which airline actually flies each one, and what to do next in the terminal. Use for 'what flight am I on', 'where do I go', 'what do I look for on the board'. Echo never books, buys, or checks in.",
      parameters: {
        type: "object",
        properties: {
          said: {
            type: "string",
            description:
              "The person's own words, verbatim, when they named an airport or terminal — so Echo can say plainly if that is not the airport their journey leaves from.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "convert_measure",
      description:
        "Read-only: convert a measurement (distance, weight, volume, area, temperature, speed) using kept exact factors, and say what the number means to a person where a kept anchor supports it. Use for 'how many square feet is 42 m2', '180 lbs in kg', 'is 34C hot'. Also handles shoe sizing across US, UK, EU and centimetres.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "The measurement exactly as the person wrote it, e.g. '42 m2 to sqft'." },
          shoe_cut: { type: "string", description: "'men' or 'women', only for a shoe sizing question." },
          shoe_system: { type: "string", description: "'us', 'uk', 'eu' or 'cm', only for a shoe sizing question." },
          shoe_size: { type: "number", description: "The size given, only for a shoe sizing question." },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "how_things_work",
      description:
        "Read-only: the kept practical notes for a country — plugs and voltage, driving side, date and clock format, dialling code, whether tax is already in the price, tipping, how people pay, fuel units, SIM and eSIM, and a few phrases. Use for 'what plug do I need in Japan', 'do I tip in Thailand', 'is tax included there'. A country with no kept notes returns nothing rather than a guess.",
      parameters: {
        type: "object",
        properties: {
          place: { type: "string", description: "Country name, two-letter code, or a major city." },
          question: { type: "string", description: "The person's question, so only the topics asked about come back." },
        },
        required: ["place"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "what_to_do",
      description:
        "Read-only: the kept playbook for a real-life situation that just went wrong — lost wallet or passport, card declined or eaten by an ATM, dead phone, missed train or connection, hotel or taxi problem, locked out, missing package, power or internet out, flat tyre, broken appliance, doctor vs clinic vs pharmacy, prescription abroad, printing or notary, government office, delayed or damaged bag, 'is this fee normal'. Returns the first move, the order after it, what Echo still needs to know, and what Echo will not do. A situation with no kept playbook returns nothing rather than invented steps.",
      parameters: {
        type: "object",
        properties: {
          situation: { type: "string", description: "What went wrong, in the person's own words." },
        },
        required: ["situation"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_options",
      description:
        "Read-only: compare two or more real options on price, time, transfers and walking, and show the tradeoff. Use when the person is choosing between a bus, a train and a taxi, or between two ways of doing something, and you have actual numbers. Never invent a number — leave a field out and Echo will say it did not rank on it. The recommendation comes back labelled as a judgement.",
      parameters: {
        type: "object",
        properties: {
          options: {
            type: "array",
            description: "The options, each with whatever numbers are actually known.",
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "What this option is, e.g. 'bus'." },
                money: { type: "number", description: "Total cost. Leave out if unknown." },
                currency: { type: "string", description: "Three-letter currency code for money." },
                minutes: { type: "number", description: "Door-to-door minutes. Leave out if unknown." },
                transfers: { type: "number", description: "Number of changes." },
                walkMinutes: { type: "number", description: "Minutes on foot." },
                note: { type: "string", description: "Anything worth weighing that is not a number." },
              },
              required: ["label"],
              additionalProperties: false,
            },
          },
        },
        required: ["options"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "local_customs",
      description:
        "Read-only: kept notes on local custom — bargaining, dress, religious-space etiquette, queues, manners and formality, timekeeping, tourist pricing patterns, what service looks like, and how people expect to be contacted. Use for 'do people haggle here', 'what should I wear to the temple', 'is it rude to be late'. A country with nothing written returns nothing rather than a stereotype. Money norms like tipping and tax live in how_things_work.",
      parameters: {
        type: "object",
        properties: {
          place: { type: "string", description: "Country name, two-letter code, or a major city." },
          question: { type: "string", description: "The person's question, so only the topics asked about come back." },
        },
        required: ["place"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cost_of_living",
      description:
        "Read-only: what living somewhere really costs per month, from figures the person gives. Adds recurring lines (rent, utilities, internet, commute, fuel, parking, building fees, laundry, maintenance, local tax), keeps move-in cash (deposit, agency fee, move-in fee, furnishing) separate, and spreads the money they will not get back over the term. Compares two or more places when both are priced in the same money. Use for 'what does this place really cost', 'is this flat cheaper than that one'. Never invents a market rent or a bill.",
      parameters: {
        type: "object",
        properties: {
          places: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "What to call this place." },
                currency: { type: "string", description: "Three-letter code the figures are in." },
                termMonths: { type: "number", description: "Months on the contract." },
                depositReturned: { type: "boolean", description: "False when the deposit is gone for good." },
                recurring: {
                  type: "object",
                  description: "Monthly figures given by the person. Omit anything unknown.",
                  properties: {
                    rent: { type: "number" },
                    utilities: { type: "number" },
                    internet: { type: "number" },
                    commute: { type: "number" },
                    fuel: { type: "number" },
                    parking: { type: "number" },
                    hoa: { type: "number" },
                    laundry: { type: "number" },
                    maintenance: { type: "number" },
                    tax: { type: "number" },
                    other: { type: "number" },
                  },
                  additionalProperties: false,
                },
                oneOff: {
                  type: "object",
                  description: "Cash paid once, at the start.",
                  properties: {
                    deposit: { type: "number" },
                    agency_fee: { type: "number" },
                    move_in_fee: { type: "number" },
                    furnishing: { type: "number" },
                  },
                  additionalProperties: false,
                },
                notes: {
                  type: "array",
                  items: { type: "string" },
                  description: "Only what the person observed themselves.",
                },
              },
              required: ["label"],
              additionalProperties: false,
            },
          },
        },
        required: ["places"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lease_checks",
      description:
        "Read-only: the questions a lease or rental contract has to answer before signing — term and break clauses, penalties, deposit deductions, what is included, repairs, rent rises, restrictions, address registration, notice, condition report. Returns questions, never legal answers. Use for 'what should I check in this lease', 'anything I should watch for before I sign'.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "body_compare",
      description:
        "Read-only: how this person's recent recorded readings — sleep, training, activity, caffeine, hydration, heart rate and the rest — compare with their own earlier days. Use for 'how am I doing lately', 'am I sleeping less than usual', 'what changed with my training'. Observation only: it names what moved and never judges it, explains it, or advises.",
      parameters: {
        type: "object",
        properties: {
          recent_days: { type: "number", description: "The recent stretch to read. Defaults to 3." },
          usual_days: { type: "number", description: "How many earlier days count as usual. Defaults to 14." },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "how_echo_reaches_you",
      description:
        "Read-only: which surfaces Echo speaks through — phone, desk, watch, Telegram — what each one is for, where its edge is, and which ones are not built yet. Use for 'where will you tell me', 'can I approve this on my watch', 'do you work on earbuds'. States limits honestly and never claims an unbuilt surface.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "weather_read",
      description:
        "Read-only: live model weather (Open-Meteo) for the person's stamped ground — current temperature, sky condition, wind, today's high/low, timed rain windows, and a sea/ferry line. ALWAYS use this for weather, rain, forecast, temperature, storm, sea, ferry, beach or 'what is it like outside' questions — never answer those from general knowledge or a web search, which returns old news instead of the sky. Optionally takes a place name when the person asks about somewhere other than where they are.",
      parameters: {
        type: "object",
        properties: {
          place: { type: "string", description: "Optional place name. Omit to read the person's stamped ground." },
        },
        additionalProperties: false,
      },
    },
  },
] as const;

export type EchoReadContext = ScopeArgs & { tz?: string | null };

export type EchoReadResult = {
  name: EchoReadName;
  /** The read, already said in plain English by the shared formatter. */
  text: string;
  /** Where it came from, for "Why this?". */
  source: string;
};

/**
 * Run one read. Returns null for a name this module does not own, so a caller
 * can fall through to its own surface-specific tools without special-casing.
 */
export async function runEchoRead(
  sb: SupabaseClient,
  name: string,
  args: Record<string, unknown> | null | undefined,
  ctx: EchoReadContext,
): Promise<EchoReadResult | null> {
  if (!isEchoRead(name)) return null;
  const scope: ScopeArgs = { userId: ctx.userId, orgId: ctx.orgId };
  const a = args ?? {};
  const source = READ_SOURCE[name];

  switch (name) {
    case "whats_waiting": {
      const { text } = await whatsWaiting(sb, scope);
      return { name, text, source };
    }
    case "whats_due": {
      const { text } = await whatsDue(sb, scope, {
        days: Number(a.days) || 7,
        tz: ctx.tz || "UTC",
      });
      return { name, text, source };
    }
    case "whats_changed": {
      const { text } = await whatsChanged(sb, scope, { days: Number(a.days) || 7 });
      return { name, text, source };
    }
    case "project_status": {
      const { text } = await projectStatus(sb, scope, String(a.project ?? ""));
      return { name, text, source };
    }
    case "where_do_i_stand": {
      const { text } = await whereYouStand(sb, scope);
      return { name, text, source };
    }
    case "find_note": {
      const query = String(a.query ?? "");
      const hits = await findNotes(sb, scope, query);
      return { name, text: formatNoteHits(hits, query), source };
    }
    case "what_was_decided": {
      const text = await whatWasDecided(sb, scope, {
        query: a.query ? String(a.query) : undefined,
        want: (a.want as "decisions" | "followUps" | "all" | undefined) ?? "all",
      });
      return { name, text, source };
    }
    case "convert_money": {
      const from = toCode(String(a.from ?? ""));
      const to = toCode(String(a.to ?? ""));
      const amount = Number(a.amount);
      if (!from || !to || !Number.isFinite(amount) || amount <= 0) {
        return { name, text: "That conversion was not stated clearly enough to read a rate for.", source };
      }
      const rates = await fetchRates(from);
      return { name, text: moneyAnswer({ amount, from, to }, rates), source };
    }
    case "local_help": {
      return { name, text: helpAnswer(String(a.place ?? "")), source };
    }
    case "money_read": {
      const text = await bankRead(sb, scope, { days: Number(a.days) || 30 });
      return { name, text, source };
    }
    case "body_read": {
      const text = await bodyRead(sb, scope, { days: Number(a.days) || 7 });
      return { name, text, source };
    }
    case "care_nearby": {
      const text = await careRead(sb, scope, { place: a.place ? String(a.place) : null });
      return { name, text, source };
    }
    case "flights_prepared": {
      const text = await flightRead(sb, scope, a.said ? String(a.said) : null);
      return { name, text, source };
    }
    case "convert_measure": {
      const cut = String(a.shoe_cut ?? "").toLowerCase();
      const system = String(a.shoe_system ?? "").toLowerCase();
      const size = Number(a.shoe_size);
      if ((cut === "men" || cut === "women") && ["us", "uk", "eu", "cm"].includes(system) && Number.isFinite(size)) {
        return { name, text: shoeAnswer(cut as "men" | "women", system as "us" | "uk" | "eu" | "cm", size), source };
      }
      return { name, text: measureAnswer(parseMeasureAsk(String(a.text ?? ""))), source };
    }
    case "how_things_work": {
      const text = factsAnswer(String(a.place ?? ""), a.question ? String(a.question) : null);
      return { name, text, source };
    }
    case "what_to_do": {
      return { name, text: troubleAnswer(String(a.situation ?? "")), source };
    }
    case "compare_options": {
      const raw = Array.isArray(a.options) ? (a.options as Option[]) : [];
      return { name, text: frictionAnswer(raw), source };
    }
    case "local_customs": {
      const text = customsAnswer(String(a.place ?? ""), a.question ? String(a.question) : null);
      return { name, text, source };
    }
    case "cost_of_living": {
      const rows = Array.isArray(a.places) ? (a.places as Place[]) : [];
      return { name, text: housingAnswer(rows), source };
    }
    case "lease_checks": {
      return { name, text: leaseWords(), source };
    }
    case "how_echo_reaches_you": {
      return { name, text: reachWords(), source };
    }
    case "weather_read": {
      const text = await weatherRead(sb as never, scope, { place: a.place ? String(a.place) : null });
      return { name, text, source };
    }
    case "body_compare": {
      const text = await bodyCompare(sb, scope, {
        recentDays: Number(a.recent_days) || 3,
        usualDays: Number(a.usual_days) || 14,
      });
      return { name, text, source };
    }
  }
}

/**
 * The results, handed to the model as recorded fact before it writes a word.
 *
 * This is the whole point of reading server-side: the model answers *from* the
 * read instead of alongside it, so "which one first?" is a real follow-up rather
 * than a second guess.
 */
export function readsBlock(results: EchoReadResult[]): string {
  if (!results.length) return "";
  return [
    "Reads you just performed on this person's own desks. These are recorded facts — answer FROM them:",
    ...results.map((r) => `- [${r.name}] ${r.text}`),
    "Rules for using these reads:",
    "- Give ONE conclusion in your own words. Never paste a read back verbatim and never list one line per read.",
    "- Never restate a count these reads do not contain, and never round one up.",
    "- If a read came back empty, say plainly that nothing is there. Empty is a real answer.",
  ].join("\n");
}

/** The plain-English provenance line behind "Why this?". */
export function readProvenance(results: EchoReadResult[]): string[] {
  return results.map((r) => `Read ${r.source}`);
}
