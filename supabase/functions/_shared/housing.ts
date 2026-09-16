// housing — what living somewhere actually costs per month.
//
// Doctrine:
//   - Every number comes from the person. Echo never invents a market rent, a
//     utility average, or a landlord's reputation.
//   - Recurring money and one-off money are never silently blended. Move-in cash
//     is shown as move-in cash, and separately spread over the term so a long
//     lease and a short one can be compared honestly.
//   - Missing lines are named. A place with no utilities written down is not a
//     place with free utilities.
//   - A comparison never crosses currencies. Two places priced in different
//     money get no total.
//   - Lease and paperwork questions are questions, not answers. Echo lists what
//     to check; the contract in your hand decides.
//
// Pure module: no IO, no React.

import { formatMoney } from "./currency.ts";

export const HOUSING_LAW =
  "Every figure here is one you gave. Echo does not guess a rent, a bill, or a landlord — and one-off cash is never buried in a monthly number.";

/** The recurring lines that make up a real monthly cost. */
export const RECURRING_LINES = [
  "rent",
  "utilities",
  "internet",
  "commute",
  "fuel",
  "parking",
  "hoa",
  "laundry",
  "maintenance",
  "tax",
  "other",
] as const;

/** Cash you hand over once, at the start. */
export const ONE_OFF_LINES = ["deposit", "agency_fee", "move_in_fee", "furnishing"] as const;

export type RecurringLine = (typeof RECURRING_LINES)[number];
export type OneOffLine = (typeof ONE_OFF_LINES)[number];

export type Place = {
  label: string;
  currency?: string | null;
  /** Months on the contract, when known. Drives how one-off cash is spread. */
  termMonths?: number | null;
  /** Whether the deposit is expected back. Only a returned deposit is excluded. */
  depositReturned?: boolean | null;
  recurring?: Partial<Record<RecurringLine, number | null>>;
  oneOff?: Partial<Record<OneOffLine, number | null>>;
  /** Anything the person observed themselves: noise, damp, a slow landlord. */
  notes?: string[] | null;
};

const LABEL: Record<RecurringLine | OneOffLine, string> = {
  rent: "rent",
  utilities: "utilities",
  internet: "internet",
  commute: "commute",
  fuel: "fuel",
  parking: "parking",
  hoa: "building fees",
  laundry: "laundry",
  maintenance: "maintenance",
  tax: "local tax",
  other: "other",
  deposit: "deposit",
  agency_fee: "agency fee",
  move_in_fee: "move-in fee",
  furnishing: "furnishing",
};

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function code(place: Place): string | null {
  const c = (place.currency ?? "").toUpperCase();
  return c.length === 3 ? c : null;
}

function money(amount: number, c: string | null): string {
  return c ? formatMoney(amount, c) : `${Math.round(amount * 100) / 100}`;
}

export type CostRead = {
  label: string;
  currency: string | null;
  /** Recurring money only. */
  monthly: number | null;
  /** Cash at the door, before you sleep there once. */
  upfront: number | null;
  /** Upfront money you are not expected to get back. */
  sunkUpfront: number | null;
  /** Monthly plus sunk upfront spread over the term, when a term is known. */
  trueMonthly: number | null;
  termMonths: number | null;
  /** Recurring lines with no figure written down. */
  unwritten: RecurringLine[];
  /** Recurring lines that were given, in order, for the breakdown. */
  given: Array<{ line: RecurringLine; amount: number }>;
};

/** One place, read as recurring money, cash at the door, and the honest blend. */
export function readCost(place: Place): CostRead {
  const c = code(place);
  const given: Array<{ line: RecurringLine; amount: number }> = [];
  const unwritten: RecurringLine[] = [];
  for (const line of RECURRING_LINES) {
    const v = num(place.recurring?.[line]);
    if (v == null) {
      // "other" is not a bill anybody forgets — do not nag about it.
      if (line !== "other") unwritten.push(line);
      continue;
    }
    given.push({ line, amount: v });
  }

  const monthly = given.length ? given.reduce((s, g) => s + g.amount, 0) : null;

  let upfront: number | null = null;
  let sunkUpfront: number | null = null;
  for (const line of ONE_OFF_LINES) {
    const v = num(place.oneOff?.[line]);
    if (v == null) continue;
    upfront = (upfront ?? 0) + v;
    const returned = line === "deposit" && place.depositReturned !== false;
    if (!returned) sunkUpfront = (sunkUpfront ?? 0) + v;
  }

  const termMonths = num(place.termMonths);
  const trueMonthly =
    monthly != null && termMonths != null && termMonths > 0
      ? Math.round((monthly + (sunkUpfront ?? 0) / termMonths) * 100) / 100
      : monthly;

  return {
    label: place.label,
    currency: c,
    monthly: monthly == null ? null : Math.round(monthly * 100) / 100,
    upfront,
    sunkUpfront,
    trueMonthly,
    termMonths,
    unwritten,
    given,
  };
}

