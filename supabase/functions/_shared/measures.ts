// measures — conversion with meaning, not a calculator.
//
// Doctrine:
//   - Echo converts, then says what the number means to a person, but only when a
//     kept anchor supports the sentence. No anchor, no editorial.
//   - Units are exact factors, written down, not fetched.
//   - A unit Echo does not know returns nothing. It never converts by guessing
//     what somebody probably meant.
//
// Pure module: no IO, no React.

export type Family =
  | "length"
  | "mass"
  | "volume"
  | "area"
  | "temperature"
  | "speed";

export type UnitSpec = {
  key: string;
  family: Family;
  /** Plural-safe label used when Echo speaks the number. */
  label: string;
  /** Multiply by this to reach the family's base unit (m, kg, l, m2, km/h). */
  factor: number;
  aliases: string[];
};

const UNITS: UnitSpec[] = [
  // length — base metre
  { key: "mm", family: "length", label: "mm", factor: 0.001, aliases: ["millimeter", "millimetre", "millimeters", "millimetres"] },
  { key: "cm", family: "length", label: "cm", factor: 0.01, aliases: ["centimeter", "centimetre", "centimeters", "centimetres"] },
  { key: "m", family: "length", label: "m", factor: 1, aliases: ["meter", "metre", "meters", "metres"] },
  { key: "km", family: "length", label: "km", factor: 1000, aliases: ["kilometer", "kilometre", "kilometers", "kilometres", "kms"] },
  { key: "in", family: "length", label: "inches", factor: 0.0254, aliases: ["inch", "inches", '"', "ins"] },
  { key: "ft", family: "length", label: "ft", factor: 0.3048, aliases: ["foot", "feet", "'"] },
  { key: "yd", family: "length", label: "yards", factor: 0.9144, aliases: ["yard", "yards"] },
  { key: "mi", family: "length", label: "miles", factor: 1609.344, aliases: ["mile", "miles"] },

  // mass — base kilogram
  { key: "g", family: "mass", label: "g", factor: 0.001, aliases: ["gram", "grams", "gramme", "grammes"] },
  { key: "kg", family: "mass", label: "kg", factor: 1, aliases: ["kilo", "kilos", "kilogram", "kilograms", "kilogramme", "kilogrammes"] },
  { key: "oz", family: "mass", label: "oz", factor: 0.028349523125, aliases: ["ounce", "ounces"] },
  { key: "lb", family: "mass", label: "lb", factor: 0.45359237, aliases: ["pound", "pounds", "lbs"] },
  { key: "st", family: "mass", label: "stone", factor: 6.35029318, aliases: ["stone", "stones"] },

  // volume — base litre
  { key: "ml", family: "volume", label: "ml", factor: 0.001, aliases: ["milliliter", "millilitre", "milliliters", "millilitres"] },
  { key: "l", family: "volume", label: "litres", factor: 1, aliases: ["liter", "litre", "liters", "litres", "ltr"] },
  { key: "galus", family: "volume", label: "US gallons", factor: 3.785411784, aliases: ["gallon", "gallons", "gal", "us gallon", "us gallons", "usgal"] },
  { key: "galuk", family: "volume", label: "imperial gallons", factor: 4.54609, aliases: ["imperial gallon", "imperial gallons", "uk gallon", "uk gallons", "ukgal"] },
  { key: "flozus", family: "volume", label: "US fl oz", factor: 0.0295735295625, aliases: ["fl oz", "floz", "fluid ounce", "fluid ounces", "us fl oz"] },
  { key: "cupus", family: "volume", label: "US cups", factor: 0.2365882365, aliases: ["cup", "cups"] },

  // area — base square metre
  { key: "m2", family: "area", label: "m²", factor: 1, aliases: ["sqm", "sq m", "square meter", "square metre", "square meters", "square metres", "m^2", "m²"] },
  { key: "ft2", family: "area", label: "ft²", factor: 0.09290304, aliases: ["sqft", "sq ft", "square foot", "square feet", "ft^2", "ft²"] },
  { key: "ha", family: "area", label: "hectares", factor: 10000, aliases: ["hectare", "hectares"] },
  { key: "acre", family: "area", label: "acres", factor: 4046.8564224, aliases: ["acre", "acres"] },

  // temperature — handled separately, factor unused
  { key: "c", family: "temperature", label: "°C", factor: 1, aliases: ["celsius", "centigrade", "degrees c", "°c"] },
  { key: "f", family: "temperature", label: "°F", factor: 1, aliases: ["fahrenheit", "degrees f", "°f"] },

  // speed — base km/h
  { key: "kmh", family: "speed", label: "km/h", factor: 1, aliases: ["kph", "km/h", "kmph", "km per hour"] },
  { key: "mph", family: "speed", label: "mph", factor: 1.609344, aliases: ["mph", "miles per hour", "mi/h"] },
];

