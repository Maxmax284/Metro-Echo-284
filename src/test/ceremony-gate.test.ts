import { beforeEach, describe, expect, it } from "vitest";
import {
  dawnShutterAllowed,
  readSpraySeen,
  recordSpray,
  sprayVariant,
  SPRAY_KEY,
} from "@/lib/ceremonyGate";
import {
  BOOT_CLAIM_KEY,
  BOOT_DAY_KEY,
  claimBootDay,
  localDay,
  readBootClaim,
  readLastBoot,
  recordBoot,
} from "@/lib/bootStorage";
import { decideBootAtMount } from "@/lib/bootDecision";
import { BOOT_ENCORE_KEY } from "@/lib/bootSequence";

describe("sprayVariant", () => {
  it("tags the door in full once, sweeps on return visits", () => {
    expect(sprayVariant({ reduced: false, seen: false })).toBe("full");
    expect(sprayVariant({ reduced: false, seen: true })).toBe("sweep");
  });

  it("is always static under reduced motion, seen or not", () => {
    expect(sprayVariant({ reduced: true, seen: false })).toBe("static");
    expect(sprayVariant({ reduced: true, seen: true })).toBe("static");
  });
});

describe("spray memory", () => {
  beforeEach(() => localStorage.clear());

  it("records the once-per-device tag", () => {
    expect(readSpraySeen()).toBe(false);
    recordSpray();
    expect(readSpraySeen()).toBe(true);
    expect(localStorage.getItem(SPRAY_KEY)).toBe("1");
  });
});

describe("dawnShutterAllowed", () => {
  const today = "2026-09-28";

  it("yields to a boot or intro that already claimed the day", () => {
    expect(dawnShutterAllowed({ today, bootDay: today, shutterDay: null, pressured: false })).toBe(false);
  });

  it("lifts only once per day", () => {
    expect(dawnShutterAllowed({ today, bootDay: null, shutterDay: today, pressured: false })).toBe(false);
  });

  it("stays down under pressure — no theatre on a day that needs you", () => {
    expect(dawnShutterAllowed({ today, bootDay: null, shutterDay: null, pressured: true })).toBe(false);
  });

  it("lifts on an ordinary arrival that skipped the roll call", () => {
    expect(
      dawnShutterAllowed({ today, bootDay: "2026-09-27", shutterDay: "2026-09-27", pressured: false }),
    ).toBe(true);
  });
});

describe("claimBootDay", () => {
  beforeEach(() => localStorage.clear());

  it("claims the day without touching the last-boot clock", () => {
    claimBootDay();
    const last = readLastBoot();
    expect(last.day).toBe(localDay());
    expect(last.at).toBeNull();
    expect(localStorage.getItem(BOOT_DAY_KEY)).toBe(localDay());
  });
});
