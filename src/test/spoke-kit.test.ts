import { describe, it, expect } from "vitest";
import { buildSpokeKit, sampleNoticePayload } from "@/lib/integrations/spokeKit";

const input = {
  platformName: "LMT Camp State",
  sourceKey: "ground_truth_hub",
  webhookUrl: "https://example.functions.supabase.co/functions/v1/gth-inbound",
  secret: "abcdefghijklmnop1234",
};

describe("spoke kit", () => {
  it("carries the URL, source key and secret", () => {
    const text = buildSpokeKit(input);
    expect(text).toContain(input.webhookUrl);
    expect(text).toContain("ground_truth_hub");
    expect(text).toContain(input.secret);
  });

  it("documents the timestamped signing scheme the receiver accepts", () => {
    const text = buildSpokeKit(input);
    expect(text).toContain("X-Vanta-Timestamp");
    expect(text).toContain("X-Vanta-Signature");
    expect(text).toMatch(/unix_seconds>\.<raw_body/);
  });

  it("states plainly that inbound signals never execute", () => {
    expect(buildSpokeKit(input)).toContain("Nothing executes from an inbound signal.");
  });

  it("samples the universal notice.raised event", () => {
    const p = sampleNoticePayload(input) as any;
    expect(p.event_type).toBe("notice.raised");
    expect(p.source_platform).toBe("ground_truth_hub");
    expect(p.payload.severity).toBe("warning");
  });
});
