// What Apple Health and Health Connect exports actually post, read straight.
import { describe, expect, it } from "vitest";
import { acceptReadings, flattenHealthPayload } from "@/lib/bodyKinds";
import { HEALTH_PUSH_TRUTH, SETUP_RECIPES } from "@/lib/wearableAutoSend";

const ALL = { body_basics: true, activity: true, sleep: true };

describe("flattenHealthPayload", () => {
  it("reads Health Auto Export's own body, no hand-written JSON", () => {
    const posted = {
      data: {
        metrics: [
          {
            name: "resting_heart_rate",
            units: "count/min",
            data: [{ date: "2026-09-17 06:00:00 +0700", qty: 54 }],
          },
          {
            name: "sleep_analysis",
            units: "hr",
            data: [{ date: "2026-09-17 06:30:00 +0700", asleep: 7.25 }],
          },
        ],
        workouts: [{ name: "Muay Thai", start: "2026-09-17T10:00:00Z", duration: 48 }],
      },
    };
    const flat = flattenHealthPayload(posted);
    expect(flat.map((r) => r.kind)).toEqual(["resting_heart_rate", "sleep_analysis", "workout"]);

    const { accepted } = acceptReadings(flat, ALL);
    expect(accepted.map((r) => r.kind)).toEqual(["resting_heart_rate", "sleep", "workout"]);
    /* Hours asleep become minutes, so one calculator covers every source. */
    expect(accepted[1]).toMatchObject({ value: 435, unit: "min" });
    expect(accepted[2].value).toBe(48);
  });

  it("reads a flat Health Connect sample list", () => {
    const flat = flattenHealthPayload({
      token: "ignored",
      samples: [
        { type: "step_count", value: 8421, unit: "steps", startTime: "2026-09-17T18:00:00Z" },
        { recordType: "heart_rate", beatsPerMinute: 61, time: "2026-09-17T18:05:00Z" },
      ],
    });
    const { accepted } = acceptReadings(flat, ALL);
    expect(accepted.map((r) => r.kind)).toEqual(["steps", "heart_rate"]);
    expect(accepted[1].value).toBe(61);
  });

  it("still reads Echo's own plain list", () => {
    const flat = flattenHealthPayload({ readings: [{ kind: "steps", value: 100 }] });
    expect(flat).toEqual([{ kind: "steps", value: 100 }]);
  });

  it("refuses a shape it cannot read instead of half-reading it", () => {
    expect(flattenHealthPayload({ token: "abc" })).toEqual([]);
    expect(flattenHealthPayload(null)).toEqual([]);
    expect(flattenHealthPayload({ data: { metrics: [{ name: "steps", data: [{}] }] } })).toEqual([]);
  });
});

describe("setup copy", () => {
  it("names both platforms and stays honest about who pushes", () => {
    expect(SETUP_RECIPES.map((r) => r.title).join(" ")).toMatch(/Apple Health/);
    expect(SETUP_RECIPES.map((r) => r.title).join(" ")).toMatch(/Health Connect/);
    expect(HEALTH_PUSH_TRUTH).toMatch(/neither offers a cloud/i);
    expect(HEALTH_PUSH_TRUTH).toMatch(/never reaches out/i);
  });

  it("never tells anyone to approve anything from a phone or watch", () => {
    const all = SETUP_RECIPES.flatMap((r) => r.steps).join(" ").toLowerCase();
    expect(all).not.toMatch(/approve|execute/);
  });
});
