import { describe, it, expect } from "vitest";
import {
  newLayers, mergeLayers, isRawPreserved, layersFromMetadata, cleanTranscript,
  extractSignals, matteredCount, hasFollowUp, captureVerdict, followUpProposals,
  proposalOffer, captureTitle, CAPTURE_LAW, type RawCapture,
} from "@/lib/captureLayers";

const raw = (text: string): RawCapture => ({
  text,
  mode: "conversation",
  captured_at: "2026-09-15T14:00:00.000Z",
  duration_seconds: 61,
  transcribed_locally: true,
});

describe("capture law", () => {
  it("states both laws in words", () => {
    expect(CAPTURE_LAW.raw).toMatch(/NEVER REWRITE THE ORIGINAL EVIDENCE/);
    expect(CAPTURE_LAW.extraction).toBe("EXTRACTION IS NOT EXECUTION.");
  });
});

describe("raw capture is never overwritten", () => {
  it("keeps the existing raw layer when interpretation arrives", () => {
    const before = newLayers(raw("um we agreed to move the deposit"));
    const after = mergeLayers(before, {
      raw: raw("a totally different transcript"),
      clean: { text: "We agreed to move the deposit.", source: "rules", at: "now" },
      mattered: extractSignals(before.raw.text),
    });
    expect(after.raw.text).toBe("um we agreed to move the deposit");
    expect(isRawPreserved(before, after)).toBe(true);
    expect(after.clean?.text).toBe("We agreed to move the deposit.");
  });

  it("survives repeated interpretation passes", () => {
    let l = newLayers(raw("I'll call the landlord tomorrow"));
    const first = l;
    for (let i = 0; i < 5; i++) {
      l = mergeLayers(l, { clean: { text: `pass ${i}`, source: "echo", at: "now" } });
    }
    expect(isRawPreserved(first, l)).toBe(true);
  });

  it("refuses to create layers with no evidence", () => {
    expect(() => mergeLayers(null, { clean: { text: "x", source: "rules", at: "now" } })).toThrow();
  });

  it("merges connections without losing earlier links", () => {
    const l = mergeLayers(newLayers(raw("hi")), { connections: { projectId: "p1" } });
    const l2 = mergeLayers(l, { connections: { threadId: "t1" } });
    expect(l2.connections).toEqual({ projectId: "p1", threadId: "t1" });
  });

  it("reads layers back off note metadata, and nothing else", () => {
    const l = newLayers(raw("something"));
    expect(layersFromMetadata({ layers: l })?.raw.text).toBe("something");
    expect(layersFromMetadata({ source: "voice" })).toBeNull();
    expect(layersFromMetadata(null)).toBeNull();
    expect(layersFromMetadata({ layers: { clean: null } })).toBeNull();
  });
});

describe("clean note", () => {
  it("removes filler and tidies spacing without inventing words", () => {
    const out = cleanTranscript("um  so we , uh, agreed to it . you know it works");
    expect(out).not.toMatch(/\bum\b|\buh\b|you know/i);
    expect(out).toMatch(/agreed to it\./);
    expect(out.startsWith("So")).toBe(true);
  });

  it("is idempotent", () => {
    const once = cleanTranscript("uh we decided to wait");
    expect(cleanTranscript(once)).toBe(once);
  });
});

describe("extraction", () => {
  const transcript = [
    "We agreed to keep the September date.",
    "We decided to use the smaller room.",
    "I'll send the deposit receipt tonight.",
    "We should follow up with the landlord.",
    "Do we know if the invoice cleared?",
  ].join(" ");

  it("separates decisions, commitments, follow-ups and questions", () => {
    const m = extractSignals(transcript);
    expect(m.decisions).toHaveLength(2);
    expect(m.commitments).toHaveLength(1);
    expect(m.followUps).toHaveLength(1);
    expect(m.questions).toHaveLength(1);
    expect(matteredCount(m)).toBe(5);
    expect(hasFollowUp(m)).toBe(true);
  });

  it("puts each sentence in at most one bucket", () => {
    const m = extractSignals("I'll follow up and send the invoice.");
    expect(matteredCount(m)).toBe(1);
  });

  it("says so when nothing is actionable", () => {
    const m = extractSignals("The room was warm. Nice coffee.");
    expect(matteredCount(m)).toBe(0);
    expect(captureVerdict(m)).toBe("Saved. Nothing needs follow-up.");
    expect(hasFollowUp(m)).toBe(false);
  });

  it("speaks the verdict in counted plain English", () => {
    expect(captureVerdict(extractSignals(transcript)))
      .toBe("Got it. I found 2 decisions, 2 follow-ups and 1 open question.");
    expect(captureVerdict(null)).toBe("Saved. Nothing needs follow-up.");
  });

  it("titles a capture from its own first sentence", () => {
    expect(captureTitle("We agreed to keep the date. Then we left.", "conversation"))
      .toBe("We agreed to keep the date.");
    expect(captureTitle("   ", "conversation")).toBe("Conversation capture");
  });
});

describe("extraction is not execution", () => {
  const m = extractSignals("I'll send the deposit tonight. We should follow up Friday. Book the room.");

  it("returns inert proposals only", () => {
    const props = followUpProposals(m);
    expect(props.length).toBeGreaterThan(0);
    for (const p of props) {
      expect(p.status).toBe("proposed");
      expect(p.requiresApproval).toBe(true);
      expect(p.destination === "commitment" || p.destination === "action").toBe(true);
      // No proposal may claim to have happened.
      expect(Object.keys(p)).not.toContain("executed");
      expect(Object.keys(p)).not.toContain("executed_at");
    }
  });

  it("offers rather than confirms", () => {
    const offer = proposalOffer(followUpProposals(m));
    expect(offer).toMatch(/Add \d+ follow-ups? to Work\?/);
    expect(offer).toMatch(/Nothing moves until you say yes/);
    expect(offer).not.toMatch(/added|created|sent|done/i);
  });

  it("offers nothing when there is nothing to offer", () => {
    expect(followUpProposals(extractSignals("Nice weather."))).toEqual([]);
    expect(proposalOffer([])).toBeNull();
  });
});
