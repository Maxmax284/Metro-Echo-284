import { specFor } from "@/lib/bodyKinds";
import { describe, expect, it } from "vitest";
import {
  autoSendHealth,
  autoSendProof,
  bodyStrip,
  ingestBodyTemplate,
  SETUP_RECIPES,
} from "@/lib/wearableAutoSend";
import type { Reading } from "@/lib/wearable";

const NOW = new Date("2026-09-02T18:00:00Z");

function reading(over: Partial<Reading>): Reading {
  return {
    kind: "steps",
    value: 100,
    unit: "steps",
    measured_at: NOW.toISOString(),
    source: "ingest",
    ...over,
  } as Reading;
}

describe("autoSendHealth", () => {
  it("says nothing is read when the activity sense is off", () => {
    const h = autoSendHealth([reading({})], false, NOW);
    expect(h.state).toBe("never");
    expect(h.detail).toMatch(/switched off/i);
  });

  it("says not set up when no reading ever arrived by phone", () => {
    const h = autoSendHealth([reading({ source: "manual" }), reading({ source: "bluetooth" })], true, NOW);
    expect(h.state).toBe("never");
    expect(h.label).toBe("not set up");
  });

  it("calls a fresh feed live", () => {
    const h = autoSendHealth(
      [reading({ measured_at: new Date(NOW.getTime() - 30 * 60_000).toISOString() })],
      true,
      NOW,
    );
    expect(h.state).toBe("live");
    expect(autoSendProof(h)).toBe("auto sending");
  });

  it("calls a quiet feed late instead of pretending", () => {
    const h = autoSendHealth(
      [reading({ measured_at: new Date(NOW.getTime() - 60 * 3_600_000).toISOString() })],
      true,
      NOW,
    );
    expect(h.state).toBe("late");
    expect(h.detail).toMatch(/stopped running/i);
  });
});

describe("bodyStrip", () => {
  it("shows a gap, never a zero, when a sense is off", () => {
    const rows = bodyStrip([reading({})], {}, NOW);
    expect(rows.every((r) => r.value === null)).toBe(true);
    expect(rows.every((r) => r.note === "sense off")).toBe(true);
  });

  it("reports real numbers with freshness when consented", () => {
    const rows = bodyStrip(
      [
        reading({ kind: "steps", value: 8421 }),
        reading({ kind: "heart_rate", value: 61.4, unit: "bpm" }),
      ],
      { heart_rate: true, activity: true },
      NOW,
    );
    expect(rows.find((r) => r.key === "steps")?.value).toBe("8421");
    expect(rows.find((r) => r.key === "heart_rate")?.value).toBe("61 bpm");
    expect(rows.find((r) => r.key === "sleep")?.value).toBeNull();
  });
});

describe("setup material", () => {
  it("posts only kinds the ingest actually accepts", () => {
    const body = JSON.parse(ingestBodyTemplate()) as { readings: { kind: string }[] };
    const kinds = body.readings.map((r) => r.kind);
    expect(kinds.length).toBeGreaterThan(3);
    for (const k of kinds) expect(specFor(k)?.kind).toBe(k);
    /* The four Echo has always taken are still in the example. */
    for (const k of ["steps", "heart_rate", "sleep", "workout"]) expect(kinds).toContain(k);
  });

  it("never tells anyone to approve anything from a watch", () => {
    const all = SETUP_RECIPES.flatMap((r) => r.steps).join(" ").toLowerCase();
    expect(all).not.toMatch(/approve|execute/);
  });
});
