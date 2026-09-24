import { describe, it, expect } from "vitest";
import { suggestHome } from "@/lib/arrivalHome";
import { arrivalsWithHomes } from "@/hooks/useWorkBriefing";

const P = [
  { id: "p1", title: "Lamai Camp", summary: "muay thai gym bookings" },
  { id: "p2", title: "Villa lease", summary: null },
];

describe("suggestHome", () => {
  it("picks the project whose title matches", () => {
    expect(suggestHome("Lamai invoice for September", P)?.projectId).toBe("p1");
  });
  it("returns null when unsure", () => {
    expect(suggestHome("buy milk", P)).toBeNull();
    expect(suggestHome("gym", P)).toBeNull(); // one summary word isn't enough
  });
  it("refuses ties", () => {
    expect(suggestHome("lamai villa", P)).toBeNull();
  });
});

describe("arrivalsWithHomes", () => {
  const raw = [
    { id: "n1", type: "note" as const, label: "Lamai receipt", text: "Lamai receipt", at: "2026-09-20T00:00:00Z" },
    { id: "m1", type: "capture" as const, label: "villa water", text: "villa water bill", at: "2026-09-21T00:00:00Z" },
  ];
  it("includes Telegram captures and suggests homes", () => {
    const out = arrivalsWithHomes(raw, P, new Set(), new Set());
    expect(out.map((o) => o.id)).toEqual(["m1", "n1"]);
    expect(out[0].suggestion?.projectId).toBe("p2");
  });
  it("drops attached items and respects dismissals", () => {
    const out = arrivalsWithHomes(raw, P, new Set(["capture:m1"]), new Set(["p1:note:n1"]));
    expect(out.map((o) => o.id)).toEqual(["n1"]);
    expect(out[0].suggestion).toBeNull();
  });
});
