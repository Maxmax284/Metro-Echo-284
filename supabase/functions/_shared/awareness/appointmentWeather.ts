// appointmentWeather — what the sky is doing when you have to be somewhere.
//
// Doctrine:
//   - This is never its own card and never its own notification. It is one short
//     clause riding on an appointment heads-up that was already earned.
//   - Only recorded hours are spoken. No interpolation, no guessing, and no
//     forecast at all when the provider gave nothing for that window.
//   - A warning is a fact, not a mood: rain, snow, ice, heat or cold that would
//     change what you wear or when you leave.
//
// Pure module: no IO, no Deno globals.

export type ForecastHour = {
  at: string;
  tempC?: number | null;
  condition?: string | null;
  rainChance?: number | null;
};

export type AppointmentWeatherKind = "snow" | "ice" | "rain" | "heat" | "cold" | "clear";

export type AppointmentWeather = {
  /** One clause, lower case, ready to append to a sentence. */
  clause: string;
  /** True when this is worth changing a plan over. */
  warning: boolean;
  kind: AppointmentWeatherKind;
  tempC: number | null;
};

const HOUR = 3_600_000;

/** Above this it is heat, not warmth. */
export const HEAT_C = 32;
/** Below this it is cold worth naming. */
export const COLD_C = -7;
/** Rain chance at or above this counts even when the label says nothing. */
export const RAIN_CHANCE = 60;

const SNOW = ["snow", "blizzard", "flurr"];
const ICE = ["ice", "freezing", "sleet", "hail"];
const RAIN = ["rain", "shower", "drizzle", "thunder", "storm"];

function hourLabel(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      hour: "numeric",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString().slice(11, 16);
  }
}

function matches(condition: string | null | undefined, words: string[]): boolean {
  const c = String(condition ?? "").toLowerCase();
  return words.some((w) => c.includes(w));
}

/**
 * The weather around one appointment, said in one clause. Returns null when the
 * forecast simply does not cover that window — silence beats invention.
 */
export function appointmentWeather(
  startsAt: string,
  hours: ForecastHour[] | null | undefined,
  timezone: string,
  now = Date.now(),
): AppointmentWeather | null {
  const start = new Date(startsAt).getTime();
  if (!Number.isFinite(start)) return null;

  const window = (hours ?? []).filter((h) => {
    const t = new Date(h.at).getTime();
    return Number.isFinite(t) && t >= start - 2 * HOUR && t <= start + HOUR;
  });
  if (window.length === 0) return null;

  // Nearest recorded hour to the start carries the temperature.
  const nearest = window.reduce((best, h) =>
    Math.abs(new Date(h.at).getTime() - start) < Math.abs(new Date(best.at).getTime() - start) ? h : best,
  );
  const tempC = typeof nearest.tempC === "number" && Number.isFinite(nearest.tempC) ? Math.round(nearest.tempC) : null;
  const tempPart = tempC === null ? "" : `${tempC}°`;

  const snow = window.find((h) => matches(h.condition, SNOW));
  const ice = window.find((h) => matches(h.condition, ICE));
  const rain = window.find(
    (h) => matches(h.condition, RAIN) || (typeof h.rainChance === "number" && h.rainChance >= RAIN_CHANCE),
  );

  const say = (kind: AppointmentWeatherKind, clause: string, warning: boolean): AppointmentWeather => ({
    clause: tempPart && !clause.includes("°") ? `${clause}, ${tempPart}` : clause,
    warning,
    kind,
    tempC,
  });

  if (snow) return say("snow", `snow around ${hourLabel(snow.at, timezone)}`, true);
  if (ice) return say("ice", `icy conditions around ${hourLabel(ice.at, timezone)}`, true);
  if (rain) return say("rain", `rain around ${hourLabel(rain.at, timezone)}`, true);
  if (tempC !== null && tempC >= HEAT_C) return say("heat", `hot out — ${tempC}° around then`, true);
  if (tempC !== null && tempC <= COLD_C) return say("cold", `cold out — ${tempC}° around then`, true);

  const label = String(nearest.condition ?? "").trim().toLowerCase();
  const plain = label && !matches(label, ["unknown"]) ? label : "clear";
  void now;
  return say("clear", tempPart ? `${plain}, ${tempPart}` : plain, false);
}
