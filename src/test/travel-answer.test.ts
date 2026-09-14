import { describe, it, expect } from "vitest";
import { travelAnswer, durationWords, distanceWords } from "@/lib/travelAnswer";

const TZ = "America/New_York";
const start = "2026-09-14T20:00:00.000Z"; // 4:00 PM ET
const now = new Date("2026-09-14T13:00:00.000Z").getTime(); // 9:00 AM ET

describe("durationWords", () => {
  it("says minutes and hours in words", () => {
    expect(durationWords(1320)).toBe("22 minutes");
    expect(durationWords(60)).toBe("1 minute");
    expect(durationWords(7500)).toBe("2 hours 5 minutes");
    expect(durationWords(7200)).toBe("2 hours");
  });
  it("stays null with nothing recorded", () => {
    expect(durationWords(null)).toBeNull();
    expect(durationWords(0)).toBeNull();
  });
});

describe("distanceWords", () => {
  it("reads short and long distances", () => {
    expect(distanceWords(400)).toBe("under a kilometre");
    expect(distanceWords(8400)).toBe("8.4 km");
    expect(distanceWords(24000)).toBe("24 km");
    expect(distanceWords(null)).toBeNull();
  });
});

describe("travelAnswer", () => {
  const subject = { title: "ADHD appointment", starts_at: start, location: "Clinic on Main St" };

  it("gives a real time and a leave-by", () => {
    const out = travelAnswer(subject, { durationS: 1320, distanceM: 14000 }, TZ, now);
    expect(out).toContain("About 22 minutes");
    expect(out).toContain("14 km");
    expect(out).toContain("at 4:00 PM");
    expect(out).toContain("Leave by 3:38 PM");
  });

  it("says leaving is already due when the road is longer than the gap", () => {
    const out = travelAnswer(subject, { durationS: 8 * 3600, distanceM: null }, TZ, now);
    expect(out).toContain("already be leaving now");
  });

  it("asks for an address rather than guessing", () => {
    const out = travelAnswer({ ...subject, location: null }, { durationS: null, distanceM: null }, TZ, now);
    expect(out).toContain("no address on it");
  });

  it("refuses to invent a drive when no route came back", () => {
    const out = travelAnswer(subject, { durationS: null, distanceM: null }, TZ, now);
    expect(out).toContain("could not get a road route");
  });
});
