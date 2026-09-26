import { describe, expect, it } from "vitest";
import { signalRead } from "@/lib/signalBars";

describe("signalRead", () => {
  it("offline reads as no bars, and says the cabinet still works", () => {
    const r = signalRead(false, "4g", 40);
    expect(r.bars).toBe(0);
    expect(r.word).toBe("Offline");
    expect(r.sub).toMatch(/on-device/);
  });

  it("2g is a thin line", () => {
    expect(signalRead(true, "2g", 800).bars).toBe(1);
    expect(signalRead(true, "slow-2g").word).toBe("Thin line");
  });

  it("3g is a fair line", () => {
    expect(signalRead(true, "3g", 300).bars).toBe(2);
  });

  it("4g is a good line and shows the round trip when known", () => {
    const r = signalRead(true, "4g", 86);
    expect(r.bars).toBe(4);
    expect(r.sub).toBe("4g · ~86ms");
  });

  it("online without details admits whose word it is", () => {
    const r = signalRead(true, null, null);
    expect(r.word).toBe("Online");
    expect(r.sub).toMatch(/device's word/);
  });
});
