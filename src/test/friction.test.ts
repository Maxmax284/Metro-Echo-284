// Cheapest, fastest and least hassle are three answers. The pick is a judgement.
import { describe, expect, it } from "vitest";
import { compareOptions, frictionAnswer, hassleScore, FRICTION_LAW } from "@/lib/friction";

const BUS = { label: "bus", money: 2, currency: "USD", minutes: 70, transfers: 2, walkMinutes: 10 };
const TAXI = { label: "taxi", money: 6, currency: "USD", minutes: 15, transfers: 0, walkMinutes: 0 };

describe("counting hassle", () => {
  it("charges for transfers and walking on top of the clock", () => {
    expect(hassleScore(BUS)).toBe(70 + 16 + 5);
    expect(hassleScore(TAXI)).toBe(15);
  });

  it("has no score when nothing measurable was given", () => {
    expect(hassleScore({ label: "walk" })).toBeNull();
  });
});

describe("comparing", () => {
  it("names cheapest, fastest and least hassle separately", () => {
    const c = compareOptions([BUS, TAXI]);
    expect(c.cheapest?.label).toBe("bus");
    expect(c.fastest?.label).toBe("taxi");
    expect(c.leastHassle?.label).toBe("taxi");
  });

  it("picks the practical move when cheap costs a lot of time", () => {
    const c = compareOptions([BUS, TAXI]);
    expect(c.pick?.label).toBe("taxi");
    expect(c.pick?.because).toContain("$4.00");
    expect(c.pick?.because).toContain("55 extra minutes");
  });

  it("keeps the cheap one when the time cost is small", () => {
    const c = compareOptions([
      { label: "bus", money: 2, currency: "USD", minutes: 25 },
      { label: "taxi", money: 20, currency: "USD", minutes: 15 },
    ]);
    expect(c.pick?.label).toBe("bus");
  });

  it("says so when one option is both", () => {
    const c = compareOptions([
      { label: "train", money: 3, currency: "USD", minutes: 12 },
      { label: "taxi", money: 18, currency: "USD", minutes: 20 },
    ]);
    expect(c.pick?.because).toMatch(/both the cheapest and the fastest/);
  });

  it("refuses to rank on a field it was not given for every option", () => {
    const c = compareOptions([{ label: "bus", minutes: 70 }, TAXI]);
    expect(c.missing).toContain("price");
    expect(c.cheapest).toBeNull();
    expect(c.pick).toBeNull();
  });
});

describe("one line back", () => {
  it("shows every option, the tradeoff and the label on the judgement", () => {
    const line = frictionAnswer([BUS, TAXI]);
    expect(line).toContain("bus, $2.00, 70 min, 2 transfers, 10 min walk");
    expect(line).toContain("Cheapest: bus.");
    expect(line).toContain("Fastest: taxi.");
    expect(line).toContain("Practical move: taxi");
    expect(line).toContain(FRICTION_LAW);
  });

  it("will not call a single option the best one", () => {
    expect(frictionAnswer([TAXI])).toMatch(/will not call a single option the best/i);
  });

  it("ranks nothing when given nothing", () => {
    expect(frictionAnswer([])).toMatch(/no options written down/i);
  });

  it("says plainly which field it could not rank on", () => {
    const line = frictionAnswer([{ label: "bus", minutes: 70 }, TAXI]);
    expect(line).toMatch(/No price was given for every option/i);
  });
});
