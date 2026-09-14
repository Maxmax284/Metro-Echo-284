// The one weather clause that rides on an appointment heads-up.
import { describe, expect, it } from "vitest";
import {
  appointmentWeather,
  type ForecastHour,
} from "../../supabase/functions/_shared/awareness/appointmentWeather";

const START = "2026-09-20T20:00:00.000Z";
const hour = (at: string, over: Partial<ForecastHour> = {}): ForecastHour => ({
  at,
  tempC: 18,
  condition: "clear",
  rainChance: 5,
  ...over,
});

describe("appointmentWeather", () => {
  it("says nothing when the forecast does not cover the window", () => {
    expect(appointmentWeather(START, [hour("2026-09-25T20:00:00.000Z")], "UTC")).toBeNull();
    expect(appointmentWeather(START, null, "UTC")).toBeNull();
    expect(appointmentWeather(START, [], "UTC")).toBeNull();
  });

  it("names rain as a warning", () => {
    const w = appointmentWeather(START, [hour(START, { condition: "rain" })], "UTC");
    expect(w?.kind).toBe("rain");
    expect(w?.warning).toBe(true);
    expect(w?.clause).toContain("rain around");
  });

  it("counts a high rain chance even when the label is quiet", () => {
    const w = appointmentWeather(START, [hour(START, { rainChance: 80 })], "UTC");
    expect(w?.kind).toBe("rain");
  });

  it("puts snow ahead of rain", () => {
    const w = appointmentWeather(
      START,
      [hour(START, { condition: "snow" }), hour("2026-09-20T19:00:00.000Z", { condition: "rain" })],
      "UTC",
    );
    expect(w?.kind).toBe("snow");
  });

  it("warns about heat and cold from the nearest recorded hour", () => {
    expect(appointmentWeather(START, [hour(START, { tempC: 35 })], "UTC")?.kind).toBe("heat");
    expect(appointmentWeather(START, [hour(START, { tempC: -12 })], "UTC")?.kind).toBe("cold");
  });

  it("reads a calm sky without raising a warning", () => {
    const w = appointmentWeather(START, [hour(START)], "UTC");
    expect(w?.warning).toBe(false);
    expect(w?.clause).toContain("18°");
  });

  it("labels the hour in the person's own zone", () => {
    const w = appointmentWeather(START, [hour(START, { condition: "rain" })], "America/New_York");
    expect(w?.clause).toContain("4 PM");
  });
});
