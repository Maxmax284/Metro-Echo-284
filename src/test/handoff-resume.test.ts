import { describe, expect, it } from "vitest";
import { carryable, MAX_GAP_MS, MIN_GAP_MS, NEVER_CARRIED, resumeNotice } from "@/lib/handoffResume";
import type { StoredContext } from "@/lib/awareness";

const NOW = Date.parse("2026-08-29T10:00:00Z");

const stored = (over: Partial<StoredContext> = {}): StoredContext => ({
  projectId: "p1",
  lastAnchorLabel: "Lamai rollout",
  lastAnchorSurface: "projects",
  lastStep: "reviewed booking drift",
  lastDeviceClass: "phone",
  lastSeenAt: new Date(NOW - 18 * 60_000).toISOString(),
  lastScopeKey: "personal",
  ...over,
});

const call = (over: Partial<StoredContext> = {}, extra: Partial<Parameters<typeof resumeNotice>[0]> = {}) =>
  resumeNotice({ stored: stored(over), scopeKey: "personal", deviceClass: "desk", now: NOW, ...extra });

describe("cross-device resume", () => {
  it("speaks when another body was working recently", () => {
    const n = call();
    expect(n?.line).toBe("You were on Lamai rollout 18 minutes ago on your phone.");
    expect(n?.step).toBe("Last step: reviewed booking drift");
    expect(n?.surface).toBe("projects");
  });

  it("never crosses scope", () => {
    expect(call({ lastScopeKey: "org:abc" })).toBeNull();
    expect(call({ lastScopeKey: null })).toBeNull();
  });

  it("stays quiet in the same sitting and once the thread is cold", () => {
    expect(call({ lastSeenAt: new Date(NOW - MIN_GAP_MS + 1_000).toISOString() })).toBeNull();
    expect(call({ lastSeenAt: new Date(NOW - MAX_GAP_MS - 1_000).toISOString() })).toBeNull();
  });

  it("stays quiet on the same device and during quiet hours", () => {
    expect(call({ lastDeviceClass: "desk" })).toBeNull();
    expect(call({ lastDeviceClass: "unknown" })).toBeNull();
    expect(call({}, { quietHours: true })).toBeNull();
  });

  it("needs a real anchor", () => {
    expect(call({ projectId: null, threadId: null, lastAnchorLabel: null })).toBeNull();
  });

  it("carries an approval as a pointer only, never as consent", () => {
    const n = call({ pendingActionId: "a1" });
    expect(n?.pendingActionId).toBe("a1");
    expect(Object.keys(n ?? {})).not.toContain("approved");
  });

  it("leaves device-local facts behind", () => {
    const out = carryable({
      projectId: "p1",
      threadId: "t1",
      deviceClass: "phone",
      moving: true,
      quietHours: true,
      earbudsPresent: true,
      wearablePresent: true,
      locationLabel: "Bangkok",
    });
    for (const k of NEVER_CARRIED) expect(out).not.toHaveProperty(k);
    expect(out.projectId).toBe("p1");
    expect(out.threadId).toBe("t1");
  });
});
