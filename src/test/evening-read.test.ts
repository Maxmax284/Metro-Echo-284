import { describe, expect, it } from "vitest";
import { eveningRead } from "@/lib/eveningRead";

const at = (h: number, m = 0) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

describe("evening read", () => {
  const now = (() => {
    const d = new Date();
    d.setHours(16, 0, 0, 0);
    return d.getTime();
  })();

  it("says what is left and what the sky is doing, in one sentence", () => {
    const read = eveningRead({
      now,
      events: [
        { id: "a", title: "Pads with Nikki", starts_at: at(18), location: "Lamai" },
        { id: "b", title: "Passed already", starts_at: at(9) },
      ],
      forecast: [
        { at: at(17), tempC: 31, condition: "clear", rainChance: 5 },
        { at: at(20), tempC: 27, condition: "showers", rainChance: 60 },
      ],
      placeLabel: "Rawai",
    });
    expect(read.ahead.map((e) => e.id)).toEqual(["a"]);
    expect(read.sentence).toContain("Pads with Nikki at 18:00, Lamai");
    expect(read.sentence).toContain("showers from about 20:00 (60% chance)");
    expect(read.sources).toContain("the forecast for Rawai");
  });

  it("fahrenheit carries its letter when the device asks for it", () => {
    const read = eveningRead({
      now,
      events: [],
      forecast: [
        { at: at(17), tempC: 30, condition: "clear", rainChance: 5 },
        { at: at(20), tempC: 26, condition: "clear", rainChance: 5 },
      ],
      unit: "f",
    });
    expect(read.sentence).toContain("86°F easing to 79°F");
  });

  it("celsius stays the established bare degree", () => {
    const read = eveningRead({
      now,
      events: [],
      forecast: [
        { at: at(17), tempC: 30, condition: "clear", rainChance: 5 },
        { at: at(20), tempC: 26, condition: "clear", rainChance: 5 },
      ],
    });
    expect(read.sentence).toContain("30° easing to 26°");
  });

  it("a missing forecast stays missing", () => {
    const read = eveningRead({ now, events: [{ id: "a", title: "Call", starts_at: at(19) }] });
    expect(read.sentence).toContain("No forecast has been read");
    expect(read.empty).toBe(false);
  });

  it("nothing left and nothing read is said plainly", () => {
    const read = eveningRead({ now, events: [], forecast: [] });
    expect(read.empty).toBe(true);
    expect(read.sentence).toContain("Nothing left on the calendar today");
  });
});
