import { describe, expect, it } from "vitest";
import {
  CARE_LAW,
  careAnswer,
  careMapLink,
  careWords,
  distanceWords,
  filterCare,
  isCareKind,
  normalizeCare,
  rankCare,
  type CarePlace,
} from "@/lib/careFinder";

const el = (over: Record<string, unknown> = {}) => ({
  type: "node",
  id: 1,
  lat: 13.75,
  lon: 100.5,
  tags: { amenity: "pharmacy", name: "Corner Pharmacy" },
  ...over,
});

const place = (over: Partial<CarePlace> = {}): CarePlace => ({
  id: "node/1",
  name: "Bangkok General",
  kind: "hospital",
  lat: 13.75,
  lon: 100.5,
  distanceM: 1200,
  address: null,
  phone: null,
  hours: null,
  emergency: null,
  ...over,
});

describe("careFinder", () => {
  it("drops elements with no name — an unnamed pin is not a place to send someone", () => {
    const rows = normalizeCare([el({ tags: { amenity: "hospital" } })], 13.75, 100.5);
    expect(rows).toHaveLength(0);
  });

  it("drops elements with no coordinates rather than placing them at the person", () => {
    const rows = normalizeCare([el({ lat: undefined, lon: undefined })], 13.75, 100.5);
    expect(rows).toHaveLength(0);
  });

  it("reads a hospital with emergency=yes as emergency care", () => {
    const rows = normalizeCare([el({ tags: { amenity: "hospital", name: "St Louis", emergency: "yes" } })], 13.75, 100.5);
    expect(rows[0].kind).toBe("emergency");
  });

  it("never invents a phone number or opening hours", () => {
    const rows = normalizeCare([el()], 13.75, 100.5);
    expect(rows[0].phone).toBeNull();
    expect(rows[0].hours).toBeNull();
  });

  it("collapses the same place recorded twice", () => {
    const rows = normalizeCare([el(), el({ id: 2 })], 13.75, 100.5);
    expect(rows).toHaveLength(1);
  });

  it("puts urgent care first, then the nearest", () => {
    const ranked = rankCare([
      place({ id: "a", kind: "pharmacy", distanceM: 100 }),
      place({ id: "b", kind: "emergency", distanceM: 5000 }),
      place({ id: "c", kind: "hospital", distanceM: 400 }),
    ]);
    expect(ranked.map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("narrows what is already listed and never claims a new lookup", () => {
    const rows = [place({ name: "Bumrungrad" }), place({ id: "node/2", name: "Samitivej" })];
    expect(filterCare(rows, "samit")).toHaveLength(1);
    expect(filterCare(rows, "", ["pharmacy"])).toHaveLength(0);
  });

  it("says distance in human steps, and calls unknown unknown", () => {
    expect(distanceWords(120)).toBe("100 m away");
    expect(distanceWords(2400)).toBe("2.4 km away");
    expect(distanceWords(Number.NaN)).toBe("distance unknown");
  });

  it("says the distance is straight-line, never a drive time", () => {
    expect(careAnswer([place()], null, 3000)).toContain("straight-line");
  });

  it("treats an empty map as the map being empty, not care being absent", () => {
    const text = careAnswer([], null, 5000);
    expect(text).toContain("That is the map being empty");
  });

  it("carries the standing law on every answer", () => {
    expect(careAnswer([place()], null, 3000)).toContain(CARE_LAW);
    expect(careAnswer([], null, 3000)).toContain(CARE_LAW);
  });

  it("leads with the published emergency number when there is one", () => {
    const text = careAnswer([place()], "In Thailand, emergency services answer on 191.", 3000);
    expect(text.split("\n")[0]).toContain("191");
  });

  it("repeats recorded hours as recorded, never as open now", () => {
    const words = careWords(place({ hours: "Mo-Fr 08:00-18:00" }));
    expect(words).toContain("hours as recorded: Mo-Fr 08:00-18:00");
    expect(words.toLowerCase()).not.toContain("open now");
  });

  it("links to the map at the recorded point", () => {
    expect(careMapLink(place())).toContain("mlat=13.75");
  });

  it("knows its own kinds", () => {
    expect(isCareKind("pharmacy")).toBe(true);
    expect(isCareKind("veterinary")).toBe(false);
  });
});
