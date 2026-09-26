import { describe, expect, it } from "vitest";
import {
  BOOT_COLD_MS,
  BOOT_JUST_NOW_MS,
  bootHoldMs,
  buildRollCall,
  decideBoot,
  type BootFacts,
} from "@/lib/bootSequence";

const NOW = 1_800_000_000_000;
const DAY = "2027-01-10";

function decide(partial: Partial<Parameters<typeof decideBoot>[0]> = {}) {
  return decideBoot({
    now: NOW,
    lastBootAt: null,
    lastBootDay: null,
    today: DAY,
    deepLink: false,
    urgent: false,
    ...partial,
  });
}

describe("decideBoot", () => {
  it("skips for a deep link — a notification tap asked for something specific", () => {
    expect(decide({ deepLink: true }).mode).toBe("skip");
    expect(decide({ deepLink: true }).reason).toBe("deep-link");
  });

  it("skips under pressure — the boot never stands between you and trouble", () => {
    expect(decide({ urgent: true }).mode).toBe("skip");
  });

  it("skips when the last boot just happened (strict-mode/double-mount guard)", () => {
    const d = decide({ lastBootAt: NOW - BOOT_JUST_NOW_MS + 500, lastBootDay: DAY });
    expect(d.mode).toBe("skip");
    expect(d.reason).toBe("just-booted");
  });

  it("runs full on the first boot ever", () => {
    expect(decide().mode).toBe("full");
  });

  it("runs full on the first open of a new day", () => {
    const d = decide({ lastBootAt: NOW - 60_000, lastBootDay: "2027-01-09" });
    expect(d.mode).toBe("full");
    expect(d.reason).toBe("first-of-day");
  });

  it("runs full after a cold gap even on the same day", () => {
    const d = decide({ lastBootAt: NOW - BOOT_COLD_MS - 1, lastBootDay: DAY });
    expect(d.mode).toBe("full");
    expect(d.reason).toBe("cold");
  });

  it("gives a quick reopen a micro nod, not the ceremony", () => {
    const d = decide({ lastBootAt: NOW - 30 * 60_000, lastBootDay: DAY });
    expect(d.mode).toBe("micro");
  });

  it("deep-link and pressure outrank every other consideration", () => {
    expect(decide({ deepLink: true, urgent: true, lastBootAt: null }).mode).toBe("skip");
  });
});

const BASE_FACTS: BootFacts = {
  placeName: "Ko Samui",
  placeStale: false,
  placeAge: "12 minutes ago",
  clockLabel: "06:47 GMT+7",
  weatherLabel: "29° clear",
  operational: "calm",
  online: true,
};

describe("buildRollCall", () => {
  it("leads with the wordmark, then the place, then the state", () => {
    const roll = buildRollCall(BASE_FACTS);
    expect(roll[0].word).toBe("METRO ECHO");
    expect(roll[1].word).toBe("KO SAMUI");
    expect(roll[2].word).toBe("ALL CLEAR");
    expect(roll[2].line).toContain("06:47 GMT+7");
    expect(roll[2].line).toContain("29° clear");
  });

  it("says NEW GROUND when there is no place — it never invents one", () => {
    const roll = buildRollCall({ ...BASE_FACTS, placeName: null });
    expect(roll[1].word).toBe("NEW GROUND");
  });

  it("labels a stale fix as LAST KNOWN instead of speaking it as now", () => {
    const roll = buildRollCall({ ...BASE_FACTS, placeStale: true, placeAge: "3 days ago" });
    expect(roll[1].word).toBe("LAST KNOWN");
    expect(roll[1].line).toContain("Ko Samui");
    expect(roll[1].line).toContain("3 days ago");
  });

  it("never claims ALL CLEAR offline — NO SIGNAL and no calm word", () => {
    const roll = buildRollCall({ ...BASE_FACTS, online: false });
    const words = roll.map((c) => c.word);
    expect(words).toContain("NO SIGNAL");
    expect(words).not.toContain("ALL CLEAR");
  });

  it("says READING while the operational state is not yet counted", () => {
    const roll = buildRollCall({ ...BASE_FACTS, operational: null });
    expect(roll[2].word).toBe("READING");
  });

  it("names drift without pretending everything is fine", () => {
    const roll = buildRollCall({ ...BASE_FACTS, operational: "drift" });
    expect(roll[2].word).toBe("NEEDS A LOOK");
  });

  it("omits the weather from the line when there is no fresh reading", () => {
    const roll = buildRollCall({ ...BASE_FACTS, weatherLabel: null });
    expect(roll[2].line).not.toContain("°");
  });

  it("keeps every drum word short enough for the split-flap", () => {
    for (const facts of [
      BASE_FACTS,
      { ...BASE_FACTS, placeName: "Washington District of Columbia" },
      { ...BASE_FACTS, online: false },
    ]) {
      for (const call of buildRollCall(facts)) {
        expect(call.word.length).toBeLessThanOrEqual(14);
      }
    }
  });
});

describe("bootHoldMs", () => {
  it("gives the full roll call at least ~2.4s so the drums can be read", () => {
    const hold = bootHoldMs("full", false);
    expect(hold).toBeGreaterThanOrEqual(2400);
    expect(hold).toBeLessThanOrEqual(3200);
  });

  it("is a nod, not a ceremony, on reopen", () => {
    expect(bootHoldMs("micro", false)).toBeLessThanOrEqual(400);
  });

  it("shortens for reduced motion rather than holding a static frame long", () => {
    expect(bootHoldMs("full", true)).toBeLessThan(bootHoldMs("full", false));
  });
});
