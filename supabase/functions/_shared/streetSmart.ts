// streetSmart — the everyday-life layer.
//
// Doctrine:
//   - One layer, not seven bolt-ons. Every part of ordinary life Echo touches
//     (money, movement, the roof over your head, your body, the messaging rails)
//     is one row in one registry, so a new life area plugs in instead of adding
//     another engine.
//   - No fake capability. A row is live only when a recorded fact says the source
//     behind it is readable. Everything else says needs connecting, or not built,
//     with the real reason.
//   - Nothing here executes. Every row is a read or a preparation; consequential
//     things still stop at your yes in Work.
//
// Pure module: no IO, no React. Facts are handed in by the caller.

export type DomainState = "live" | "needs_connecting" | "not_yet";

export type LifeDomain = {
  id: string;
  /** What life area this is, in the person's words. */
  label: string;
  /** What Echo does with it. */
  plain: string;
  state: DomainState;
  /** Recorded reason it is not live. Never a guess. */
  because?: string;
  /** The law that limits it, when one applies. */
  limit?: string;
  /** What has to arrive before it can go live. */
  needs?: string;
};

export type LifeFacts = {
  /** A bank rail is connected (Plaid or equivalent). */
  bank: boolean;
  /** Public currency rates are reachable. */
  rates: boolean;
  /** A flight-status provider key is configured. */
  flights: boolean;
  /** A place has actually been recorded for this person. */
  place: boolean;
  /** Any wearable reading has been recorded. */
  body: boolean;
  /** A WhatsApp Business rail is connected. */
  whatsapp: boolean;
  /** A calendar is being read (the roof/stay read runs off it). */
  calendar: boolean;
};

export function lifeDomains(f: LifeFacts): LifeDomain[] {
  return [
    {
      id: "money_convert",
      label: "Money in the currency you're standing in",
      plain: "Converts an amount between currencies and says what the rate was when it read it.",
      state: f.rates ? "live" : "needs_connecting",
      because: f.rates ? undefined : "Public rates could not be read.",
      limit: "A published rate, not the rate your card will give you.",
    },
    {
      id: "money_bank",
      label: "What your accounts actually say",
      plain: "Would read balances and recent transactions so a promise can be checked against real money.",
      state: f.bank ? "live" : "needs_connecting",
      because: f.bank ? undefined : "No bank rail is connected.",
      needs: "A bank connection (Plaid client id and secret).",
      limit: "Read only. Echo would never move money.",
    },
    {
      id: "move_flight",
      label: "Where a flight actually is",
      plain:
        "Prepares a flight from the times and prices you paste, holds it until you confirm, then records departure and landing on your board. Live status, gates and delays would need a provider.",
      state: f.flights ? "live" : "needs_connecting",
      because: f.flights ? undefined : "No flight provider is configured.",
      needs: "A flight-data key.",
      limit: "Reads status. Never checks you in, never rebooks.",
    },
    {
      id: "ground_help",
      label: "Help where you're standing",
      plain:
        "Says the emergency number for the country you're actually in, and finds the hospitals, clinics and pharmacies nearest to where you're standing.",
      state: "live",
      limit: "Says the number and where care is. It never dials, never books, and never advises on treatment.",
    },
    {
      id: "ground_roof",
      label: "The roof over your head",
      plain: "Knows the stay you're in the middle of, when it ends, and what happens after it.",
      state: f.calendar ? "live" : "needs_connecting",
      because: f.calendar ? undefined : "No calendar is being read yet.",
      limit: "Reads the stay from your own records. It books nothing.",
    },
    {
      id: "body",
      label: "How your body is holding up",
      plain: "Reads what your watch recorded and says plainly when it says nothing.",
      state: f.body ? "live" : "needs_connecting",
      because: f.body ? undefined : "No readings have arrived from a watch yet.",
      limit: "Not medical advice, and never a diagnosis.",
    },
    {
      id: "rail_whatsapp",
      label: "Capture over WhatsApp",
      plain: "Would take capture on the rail most people already live on, same as Telegram does now.",
      state: f.whatsapp ? "live" : "needs_connecting",
      because: f.whatsapp ? undefined : "No WhatsApp Business number is connected.",
      needs: "A WhatsApp Business number with API access.",
      limit: "Capture only. Nothing would ever run from a message.",
    },
  ];
}

/** One honest sentence about the everyday-life layer. */
export function lifeLine(rows: LifeDomain[]): string {
  const live = rows.filter((r) => r.state === "live").length;
  const waiting = rows.filter((r) => r.state === "needs_connecting").length;
  if (live === 0) return "Nothing in everyday life is wired up yet.";
  const head = `${live} everyday ${live === 1 ? "thing" : "things"} Echo can read now`;
  return waiting ? `${head}, ${waiting} waiting on a connection.` : `${head}.`;
}

function word(state: DomainState): string {
  if (state === "live") return "now";
  if (state === "needs_connecting") return "needs connecting";
  return "not yet";
}

/** The chat-shaped answer, for Ask and Telegram. */
export function lifeAnswer(rows: LifeDomain[]): string {
  return [
    lifeLine(rows),
    ...rows.map((r) => {
      const tail = [r.because, r.needs ? `Needs: ${r.needs}` : "", r.limit].filter(Boolean).join(" ");
      return `• ${r.label} — ${word(r.state)}. ${r.plain}${tail ? ` ${tail}` : ""}`;
    }),
    "Nothing on this list acts on its own.",
  ].join("\n");
}

/** Recorded fact for the prompt. */
export function lifeBlock(rows: LifeDomain[]): string {
  return [
    "Everyday life you can reach (recorded fact — never promise a row marked needs connecting or not yet):",
    ...rows.map((r) => `- ${r.label}: ${word(r.state)}. ${r.plain}${r.because ? ` ${r.because}` : ""}${r.limit ? ` ${r.limit}` : ""}`),
    "Answer shortest useful form. Say plainly what is missing rather than implying it works.",
  ].join("\n");
}

const LIFE_QUESTION =
  /(can you (see|read|check) my (bank|money|account)|what about my (money|health|body|flight)|street ?smart|everyday life|what can you do (about|with) my (life|money|health))/i;

export function matchLifeQuestion(text: string | null | undefined): boolean {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t ? LIFE_QUESTION.test(t) : false;
}
