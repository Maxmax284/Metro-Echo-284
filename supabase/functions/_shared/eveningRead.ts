// eveningRead — one sentence about the rest of your day.
//
// Doctrine:
//  - Synthesis, not a feed. What is still ahead today plus the weather window
//    for those hours, said once.
//  - Nothing is inferred. No events means it says there is nothing left, and a
//    missing forecast is missing, never assumed fair.
//  - Read-only and on demand. This composes; it never fetches and never runs.
//
// Pure module: the caller hands over the events and the forecast hours.

export type EveningEvent = {
  id: string;
  title: string | null;
  starts_at: string;
  location?: string | null;
  all_day?: boolean;
};

/** One hour of forecast, exactly as the provider reported it. */
export type ForecastHour = {
  /** ISO time for the start of the hour. */
  at: string;
  tempC: number | null;
  /** Plain label: clear, rain, showers… */
  condition: string | null;
  /** Chance of rain in percent, when the provider gave one. */
  rainChance?: number | null;
};

export type EveningRead = {
  /** The one sentence a person reads. Never empty. */
  sentence: string;
  /** What is still ahead, in time order. */
  ahead: EveningEvent[];
  /** The hours the forecast half of the sentence was built from. */
  hours: ForecastHour[];
  /** Named sources, for "Why this?". */
  sources: string[];
  /** True when there is neither an event nor a forecast to stand on. */
  empty: boolean;
};

/** Where "the rest of today" ends: local midnight. */
function endOfLocalDay(now: Date): number {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  return m === 0 ? `${h}:00` : `${h}:${String(m).padStart(2, "0")}`;
}

function list(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

const WET = ["rain", "showers", "thunderstorm", "snow"];

/** The weather half: what those hours look like, in the fewest honest words. */
function weatherClause(hours: ForecastHour[], unit: "c" | "f" = "c"): string | null {
  if (hours.length === 0) return null;
  const temps = hours.map((h) => h.tempC).filter((t): t is number => typeof t === "number");
  const wet = hours.filter((h) => h.condition && WET.includes(h.condition));
  const bits: string[] = [];
  /* Fahrenheit carries its letter; Celsius stays the established bare degree.
     The "easing" threshold is judged in Celsius either way, so the wording
     never shifts just because the unit did. */
  const deg = (c: number) => `${Math.round(unit === "f" ? (c * 9) / 5 + 32 : c)}°${unit === "f" ? "F" : ""}`;

  if (temps.length > 0) {
    const lo = Math.round(Math.min(...temps));
    const hi = Math.round(Math.max(...temps));
    bits.push(hi - lo >= 2 ? `${deg(Math.max(...temps))} easing to ${deg(Math.min(...temps))}` : `around ${deg(Math.max(...temps))}`);
  }

  if (wet.length > 0) {
    const first = wet[0];
    const chance = typeof first.rainChance === "number" ? ` (${Math.round(first.rainChance)}% chance)` : "";
    bits.push(`${first.condition} from about ${timeLabel(first.at)}${chance}`);
  } else if (temps.length > 0) {
    bits.push("nothing wet in the window");
  }

  return bits.length > 0 ? bits.join(", ") : null;
}

export function eveningRead(input: {
  now?: number;
  events: EveningEvent[];
  /** Hourly forecast, any length. Only the hours left today are used. */
  forecast?: ForecastHour[];
  /** Where the forecast was read for, e.g. "Rawai". */
  placeLabel?: string | null;
  /** Display unit for the weather half. Server callers leave it at "c". */
  unit?: "c" | "f";
}): EveningRead {
  const now = input.now ?? Date.now();
  const cutoff = endOfLocalDay(new Date(now));

  const ahead = (input.events ?? [])
    .filter((e) => {
      const t = new Date(e.starts_at).getTime();
      return Number.isFinite(t) && t >= now && t <= cutoff;
    })
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  const hours = (input.forecast ?? [])
    .filter((h) => {
      const t = new Date(h.at).getTime();
      return Number.isFinite(t) && t >= now && t <= cutoff;
    })
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const sources: string[] = [];
  if (ahead.length > 0) sources.push("your connected calendar");
  if (hours.length > 0) sources.push(`the forecast${input.placeLabel ? ` for ${input.placeLabel}` : ""}`);

  const weather = weatherClause(hours, input.unit);

  let eventClause: string;
  if (ahead.length === 0) {
    eventClause = "Nothing left on the calendar today";
  } else {
    const named = ahead.slice(0, 2).map((e) => {
      const title = e.title?.trim() || "an entry";
      const when = e.all_day ? "all day" : `at ${timeLabel(e.starts_at)}`;
      return e.location ? `${title} ${when}, ${e.location}` : `${title} ${when}`;
    });
    const rest = ahead.length - named.length;
    eventClause = `${list(named)}${rest > 0 ? `, and ${rest} more after that` : ""}`;
  }

  const empty = ahead.length === 0 && hours.length === 0;
  const sentence = empty
    ? "Nothing left on the calendar today, and no forecast has been read for where you are."
    : weather
      ? `${eventClause} — ${weather}.`
      : `${eventClause}. No forecast has been read for the rest of today.`;

  return { sentence, ahead, hours, sources, empty };
}
