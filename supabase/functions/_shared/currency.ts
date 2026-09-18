// currency — money in the currency you are standing in.
//
// Doctrine:
//   - A converted amount is only as true as the rate behind it, so the rate and
//     the moment it was read travel with every answer.
//   - A published rate is not the rate a card gives you. Say so, always.
//   - Read-only. Nothing here moves money.

export type Rates = { base: string; rates: Record<string, number>; readAt: string };

export const CURRENCY_SYMBOL: Record<string, string> = {
  USD: "$", EUR: "€", GBP: "£", THB: "฿", JPY: "¥", CAD: "CA$", AUD: "A$", CHF: "CHF",
  MXN: "MX$", INR: "₹", CNY: "CN¥", SEK: "kr", NOK: "kr", DKK: "kr", PLN: "zł",
  BRL: "R$", ZAR: "R", TRY: "₺", AED: "AED", SGD: "S$", NZD: "NZ$", KRW: "₩", VND: "₫", PHP: "₱",
  TWD: "NT$", HKD: "HK$", MYR: "RM", IDR: "Rp", KHR: "៛", LKR: "Rs", QAR: "QR", BHD: "BD",
  EGP: "E£", ETB: "Br", ISK: "kr",
};

const WORD_TO_CODE: Record<string, string> = {
  dollar: "USD", dollars: "USD", usd: "USD", bucks: "USD",
  euro: "EUR", euros: "EUR", eur: "EUR",
  pound: "GBP", pounds: "GBP", quid: "GBP", gbp: "GBP", sterling: "GBP",
  baht: "THB", thb: "THB",
  yen: "JPY", jpy: "JPY",
  peso: "MXN", pesos: "MXN", mxn: "MXN",
  rupee: "INR", rupees: "INR", inr: "INR",
  yuan: "CNY", rmb: "CNY", cny: "CNY",
  won: "KRW", krw: "KRW",
  dong: "VND", vnd: "VND",
  dirham: "AED", aed: "AED",
  rand: "ZAR", zar: "ZAR",
  real: "BRL", reais: "BRL", brl: "BRL",
  lira: "TRY", try: "TRY",
};

/** Normalise anything a person might type into an ISO code, or null. */
export function toCode(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim().toLowerCase().replace(/[^a-z$€£฿¥₹₺₩₫₱]/g, "");
  if (!t) return null;
  const bySymbol: Record<string, string> = {
    "$": "USD", "€": "EUR", "£": "GBP", "฿": "THB", "¥": "JPY", "₹": "INR", "₺": "TRY", "₩": "KRW", "₫": "VND", "₱": "PHP",
  };
  if (bySymbol[t]) return bySymbol[t];
  if (WORD_TO_CODE[t]) return WORD_TO_CODE[t];
  if (/^[a-z]{3}$/.test(t)) return t.toUpperCase();
  return null;
}

export type MoneyAsk = { amount: number; from: string; to: string };

/**
 * Read a conversion out of ordinary words: "convert 50 usd to thb",
 * "what's £40 in euros", "1200 baht in dollars".
 */
export function parseMoneyAsk(text: string | null | undefined): MoneyAsk | null {
  const t = (text ?? "").replace(/,/g, "").trim();
  if (!t) return null;
  const m =
    t.match(/([$€£฿¥₹₺₩₫₱]?)\s*(\d+(?:\.\d+)?)\s*([a-z]{3,8}|[$€£฿¥₹₺₩₫₱])?\s*(?:in|to|into|as)\s+([a-z]{3,8}|[$€£₿฿¥₹₺₩₫₱])/i);
  if (!m) return null;
  const amount = Number(m[2]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const from = toCode(m[3] || m[1]);
  const to = toCode(m[4]);
  if (!from || !to || from === to) return null;
  return { amount, from, to };
}

/** Cross-rate through the table's own base. Returns null when a leg is missing. */
export function convert(amount: number, from: string, to: string, r: Rates): number | null {
  const rate = crossRate(from, to, r);
  return rate == null ? null : amount * rate;
}

export function crossRate(from: string, to: string, r: Rates): number | null {
  if (from === to) return 1;
  const base = r.base.toUpperCase();
  const val = (c: string) => (c === base ? 1 : r.rates[c]);
  const a = val(from.toUpperCase());
  const b = val(to.toUpperCase());
  if (!a || !b) return null;
  return b / a;
}

export function formatMoney(amount: number, code: string): string {
  const zeroDp = code === "JPY" || code === "KRW" || code === "VND";
  const n = amount.toLocaleString(undefined, {
    minimumFractionDigits: zeroDp ? 0 : 2,
    maximumFractionDigits: zeroDp ? 0 : 2,
  });
  const sym = CURRENCY_SYMBOL[code];
  return sym && sym.length <= 2 ? `${sym}${n}` : `${n} ${code}`;
}

/** The whole answer, rate and reading time included. */
export function moneyAnswer(ask: MoneyAsk, r: Rates | null): string {
  if (!r) return "The rates could not be read just now, so no number here would be honest.";
  const out = convert(ask.amount, ask.from, ask.to, r);
  const rate = crossRate(ask.from, ask.to, r);
  if (out == null || rate == null) {
    return `No published rate for ${ask.from} to ${ask.to} was in what Echo read, so there is no number to give you.`;
  }
  const when = new Date(r.readAt).toISOString().replace("T", " ").slice(0, 16);
  return [
    `${formatMoney(ask.amount, ask.from)} is about ${formatMoney(out, ask.to)}.`,
    `Rate read ${when} UTC: 1 ${ask.from} = ${rate.toFixed(4)} ${ask.to}.`,
    "That is a published rate, not what a card or a counter will give you.",
  ].join(" ");
}

/** Public rates. No key, no account. */
export async function fetchRates(base = "USD"): Promise<Rates | null> {
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`);
    if (!res.ok) return null;
    const body = await res.json();
    const rates = body?.rates;
    if (!rates || typeof rates !== "object") return null;
    return { base: base.toUpperCase(), rates, readAt: new Date().toISOString() };
  } catch {
    return null;
  }
}

/**
 * Country (ISO-3166 alpha-2) to the currency actually spent there. A kept table,
 * not a guess: a country that is not listed returns null and Echo says it does
 * not know the money rather than naming the wrong note.
 */
export const COUNTRY_CURRENCY: Record<string, string> = {
  US: "USD", CA: "CAD", GB: "GBP", IE: "EUR", FR: "EUR", DE: "EUR", ES: "EUR", IT: "EUR",
  NL: "EUR", PT: "EUR", BE: "EUR", AT: "EUR", GR: "EUR", FI: "EUR", MT: "EUR", CY: "EUR",
  CH: "CHF", NO: "NOK", SE: "SEK", DK: "DKK", PL: "PLN", IS: "ISK", TR: "TRY",
  TH: "THB", JP: "JPY", KR: "KRW", CN: "CNY", TW: "TWD", HK: "HKD", SG: "SGD", MY: "MYR",
  VN: "VND", PH: "PHP", ID: "IDR", KH: "KHR", IN: "INR", LK: "LKR",
  AE: "AED", QA: "QAR", BH: "BHD", EG: "EGP", ET: "ETB", ZA: "ZAR",
  AU: "AUD", NZ: "NZD", BR: "BRL", MX: "MXN", PA: "USD",
};

/** The currency spent in a country, or null when it is not on record. */
export function currencyForCountry(cc: string | null | undefined): string | null {
  const code = (cc ?? "").trim().toUpperCase();
  return code ? (COUNTRY_CURRENCY[code] ?? null) : null;
}
