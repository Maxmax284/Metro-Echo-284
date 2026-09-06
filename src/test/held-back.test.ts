import { describe, expect, it } from "vitest";
import { heldBackRead } from "@/lib/heldBack";

const now = Date.now();
const ago = (ms: number) => new Date(now - ms).toISOString();
const HOUR = 3_600_000;

describe("held back", () => {
  it("groups recorded suppressions by reason, in plain English", () => {
    const read = heldBackRead({
      now,
      rows: [
        {
          created_at: ago(2 * HOUR),
          payload: {
            records: [
              { type: "silent_project", suppressed: true, suppression_reason: "cooldown" },
              { type: "drifting_promise", suppressed: true, suppression_reason: "cooldown" },
              { type: "unread_risk", suppressed: true, suppression_reason: "quiet_hours" },
              { type: "unread_risk", suppressed: false, suppression_reason: null },
            ],
          },
        },
      ],
    });
    expect(read.total).toBe(3);
    expect(read.groups[0].reason).toBe("cooldown");
    expect(read.groups[0].label).toContain("already said recently");
    expect(read.groups[0].kinds).toEqual(["silent project", "drifting promise"]);
    expect(read.sentence).toContain("3 things");
  });

  it("ignores decisions older than the window", () => {
    const read = heldBackRead({
      now,
      windowMs: 24 * HOUR,
      rows: [
        { created_at: ago(48 * HOUR), payload: { records: [{ suppressed: true, suppression_reason: "cooldown" }] } },
      ],
    });
    expect(read.empty).toBe(true);
    expect(read.sentence).toContain("Nothing was held back");
  });

  it("keeps an unrecognised reason instead of guessing at it", () => {
    const read = heldBackRead({
      now,
      rows: [{ created_at: ago(HOUR), payload: { records: [{ suppressed: true, suppression_reason: "future_rule" }] } }],
    });
    expect(read.groups[0].label).toBe("held back");
    expect(read.groups[0].because).toContain("future_rule");
  });
});
