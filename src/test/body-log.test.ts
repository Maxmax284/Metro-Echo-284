import { describe, expect, it } from "vitest";
import {
  cleanTime,
  dosesOn,
  kindWord,
  latestByKind,
  moveWords,
  nextDose,
  pairBloodPressure,
  parseBloodPressure,
  readingWords,
  type BodyEntry,
  type Medication,
} from "@/lib/bodyLog";

const at = (iso: string, kind: string, value: number, unit: string): BodyEntry => ({
  kind,
  value,
  unit,
  measured_at: iso,
  source: "typed",
});

describe("blood pressure is read exactly as a cuff shows it", () => {
  it("takes the ordinary two-number form", () => {
    expect(parseBloodPressure("128/82")).toEqual({ systolic: 128, diastolic: 82, pulse: null });
  });

  it("tolerates spaces and a pulse", () => {
    const p = parseBloodPressure("128 / 82 p64");
    expect(p?.systolic).toBe(128);
    expect(p?.pulse).toBe(64);
  });

  it("refuses one number, prose, or an impossible pair", () => {
    expect(parseBloodPressure("128")).toBeNull();
    expect(parseBloodPressure("a bit high")).toBeNull();
    expect(parseBloodPressure("82/128")).toBeNull();
    expect(parseBloodPressure("900/500")).toBeNull();
  });
});

describe("readings are reported, never interpreted", () => {
  it("says the number with its unit and no verdict", () => {
    const line = readingWords(at("2026-01-02T08:00:00Z", "weight", 81.4, "kg"));
    expect(line).toContain("81.4");
    expect(line).toContain("kg");
    expect(line.toLowerCase()).not.toMatch(/high|low|good|bad|normal|healthy/);
  });

  it("keeps only the newest of each kind", () => {
    const rows = [
      at("2026-01-03T08:00:00Z", "weight", 81, "kg"),
      at("2026-01-01T08:00:00Z", "weight", 83, "kg"),
      at("2026-01-02T08:00:00Z", "temperature", 36.7, "°C"),
    ];
    const latest = latestByKind(rows);
    expect(latest).toHaveLength(2);
    expect(latest.find((r) => r.kind === "weight")?.value).toBe(81);
  });

  it("describes movement only between two recorded numbers", () => {
    const two = [at("2026-01-03T08:00:00Z", "weight", 81, "kg"), at("2026-01-01T08:00:00Z", "weight", 83, "kg")];
    expect(moveWords(two, "weight")).toBeTruthy();
    expect(moveWords([two[0]], "weight")).toBeNull();
  });

  it("names each kind in plain words", () => {
    expect(kindWord("bp_systolic").toLowerCase()).toContain("blood pressure");
    expect(kindWord("weight").toLowerCase()).toContain("weight");
  });
});

describe("a cuff reading is one event, not two rows", () => {
  it("pairs the halves recorded at the same moment", () => {
    const rows = [
      at("2026-01-03T08:00:00Z", "bp_systolic", 128, "mmHg"),
      at("2026-01-03T08:00:00Z", "bp_diastolic", 82, "mmHg"),
    ];
    const paired = pairBloodPressure(rows);
    expect(paired).toHaveLength(1);
    expect(paired[0].text).toContain("128/82");
  });

  it("never invents a missing half — it says which half it has", () => {
    const paired = pairBloodPressure([at("2026-01-03T08:00:00Z", "bp_systolic", 128, "mmHg")]);
    expect(paired).toHaveLength(1);
    expect(paired[0].text).toContain("systolic only");
    expect(paired[0].text).not.toContain("/");
  });
});

describe("medication doses are reminders on a day", () => {
  const med: Medication = {
    id: "m1",
    name: "Ramipril",
    dose: "5mg",
    times_local: ["08:00", "20:00"],
    rhythm: "daily",
    starts_on: "2026-01-01",
    ends_on: null,
    active: true,
  };

  it("cleans typed times and drops nonsense", () => {
    expect(cleanTime("8:00")).toBe("08:00");
    expect(cleanTime("evening")).toBeNull();
    expect(cleanTime("29:00")).toBeNull();
  });

  it("lists the day's doses in order", () => {
    const doses = dosesOn([med], new Date("2026-01-05T10:00:00Z"));
    expect(doses.map((d) => d.time)).toEqual(["08:00", "20:00"]);
  });

  it("says nothing for a paused course, an as-needed course, or a day outside the course", () => {
    expect(dosesOn([{ ...med, active: false }], new Date("2026-01-05T10:00:00Z"))).toHaveLength(0);
    expect(dosesOn([{ ...med, rhythm: "as_needed" }], new Date("2026-01-05T10:00:00Z"))).toHaveLength(0);
    expect(dosesOn([{ ...med, ends_on: "2026-01-02" }], new Date("2026-01-05T10:00:00Z"))).toHaveLength(0);
    expect(dosesOn([med], new Date("2025-12-30T10:00:00Z"))).toHaveLength(0);
  });

  it("finds the next dose still ahead in the day and none once the day is done", () => {
    expect(nextDose([med], new Date("2026-01-05T09:00:00"))?.time).toBe("20:00");
    expect(nextDose([med], new Date("2026-01-05T22:00:00"))).toBeNull();
  });
});
