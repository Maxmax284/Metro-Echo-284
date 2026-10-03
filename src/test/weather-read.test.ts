import { describe, expect, it } from "vitest";
import {
  knots,
  looksLikeWeather,
  marineLine,
  rainWindows,
  weatherText,
} from "../../supabase/functions/_shared/weatherRead";

describe("looksLikeWeather", () => {
  it("catches the plain weather asks", () => {
    expect(looksLikeWeather("What's the weather on Koh Samui?")).toBe(true);
    expect(looksLikeWeather("will it rain this afternoon")).toBe(true);
    expect(looksLikeWeather("is the ferry running in this wind")).toBe(true);
    expect(looksLikeWeather("how hot is it outside")).toBe(true);
    expect(looksLikeWeather("forecast for tomorrow")).toBe(true);
  });

  it("leaves non-weather questions alone", () => {
    expect(looksLikeWeather("what's on my calendar today")).toBe(false);
    expect(looksLikeWeather("did Dani reply about the invoice")).toBe(false);
    expect(looksLikeWeather("what did we decide about the lease")).toBe(false);
  });
});

describe("marineLine", () => {
  it("reads calm under 20 km/h", () => {
    expect(marineLine(14)).toContain("calm seas");
  });
  it("reads chop between 20 and 35 km/h", () => {
    expect(marineLine(28)).toContain("chop");
    expect(marineLine(28)).toContain("bumpy");
  });
  it("reads rough between 35 and 55 km/h", () => {
    expect(marineLine(42)).toContain("rough");
    expect(marineLine(42)).toContain("suspend");
  });
  it("reads severe above 55 km/h", () => {
    expect(marineLine(70)).toContain("severe");
    expect(marineLine(70)).toContain("suspended");
  });
});

describe("knots", () => {
  it("converts km/h to knots", () => {
    expect(knots(18.52)).toBeCloseTo(10, 1);
  });
});

describe("rainWindows", () => {
  const times = [
    "2026-10-02T07:00",
    "2026-10-02T08:00",
    "2026-10-02T09:00",
    "2026-10-02T14:00",
    "2026-10-02T15:00",
    "2026-10-02T16:00",
    "2026-10-02T20:00",
  ];
  it("groups contiguous runs at or above the threshold", () => {
    const probs = [10, 20, 30, 60, 80, 55, 20];
    const windows = rainWindows(times, probs, "2026-10-02T07:00");
    expect(windows).toHaveLength(1);
    expect(windows[0].from).toBe("2026-10-02T14:00");
    expect(windows[0].peak).toBe(80);
  });
  it("returns nothing when the sky stays dry", () => {
    const probs = [10, 20, 30, 40, 20, 10, 5];
    expect(rainWindows(times, probs, "2026-10-02T07:00")).toHaveLength(0);
  });
});

describe("weatherText", () => {
  const meteo = {
    current: {
      time: "2026-10-02T07:52",
      temperature_2m: 28.4,
      apparent_temperature: 33.1,
      weather_code: 3,
      wind_speed_10m: 14.2,
      wind_direction_10m: 225,
    },
    hourly: {
      time: ["2026-10-02T07:00", "2026-10-02T14:00", "2026-10-02T15:00"],
      precipitation_probability: [10, 65, 70],
      wind_speed_10m: [14.2, 16.1, 15.4],
    },
    daily: {
      temperature_2m_max: [31.2],
      temperature_2m_min: [27.0],
    },
  };
  it("keeps the spine: place and check-time, Now, Today, sea line, provenance", () => {
    const text = weatherText(
      { label: "Ko Samui", note: "your stamped ground", lat: 9.46, lon: 100.04 },
      meteo,
    );
    expect(text).toContain("Ko Samui");
    expect(text).toContain("your stamped ground");
    expect(text).toContain("07:52 local time");
    expect(text).toContain("Now: 28°C");
    expect(text).toContain("overcast");
    expect(text).toContain("Today: high 31°C, low 27°C");
    expect(text).toContain("Sea and ferries:");
    expect(text).toContain("Open-Meteo");
    expect(text).toContain("forecast, not a guarantee");
  });
});