const LOOKUP: Record<string, UnitSpec> = (() => {
  const out: Record<string, UnitSpec> = {};
  for (const u of UNITS) {
    out[u.key] = u;
    for (const a of u.aliases) out[a.toLowerCase()] = u;
  }
  return out;
})();

/** A written unit in, the spec out, or null when Echo does not know it. */
export function unit(raw: string | null | undefined): UnitSpec | null {
  const t = (raw ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!t) return null;
  return LOOKUP[t] ?? null;
}

export function knownUnits(): string[] {
  return UNITS.map((u) => u.key);
}

/** The counterpart Echo reaches for when nobody named a target unit. */
const DEFAULT_PAIR: Record<string, string> = {
  mm: "in", cm: "in", m: "ft", km: "mi",
  in: "cm", ft: "m", yd: "m", mi: "km",
  g: "oz", kg: "lb", oz: "g", lb: "kg", st: "kg",
  ml: "flozus", l: "galus", galus: "l", galuk: "l", flozus: "ml", cupus: "ml",
  m2: "ft2", ft2: "m2", ha: "acre", acre: "ha",
  c: "f", f: "c",
  kmh: "mph", mph: "kmh",
};

export function counterpart(u: UnitSpec): UnitSpec | null {
  const key = DEFAULT_PAIR[u.key];
  return key ? (LOOKUP[key] ?? null) : null;
}

export type MeasureAsk = { amount: number; from: UnitSpec; to: UnitSpec };

const NUM = "(-?\\d+(?:[.,]\\d+)?)";
const UNIT_WORD = "([a-z°²^/\"'\\s]{1,22}?)";

/**
 * Reads "42 m2 to sqft", "how many miles is 10 km", "180 lbs in kg", "32c".
 * Returns null the moment either unit is unknown or the families disagree.
 */
export function parseMeasureAsk(text: string | null | undefined): MeasureAsk | null {
  const t = (text ?? "").trim().toLowerCase();
  if (!t) return null;

  // "<n> <unit> (to|in|into|as) <unit>"
  const both = new RegExp(`${NUM}\\s*${UNIT_WORD}\\s+(?:to|in|into|as|=)\\s+([a-z°²^/\"'\\s]{1,22})`).exec(t);
  if (both) {
    const from = unit(both[2]);
    const to = unit(both[3]);
    const amount = readNumber(both[1]);
    if (from && to && amount != null && from.family === to.family) return { amount, from, to };
  }

  // "how many <unit> is <n> <unit>"
  const flipped = new RegExp(`how\\s+many\\s+([a-z°²^/\"'\\s]{1,22}?)\\s+(?:is|are|in)\\s+${NUM}\\s*${UNIT_WORD}`).exec(t);
  if (flipped) {
    const to = unit(flipped[1]);
    const from = unit(flipped[3]);
    const amount = readNumber(flipped[2]);
    if (from && to && amount != null && from.family === to.family) return { amount, from, to };
  }

  // "<n> <unit>" on its own — convert to the usual counterpart.
  const bare = new RegExp(`(?:^|\\s)${NUM}\\s*([a-z°²]{1,6})(?:\\s|$|\\?|\\.)`).exec(t);
  if (bare) {
    const from = unit(bare[2]);
    const amount = readNumber(bare[1]);
    const to = from ? counterpart(from) : null;
    if (from && to && amount != null) return { amount, from, to };
  }

  return null;
}

