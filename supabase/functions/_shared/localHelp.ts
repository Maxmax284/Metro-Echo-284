// localHelp — help where you are standing.
//
// Doctrine:
//   - The number has to be right or it is worse than nothing, so this is a fixed
//     table of published national emergency numbers, not a guess and not a search.
//   - A country Echo has not been told about says so. It never offers a nearby
//     country's number as if it were local.
//   - Echo says the number. It never dials, and it never calls anyone for you.

export type HelpNumbers = {
  country: string;
  /** The one number to call when it does not matter which service. */
  general?: string;
  police?: string;
  ambulance?: string;
  fire?: string;
  note?: string;
};

const TABLE: Record<string, HelpNumbers> = {
  US: { country: "United States", general: "911" },
  CA: { country: "Canada", general: "911" },
  GB: { country: "United Kingdom", general: "999", note: "112 also works. 111 for urgent but non-emergency health." },
  IE: { country: "Ireland", general: "112", note: "999 also works." },
  TH: { country: "Thailand", general: "191", ambulance: "1669", fire: "199", note: "1155 is the tourist police, English spoken." },
  AU: { country: "Australia", general: "000" },
  NZ: { country: "New Zealand", general: "111" },
  JP: { country: "Japan", police: "110", ambulance: "119", fire: "119" },
  KR: { country: "South Korea", police: "112", ambulance: "119", fire: "119" },
  CN: { country: "China", police: "110", ambulance: "120", fire: "119" },
  IN: { country: "India", general: "112" },
  SG: { country: "Singapore", police: "999", ambulance: "995", fire: "995" },
  MY: { country: "Malaysia", general: "999" },
  VN: { country: "Vietnam", police: "113", ambulance: "115", fire: "114" },
  PH: { country: "Philippines", general: "911" },
  ID: { country: "Indonesia", general: "112" },
  AE: { country: "United Arab Emirates", police: "999", ambulance: "998", fire: "997" },
  ZA: { country: "South Africa", general: "112", ambulance: "10177" },
  MX: { country: "Mexico", general: "911" },
  BR: { country: "Brazil", police: "190", ambulance: "192", fire: "193" },
  TR: { country: "Türkiye", general: "112" },
  CH: { country: "Switzerland", general: "112" },
  NO: { country: "Norway", police: "112", ambulance: "113", fire: "110" },
  IS: { country: "Iceland", general: "112" },
  TW: { country: "Taiwan", police: "110", ambulance: "119", fire: "119", note: "0800-024-111 is the 24-hour travel hotline, English spoken." },
  HK: { country: "Hong Kong", general: "999" },
  QA: { country: "Qatar", general: "999" },
  BH: { country: "Bahrain", general: "999" },
  EG: { country: "Egypt", police: "122", ambulance: "123", fire: "180" },
  ET: { country: "Ethiopia", police: "991", ambulance: "907", fire: "939" },
  LK: { country: "Sri Lanka", police: "119", ambulance: "1990" },
  KH: { country: "Cambodia", police: "117", ambulance: "119", fire: "118" },
  PA: { country: "Panama", general: "911" },
};

/** Every country inside the EU/EEA answer 112 — one row instead of thirty. */
const EU_112: Record<string, string> = {
  FR: "France", DE: "Germany", ES: "Spain", IT: "Italy", PT: "Portugal", NL: "Netherlands",
  BE: "Belgium", AT: "Austria", SE: "Sweden", DK: "Denmark", FI: "Finland", PL: "Poland",
  CZ: "Czechia", SK: "Slovakia", HU: "Hungary", RO: "Romania", BG: "Bulgaria", GR: "Greece",
  HR: "Croatia", SI: "Slovenia", EE: "Estonia", LV: "Latvia", LT: "Lithuania", LU: "Luxembourg",
  CY: "Cyprus", MT: "Malta",
};

const NAME_TO_CODE: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [code, row] of Object.entries(TABLE)) out[row.country.toLowerCase()] = code;
  for (const [code, name] of Object.entries(EU_112)) out[name.toLowerCase()] = code;
  Object.assign(out, {
    usa: "US", "united states of america": "US", america: "US", uk: "GB", england: "GB",
    scotland: "GB", wales: "GB", "northern ireland": "GB", britain: "GB", holland: "NL",
    turkey: "TR", "south korea": "KR", korea: "KR", uae: "AE", emirates: "AE",
  });
  return out;
})();

/** Country name or ISO code in, one row out, or null when it is not recorded. */
export function helpFor(place: string | null | undefined): HelpNumbers | null {
  const t = (place ?? "").trim().toLowerCase();
  if (!t) return null;
  const code = /^[a-z]{2}$/.test(t) ? t.toUpperCase() : NAME_TO_CODE[t];
  if (!code) return null;
  if (TABLE[code]) return TABLE[code];
  if (EU_112[code]) {
    return { country: EU_112[code], general: "112", note: "112 works across the EU, in English." };
  }
  return null;
}

/** The answer, in the order a person needs it. */
export function helpAnswer(place: string | null | undefined): string {
  const row = helpFor(place);
  if (!row) {
    const named = (place ?? "").trim();
    return named
      ? `Echo does not have a recorded emergency number for ${named}, and a wrong number is worse than none. Ask a local, or check the number posted where you are staying.`
      : "Echo does not know which country you are in right now, so there is no number it can honestly give you. Tell it the country and it will.";
  }
  const lines: string[] = [];
  if (row.general) lines.push(`In ${row.country}, call ${row.general} for anything urgent.`);
  const parts = [
    row.police ? `police ${row.police}` : "",
    row.ambulance ? `ambulance ${row.ambulance}` : "",
    row.fire ? `fire ${row.fire}` : "",
  ].filter(Boolean);
  if (parts.length) {
    lines.push(row.general ? `Direct lines: ${parts.join(", ")}.` : `In ${row.country}: ${parts.join(", ")}.`);
  }
  if (row.note) lines.push(row.note);
  lines.push("Say where you are first, then what happened. Echo cannot make the call for you.");
  return lines.join(" ");
}