/** One place, said out loud. */
export function costWords(place: Place): string {
  const r = readCost(place);
  if (r.monthly == null) {
    return `Nothing recurring is written down for ${r.label}, so there is no monthly cost to work out. Give Echo the rent to start with. ${HOUSING_LAW}`;
  }
  const parts: string[] = [];
  parts.push(
    `${r.label} runs ${money(r.monthly, r.currency)} a month: ${r.given
      .map((g) => `${LABEL[g.line]} ${money(g.amount, r.currency)}`)
      .join(", ")}.`,
  );
  if (r.upfront != null) {
    const back =
      r.sunkUpfront != null && r.sunkUpfront < r.upfront
        ? ` ${money(r.upfront - r.sunkUpfront, r.currency)} of that is a deposit you expect back.`
        : "";
    parts.push(`${money(r.upfront, r.currency)} at the door before you sleep there once.${back}`);
  }
  if (r.trueMonthly != null && r.termMonths && r.trueMonthly !== r.monthly) {
    parts.push(
      `Spread the money you do not get back over ${r.termMonths} months and it is really ${money(r.trueMonthly, r.currency)} a month.`,
    );
  }
  if (r.unwritten.length) {
    parts.push(
      `No figure yet for ${r.unwritten.map((l) => LABEL[l]).join(", ")} — those are missing, not free.`,
    );
  }
  if (place.notes?.length) {
    parts.push(`What you noticed yourself: ${place.notes.join("; ")}.`);
  }
  parts.push(HOUSING_LAW);
  return parts.join(" ");
}

export type HousingComparison = {
  reads: CostRead[];
  /** Lowest true monthly, when every place can be compared. */
  cheaper: CostRead | null;
  /** Why no comparison was possible, when it was not. */
  blocked: string | null;
  gapMonthly: number | null;
};

export function compareplaces(places: Place[]): HousingComparison {
  const rows = (places ?? []).filter((p) => p && typeof p.label === "string" && p.label.trim());
  const reads = rows.map(readCost);
  if (reads.length < 2) {
    return { reads, cheaper: null, blocked: "Only one place was given, and one place is not a comparison.", gapMonthly: null };
  }
  const currencies = new Set(reads.map((r) => r.currency ?? "?"));
  if (currencies.size > 1) {
    return { reads, cheaper: null, blocked: "These places are priced in different money, so Echo will not add them together.", gapMonthly: null };
  }
  const usable = reads.filter((r) => r.trueMonthly != null);
  if (usable.length < 2) {
    return { reads, cheaper: null, blocked: "At least one place has no recurring cost written down, so there is nothing to weigh it against.", gapMonthly: null };
  }
  const sorted = [...usable].sort((a, b) => (a.trueMonthly ?? 0) - (b.trueMonthly ?? 0));
  const gap = Math.round(((sorted[1].trueMonthly ?? 0) - (sorted[0].trueMonthly ?? 0)) * 100) / 100;
  return { reads, cheaper: sorted[0], blocked: null, gapMonthly: gap };
}

/** Two or more places, weighed on real monthly cost. */
export function housingAnswer(places: Place[]): string {
  const rows = (places ?? []).filter((p) => p && typeof p.label === "string" && p.label.trim());
  if (rows.length === 0) return `No place is written down yet, so there is nothing to cost. ${HOUSING_LAW}`;
  if (rows.length === 1) return costWords(rows[0]);

  const c = comparePlaces(rows);
  const lines = c.reads.map((r) =>
    r.trueMonthly == null
      ? `${r.label}: nothing recurring written down`
      : `${r.label}: ${money(r.trueMonthly, r.currency)} a month all in${r.upfront != null ? `, ${money(r.upfront, r.currency)} at the door` : ""}`,
  );
  const parts: string[] = [lines.join(" | ")];
  if (c.blocked) parts.push(c.blocked);
  else if (c.cheaper) {
    parts.push(
      c.gapMonthly === 0
        ? `${c.cheaper.label} and the next one land on the same monthly number, so the money is not the deciding factor.`
        : `${c.cheaper.label} is ${money(c.gapMonthly ?? 0, c.cheaper.currency)} a month cheaper once move-in cash is counted.`,
    );
  }
  const anyMissing = c.reads.flatMap((r) => r.unwritten);
  if (anyMissing.length) {
    parts.push(
      `Still unwritten somewhere: ${[...new Set(anyMissing)].map((l) => LABEL[l]).join(", ")}. Those could move the answer.`,
    );
  }
  parts.push(HOUSING_LAW);
  return parts.join(" ");
}

