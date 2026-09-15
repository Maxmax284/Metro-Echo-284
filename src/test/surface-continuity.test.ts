// Surface continuity — hygiene, not a wearable build.
//
// These are the invariants that must hold so the watch/earbuds/glasses future
// is not blocked later: one context across bodies, no body erasing the body it
// came from, every device class mapped to a depth, and approval never carried.
import { describe, expect, it } from "vitest";
import { handoff } from "@/lib/awareness";
import { bodyForDevice, verbosityForBody } from "@/lib/responseDepth";
import { carryable, NEVER_CARRIED, resumeNotice } from "@/lib/handoffResume";
import type { DeviceClass } from "@/lib/awareness";

const ALL: DeviceClass[] = [
  "desk",
  "phone",
  "tablet",
  "wearable",
  "earbuds",
  "vehicle",
  "ambient",
  "unknown",
];

describe("surface continuity", () => {
  it("maps every device class to a real depth", () => {
    for (const d of ALL) {
      const body = bodyForDevice(d);
      expect(verbosityForBody(body)).toBeTruthy();
    }
  });

  it("gives small bodies a glance, spoken bodies a sentence", () => {
    expect(bodyForDevice("wearable")).toBe("wrist");
    expect(bodyForDevice("ambient")).toBe("wrist");
    expect(bodyForDevice("earbuds")).toBe("spoken");
    expect(bodyForDevice("vehicle")).toBe("spoken");
  });

  it("keeps the body it came from when the arriving body knows nothing", () => {
    const ctx = handoff({ lastDeviceClass: "phone" }, "desk");
    expect(ctx.lastDeviceClass).toBe("phone");
    expect(ctx.deviceClass).toBe("desk");
  });

  it("records the previous body when there was one", () => {
    const ctx = handoff({ deviceClass: "wearable" }, "phone");
    expect(ctx.lastDeviceClass).toBe("wearable");
  });

  it("never persists device-local facts", () => {
    const out = carryable({
      deviceClass: "phone",
      moving: true,
      quietHours: true,
      earbudsPresent: true,
      wearablePresent: true,
      locationLabel: "Brooklyn",
      projectId: "p1",
    });
    for (const k of NEVER_CARRIED) expect(out).not.toHaveProperty(k);
    expect(out.projectId).toBe("p1");
  });

  it("resumes a wrist step on the phone, as a pointer only", () => {
    const seen = new Date(Date.now() - 20 * 60_000).toISOString();
    const n = resumeNotice({
      stored: {
        lastScopeKey: "personal",
        lastSeenAt: seen,
        lastDeviceClass: "wearable",
        lastStep: "deferred a heads-up on your watch",
        lastAnchorLabel: "Clinic moved",
        lastAnchorSurface: "today",
        pendingActionId: "a1",
      } as never,
      scopeKey: "personal",
      deviceClass: "phone",
    });
    expect(n?.line).toContain("Clinic moved");
    expect(n?.surface).toBe("today");
    /* The approval is visible as a pointer; it is not consent. */
    expect(n?.pendingActionId).toBe("a1");
  });

  it("never resumes across scopes", () => {
    const n = resumeNotice({
      stored: {
        lastScopeKey: "org:1",
        lastSeenAt: new Date(Date.now() - 20 * 60_000).toISOString(),
        lastDeviceClass: "wearable",
        lastAnchorLabel: "Payroll",
      } as never,
      scopeKey: "personal",
      deviceClass: "phone",
    });
    expect(n).toBeNull();
  });
});
