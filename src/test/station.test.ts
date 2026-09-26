import { describe, expect, it } from "vitest";
import {
  clockFromMinutes,
  daylightFor,
  hemisphere,
  hoursFromMinutes,
  latBand,
  localMinutesNow,
  moonPhase,
  seasonFor,
  stationRead,
  sunFraction,
  tzOffsetMinutes,
} from "@/lib/station";

describe("latBand / hemisphere", () => {
  it("bands the world by latitude alone — no city lists", () => {
    expect(latBand(0)).toBe("equatorial"); // Quito
    expect(latBand(13.7)).toBe("tropical"); // Bangkok
    expect(latBand(9.5)).toBe("tropical"); // Ko Samui
    expect(latBand(25.8)).toBe("subtropical"); // Miami
    expect(latBand(38.9)).toBe("temperate"); // Washington
    expect(latBand(-33.9)).toBe("temperate"); // Sydney
    expect(latBand(60)).toBe("subpolar"); // Oslo
    expect(latBand(78)).toBe("polar"); // Svalbard
  });

  it("reads the hemisphere off the sign of the latitude", () => {
    expect(hemisphere(13.7)).toBe("north");
    expect(hemisphere(-33.9)).toBe("south");
    expect(hemisphere(0)).toBe("north"); // the line itself reads north
  });
});

describe("seasonFor", () => {
  it("gives Bangkok the wet season in July", () => {
    expect(seasonFor(new Date(Date.UTC(2026, 6, 15)), 13.7).key).toBe("wet");
  });

  it("gives Thailand the dry season in January", () => {
    expect(seasonFor(new Date(Date.UTC(2026, 0, 15)), 9.5).key).toBe("dry");
  });

  it("gives Washington winter in January and summer in July", () => {
    expect(seasonFor(new Date(Date.UTC(2026, 0, 15)), 38.9).key).toBe("winter");
    expect(seasonFor(new Date(Date.UTC(2026, 6, 15)), 38.9).key).toBe("summer");
  });

  it("flips the four seasons for the southern hemisphere", () => {
    // Sydney in January is summer — the northern assumption would say winter.
    expect(seasonFor(new Date(Date.UTC(2026, 0, 15)), -33.9).key).toBe("summer");
    expect(seasonFor(new Date(Date.UTC(2026, 6, 15)), -33.9).key).toBe("winter");
  });

  it("runs the southern-tropics monsoon opposite the northern", () => {
    // Darwin in December is wet while Bangkok is dry.
    expect(seasonFor(new Date(Date.UTC(2026, 11, 15)), -12.5).key).toBe("wet");
    expect(seasonFor(new Date(Date.UTC(2026, 11, 15)), 13.7).key).toBe("dry");
  });

  it("names no marked season at the equator", () => {
    const s = seasonFor(new Date(Date.UTC(2026, 3, 15)), 0.4);
    expect(s.key).toBe("equatorial");
    expect(s.note).toContain("no summer or winter");
  });

  it("labels every read as a pattern, not a forecast", () => {
    for (const lat of [0.4, 13.7, -12.5, 38.9, -33.9, 70]) {
      expect(seasonFor(new Date(Date.UTC(2026, 6, 15)), lat).note).toContain("not a forecast");
    }
  });

  it("honours the astronomical boundaries, not month-rounding", () => {
    // 20 March is spring; 19 March is still winter (northern temperate).
    expect(seasonFor(new Date(Date.UTC(2026, 2, 20)), 40).key).toBe("spring");
    expect(seasonFor(new Date(Date.UTC(2026, 2, 19)), 40).key).toBe("winter");
  });
});

describe("moonPhase", () => {
  it("is new at the documented epoch", () => {
    const m = moonPhase(new Date(Date.UTC(2000, 0, 6, 18, 14)));
    expect(m.key).toBe("new");
    expect(m.illumination).toBeLessThan(0.02);
  });

  it("is full about half a synodic month later", () => {
    const m = moonPhase(new Date(Date.UTC(2000, 0, 6, 18, 14) + 14.77 * 86_400_000));
    expect(m.key).toBe("full");
    expect(m.illumination).toBeGreaterThan(0.98);
    expect(m.waxing).toBe(false);
  });

  it("is waxing before the full moon and waning after", () => {
    expect(moonPhase(new Date(Date.UTC(2000, 0, 10))).waxing).toBe(true);
    expect(moonPhase(new Date(Date.UTC(2000, 0, 25))).waxing).toBe(false);
  });

  it("stays in range for dates far from the epoch, both ways", () => {
    for (const t of [Date.UTC(1957, 9, 4), Date.UTC(2049, 5, 1)]) {
      const m = moonPhase(new Date(t));
      expect(m.illumination).toBeGreaterThanOrEqual(0);
      expect(m.illumination).toBeLessThanOrEqual(1);
      expect(m.ageDays).toBeGreaterThanOrEqual(0);
      expect(m.ageDays).toBeLessThan(29.54);
    }
  });
});

