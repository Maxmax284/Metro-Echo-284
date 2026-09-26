// tempUnit — one setting, every weather read. The conversion math is pinned
// and the source invariants keep a stray hardcoded °C from sneaking back in.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatTemp, tempIn, toF } from "@/lib/tempUnit";

describe("tempUnit conversion", () => {
  it("converts and rounds honestly", () => {
    expect(toF(30)).toBe(86);
    expect(tempIn(30, "f")).toBe(86);
    expect(tempIn(30, "c")).toBe(30);
    expect(tempIn(0, "f")).toBe(32);
    expect(tempIn(-10, "f")).toBe(14);
  });

  it("formats with the unit letter always riding the number", () => {
    expect(formatTemp(30, "c")).toBe("30°C");
    expect(formatTemp(30, "f")).toBe("86°F");
  });
});

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("every weather read shares the one unit setting", () => {
  it("the storage key has exactly one home", () => {
    expect(read("src/lib/tempUnit.ts")).toContain("vanta.tempunit");
    for (const f of [
      "src/components/awareness/WeatherGauge.tsx",
      "src/components/shell/MiniRadarStrip.tsx",
      "src/components/shell/AwareCockpitCard.tsx",
      "src/components/shell/AwarenessHUD.tsx",
      "src/components/awareness/FieldPolaroid.tsx",
      "src/components/shell/BootSequence.tsx",
    ]) {
      expect(read(f), f).not.toContain("vanta.tempunit");
    }
  });

  it("no hardcoded Celsius letters survive in the weather reads", () => {
    for (const f of [
      "src/components/shell/MiniRadarStrip.tsx",
      "src/components/shell/AwareCockpitCard.tsx",
      "src/components/shell/AwarenessHUD.tsx",
      "src/components/awareness/FieldPolaroid.tsx",
    ]) {
      expect(read(f), f).not.toMatch(/°C/);
      expect(read(f), f).toContain("formatTemp");
    }
  });

  it("the gauge toggle goes through the shared setter", () => {
    const gauge = read("src/components/awareness/WeatherGauge.tsx");
    expect(gauge).toContain("useTempUnit");
    expect(gauge).not.toContain("localStorage");
  });

  it("the boot roll call reads the shared unit", () => {
    const boot = read("src/components/shell/BootSequence.tsx");
    expect(boot).toContain("readTempUnit");
    expect(boot).not.toContain('localStorage.getItem("vanta.tempunit")');
  });
});
