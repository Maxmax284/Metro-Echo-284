// The next-generation seams: open signal vocabulary, channel compression, and
// the cross-device context object. All pure, all deterministic.
import { describe, expect, it } from "vitest";
import {
  EMPTY_CONTEXT,
  POSTURES,
  compressForChannel,
  compressNotice,
  describeContext,
  handoff,
  isKnownSignalKind,
  mergeContext,
  postureAllowsInteraction,
  postureHoldsNoise,
  registerSignalKind,
  registeredSignalKinds,
  signalBaseImpact,
  signalKindSpec,
  verbosityForChannel,
  scoreRelevance,
  activePosture,
  readStoredContext,
  sensorAllowed,
  postureHolds,
  storedFromContext,
  contextFromStored,
  type AwarenessSignal,
} from "@/lib/awareness";

const facts = {
  title: "LMT Camp State — booking cancelled",
  why: "The day's plan just changed.",
  lines: ["Guest: A. Chen", "Nights: 3", "Amount: 12,000 THB"],
  nextStepLine: "In Metro Echo's inbox for review — nothing was actioned.",
};

describe("signal registry", () => {
  it("keeps the live impact weights", () => {
    expect(signalBaseImpact("security_event")).toBe(0.9);
    expect(signalBaseImpact("capture_unrouted")).toBe(0.3);
  });

  it("treats an unregistered kind as quiet, never loud", () => {
    expect(signalBaseImpact("something_nobody_declared")).toBe(0.3);
  });

  it("lets a new adapter register a kind without a core edit", () => {
    registerSignalKind({ kind: "calendar_conflict", source: "calendar", baseImpact: 0.65 });
    expect(signalKindSpec("calendar_conflict")?.source).toBe("calendar");
    expect(signalBaseImpact("calendar_conflict")).toBe(0.65);
    expect(isKnownSignalKind("calendar_conflict")).toBe(false);
    expect(registeredSignalKinds().length).toBeGreaterThan(13);
  });

  it("clamps a declared impact so an adapter cannot argue itself up", () => {
    registerSignalKind({ kind: "greedy_source", source: "greedy", baseImpact: 9 });
    expect(signalBaseImpact("greedy_source")).toBe(1);
  });

  it("feeds relevance through the registry", () => {
    const signal: AwarenessSignal = {
      id: "s1",
      source: "calendar",
      type: "calendar_conflict",
      scope: { userId: "u1", organizationId: null },
      entityId: "e1",
      timestamp: new Date().toISOString(),
      summary: "Two things at once",
      why: "Overlap",
      nextStep: "Pick one",
      confidence: 1,
      sourceRefs: [{ kind: "calendar_event", id: "e1" }],
    };
    const scored = scoreRelevance(signal, { hoursUntilDue: 4 });
    expect(scored.factors.impact).toBe(0.65);
  });
});

describe("compression", () => {
  it("maps channels to verbosity", () => {
    expect(verbosityForChannel("today")).toBe("rich");
    expect(verbosityForChannel("messaging")).toBe("brief");
    expect(verbosityForChannel("wearable")).toBe("signal");
    expect(verbosityForChannel("voice")).toBe("spoken");
    expect(verbosityForChannel("ambient")).toBe("cue");
    expect(verbosityForChannel("silent")).toBe("cue");
  });

  it("brief keeps every fact and the closing line, in order", () => {
    expect(compressNotice(facts, "brief")).toBe(
      [
        "LMT Camp State — booking cancelled",
        "The day's plan just changed.",
        "Guest: A. Chen",
        "Nights: 3",
        "Amount: 12,000 THB",
        "In Metro Echo's inbox for review — nothing was actioned.",
      ].join("\n"),
    );
  });

  it("appends one trailing-slash-normalized link when a public url exists", () => {
    const out = compressNotice({ ...facts, publicUrl: "https://vantav2.lovable.app/" }, "brief");
    expect(out.endsWith("Open Metro Echo: https://vantav2.lovable.app/")).toBe(true);
  });

  it("gets quieter as the channel gets smaller", () => {
    expect(compressNotice(facts, "signal")).toBe(
      "LMT Camp State — booking cancelled\nThe day's plan just changed.",
    );
    expect(compressNotice(facts, "spoken")).toBe(
      "LMT Camp State — booking cancelled. The day's plan just changed. Want the rest?",
    );
    expect(compressForChannel(facts, "ambient")).toBe("One thing changed.");
  });

  it("invents nothing when the payload was sparse", () => {
    expect(compressNotice({ title: "Payment failed" }, "brief")).toBe("Payment failed");
    expect(compressNotice({ title: "Payment failed" }, "spoken")).toBe(
      "Payment failed. Want the detail?",
    );
  });
});

