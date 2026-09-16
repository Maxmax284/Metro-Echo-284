// Conversion is arithmetic. The sentence after it is a kept anchor or nothing.
import { describe, expect, it } from "vitest";
import {
  convertMeasure, counterpart, measureAnswer, parseMeasureAsk, senseOf,
  shoeAnswer, shoeRow, showNumber, unit,
} from "../../supabase/functions/_shared/measures";

const u = (k: string) => {
  const spec = unit(k);
  if (!spec) throw new Error(`unknown unit ${k}`);
  return spec;
};

describe("knowing a unit", () => {
  it("takes the short form, the word and the plural", () => {
    expect(unit("kg")?.key).toBe("kg");
    expect(unit("kilograms")?.key).toBe("kg");
    expect(unit("Metres")?.key).toBe("m");
    expect(unit("sq ft")?.key).toBe("ft2");
  });

  it("returns nothing for a unit it does not keep", () => {
    expect(unit("furlong")).toBeNull();
    expect(unit("")).toBeNull();
    expect(unit(null)).toBeNull();
  });
});

describe("converting", () => {
  it("does length, mass, volume and area on kept factors", () => {
    expect(convertMeasure(10, u("km"), u("mi"))).toBeCloseTo(6.2137, 3);
    expect(convertMeasure(180, u("lb"), u("kg"))).toBeCloseTo(81.6466, 3);
    expect(convertMeasure(1, u("galus"), u("l"))).toBeCloseTo(3.7854, 3);
    expect(convertMeasure(42, u("m2"), u("ft2"))).toBeCloseTo(452.084, 2);
  });

  it("does temperature both ways", () => {
    expect(convertMeasure(0, u("c"), u("f"))).toBe(32);
    expect(convertMeasure(100, u("c"), u("f"))).toBe(212);
    expect(convertMeasure(90, u("f"), u("c"))).toBeCloseTo(32.222, 2);
  });

  it("refuses to convert across families", () => {
    expect(convertMeasure(5, u("kg"), u("m"))).toBeNull();
  });

  it("keeps digits sane", () => {
    expect(showNumber(452.0841)).toBe("452");
    expect(showNumber(6.2137)).toBe("6.21");
    expect(showNumber(0.3048)).toBe("0.305");
  });
});

describe("reading what somebody typed", () => {
  it("takes '<n> <unit> to <unit>'", () => {
    const ask = parseMeasureAsk("42 m2 to sqft");
    expect(ask?.from.key).toBe("m2");
    expect(ask?.to.key).toBe("ft2");
    expect(ask?.amount).toBe(42);
  });

  it("takes the question flipped round", () => {
    const ask = parseMeasureAsk("how many miles is 10 km");
    expect(ask?.from.key).toBe("km");
    expect(ask?.to.key).toBe("mi");
  });

  it("takes a bare amount and reaches for the usual counterpart", () => {
    expect(parseMeasureAsk("32c")?.to.key).toBe("f");
    expect(counterpart(u("kg"))?.key).toBe("lb");
  });

  it("returns nothing when the units measure different things", () => {
    expect(parseMeasureAsk("5 kg to metres")).toBeNull();
  });

  it("returns nothing when there is no unit at all", () => {
    expect(parseMeasureAsk("what is the plan today")).toBeNull();
  });
});

describe("the meaning after the number", () => {
  it("puts a city-apartment anchor on a floor area", () => {
    expect(senseOf(42, u("m2"))).toContain("city apartment");
  });

  it("says what a temperature feels like", () => {
    expect(senseOf(36, u("c"))).toContain("Hot");
    expect(senseOf(2, u("c"))).toContain("Cold");
  });

  it("turns a short distance into a walk", () => {
    expect(senseOf(2, u("km"))).toContain("on foot");
  });

  it("stays quiet where it has no anchor", () => {
    expect(senseOf(180, u("lb"))).toBeNull();
    expect(senseOf(3, u("l"))).toBeNull();
    expect(senseOf(400, u("km"))).toBeNull();
  });
});

describe("one line back", () => {
  it("converts then explains when an anchor exists", () => {
    const line = measureAnswer(parseMeasureAsk("42 m2 to sqft"));
    expect(line).toContain("452 ft²");
    expect(line).toContain("city apartment");
  });

  it("converts and stops when no anchor exists", () => {
    const line = measureAnswer(parseMeasureAsk("180 lb to kg"));
    expect(line).toContain("81.6 kg");
    expect(line).toBe("180 lb is about 81.6 kg.");
  });

  it("says plainly when it cannot read the ask", () => {
    expect(measureAnswer(null)).toContain("nothing to convert");
  });
});

describe("shoe sizing, honestly", () => {
  it("crosses US, UK, EU and centimetres", () => {
    expect(shoeRow("men", "us", 10)).toEqual({ us: 10, uk: 9, eu: 43, cm: 28 });
    expect(shoeRow("women", "eu", 38.5)?.us).toBe(8);
  });

  it("refuses a size outside the kept table", () => {
    expect(shoeRow("men", "us", 18)).toBeNull();
    expect(shoeAnswer("men", "us", 18)).toContain("will not put a number on it");
  });

  it("always carries the caveat", () => {
    expect(shoeAnswer("men", "us", 10)).toContain("starting point");
  });
});
