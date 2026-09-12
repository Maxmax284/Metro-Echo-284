import { describe, expect, it } from "vitest";
import {
  contractFor, contractSteps, contractSummary, needsYou,
  reachFromConn, reachFromHealth, reachFromStatus, REACH_TONE,
} from "@/lib/reach";
import { INTEGRATIONS } from "@/lib/integrations/registry";

const gth = INTEGRATIONS.find((i) => i.key === "gth")!;
const fenrir = INTEGRATIONS.find((i) => i.key === "fenrir")!;
const calendar = INTEGRATIONS.find((i) => i.key === "calendar")!;
const whatsapp = INTEGRATIONS.find((i) => i.key === "whatsapp")!;

describe("three connection words", () => {
  it("never calls a never-connected optional source broken", () => {
    expect(reachFromConn("needs_setup")).toBe("available");
    expect(reachFromConn("off")).toBe("available");
    expect(reachFromConn("no_data")).toBe("available");
    expect(reachFromStatus("planned")).toBe("available");
    expect(reachFromStatus("needs_setup")).toBe("available");
    expect(reachFromStatus("deferred")).toBe("available");
  });

  it("reserves the urgent word for a real failure", () => {
    expect(reachFromConn("attention")).toBe("needs_you");
    expect(reachFromHealth("late")).toBe("needs_you");
    expect(reachFromHealth("attention")).toBe("needs_you");
    expect(reachFromStatus("blocked")).toBe("needs_you");
  });

  it("calls a working source connected", () => {
    expect(reachFromConn("connected")).toBe("connected");
    expect(reachFromConn("partial")).toBe("connected");
    expect(reachFromHealth("quiet")).toBe("connected");
    expect(reachFromStatus("configured")).toBe("connected");
  });

  it("gives red to Needs you and nobody else", () => {
    expect(REACH_TONE.needs_you).toMatch(/destructive/);
    expect(REACH_TONE.connected).not.toMatch(/destructive/);
    expect(REACH_TONE.available).not.toMatch(/destructive/);
  });
});

describe("needsYou", () => {
  it("stays quiet when an optional source was never switched on", () => {
    expect(
      needsYou({ def: gth, switchedOn: false, inUse: false, missingSecrets: ["GTH_WEBHOOK_SECRET"] }),
    ).toBe(false);
  });

  it("speaks up when a switched-on source is missing what it needs", () => {
    expect(
      needsYou({ def: gth, switchedOn: true, inUse: false, missingSecrets: ["GTH_WEBHOOK_SECRET"] }),
    ).toBe(true);
  });

  it("speaks up when something that was working just failed", () => {
    expect(
      needsYou({ def: gth, switchedOn: true, inUse: true, missingSecrets: [], failing: true }),
    ).toBe(true);
  });

  it("stays quiet when nothing is missing", () => {
    expect(needsYou({ def: gth, switchedOn: true, inUse: true, missingSecrets: [] })).toBe(false);
  });

  it("uses in-use as the expectation for sources without a switch", () => {
    const telegram = INTEGRATIONS.find((i) => i.key === "telegram")!;
    expect(needsYou({ def: telegram, switchedOn: null, inUse: false, missingSecrets: ["TELEGRAM_API_KEY"] })).toBe(false);
    expect(needsYou({ def: telegram, switchedOn: null, inUse: true, missingSecrets: ["TELEGRAM_API_KEY"] })).toBe(true);
  });
});

describe("capability contract", () => {
  it("gives a two-way source the full ladder once connected", () => {
    const c = contractFor(gth, { connected: true, watching: true });
    expect(c.see && c.understand && c.prepare && c.act && c.watch && c.report).toBe(true);
    expect(c.authority).toBe("act");
    expect(c.presence).toBe("watching");
  });

  it("never grants Act to a read-only or inbound-only source", () => {
    expect(contractFor(calendar, { connected: true }).act).toBe(false);
    expect(contractFor(fenrir, { connected: true }).act).toBe(false);
    expect(contractFor(calendar, { connected: true }).authority).toBe("prepare");
  });

  it("does not claim watching for something that is not connected", () => {
    const c = contractFor(gth, { connected: false, watching: true });
    expect(c.watch).toBe(false);
    expect(c.presence).toBe("on_ask");
  });

  it("gives a deferred source no reach at all", () => {
    const c = contractFor(whatsapp, { connected: false });
    expect(c.see).toBe(false);
    expect(c.act).toBe(false);
  });

  it("always speaks approval, never backend nouns", () => {
    const line = contractSummary(contractFor(gth, { connected: true, watching: true }));
    expect(line).toMatch(/approve/i);
    expect(line).not.toMatch(/webhook|secret|payload|endpoint/i);
    expect(contractSteps(contractFor(gth)).map((s) => s.key)).toEqual([
      "see", "understand", "prepare", "act", "watch", "report",
    ]);
  });

  it("always reports, whatever the source", () => {
    for (const def of INTEGRATIONS) {
      expect(contractFor(def, { connected: true }).report).toBe(true);
    }
  });
});