describe("cross-device context", () => {
  it("starts empty and degrades gracefully", () => {
    expect(describeContext(EMPTY_CONTEXT)).toBe("no context set");
  });

  it("never lets an unaware device blank a known thread", () => {
    const desk = mergeContext(EMPTY_CONTEXT, {
      threadId: "t1",
      projectId: "p1",
      deviceClass: "desk",
    });
    const merged = mergeContext(desk, { threadId: undefined, deviceClass: "phone" });
    expect(merged.threadId).toBe("t1");
    expect(merged.projectId).toBe("p1");
    expect(merged.deviceClass).toBe("phone");
  });

  it("remembers the previous body on handoff", () => {
    const moved = handoff({ deviceClass: "earbuds", threadId: "t1" }, "desk");
    expect(moved.lastDeviceClass).toBe("earbuds");
    expect(moved.deviceClass).toBe("desk");
    expect(moved.threadId).toBe("t1");
  });

  it("knows which postures hold noise", () => {
    expect(POSTURES).toHaveLength(9);
    expect(postureHoldsNoise("deep_work")).toBe(true);
    expect(postureHoldsNoise("training")).toBe(true);
    expect(postureHoldsNoise("at_desk")).toBe(false);
    expect(postureHoldsNoise(undefined)).toBe(false);
  });

  it("refuses unsafe interaction shapes", () => {
    expect(postureAllowsInteraction("driving", "approval")).toBe(false);
    expect(postureAllowsInteraction("driving", "voice")).toBe(true);
    expect(postureAllowsInteraction("training", "approval")).toBe(false);
    expect(postureAllowsInteraction("sleep", "read")).toBe(false);
    expect(postureAllowsInteraction(undefined, "approval")).toBe(true);
  });

  it("describes the moment in plain English", () => {
    expect(
      describeContext({ posture: "training", deviceClass: "phone", quietHours: true }),
    ).toBe("Training · on phone · quiet hours");
  });
});

describe("persisted context + consent", () => {
  it("restores a stored posture and expires it", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(activePosture({ posture: "driving", postureUntil: future })).toBe("driving");
    expect(activePosture({ posture: "driving", postureUntil: past })).toBe(null);
    expect(activePosture({ posture: "driving" })).toBe("driving");
  });

  it("reads the stored slice defensively", () => {
    expect(readStoredContext(null)).toEqual({});
    expect(readStoredContext({ context: { posture: "nonsense", threadId: "t1" } }).posture).toBe(null);
    expect(readStoredContext({ context: { posture: "deep_work" } }).posture).toBe("deep_work");
  });

  it("treats a missing sensor as off", () => {
    expect(sensorAllowed({}, "calendar")).toBe(false);
    expect(sensorAllowed({ sensor_consent: { calendar: true } }, "calendar")).toBe(true);
    expect(sensorAllowed({ sensor_consent: { calendar: true } }, "location")).toBe(false);
  });

  it("holds ordinary notes on a holding posture but never critical", () => {
    const prefs = { context: { posture: "training" } };
    expect(postureHolds(prefs, "attention")).toBe(true);
    expect(postureHolds(prefs, "critical")).toBe(false);
    expect(postureHolds({ context: { posture: "at_desk" } }, "attention")).toBe(false);
  });

  it("round-trips context through the stored slice", () => {
    const stored = storedFromContext({ posture: "meeting", threadId: "t1", deviceClass: "phone" }, null);
    const back = contextFromStored(stored);
    expect(back.posture).toBe("meeting");
    expect(back.threadId).toBe("t1");
    expect(back.lastDeviceClass).toBe("phone");
  });
});