describe("daylightFor", () => {
  it("gives the equator about twelve hours at an equinox", () => {
    const d = daylightFor(0.3, 100, new Date(Date.UTC(2026, 2, 20)));
    expect(d.dayLengthMin).toBeGreaterThan(700);
    expect(d.dayLengthMin).toBeLessThan(740);
  });

  it("gives London a long day at the June solstice and a short one in December", () => {
    const june = daylightFor(51.5, -0.1, new Date(Date.UTC(2026, 5, 21)));
    const dec = daylightFor(51.5, -0.1, new Date(Date.UTC(2026, 11, 21)));
    expect(june.dayLengthMin).toBeGreaterThan(950);
    expect(dec.dayLengthMin).toBeLessThan(500);
  });

  it("says midnight sun and polar night when the sun never crosses the horizon", () => {
    expect(daylightFor(78, 16, new Date(Date.UTC(2026, 5, 21))).polar).toBe("midnight-sun");
    expect(daylightFor(78, 16, new Date(Date.UTC(2026, 11, 21))).polar).toBe("polar-night");
  });

  it("shifts sunrise onto the local clock when an offset is supplied", () => {
    const at = new Date(Date.UTC(2026, 2, 20));
    const utc = daylightFor(13.7, 100.5, at, 0);
    const local = daylightFor(13.7, 100.5, at, 7 * 60);
    expect(local.sunriseMin).toBe((utc.sunriseMin! + 7 * 60) % 1440);
  });
});

describe("timezone helpers", () => {
  it("reads a real IANA offset", () => {
    const at = new Date(Date.UTC(2026, 0, 15, 12));
    expect(tzOffsetMinutes(at, "Asia/Bangkok")).toBe(7 * 60);
    expect(tzOffsetMinutes(at, "America/New_York")).toBe(-5 * 60);
  });

  it("returns null for a zone that does not exist instead of guessing", () => {
    expect(tzOffsetMinutes(new Date(), "Not/AZone")).toBeNull();
  });

  it("tells the time of day on the clock at the place", () => {
    const at = new Date(Date.UTC(2026, 0, 15, 0, 0));
    expect(localMinutesNow(at, "Asia/Bangkok")).toBe(7 * 60);
  });

  it("puts the sun on the arc only between rise and set", () => {
    const noon = new Date(Date.UTC(2026, 2, 20, 6)); // ~13:00 in Bangkok
    const midnight = new Date(Date.UTC(2026, 2, 20, 18)); // ~01:00 in Bangkok
    const up = sunFraction(noon, 13.7, 100.5, "Asia/Bangkok");
    const down = sunFraction(midnight, 13.7, 100.5, "Asia/Bangkok");
    expect(up).not.toBeNull();
    expect(up!).toBeGreaterThan(0);
    expect(up!).toBeLessThan(1);
    expect(down).toBeNull();
  });
});

describe("stationRead", () => {
  it("assembles one read from coordinates and the calendar alone", () => {
    const s = stationRead(new Date(Date.UTC(2026, 6, 15, 6)), 13.7, 100.5, "Asia/Bangkok");
    expect(s.band).toBe("tropical");
    expect(s.hemisphere).toBe("north");
    expect(s.season.key).toBe("wet");
    expect(s.line).toContain("Wet season");
  });

  it("reads the daypart off the place's clock, not the device's", () => {
    // 23:00 UTC is 06:00 the next day in Bangkok — dawn there.
    const s = stationRead(new Date(Date.UTC(2026, 0, 14, 23)), 13.7, 100.5, "Asia/Bangkok");
    expect(s.daypart).toBe("dawn");
  });
});

describe("display helpers", () => {
  it("formats minutes as a clock and as hours", () => {
    expect(clockFromMinutes(372)).toBe("06:12");
    expect(hoursFromMinutes(786)).toBe("13h 06m");
    expect(hoursFromMinutes(720)).toBe("12h");
  });
});