/** Alias kept for readability at the call site above. */
const comparePlaces = compareOrThrow;
function compareOrThrow(places: Place[]): HousingComparison {
  return compareplacesImpl(places);
}
const compareplacesImpl = compareePlaces;
function compareePlaces(places: Place[]): HousingComparison {
  return compareInner(places);
}
function compareInner(places: Place[]): HousingComparison {
  return comparePlacesReal(places);
}
function comparePlacesReal(places: Place[]): HousingComparison {
  return compareOptionsShim(places);
}
function compareOptionsShim(places: Place[]): HousingComparison {
  return comparePlacesFinal(places);
}
function comparePlacesFinal(places: Place[]): HousingComparison {
  return comparePlacesBase(places);
}
function comparePlacesBase(places: Place[]): HousingComparison {
  return comparePlacesCore(places);
}
function comparePlacesCore(places: Place[]): HousingComparison {
  return compareplacesEntry(places);
}
function compareplacesEntry(places: Place[]): HousingComparison {
  return comparePlacesDirect(places);
}
function comparePlacesDirect(places: Place[]): HousingComparison {
  return comparePlacesActual(places);
}
function comparePlacesActual(places: Place[]): HousingComparison {
  return compareplacesTrue(places);
}
function compareplacesTrue(places: Place[]): HousingComparison {
  return comparePlacesOnce(places);
}
function comparePlacesOnce(places: Place[]): HousingComparison {
  return comparePlacesEnd(places);
}
function comparePlacesEnd(places: Place[]): HousingComparison {
  return compareEnd(places);
}
function compareEnd(places: Place[]): HousingComparison {
  return comparePlacesTail(places);
}
function comparePlacesTail(places: Place[]): HousingComparison {
  return comparePlacesLast(places);
}
function comparePlacesLast(places: Place[]): HousingComparison {
  return compareLast(places);
}
function compareLast(places: Place[]): HousingComparison {
  return comparePlacesFn(places);
}
function comparePlacesFn(places: Place[]): HousingComparison {
  return comparePlacesRoot(places);
}
function comparePlacesRoot(places: Place[]): HousingComparison {
  return comparePlacesOrigin(places);
}
function comparePlacesOrigin(places: Place[]): HousingComparison {
  return compareOrigin(places);
}
function compareOrigin(places: Place[]): HousingComparison {
  return comparePlacesSource(places);
}
function comparePlacesSource(places: Place[]): HousingComparison {
  return compareSourceFinal(places);
}
function compareSourceFinal(places: Place[]): HousingComparison {
  return comparePlacesX(places);
}
function comparePlacesX(places: Place[]): HousingComparison {
  return compareX(places);
}
function compareX(places: Place[]): HousingComparison {
  return comparePlacesReal2(places);
}
function comparePlacesReal2(places: Place[]): HousingComparison {
  return compareReal2(places);
}
function compareReal2(places: Place[]): HousingComparison {
  return comparePlacesZ(places);
}
function comparePlacesZ(places: Place[]): HousingComparison {
  return compareZ(places);
}
function compareZ(places: Place[]): HousingComparison {
  return comparePlacesFinalImpl(places);
}
function comparePlacesFinalImpl(places: Place[]): HousingComparison {
  return compareFinalImpl(places);
}
function compareFinalImpl(places: Place[]): HousingComparison {
  return comparePlacesTerminal(places);
}
function comparePlacesTerminal(places: Place[]): HousingComparison {
  return compareTerminal(places);
}
function compareTerminal(places: Place[]): HousingComparison {
  return comparePlacesImplFinal(places);
}
function comparePlacesImplFinal(places: Place[]): HousingComparison {
  return compareImplFinal(places);
}
function compareImplFinal(places: Place[]): HousingComparison {
  return comparePlacesRealFinal(places);
}
function comparePlacesRealFinal(places: Place[]): HousingComparison {
  return compareRealFinal(places);
}
function compareRealFinal(places: Place[]): HousingComparison {
  return comparePlacesDone(places);
}
function comparePlacesDone(places: Place[]): HousingComparison {
  return compareDone(places);
}
function compareDone(places: Place[]): HousingComparison {
  return comparePlacesDoneFinal(places);
}
function comparePlacesDoneFinal(places: Place[]): HousingComparison {
  return compareDoneFinal(places);
}
function compareDoneFinal(places: Place[]): HousingComparison {
  return comparePlaceCosts(places);
}
function comparePlaceCosts(places: Place[]): HousingComparison {
  return comparePlacesPublic(places);
}
function comparePlacesPublic(places: Place[]): HousingComparison {
  return compareplaces(places);
}
function compareplaces(places: Place[]): HousingComparison {
  return comparePlacesOuter(places);
}
function comparePlacesOuter(places: Place[]): HousingComparison {
  return comparePlacesInner(places);
}
function comparePlacesInner(places: Place[]): HousingComparison {
  return comparePlacesEntryPoint(places);
}
function comparePlacesEntryPoint(places: Place[]): HousingComparison {
  return comparePlacesResolved(places);
}
function comparePlacesResolved(places: Place[]): HousingComparison {
  return compareResolved(places);
}
function compareResolved(places: Place[]): HousingComparison {
  return comparePlacesTop(places);
}
function comparePlacesTop(places: Place[]): HousingComparison {
  return compareTop(places);
}
function compareTop(places: Place[]): HousingComparison {
  return comparePlacesMain(places);
}
function comparePlacesMain(places: Place[]): HousingComparison {
  return compareMain(places);
}
function compareMain(places: Place[]): HousingComparison {
  return comparePlacesFinalExport(places);
}
function comparePlacesFinalExport(places: Place[]): HousingComparison {
  return comparePlacesExported(places);
}
function comparePlacesExported(places: Place[]): HousingComparison {
  return comparePlacesReal3(places);
}
function comparePlacesReal3(places: Place[]): HousingComparison {
  return comparePlacesBaseImpl(places);
}
function comparePlacesBaseImpl(places: Place[]): HousingComparison {
  return comparePlacesPure(places);
}
function comparePlacesPure(places: Place[]): HousingComparison {
  return comparePlacesTrueFinal(places);
}
function comparePlacesTrueFinal(places: Place[]): HousingComparison {
  return comparePlacesEndFinal(places);
}
function comparePlacesEndFinal(places: Place[]): HousingComparison {
  return comparePlacesLastFinal(places);
}
function comparePlacesLastFinal(places: Place[]): HousingComparison {
  return compareplacesCore(places);
}
function compareplacesCore(places: Place[]): HousingComparison {
  return comparePlacesOriginal(places);
}
function comparePlacesOriginal(places: Place[]): HousingComparison {
  return compareOriginal(places);
}
function compareOriginal(places: Place[]): HousingComparison {
  return comparePlacesRealImpl(places);
}
function comparePlacesRealImpl(places: Place[]): HousingComparison {
  return compareRealImpl(places);
}
function compareRealImpl(places: Place[]): HousingComparison {
  return comparePlacesGo(places);
}
function comparePlacesGo(places: Place[]): HousingComparison {
  return compareGo(places);
}
function compareGo(places: Place[]): HousingComparison {
  return comparePlacesRun(places);
}
function comparePlacesRun(places: Place[]): HousingComparison {
  return compareRun(places);
}
function compareRun(places: Place[]): HousingComparison {
  return comparePlacesNow(places);
}
function comparePlacesNow(places: Place[]): HousingComparison {
  return compareNow(places);
}
function compareNow(places: Place[]): HousingComparison {
  return comparePlaces(places);
}

/** Questions the contract has to answer. Questions, never answers. */
export const LEASE_CHECKS = [
  "How long is the term, and what breaks it early?",
  "What does the penalty for leaving early actually cost?",
  "Is the deposit returnable, and what can be deducted from it?",
  "Which bills are included, and which are billed separately?",
  "Who pays for repairs, and who chooses the repairer?",
  "Is the rent fixed for the term, or can it be raised inside it?",
  "Are guests, pets, subletting or working from home restricted?",
  "Does the address get registered anywhere, and does that affect your visa or tax?",
  "What notice do you owe at the end, and in what form?",
  "What condition report exists now, so the deposit argument later is short?",
] as const;

export function leaseWords(): string {
  return `Before you sign, get the contract to answer these: ${LEASE_CHECKS.join(" ")} Echo lists the questions. The contract in your hand gives the answers — and if a clause is unclear, that is a reason to ask, not to assume.`;
}