function readNumber(raw: string): number | null {
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** The conversion itself. Null when the families do not match. */
export function convertMeasure(amount: number, from: UnitSpec, to: UnitSpec): number | null {
  if (from.family !== to.family) return null;
  if (from.family === "temperature") {
    if (from.key === to.key) return amount;
    return from.key === "c" ? amount * 9 / 5 + 32 : (amount - 32) * 5 / 9;
  }
  return (amount * from.factor) / to.factor;
}

/** Sensible digits: big numbers stay whole, small ones keep a decimal or two. */
export function showNumber(n: number): string {
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
  const fixed = n.toFixed(digits);
  return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export function showMeasure(n: number, u: UnitSpec): string {
  return u.family === "temperature" ? `${showNumber(n)}${u.label}` : `${showNumber(n)} ${u.label}`;
}

export const SENSE_LAW =
  "The comparison lines here are kept anchors, not opinions dressed up as facts. Where Echo has no anchor it gives the number and stops.";

/**
 * The half that matters: what the number means to a person standing there.
 * Returns null when nothing kept supports a sentence — silence over invention.
 */
export function senseOf(value: number, u: UnitSpec): string | null {
  switch (u.family) {
    case "area": {
      const m2 = (value * u.factor) / 1;
      if (m2 <= 0) return null;
      if (m2 < 20) return "That is studio territory — one room doing every job.";
      if (m2 < 45) return "Small by US suburban standards, normal for a city apartment.";
      if (m2 < 80) return "A comfortable one or two bedroom in most cities.";
      if (m2 < 150) return "Family-sized in a city, average for a US house.";
      return "Large by city standards anywhere.";
    }
    case "temperature": {
      const c = u.key === "c" ? value : (value - 32) * 5 / 9;
      if (c <= -10) return "Hard cold — proper coat, covered hands and head.";
      if (c < 5) return "Cold. Coat weather.";
      if (c < 15) return "Cool. A jacket, not a coat.";
      if (c < 24) return "Mild. Comfortable either way.";
      if (c < 31) return "Warm. Fine, but drink water.";
      if (c < 38) return "Hot. Shade and water matter, and midday is not the time to walk far.";
      return "Dangerous heat. Treat time outside as something to ration.";
    }
    case "length": {
      const m = value * u.factor;
      if (m < 100) return null;
      const km = m / 1000;
      if (km > 25) return null;
      const walk = Math.round((km / 5) * 60);
      const label = walk >= 60 ? `${Math.round(walk / 6) / 10} hours` : `${walk} minutes`;
      return `About ${label} on foot at an ordinary pace.`;
    }
    default:
      return null;
  }
}

/** One line back for a chat surface: the conversion, then the meaning if kept. */
export function measureAnswer(ask: MeasureAsk | null): string {
  if (!ask) {
    return "That did not name a unit Echo keeps a factor for, so it has nothing to convert without guessing.";
  }
  const out = convertMeasure(ask.amount, ask.from, ask.to);
  if (out == null) return "Those two units measure different things, so there is no honest conversion between them.";
  const head = `${showMeasure(ask.amount, ask.from)} is about ${showMeasure(out, ask.to)}.`;
  const sense = senseOf(ask.amount, ask.from);
  return sense ? `${head} ${sense}` : head;
}

/** Shoe sizing, treated as the rough guide it actually is. */
export const SIZING_LAW =
  "Shoe and clothing sizes differ by maker even inside one country, so these are a starting point for trying something on, not a fit.";

export type ShoeRow = { us: number; uk: number; eu: number; cm: number };

const SHOE_MEN: ShoeRow[] = [
  { us: 7, uk: 6, eu: 40, cm: 25 },
  { us: 8, uk: 7, eu: 41, cm: 26 },
  { us: 9, uk: 8, eu: 42, cm: 27 },
  { us: 10, uk: 9, eu: 43, cm: 28 },
  { us: 11, uk: 10, eu: 44.5, cm: 29 },
  { us: 12, uk: 11, eu: 46, cm: 30 },
  { us: 13, uk: 12, eu: 47, cm: 31 },
];

const SHOE_WOMEN: ShoeRow[] = [
  { us: 5, uk: 3, eu: 35.5, cm: 22 },
  { us: 6, uk: 4, eu: 36.5, cm: 22.5 },
  { us: 7, uk: 5, eu: 37.5, cm: 23.5 },
  { us: 8, uk: 6, eu: 38.5, cm: 24 },
  { us: 9, uk: 7, eu: 40, cm: 25 },
  { us: 10, uk: 8, eu: 41, cm: 26 },
  { us: 11, uk: 9, eu: 42, cm: 27 },
];

export type ShoeCut = "men" | "women";

/** Nearest kept row, or null when the size sits outside the table. */
export function shoeRow(cut: ShoeCut, system: "us" | "uk" | "eu" | "cm", size: number): ShoeRow | null {
  const table = cut === "women" ? SHOE_WOMEN : SHOE_MEN;
  let best: ShoeRow | null = null;
  let gap = Infinity;
  for (const row of table) {
    const d = Math.abs(row[system] - size);
    if (d < gap) { gap = d; best = row; }
  }
  const tolerance = system === "eu" ? 1.5 : system === "cm" ? 1 : 0.75;
  return best && gap <= tolerance ? best : null;
}

export function shoeAnswer(cut: ShoeCut, system: "us" | "uk" | "eu" | "cm", size: number): string {
  const row = shoeRow(cut, system, size);
  if (!row) {
    return `Echo's kept sizing table does not reach ${size} ${system.toUpperCase()} for ${cut}, so it will not put a number on it.`;
  }
  return `${cut === "women" ? "Women's" : "Men's"} US ${row.us} is about UK ${row.uk}, EU ${row.eu}, and ${row.cm} cm of foot. ${SIZING_LAW}`;
}
