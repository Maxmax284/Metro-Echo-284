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
import { bankRead } from "./bankRead.ts";
import { bodyRead } from "./bodyRead.ts";
import { careRead } from "./careRead.ts";
import { flightRead } from "./flightRead.ts";

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
  money_read: "what your bank recorded",
  care_nearby: "the emergency number for that country and the care you kept",
  flights_prepared: "the flights you prepared",
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
        "Read-only: the flights this person prepared, their times and recorded prices, and which are still waiting on their yes. Use for 'what flight am I on', 'did I confirm that flight'. Echo never books, buys, or checks in.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
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
      const text = await flightRead(sb, scope);
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
